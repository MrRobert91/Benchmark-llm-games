"""API HTTP de Moloch Arena.

    uvicorn moloch.api:app --reload --port 8000
"""

from __future__ import annotations

import os
import asyncio
import json
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
from .openrouter_catalog import list_text_models, validate_key
from .runs import RunQueue

DB_PATH = Path(os.environ.get("MOLOCH_DB", str(db.DEFAULT_DB)))
MIN_BUDGET_USD = 0.50
MAX_BUDGET_USD = float(os.environ.get("MOLOCH_MAX_BUDGET_USD", "10.00"))
DEFAULT_BUDGET_USD = MIN_BUDGET_USD
RUN_QUEUE = RunQueue(DB_PATH)


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
    models: Annotated[list[str], Field(min_length=3, max_length=5)]
    budget_usd: float = DEFAULT_BUDGET_USD

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
            "models": db.leaderboard(conn, openrouter_only=True),
            "backends": db.moloch_by_backend(conn),
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
            "min_players": 3,
            "max_players": 5,
            "min_budget_usd": MIN_BUDGET_USD,
            "default_budget_usd": DEFAULT_BUDGET_USD,
            "max_budget_usd": MAX_BUDGET_USD,
            "queue_size": RUN_QUEUE.max_waiting,
            "max_rounds": 10,
            "calls_per_player_max": 20,
            "estimated_input_tokens_per_call": 800,
            "estimated_output_tokens_per_call": 160,
        },
    }


@app.post("/api/runs", status_code=202)
def create_run(request: CreateRunRequest) -> dict:
    api_key = request.api_key.get_secret_value()
    try:
        key_info = validate_key(api_key)
    except httpx.HTTPStatusError as exc:
        status = 401 if exc.response.status_code in {401, 403} else 502
        raise HTTPException(
            status_code=status,
            detail="La clave de OpenRouter no es válida o no está disponible.",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502, detail="No se pudo validar la clave con OpenRouter."
        ) from exc

    try:
        allowed = {model["id"] for model in list_text_models()}
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="No se pudo validar el catálogo.") from exc
    unknown = [model for model in request.models if model not in allowed]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Modelo no disponible: {unknown[0]}")

    remaining = key_info.get("limit_remaining")
    if isinstance(remaining, (int, float)) and remaining < request.budget_usd:
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
        )
    except queue.Full as exc:
        raise HTTPException(
            status_code=503,
            detail="La cola está completa. Inténtalo de nuevo en unos minutos.",
        ) from exc
    return {"game_id": game_id, "url": f"/arena/{game_id}", "status": "queued"}


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
