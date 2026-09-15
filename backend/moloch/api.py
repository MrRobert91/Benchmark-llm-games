"""API HTTP de Moloch Arena.

    uvicorn moloch.api:app --reload --port 8000
"""

from __future__ import annotations

import os
import asyncio
import json
import logging
import queue
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, SecretStr, field_validator

from . import db
from .benchmark.manifest import build_manifest, list_presets
from .benchmark.registry import (
    DEFAULT_BENCHMARK_VERSION,
    PAPER_BENCHMARK_VERSION,
    get_benchmark,
    list_benchmarks,
)
from .openrouter_catalog import list_text_models, validate_key
from .runs import RunQueue

DB_PATH = Path(os.environ.get("MOLOCH_DB", str(db.DEFAULT_DB)))
MIN_BUDGET_USD = 0.50
MAX_BUDGET_USD = float(os.environ.get("MOLOCH_MAX_BUDGET_USD", "10.00"))
DEFAULT_BUDGET_USD = MIN_BUDGET_USD
RUN_QUEUE = RunQueue(DB_PATH)
logger = logging.getLogger("uvicorn.error").getChild("moloch.api")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    RUN_QUEUE.database_path = DB_PATH
    RUN_QUEUE.start()
    yield

app = FastAPI(
    title="Moloch Arena",
    description="Benchmark de carrera armamentística para modelos de lenguaje.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.environ.get(
            "MOLOCH_CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000",
        ).split(",")
        if origin.strip()
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def _conn():
    return db.connect(DB_PATH)


class CreateRunRequest(BaseModel):
    api_key: SecretStr = Field(min_length=10, max_length=512)
    nick: Annotated[str, Field(min_length=1, max_length=40)]
    url: Annotated[str | None, Field(max_length=300)] = None
    models: Annotated[list[str], Field(min_length=2, max_length=5)]
    budget_usd: float = DEFAULT_BUDGET_USD
    benchmark_version: str = DEFAULT_BENCHMARK_VERSION
    risk_treatment: float = 0.60
    seed: int | None = Field(default=None, ge=0, le=9_223_372_036_854_775_807)

    @field_validator("nick")
    @classmethod
    def clean_nick(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("el nick no puede estar vacío")
        return cleaned

    @field_validator("url")
    @classmethod
    def https_url_only(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        cleaned = value.strip()
        if not cleaned.startswith("https://"):
            raise ValueError("la URL debe empezar por https://")
        return cleaned

    @field_validator("models")
    @classmethod
    def valid_model_names(cls, value: list[str]) -> list[str]:
        if any(not model.strip() or len(model) > 160 for model in value):
            raise ValueError("modelo no válido")
        return [model.strip() for model in value]

    @field_validator("budget_usd")
    @classmethod
    def allowed_budget(cls, value: float) -> float:
        if value < MIN_BUDGET_USD or value > MAX_BUDGET_USD:
            raise ValueError(
                f"el presupuesto debe estar entre {MIN_BUDGET_USD:.2f} y "
                f"{MAX_BUDGET_USD:.2f} USD"
            )
        return round(value, 2)

    @field_validator("benchmark_version")
    @classmethod
    def known_benchmark(cls, value: str) -> str:
        get_benchmark(value)
        return value

    @field_validator("risk_treatment")
    @classmethod
    def published_risk(cls, value: float) -> float:
        rounded = round(float(value), 2)
        if rounded not in {0.10, 0.60, 0.90}:
            raise ValueError("risk_treatment debe ser 0.10, 0.60 o 0.90")
        return rounded


class PlanExperimentRequest(BaseModel):
    models: Annotated[list[str], Field(min_length=1, max_length=40)]
    preset: str = "paper-2p-neutral"
    master_seed: int = Field(default=1, ge=0, le=9_223_372_036_854_775_807)
    repetitions: int | None = Field(default=None, ge=1, le=10_000)
    risks: list[float] | None = None
    players: int | None = Field(default=None, ge=2, le=5)


class ExecuteExperimentRequest(PlanExperimentRequest):
    api_key: SecretStr = Field(min_length=10, max_length=512)
    nick: Annotated[str, Field(min_length=1, max_length=40)]
    url: Annotated[str | None, Field(max_length=300)] = None
    budget_usd: float = DEFAULT_BUDGET_USD

    @field_validator("nick")
    @classmethod
    def clean_experiment_nick(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("el nick no puede estar vacío")
        return cleaned

    @field_validator("url")
    @classmethod
    def experiment_https_only(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        cleaned = value.strip()
        if not cleaned.startswith("https://"):
            raise ValueError("la URL debe empezar por https://")
        return cleaned

    @field_validator("budget_usd")
    @classmethod
    def experiment_budget(cls, value: float) -> float:
        if value < MIN_BUDGET_USD or value > MAX_BUDGET_USD:
            raise ValueError(
                f"el presupuesto debe estar entre {MIN_BUDGET_USD:.2f} y "
                f"{MAX_BUDGET_USD:.2f} USD"
            )
        return round(value, 2)


@app.get("/api/health")
def health() -> dict[str, object]:
    conn = _conn()
    games = conn.execute("SELECT COUNT(*) AS n FROM games").fetchone()["n"]
    conn.close()
    return {"status": "ok", "games": games, "db": str(DB_PATH)}


@app.get("/api/games")
def games(
    limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0)
) -> list[dict]:
    conn = _conn()
    try:
        return db.list_games(conn, limit=limit, offset=offset)
    finally:
        conn.close()


@app.get("/api/games/{game_id}")
def game(game_id: str) -> dict:
    conn = _conn()
    try:
        replay = db.get_game(conn, game_id)
    finally:
        conn.close()
    if replay is None:
        raise HTTPException(status_code=404, detail="partida no encontrada")
    return replay


@app.get("/api/leaderboard")
def leaderboard() -> dict:
    conn = _conn()
    try:
        return {
            "summary": db.paper_summary(conn),
            "paper_models": db.paper_leaderboard(conn),
            "paper_backends": db.paper_backend_leaderboard(conn),
            "contributors": db.list_contributions(conn),
        }
    finally:
        conn.close()


@app.get("/api/openrouter/models")
def openrouter_models() -> dict:
    try:
        models = list_text_models()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="OpenRouter no devolvió su catálogo") from exc
    return {
        "models": models,
        "limits": {
            "min_players": 2,
            "max_players": 5,
            "min_budget_usd": MIN_BUDGET_USD,
            "default_budget_usd": DEFAULT_BUDGET_USD,
            "max_budget_usd": MAX_BUDGET_USD,
            "queue_size": RUN_QUEUE.max_waiting,
            "max_rounds": None,
            "expected_rounds": 9,
            "calls_per_player_expected": 9,
            "calls_per_player_max": 30,
            "estimated_input_tokens_per_call": 650,
            "estimated_output_tokens_per_call": 80,
        },
        "default_benchmark_version": DEFAULT_BENCHMARK_VERSION,
        "benchmark_versions": list_benchmarks(),
        "presets": list_presets(),
    }


@app.get("/api/benchmark-versions")
def benchmark_versions() -> dict:
    return {
        "default": DEFAULT_BENCHMARK_VERSION,
        "versions": list_benchmarks(),
        "presets": list_presets(),
    }


@app.post("/api/experiments/plan")
def plan_experiment(request: PlanExperimentRequest) -> dict:
    try:
        manifest = build_manifest(
            models=request.models,
            preset=request.preset,
            master_seed=request.master_seed,
            repetitions=request.repetitions,
            risks=request.risks,
            players=request.players,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    payload = manifest.to_dict()
    conn = _conn()
    try:
        db.save_experiment(conn, payload)
    finally:
        conn.close()
    return payload


@app.post("/api/experiments", status_code=202)
def create_experiment(request: ExecuteExperimentRequest) -> dict:
    api_key = request.api_key.get_secret_value()
    try:
        key_info = validate_key(api_key)
        allowed = {model["id"] for model in list_text_models()}
    except httpx.HTTPStatusError as exc:
        status = 401 if exc.response.status_code in {401, 403} else 502
        raise HTTPException(status_code=status, detail="La clave de OpenRouter no es válida.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="OpenRouter no está disponible.") from exc
    unknown = [model for model in request.models if model not in allowed]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Modelo no disponible: {unknown[0]}")
    remaining = key_info.get("limit_remaining")
    if isinstance(remaining, (int, float)) and remaining < request.budget_usd:
        raise HTTPException(
            status_code=400,
            detail=f"La clave tiene {remaining:.2f} USD disponibles.",
        )
    try:
        manifest = build_manifest(
            models=request.models,
            preset=request.preset,
            master_seed=request.master_seed,
            repetitions=request.repetitions,
            risks=request.risks,
            players=request.players,
        ).to_dict()
        game_ids = RUN_QUEUE.submit_manifest(
            api_key=api_key,
            nick=request.nick,
            url=request.url,
            manifest=manifest,
            budget=request.budget_usd,
        )
    except queue.Full as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "El lote no cabe en la cola web actual. Reduce celdas o usa el runner CLI "
                "reanudable para el benchmark completo."
            ),
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "experiment_id": manifest["experiment_id"],
        "manifest_hash": manifest["manifest_hash"],
        "game_ids": game_ids,
        "status": "queued",
        "budget_usd": request.budget_usd,
    }


@app.get("/api/experiments/{experiment_id}")
def experiment(experiment_id: str) -> dict:
    conn = _conn()
    try:
        result = db.get_experiment(conn, experiment_id)
    finally:
        conn.close()
    if result is None:
        raise HTTPException(status_code=404, detail="experimento no encontrado")
    return result


@app.post("/api/runs", status_code=202)
def create_run(request: CreateRunRequest) -> dict:
    api_key = request.api_key.get_secret_value()
    logger.info(
        "run.request.received models=%s budget_usd=%.2f",
        ",".join(request.models),
        request.budget_usd,
    )
    try:
        key_info = validate_key(api_key)
    except httpx.HTTPStatusError as exc:
        status = 401 if exc.response.status_code in {401, 403} else 502
        logger.warning(
            "run.request.rejected stage=key_validation openrouter_status=%s models=%s",
            exc.response.status_code,
            ",".join(request.models),
        )
        raise HTTPException(
            status_code=status,
            detail="La clave de OpenRouter no es válida o no está disponible.",
        ) from exc
    except httpx.HTTPError as exc:
        logger.warning(
            "run.request.rejected stage=key_validation error_type=%s models=%s",
            type(exc).__name__,
            ",".join(request.models),
        )
        raise HTTPException(
            status_code=502, detail="No se pudo validar la clave con OpenRouter."
        ) from exc

    try:
        allowed = {model["id"] for model in list_text_models()}
    except httpx.HTTPError as exc:
        logger.warning(
            "run.request.rejected stage=catalog_validation error_type=%s models=%s",
            type(exc).__name__,
            ",".join(request.models),
        )
        raise HTTPException(status_code=502, detail="No se pudo validar el catálogo.") from exc
    unknown = [model for model in request.models if model not in allowed]
    if unknown:
        logger.warning("run.request.rejected stage=model_validation model=%s", unknown[0])
        raise HTTPException(status_code=400, detail=f"Modelo no disponible: {unknown[0]}")

    remaining = key_info.get("limit_remaining")
    if isinstance(remaining, (int, float)) and remaining < request.budget_usd:
        logger.warning(
            "run.request.rejected stage=budget_validation remaining_usd=%.4f budget_usd=%.2f",
            remaining,
            request.budget_usd,
        )
        raise HTTPException(
            status_code=400,
            detail=(
                f"La clave tiene {remaining:.2f} USD disponibles, menos que el presupuesto "
                f"de {request.budget_usd:.2f} USD."
            ),
        )
    try:
        game_id = RUN_QUEUE.submit(
            api_key=api_key,
            nick=request.nick,
            url=request.url,
            models=request.models,
            budget=request.budget_usd,
            benchmark_version=request.benchmark_version,
            risk_treatment=request.risk_treatment,
            seed=request.seed,
        )
    except queue.Full as exc:
        logger.warning("run.request.rejected stage=queue queue_size=%s", RUN_QUEUE.max_waiting)
        raise HTTPException(
            status_code=503,
            detail="La cola está completa. Inténtalo de nuevo en unos minutos.",
        ) from exc
    logger.info("run.request.accepted run_id=%s", game_id)
    return {
        "game_id": game_id,
        "url": f"/arena/{game_id}",
        "status": "queued",
        "benchmark_version": request.benchmark_version,
        "risk_treatment": request.risk_treatment
        if request.benchmark_version == PAPER_BENCHMARK_VERSION
        else None,
    }


@app.get("/api/runs/{game_id}")
def get_run(game_id: str) -> dict:
    conn = _conn()
    try:
        run = db.get_web_run(conn, game_id)
    finally:
        conn.close()
    if run is None:
        raise HTTPException(status_code=404, detail="ejecución no encontrada")
    return run


@app.get("/api/runs/{game_id}/events")
async def run_events(game_id: str) -> StreamingResponse:
    conn = _conn()
    try:
        if db.get_web_run(conn, game_id) is None:
            raise HTTPException(status_code=404, detail="ejecución no encontrada")
    finally:
        conn.close()

    async def stream():
        seq = 0
        idle = 0
        while True:
            conn = _conn()
            try:
                events = db.get_events_after(conn, game_id, seq)
                run = db.get_web_run(conn, game_id)
            finally:
                conn.close()
            if run is None:
                return
            if events or seq == 0:
                seq = events[-1]["seq"] if events else seq
                payload = {"seq": seq, "run": run}
                yield f"event: run\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                idle = 0
            else:
                idle += 1
                if idle >= 20:
                    yield ": keepalive\n\n"
                    idle = 0
            if run["status"] in {"completed", "failed"} and not events:
                return
            await asyncio.sleep(0.5)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
