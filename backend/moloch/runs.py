"""Cola de ejecuciones web con credenciales efímeras y persistencia incremental."""

from __future__ import annotations

import os
import logging
import queue
import secrets
import threading
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import db
from .agents.openrouter import BudgetExceeded, BudgetGuard, OpenRouterAgent, OpenRouterError
from .benchmark.registry import (
    DEFAULT_BENCHMARK_VERSION,
    LEGACY_BENCHMARK_VERSION,
    PAPER_BENCHMARK_VERSION,
    get_benchmark,
)
from .benchmark.versions.paper_2608_01193_v1.agents import PaperOpenRouterAgent
from .benchmark.versions.paper_2608_01193_v1.engine import PaperGame
from .cli import LAB_NAMES
from .engine import Game

logger = logging.getLogger("uvicorn.error").getChild("moloch.runs")


@dataclass
class WorkItem:
    game_id: str
    api_key: str
    nick: str
    url: str | None
    models: list[str]
    seed: int
    budget: float
    benchmark_version: str = LEGACY_BENCHMARK_VERSION
    risk_treatment: float = 0.60
    shared_guard: BudgetGuard | None = None
    experiment_id: str | None = None
    cell_id: str | None = None
    repetition: int | None = None


class RunQueue:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self.max_waiting = int(os.environ.get("MOLOCH_QUEUE_SIZE", "8"))
        self.queue: queue.Queue[WorkItem] = queue.Queue(maxsize=self.max_waiting)
        self._started = False
        self._start_lock = threading.Lock()
        self._submit_lock = threading.Lock()

    def start(self) -> None:
        with self._start_lock:
            if self._started:
                return
            conn = db.connect(self.database_path)
            try:
                interrupted = db.fail_interrupted_runs(conn)
            finally:
                conn.close()
            threading.Thread(target=self._worker, name="moloch-runner", daemon=True).start()
            self._started = True
            logger.info(
                "run.worker.started database=%s queue_size=%s interrupted_runs=%s",
                self.database_path,
                self.max_waiting,
                interrupted,
            )

    def submit(
        self,
        *,
        api_key: str,
        nick: str,
        url: str | None,
        models: list[str],
        budget: float,
        benchmark_version: str = DEFAULT_BENCHMARK_VERSION,
        risk_treatment: float = 0.60,
        seed: int | None = None,
    ) -> str:
        self.start()
        item = WorkItem(
            game_id=uuid.uuid4().hex[:12],
            api_key=api_key,
            nick=nick,
            url=url,
            models=list(models),
            seed=seed if seed is not None else secrets.randbelow(2_147_483_647),
            budget=budget,
            benchmark_version=benchmark_version,
            risk_treatment=risk_treatment,
        )
        with self._submit_lock:
            if self.queue.full():
                raise queue.Full
            conn = db.connect(self.database_path)
            try:
                db.create_web_run(
                    conn,
                    game_id=item.game_id,
                    seed=item.seed,
                    nick=item.nick,
                    url=item.url,
                    models=item.models,
                    budget_limit=item.budget,
                    benchmark_version=item.benchmark_version,
                    protocol_version=get_benchmark(item.benchmark_version).protocol_version,
                    risk_treatment=item.risk_treatment
                    if item.benchmark_version == PAPER_BENCHMARK_VERSION
                    else None,
                )
            finally:
                conn.close()
            self.queue.put_nowait(item)
        logger.info(
            "run.queued run_id=%s models=%s budget_usd=%.2f waiting=%s",
            item.game_id,
            ",".join(item.models),
            item.budget,
            self.queue.qsize(),
        )
        return item.game_id

    def submit_manifest(
        self,
        *,
        api_key: str,
        nick: str,
        url: str | None,
        manifest: dict[str, Any],
        budget: float,
    ) -> list[str]:
        """Queue a small web batch with one shared budget guard."""
        self.start()
        with self._submit_lock:
            conn = db.connect(self.database_path)
            try:
                db.save_experiment(conn, manifest)
                existing = db.get_experiment(conn, manifest["experiment_id"])
            finally:
                conn.close()
            terminal_or_active = {
                cell["cell_id"]
                for cell in (existing or {}).get("cells", [])
                if cell["status"] in {"completed", "queued", "running"}
            }
            cells = [
                cell for cell in manifest["cells"] if cell["cell_id"] not in terminal_or_active
            ]
            available = self.max_waiting - self.queue.qsize()
            if len(cells) > available:
                raise queue.Full
            guard = BudgetGuard(limit_usd=budget)
            items = [
                WorkItem(
                    game_id=uuid.uuid4().hex[:12],
                    api_key=api_key,
                    nick=nick,
                    url=url,
                    models=list(cell["models"]),
                    seed=int(cell["seed"]),
                    budget=budget,
                    benchmark_version=manifest["benchmark_version"],
                    risk_treatment=float(cell["risk_treatment"]),
                    shared_guard=guard,
                    experiment_id=manifest["experiment_id"],
                    cell_id=cell["cell_id"],
                    repetition=int(cell["repetition"]),
                )
                for cell in cells
            ]
            conn = db.connect(self.database_path)
            try:
                for item in items:
                    db.create_web_run(
                        conn,
                        game_id=item.game_id,
                        seed=item.seed,
                        nick=item.nick,
                        url=item.url,
                        models=item.models,
                        budget_limit=item.budget,
                        benchmark_version=item.benchmark_version,
                        protocol_version=manifest["protocol_version"],
                        risk_treatment=item.risk_treatment,
                    )
                    db.update_experiment_cell(
                        conn,
                        item.experiment_id or "",
                        item.cell_id or "",
                        status="queued",
                        game_id=item.game_id,
                    )
            finally:
                conn.close()
            for item in items:
                self.queue.put_nowait(item)
        return [item.game_id for item in items]

    def _worker(self) -> None:
        while True:
            item = self.queue.get()
            try:
                self._play(item)
            except Exception:  # noqa: BLE001 - el worker debe sobrevivir a cualquier trabajo
                logger.exception("run.worker.unhandled run_id=%s", item.game_id)
            finally:
                item.api_key = ""
                self.queue.task_done()

    def _play(self, item: WorkItem) -> None:
        guard = item.shared_guard or BudgetGuard(limit_usd=item.budget)
        private_analysis: list[dict[str, Any]] = []
        agents: list[Any] = []
        game: Game | PaperGame | None = None

        def audit_sink(entry: dict[str, Any]) -> None:
            private_analysis.append(entry)
            conn = db.connect(self.database_path)
            try:
                db.update_web_run(
                    conn,
                    item.game_id,
                    private_analysis=private_analysis,
                    usage=guard.summary(),
                )
            finally:
                conn.close()

        def event_sink(event_type: str, detail: dict[str, Any]) -> None:
            assert game is not None
            round_index = detail.get("round")
            player_id = detail.get("player_id")
            label = _player_label(player_id, item.models)
            if event_type == "speaking":
                phase = f"Ronda {round_index}: {label} prepara su intervención"
            elif event_type == "speech":
                phase = f"Ronda {round_index}: {label} ha intervenido"
            elif event_type == "thinking":
                phase = f"Ronda {round_index}: {label} toma su decisión privada"
            elif event_type == "round_resolved":
                phase = f"Ronda {round_index}: acciones reveladas"
            elif event_type == "finished":
                phase = "Calculando resultados"
            else:
                phase = "Preparando el consejo"
            conn = db.connect(self.database_path)
            try:
                db.update_web_run(
                    conn,
                    item.game_id,
                    status="running",
                    phase=phase,
                    replay=game.record.to_dict(),
                    private_analysis=private_analysis,
                    usage=guard.summary(),
                    parse_incidents=game.record.parse_incidents,
                    event_type=event_type,
                )
            finally:
                conn.close()
            logger.info(
                "run.progress run_id=%s event=%s phase=%s calls=%s spent_usd=%.6f "
                "parse_failures=%s",
                item.game_id,
                event_type,
                phase,
                guard.calls,
                guard.spent_usd,
                len(game.record.parse_incidents),
            )

        try:
            logger.info(
                "run.started run_id=%s seed=%s models=%s budget_usd=%.2f",
                item.game_id,
                item.seed,
                ",".join(item.models),
                item.budget,
            )
            definition = get_benchmark(item.benchmark_version)
            agent_class = (
                PaperOpenRouterAgent
                if item.benchmark_version == PAPER_BENCHMARK_VERSION
                else OpenRouterAgent
            )
            for index, model in enumerate(item.models):
                agents.append(
                    agent_class(
                        player_id=f"p{index}",
                        label=LAB_NAMES[index],
                        model=model,
                        budget=guard,
                        api_key=item.api_key,
                        timeout=float(os.environ.get("MOLOCH_OPENROUTER_TIMEOUT", "75")),
                        audit_sink=audit_sink,
                    )
                )
            if item.benchmark_version == PAPER_BENCHMARK_VERSION:
                game = PaperGame(
                    agents,
                    risk_treatment=item.risk_treatment,
                    seed=item.seed,
                    backend="openrouter-web-paper-v1",
                    game_id=item.game_id,
                    event_sink=event_sink,
                    spec_hash=definition.spec_hash,
                    protocol_hash=definition.protocol_hash,
                    experiment_id=item.experiment_id,
                    cell_id=item.cell_id,
                    repetition=item.repetition,
                )
            else:
                game = Game(
                    agents,
                    seed=item.seed,
                    backend="openrouter-web",
                    game_id=item.game_id,
                    event_sink=event_sink,
                )
            record = game.play()
            payload = record.to_dict()
            payload["budget"] = guard.summary()
            incidents = record.parse_incidents
            contributor = {"nick": item.nick, "url": item.url}
            conn = db.connect(self.database_path)
            try:
                db.save_game(conn, payload, contributor=contributor)
                db.save_provider_calls(
                    conn,
                    item.game_id,
                    private_analysis,
                    experiment_id=item.experiment_id,
                    cell_id=item.cell_id,
                )
                db.update_web_run(
                    conn,
                    item.game_id,
                    status="completed",
                    phase=(
                        "Partida completada con respuestas ilegibles"
                        if incidents
                        else "Partida completada"
                    ),
                    replay=payload,
                    private_analysis=private_analysis,
                    usage=guard.summary(),
                    parse_incidents=incidents,
                    error_message=_parse_warning(incidents) if incidents else None,
                    event_type="completed",
                )
                if item.experiment_id and item.cell_id:
                    db.update_experiment_cell(
                        conn,
                        item.experiment_id,
                        item.cell_id,
                        status="completed",
                        game_id=item.game_id,
                    )
            finally:
                conn.close()
            logger.info(
                "run.completed run_id=%s calls=%s spent_usd=%.6f outcome=%s "
                "parse_failures=%s contaminated=%s reasons=%s",
                item.game_id,
                guard.calls,
                guard.spent_usd,
                payload.get("outcome", {}).get("kind", "unknown"),
                len(incidents),
                int(bool(payload.get("metrics", {}).get("contaminated"))),
                _reason_histogram(incidents) or "-",
            )
        except Exception as exc:  # noqa: BLE001 - el fallo forma parte del registro
            message = _public_error(exc)
            partial = game.record.to_dict() if game is not None else None
            logger.exception(
                "run.failed run_id=%s calls=%s spent_usd=%.6f error_type=%s "
                "parse_failures=%s public_error=%s",
                item.game_id,
                guard.calls,
                guard.spent_usd,
                type(exc).__name__,
                len(game.record.parse_incidents) if game else 0,
                message,
            )
            conn = db.connect(self.database_path)
            try:
                db.save_provider_calls(
                    conn,
                    item.game_id,
                    private_analysis,
                    experiment_id=item.experiment_id,
                    cell_id=item.cell_id,
                )
                db.update_web_run(
                    conn,
                    item.game_id,
                    status="failed",
                    phase="Ejecución fallida",
                    replay=partial,
                    private_analysis=private_analysis,
                    usage=guard.summary(),
                    parse_incidents=game.record.parse_incidents if game else [],
                    error_message=message,
                    event_type="failed",
                )
                if item.experiment_id and item.cell_id:
                    db.update_experiment_cell(
                        conn,
                        item.experiment_id,
                        item.cell_id,
                        status="failed",
                        game_id=item.game_id,
                        error_message=message,
                        usage=guard.summary(),
                        partial_replay=partial,
                    )
            finally:
                conn.close()
        finally:
            for agent in agents:
                agent.close()
            item.api_key = ""


def _reason_histogram(incidents: list[dict[str, Any]]) -> str:
    """``empty_content=4,missing_field=1``: de un vistazo, por qué falló el parser."""
    counts: dict[str, int] = {}
    for incident in incidents:
        reason = str(incident.get("reason") or "unknown")
        counts[reason] = counts.get(reason, 0) + 1
    return ",".join(f"{k}={v}" for k, v in sorted(counts.items()))


def _parse_warning(incidents: list[dict[str, Any]]) -> str:
    """Aviso visible para quien lanzó la partida: terminó, pero no es comparable."""
    models = sorted({str(i.get("model")) for i in incidents if i.get("model")})
    return (
        f"La partida terminó, pero {len(incidents)} respuesta(s) no se pudieron interpretar "
        f"({_reason_histogram(incidents)}). Las rondas afectadas no cuentan para la "
        f"integridad y la ejecución queda marcada como contaminada. "
        f"Modelos implicados: {', '.join(models) or 'desconocido'}."
    )[:800]


def _public_error(exc: Exception) -> str:
    if isinstance(exc, OpenRouterError):
        return exc.public_message()
    if isinstance(exc, BudgetExceeded):
        return (
            "La partida se detuvo antes de una nueva llamada porque alcanzó el presupuesto "
            f"máximo configurado. Detalle: {str(exc).strip()}. Aumenta el límite de la "
            "partida o elige modelos más económicos."
        )[:800]
    return (
        "La partida se detuvo por un error interno inesperado. No se ha incluido en las "
        "métricas. Consulta el identificador de esta ejecución en los logs del backend y "
        "vuelve a intentarlo."
    )


def _player_label(player_id: object, models: list[str]) -> str:
    if isinstance(player_id, str) and player_id.startswith("p"):
        try:
            index = int(player_id[1:])
            return f"{LAB_NAMES[index]} ({models[index]})"
        except (ValueError, IndexError):
            pass
    return str(player_id or "un laboratorio")
