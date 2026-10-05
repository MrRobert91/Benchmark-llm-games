"""Inicializa la base desplegada con los replays incluidos en la imagen."""

from __future__ import annotations

import json
import os
from pathlib import Path

from . import db


def seed_database(database_path: Path, seed_dir: Path) -> int:
    """Carga snapshots únicamente cuando la base todavía no contiene partidas."""
    conn = db.connect(database_path)
    try:
        existing = conn.execute("SELECT COUNT(*) AS n FROM games").fetchone()["n"]
        if existing:
            return 0

        imported = 0
        for replay_path in sorted((seed_dir / "games").glob("*.json")):
            record = json.loads(replay_path.read_text(encoding="utf-8"))
            db.save_game(conn, record, contributor=record.get("contributor"))
            imported += 1
        return imported
    finally:
        conn.close()


def seed_research(database_path: Path, seed_dir: Path) -> int:
    """Add published research races to an existing deployment, without overwrites."""
    conn = db.connect(database_path)
    calls = {}
    for name in ("historical-provider-calls.json", "research-provider-calls.json"):
        calls_path = seed_dir / name
        if calls_path.exists():
            calls.update(json.loads(calls_path.read_text(encoding="utf-8")))
    imported = 0
    try:
        for replay_path in sorted((seed_dir / "games").glob("*.json")):
            record = json.loads(replay_path.read_text(encoding="utf-8"))
            game_id = record["game_id"]
            if db.get_game(conn, game_id) is None:
                if not record.get("research"):
                    continue
                db.save_game(conn, record, contributor=record.get("contributor"))
                imported += 1
            # The initial empty-database bootstrap may have imported the replay already.
            has_calls = conn.execute("SELECT 1 FROM provider_calls WHERE game_id = ? LIMIT 1", (game_id,)).fetchone()
            if not has_calls and game_id in calls:
                db.save_provider_calls(conn, game_id, calls[game_id])
        return imported
    finally:
        conn.close()


def main() -> None:
    database_path = Path(os.environ.get("MOLOCH_DB", str(db.DEFAULT_DB)))
    seed_dir = Path(os.environ.get("MOLOCH_SEED_DIR", "/seed-data"))
    imported = seed_database(database_path, seed_dir)
    research = seed_research(database_path, seed_dir)
    print(f"Base de Moloch preparada: {imported} snapshots y {research} carreras publicadas añadidas")


if __name__ == "__main__":
    main()

