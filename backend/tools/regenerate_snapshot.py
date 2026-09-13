"""Regenera el snapshot de partidas guionizadas de `frontend/public/data`.

POR QUÉ EXISTE ESTE FICHERO
---------------------------
El snapshot original se generó a mano y no quedó registrado cómo. Cuando se corrigió
`ConditionallyAntisocialSafe` (que estaba implementada como estrategia antirrecíproca en vez
de como Suspicious Tit-for-Tat, ver `moloch/agents/scripted.py`), las 51 partidas guionizadas
guardadas quedaron jugadas contra una escalera de referencia incorrecta y hubo que
reconstruir el diseño por ingeniería inversa. Este script lo deja declarado.

QUÉ REGENERA Y QUÉ NO
---------------------
Regenera **solo las partidas con backend `scripted`**. Las partidas jugadas por modelos
reales son datos observados: no son reproducibles y se conservan intactas.

IDENTIDAD ESTABLE
-----------------
`game_id` y `created_at` se leen del snapshot existente, emparejados por semilla. El motor
los genera al azar (`uuid4`, `datetime.now`), así que sin esto cada regeneración crearía 51
ficheros nuevos y rompería los enlaces del archivo. Conservarlos hace que el diff muestre
exactamente lo que cambió en el juego y nada más.

El resto del registro es una función pura de (semilla, roster, reglas, código de estrategia),
así que dos ejecuciones seguidas producen ficheros idénticos byte a byte.

USO
---
    python -m tools.regenerate_snapshot              # desde backend/
    python -m tools.regenerate_snapshot --check      # falla si el snapshot está desfasado
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from moloch import db  # noqa: E402
from moloch.cli import build_scripted  # noqa: E402
from moloch.engine import Game  # noqa: E402
from moloch.rules import Rules  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT_DIR = REPO_ROOT / "frontend" / "public" / "data"

AS = "always-safe"
AU = "always-unsafe"
CS = "conditionally-safe"
CAS = "conditionally-antisocial-safe"

#: Las diez configuraciones que forman un bloque. Cubren los seis emparejamientos de tres
#: estrategias distintas, las cuatro poblaciones puras, y dos partidas de 4 y 5 jugadores.
BLOCK: list[list[str]] = [
    [AS, AU, CS],
    [AS, AU, CAS],
    [AS, CS, CAS],
    [AU, CS, CAS],
    [AS, AS, AS],
    [AU, AU, AU],
    [CS, CS, CS],
    [CAS, CAS, CAS],
    [AS, AU, CS, CAS],
    [AS, AU, CS, CAS, CS],
]

#: Cinco réplicas del bloque, una por base de semilla, más la semilla 99 heredada del
#: snapshot original (un roster suelto que no encaja en el bloque y se conserva por
#: continuidad del archivo).
SEED_BASES = [100, 200, 300, 400, 500]
EXTRA: dict[int, list[str]] = {99: [CS, AU, AS]}


def design() -> dict[int, list[str]]:
    """Semilla -> roster. 5 bloques de 10, más la suelta: 51 partidas."""
    plan = dict(EXTRA)
    for base in SEED_BASES:
        for offset, roster in enumerate(BLOCK):
            plan[base + offset] = list(roster)
    return plan


def load_identities(games_dir: Path) -> dict[int, tuple[str, str]]:
    """Semilla -> (game_id, created_at) de las partidas guionizadas ya guardadas."""
    identities: dict[int, tuple[str, str]] = {}
    for path in sorted(games_dir.glob("*.json")):
        record = json.loads(path.read_text(encoding="utf-8"))
        if record.get("backend") != "scripted":
            continue
        identities[record["seed"]] = (record["game_id"], record["created_at"])
    return identities


def preserved_records(games_dir: Path) -> list[dict]:
    """Partidas que NO se regeneran: las jugadas por modelos reales."""
    kept = []
    for path in sorted(games_dir.glob("*.json")):
        record = json.loads(path.read_text(encoding="utf-8"))
        if record.get("backend") != "scripted":
            kept.append(record)
    return kept


def replay_scripted(seed: int, roster: list[str], identity: tuple[str, str] | None) -> dict:
    agents = build_scripted(roster, seed)
    record = Game(agents, rules=Rules(), seed=seed, backend="scripted").play()
    if identity is not None:
        record.game_id, record.created_at = identity
    return record.to_dict()


def build_snapshot(games_dir: Path) -> list[dict]:
    """Todos los registros del snapshot nuevo: guionizados regenerados + reales intactos."""
    identities = load_identities(games_dir)
    plan = design()

    missing = sorted(set(plan) - set(identities))
    if missing:
        print(
            f"aviso: {len(missing)} semillas sin identidad previa {missing}; "
            "se les asignará un game_id nuevo",
            file=sys.stderr,
        )

    records = [replay_scripted(s, plan[s], identities.get(s)) for s in sorted(plan)]
    records.extend(preserved_records(games_dir))
    return records


def write_snapshot(records: list[dict], out: Path) -> None:
    """Reconstruye una base desechable y exporta por el mismo camino que `cli export`.

    Es una base en fichero temporal, no `:memory:`: `db.connect` activa WAL y trata la ruta
    como un `Path`, así que una base en memoria acabaría creando un fichero literal.
    """
    with tempfile.TemporaryDirectory() as scratch:
        conn = db.connect(Path(scratch) / "snapshot.db")
        _export(conn, records, out)


def _export(conn, records: list[dict], out: Path) -> None:
    try:
        for record in records:
            db.save_game(conn, record)

        games = db.list_games(conn, limit=None)
        out.mkdir(parents=True, exist_ok=True)
        (out / "games.json").write_text(
            json.dumps(games, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (out / "leaderboard.json").write_text(
            json.dumps(
                {
                    "models": db.leaderboard(conn),
                    "backends": db.moloch_by_backend(conn),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        games_dir = out / "games"
        games_dir.mkdir(exist_ok=True)
        written = set()
        for game in games:
            replay = db.get_game(conn, game["game_id"])
            if replay is None:
                continue
            (games_dir / f"{game['game_id']}.json").write_text(
                json.dumps(replay, ensure_ascii=False), encoding="utf-8"
            )
            written.add(game["game_id"])

        # Un game_id que ya no produce el diseño es basura: hay que barrerlo, o el archivo
        # acumula partidas jugadas con reglas o estrategias viejas.
        for stale in sorted(games_dir.glob("*.json")):
            if stale.stem not in written:
                stale.unlink()
                print(f"eliminada partida huérfana {stale.name}")
    finally:
        conn.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(SNAPSHOT_DIR), help="directorio del snapshot")
    parser.add_argument(
        "--check",
        action="store_true",
        help="no escribe: sale con código 1 si el snapshot en disco no coincide",
    )
    args = parser.parse_args(argv)

    out = Path(args.out)
    games_dir = out / "games"
    records = build_snapshot(games_dir)

    if args.check:
        before = {p.name: p.read_text(encoding="utf-8") for p in sorted(games_dir.glob("*.json"))}
        with tempfile.TemporaryDirectory() as tmp:
            probe = Path(tmp)
            (probe / "games").mkdir(parents=True)
            write_snapshot(records, probe)
            after = {
                p.name: p.read_text(encoding="utf-8")
                for p in sorted((probe / "games").glob("*.json"))
            }
        if before != after:
            changed = sorted(set(before) ^ set(after)) or sorted(
                k for k in before if before[k] != after.get(k)
            )
            print(f"el snapshot está desfasado ({len(changed)} partidas difieren)")
            return 1
        print("el snapshot coincide con el diseño")
        return 0

    write_snapshot(records, out)
    scripted_n = sum(1 for r in records if r["backend"] == "scripted")
    print(
        f"snapshot regenerado en {out}: {scripted_n} partidas guionizadas, "
        f"{len(records) - scripted_n} conservadas sin tocar"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
