"""Persistencia en SQLite.

Una fila por partida con el replay completo en JSON, más tablas normalizadas de jugadores y
rondas para poder consultar el leaderboard sin desempaquetar el replay.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
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

CREATE TABLE IF NOT EXISTS web_runs (
    game_id        TEXT PRIMARY KEY,
    status         TEXT NOT NULL,
    phase          TEXT NOT NULL DEFAULT 'queued',
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    seed           INTEGER NOT NULL,
    contributor_nick TEXT NOT NULL,
    contributor_url  TEXT,
    models_json    TEXT NOT NULL,
    budget_limit   REAL NOT NULL,
    spent_usd      REAL NOT NULL DEFAULT 0,
    calls          INTEGER NOT NULL DEFAULT 0,
    prompt_tokens  INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    error_message  TEXT,
    replay_json    TEXT,
    private_analysis_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS run_events (
    game_id    TEXT NOT NULL REFERENCES web_runs(game_id) ON DELETE CASCADE,
    seq        INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    event_type TEXT NOT NULL,
    PRIMARY KEY (game_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_web_runs_created ON web_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_events_game ON run_events(game_id, seq);
"""


def connect(path: Path | str = DEFAULT_DB) -> sqlite3.Connection:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.executescript(SCHEMA)
    _ensure_column(conn, "games", "contributor_nick", "TEXT")
    _ensure_column(conn, "games", "contributor_url", "TEXT")
    return conn


def _ensure_column(
    conn: sqlite3.Connection, table: str, column: str, declaration: str
) -> None:
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")


def save_game(
    conn: sqlite3.Connection,
    record: dict[str, Any],
    contributor: dict[str, str | None] | None = None,
) -> str:
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
    if contributor:
        conn.execute(
            "UPDATE games SET contributor_nick = ?, contributor_url = ? WHERE game_id = ?",
            (contributor.get("nick"), contributor.get("url"), record["game_id"]),
        )
    conn.commit()
    return record["game_id"]


def list_games(
    conn: sqlite3.Connection, limit: int | None = 50, offset: int = 0
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT game_id, created_at, backend, n_players, outcome_kind, winner_label,
                  final_round, moloch_index, total_welfare, mean_integrity,
                  contributor_nick, contributor_url,
                  json_extract(replay_json, '$.outcome.winner_id') AS winner_id
           FROM games ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?""",
        (-1 if limit is None else limit, offset),
    ).fetchall()
    # One joined query for the selected page, rather than one replay fetch per game.
    players = conn.execute(
        """SELECT gp.game_id, gp.player_id, gp.model FROM game_players gp
           JOIN (SELECT game_id FROM games ORDER BY created_at DESC, rowid DESC
                 LIMIT ? OFFSET ?) page ON page.game_id = gp.game_id
           ORDER BY gp.rowid""",
        (-1 if limit is None else limit, offset),
    ).fetchall()
    by_game: dict[str, list[sqlite3.Row]] = {}
    for player in players:
        by_game.setdefault(player["game_id"], []).append(player)
    result = []
    for row in rows:
        game = dict(row)
        winner_id = game.pop("winner_id")
        participants = by_game.get(game["game_id"], [])
        game["participant_models"] = list(dict.fromkeys(p["model"] for p in participants))
        game["winner_model"] = next(
            (p["model"] for p in participants if p["player_id"] == winner_id), None
        )
        result.append(game)
    return result


def get_game(conn: sqlite3.Connection, game_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT replay_json, contributor_nick, contributor_url FROM games WHERE game_id = ?",
        (game_id,),
    ).fetchone()
    if not row:
        return None
    replay = json.loads(row["replay_json"])
    if row["contributor_nick"]:
        replay["contributor"] = {
            "nick": row["contributor_nick"],
            "url": row["contributor_url"],
        }
    return replay


def leaderboard(
    conn: sqlite3.Connection, *, openrouter_only: bool = False
) -> list[dict[str, Any]]:
    """Ranking por modelo, con los dos ejes: rendimiento e integridad."""
    rows = conn.execute(
        """SELECT gp.model,
                  COUNT(DISTINCT gp.game_id) AS games,
                  AVG(gp.payoff)       AS avg_payoff,
                  AVG(gp.integrity)    AS avg_integrity,
                  AVG(gp.fast_rate)    AS avg_fast_rate,
                  AVG(gp.risk)         AS avg_risk,
                  SUM(gp.pledges_made) AS pledges_made,
                  SUM(gp.pledges_kept) AS pledges_kept
           FROM game_players gp
           JOIN games g ON g.game_id = gp.game_id
           WHERE (? = 0 OR g.backend LIKE 'openrouter%')
           GROUP BY gp.model ORDER BY avg_integrity DESC, avg_payoff DESC""",
        (1 if openrouter_only else 0,),
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


def create_web_run(
    conn: sqlite3.Connection,
    *,
    game_id: str,
    seed: int,
    nick: str,
    url: str | None,
    models: list[str],
    budget_limit: float,
) -> None:
    now = _utc_now()
    conn.execute(
        """INSERT INTO web_runs
           (game_id, status, phase, created_at, updated_at, seed, contributor_nick,
            contributor_url, models_json, budget_limit)
           VALUES (?, 'queued', 'queued', ?, ?, ?, ?, ?, ?, ?)""",
        (game_id, now, now, seed, nick, url, json.dumps(models), budget_limit),
    )
    _append_event(conn, game_id, "queued")
    conn.commit()


def update_web_run(
    conn: sqlite3.Connection,
    game_id: str,
    *,
    status: str | None = None,
    phase: str | None = None,
    replay: dict[str, Any] | None = None,
    private_analysis: list[dict[str, Any]] | None = None,
    usage: dict[str, Any] | None = None,
    error_message: str | None = None,
    event_type: str | None = None,
) -> None:
    fields = ["updated_at = ?"]
    values: list[Any] = [_utc_now()]
    for column, value in (("status", status), ("phase", phase)):
        if value is not None:
            fields.append(f"{column} = ?")
            values.append(value)
    if replay is not None:
        fields.append("replay_json = ?")
        values.append(json.dumps(replay, ensure_ascii=False))
    if private_analysis is not None:
        fields.append("private_analysis_json = ?")
        values.append(json.dumps(private_analysis, ensure_ascii=False))
    if usage is not None:
        for column, key in (
            ("spent_usd", "spent_usd"),
            ("calls", "calls"),
            ("prompt_tokens", "prompt_tokens"),
            ("completion_tokens", "completion_tokens"),
        ):
            fields.append(f"{column} = ?")
            values.append(usage.get(key, 0))
    if error_message is not None:
        fields.append("error_message = ?")
        values.append(error_message[:800])
    values.append(game_id)
    conn.execute(f"UPDATE web_runs SET {', '.join(fields)} WHERE game_id = ?", values)
    if event_type:
        _append_event(conn, game_id, event_type)
    conn.commit()


def get_web_run(conn: sqlite3.Connection, game_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        """SELECT game_id, status, phase, created_at, updated_at, seed,
                  contributor_nick, contributor_url, models_json, budget_limit,
                  spent_usd, calls, prompt_tokens, completion_tokens, error_message,
                  replay_json
           FROM web_runs WHERE game_id = ?""",
        (game_id,),
    ).fetchone()
    if not row:
        return None
    result = dict(row)
    result["models"] = json.loads(result.pop("models_json"))
    result["replay"] = (
        json.loads(result.pop("replay_json")) if result["replay_json"] else None
    )
    result["contributor"] = {
        "nick": result.pop("contributor_nick"),
        "url": result.pop("contributor_url"),
    }
    return result


def get_private_analysis(conn: sqlite3.Connection, game_id: str) -> list[dict[str, Any]]:
    row = conn.execute(
        "SELECT private_analysis_json FROM web_runs WHERE game_id = ?", (game_id,)
    ).fetchone()
    return json.loads(row["private_analysis_json"]) if row else []


def get_events_after(
    conn: sqlite3.Connection, game_id: str, after_seq: int
) -> list[dict[str, Any]]:
    return [
        dict(row)
        for row in conn.execute(
            """SELECT seq, created_at, event_type FROM run_events
               WHERE game_id = ? AND seq > ? ORDER BY seq""",
            (game_id, after_seq),
        )
    ]


def list_contributions(conn: sqlite3.Connection, limit: int = 100) -> list[dict[str, Any]]:
    return [
        dict(row)
        for row in conn.execute(
            """SELECT g.game_id, g.created_at, g.contributor_nick AS nick,
                      g.contributor_url AS url, g.n_players, g.outcome_kind,
                      g.moloch_index, g.mean_integrity
               FROM games g
               WHERE g.backend = 'openrouter-web' AND g.contributor_nick IS NOT NULL
               ORDER BY g.created_at DESC, g.rowid DESC LIMIT ?""",
            (limit,),
        )
    ]


def fail_interrupted_runs(conn: sqlite3.Connection) -> int:
    rows = conn.execute(
        "SELECT game_id FROM web_runs WHERE status IN ('queued', 'running')"
    ).fetchall()
    for row in rows:
        update_web_run(
            conn,
            row["game_id"],
            status="failed",
            phase="failed",
            error_message="La ejecución se interrumpió al reiniciarse el servidor.",
            event_type="failed",
        )
    return len(rows)


def _append_event(conn: sqlite3.Connection, game_id: str, event_type: str) -> None:
    next_seq = conn.execute(
        "SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM run_events WHERE game_id = ?",
        (game_id,),
    ).fetchone()["n"]
    conn.execute(
        "INSERT INTO run_events (game_id, seq, created_at, event_type) VALUES (?, ?, ?, ?)",
        (game_id, next_seq, _utc_now(), event_type),
    )


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
