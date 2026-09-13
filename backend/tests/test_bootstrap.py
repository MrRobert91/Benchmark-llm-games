from pathlib import Path

from moloch import db
from moloch.bootstrap import seed_database


def test_seed_database_imports_snapshots_only_once(tmp_path: Path) -> None:
    database_path = tmp_path / "moloch.db"
    seed_dir = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data"

    first_import = seed_database(database_path, seed_dir)
    second_import = seed_database(database_path, seed_dir)

    conn = db.connect(database_path)
    try:
        stored = conn.execute("SELECT COUNT(*) AS n FROM games").fetchone()["n"]
    finally:
        conn.close()

    assert first_import > 0
    assert second_import == 0
    assert stored == first_import

