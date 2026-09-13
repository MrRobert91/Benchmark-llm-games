"""Persistencia en SQLite.

Una fila por partida con el replay completo en JSON, más tablas normalizadas de jugadores y
rondas para poder consultar el leaderboard sin desempaquetar el replay.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

DEFAULT_DB = Path(__file__).resolve().parents[1] / "data" / "moloch.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS games (
    game_id       TEXT PRIMARY KEY,
    created_at    TEXT NOT NULL,
    seed          INTEGER NOT NULL,
    backend       TEXT NOT NULL,
    n_players     INTEGER NOT NULL,
    outcome_kind  TEXT NOT NULL,
    winner_label  TEXT,
    final_round   INTEGER NOT NULL,
    moloch_index  REAL NOT NULL,
    total_welfare REAL NOT NULL,
    mean_integrity REAL NOT NULL,
    replay_json   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_players (
    game_id     TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
    player_id   TEXT NOT NULL,
    label       TEXT NOT NULL,
    model       TEXT NOT NULL,
    progress    INTEGER NOT NULL,
    risk        INTEGER NOT NULL,
    payoff      REAL NOT NULL,
    integrity   REAL NOT NULL,
    fast_rate   REAL NOT NULL,
    pledges_made INTEGER NOT NULL,
    pledges_kept INTEGER NOT NULL,
    PRIMARY KEY (game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_players_model ON game_players(model);
CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at DESC);
"""


def connect(path: Path | str = DEFAULT_DB) -> sqlite3.Connection:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    return conn


def save_game(conn: sqlite3.Connection, record: dict[str, Any]) -> str:
    metrics = record["metrics"]
    outcome = record["outcome"]
    conn.execute(
        """INSERT OR REPLACE INTO games
           (game_id, created_at, seed, backend, n_players, outcome_kind, winner_label,
            final_round, moloch_index, total_welfare, mean_integrity, replay_json)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            record["game_id"],
            record["created_at"],
            record["seed"],
            record["backend"],
            len(record["players"]),
            outcome["kind"],
            outcome.get("winner_label"),
            outcome["final_round"],
            metrics["moloch_index"],
            metrics["total_welfare"],
            metrics["mean_integrity"],
            json.dumps(record, ensure_ascii=False),
        ),
    )
    conn.execute("DELETE FROM game_players WHERE game_id = ?", (record["game_id"],))
    for p in metrics["players"]:
        conn.execute(
            """INSERT INTO game_players
               (game_id, player_id, label, model, progress, risk, payoff, integrity,
                fast_rate, pledges_made, pledges_kept)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                record["game_id"],
                p["player_id"],
                p["label"],
                p["model"],
                p["progress"],
                p["risk"],
                p["payoff"],
                p["integrity"],
                p["fast_rate"],
                p["pledges_made"],
                p["pledges_kept"],
            ),
        )
    conn.commit()
    return record["game_id"]


def list_games(conn: sqlite3.Connection, limit: int = 50) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT game_id, created_at, backend, n_players, outcome_kind, winner_label,
                  final_round, moloch_index, total_welfare, mean_integrity
           FROM games ORDER BY created_at DESC, rowid DESC LIMIT ?""",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_game(conn: sqlite3.Connection, game_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT replay_json FROM games WHERE game_id = ?", (game_id,)
    ).fetchone()
    return json.loads(row["replay_json"]) if row else None


def leaderboard(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """Ranking por modelo, con los dos ejes: rendimiento e integridad."""
    rows = conn.execute(
        """SELECT model,
                  COUNT(*)          AS games,
                  AVG(payoff)       AS avg_payoff,
                  AVG(integrity)    AS avg_integrity,
                  AVG(fast_rate)    AS avg_fast_rate,
                  AVG(risk)         AS avg_risk,
                  SUM(pledges_made) AS pledges_made,
                  SUM(pledges_kept) AS pledges_kept
           FROM game_players GROUP BY model ORDER BY avg_integrity DESC, avg_payoff DESC"""
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["avg_payoff"] = round(d["avg_payoff"], 2)
        d["avg_integrity"] = round(d["avg_integrity"], 4)
        d["avg_fast_rate"] = round(d["avg_fast_rate"], 4)
        d["avg_risk"] = round(d["avg_risk"], 2)
        out.append(d)
    return out


def moloch_by_backend(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT backend, COUNT(*) AS games, AVG(moloch_index) AS avg_moloch,
                  SUM(outcome_kind = 'catastrophe') AS catastrophes,
                  SUM(outcome_kind = 'restraint')   AS restraints,
                  SUM(outcome_kind = 'aligned_win') AS aligned_wins
           FROM games GROUP BY backend"""
    ).fetchall()
    return [
        {**dict(r), "avg_moloch": round(r["avg_moloch"], 4)} for r in rows
    ]
