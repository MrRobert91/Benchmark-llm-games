"""Cola de ejecuciones web con credenciales efímeras y persistencia incremental."""

from __future__ import annotations

import os
import queue
import secrets
import threading
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import db
from .agents.openrouter import BudgetGuard, OpenRouterAgent
from .cli import LAB_NAMES
from .engine import Game


@dataclass
class WorkItem:
    game_id: str
    api_key: str
    nick: str
    url: str | None
    models: list[str]
    seed: int
    budget: float


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
                db.fail_interrupted_runs(conn)
            finally:
                conn.close()
            threading.Thread(target=self._worker, name="moloch-runner", daemon=True).start()
            self._started = True

    def submit(
        self,
        *,
        api_key: str,
        nick: str,
        url: str | None,
        models: list[str],
        budget: float,
    ) -> str:
        self.start()
        item = WorkItem(
            game_id=uuid.uuid4().hex[:12],
            api_key=api_key,
            nick=nick,
            url=url,
            models=list(models),
            seed=secrets.randbelow(2_147_483_647),
            budget=budget,
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
                )
            finally:
                conn.close()
            self.queue.put_nowait(item)
        return item.game_id

    def _worker(self) -> None:
        while True:
            item = self.queue.get()
            try:
                self._play(item)
            finally:
                item.api_key = ""
                self.queue.task_done()

    def _play(self, item: WorkItem) -> None:
        guard = BudgetGuard(limit_usd=item.budget)
        private_analysis: list[dict[str, Any]] = []
        agents: list[OpenRouterAgent] = []
        game: Game | None = None

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

        for index, model in enumerate(item.models):
            agents.append(
                OpenRouterAgent(
                    player_id=f"p{index}",
                    label=LAB_NAMES[index],
                    model=model,
                    budget=guard,
                    api_key=item.api_key,
                    timeout=float(os.environ.get("MOLOCH_OPENROUTER_TIMEOUT", "75")),
                    audit_sink=audit_sink,
                )
            )

        def event_sink(event_type: str, detail: dict[str, Any]) -> None:
            assert game is not None
            round_index = detail.get("round")
            player_id = detail.get("player_id")
            if event_type == "speech":
                phase = f"Ronda {round_index}: habla {player_id}"
            elif event_type == "thinking":
                phase = f"Ronda {round_index}: decisión privada de {player_id}"
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
                    event_type=event_type,
                )
            finally:
                conn.close()

        game = Game(
            agents,
            seed=item.seed,
            backend="openrouter-web",
            game_id=item.game_id,
            event_sink=event_sink,
        )
        try:
            record = game.play()
            payload = record.to_dict()
            payload["budget"] = guard.summary()
            contributor = {"nick": item.nick, "url": item.url}
            conn = db.connect(self.database_path)
            try:
                db.save_game(conn, payload, contributor=contributor)
                db.update_web_run(
                    conn,
                    item.game_id,
                    status="completed",
                    phase="Partida completada",
                    replay=payload,
                    private_analysis=private_analysis,
                    usage=guard.summary(),
                    event_type="completed",
                )
            finally:
                conn.close()
        except Exception as exc:  # noqa: BLE001 - el fallo forma parte del registro
            message = _public_error(exc)
            partial = game.record.to_dict()
            conn = db.connect(self.database_path)
            try:
                db.update_web_run(
                    conn,
                    item.game_id,
                    status="failed",
                    phase="Ejecución fallida",
                    replay=partial,
                    private_analysis=private_analysis,
                    usage=guard.summary(),
                    error_message=message,
                    event_type="failed",
                )
            finally:
                conn.close()
        finally:
            for agent in agents:
                agent.close()
            item.api_key = ""


def _public_error(exc: Exception) -> str:
    text = str(exc).strip()
    if not text:
        return "La ejecución falló sin un mensaje del proveedor."
    return text[:800]
