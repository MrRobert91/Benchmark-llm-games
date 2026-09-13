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
            db.save_game(conn, record)
            imported += 1
        return imported
    finally:
        conn.close()


def main() -> None:
    database_path = Path(os.environ.get("MOLOCH_DB", str(db.DEFAULT_DB)))
    seed_dir = Path(os.environ.get("MOLOCH_SEED_DIR", "/seed-data"))
    imported = seed_database(database_path, seed_dir)
    print(f"Base de Moloch preparada: {imported} partidas importadas")


if __name__ == "__main__":
    main()

