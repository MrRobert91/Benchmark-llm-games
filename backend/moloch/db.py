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

CREATE TABLE IF NOT EXISTS benchmark_versions (
    benchmark_version TEXT PRIMARY KEY,
    protocol_version  TEXT NOT NULL,
    spec_hash         TEXT NOT NULL,
    protocol_hash     TEXT NOT NULL,
    definition_json  TEXT NOT NULL,
    created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experiments (
    experiment_id    TEXT PRIMARY KEY,
    benchmark_version TEXT NOT NULL,
    protocol_version TEXT NOT NULL,
    preset           TEXT NOT NULL,
    manifest_hash    TEXT NOT NULL UNIQUE,
    status           TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    manifest_json    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experiment_cells (
    experiment_id    TEXT NOT NULL REFERENCES experiments(experiment_id) ON DELETE CASCADE,
    cell_id          TEXT NOT NULL,
    model            TEXT NOT NULL,
    models_json      TEXT NOT NULL,
    risk_treatment   REAL NOT NULL,
    repetition       INTEGER NOT NULL,
    seed             INTEGER NOT NULL,
    evidence         TEXT NOT NULL,
    comparison_group TEXT NOT NULL,
    game_id          TEXT,
    status           TEXT NOT NULL DEFAULT 'planned',
    PRIMARY KEY (experiment_id, cell_id)
);

CREATE TABLE IF NOT EXISTS race_decisions (
    game_id          TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
    round_index      INTEGER NOT NULL,
    player_id        TEXT NOT NULL,
    state_before_hash TEXT NOT NULL,
    action           TEXT NOT NULL,
    stage_payoff     REAL NOT NULL,
    action_readable  INTEGER NOT NULL,
    strict_format    INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (game_id, round_index, player_id)
);

CREATE TABLE IF NOT EXISTS terminal_results (
    game_id          TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
    player_id        TEXT NOT NULL,
    is_leader        INTEGER NOT NULL,
    stage_payoff     REAL NOT NULL,
    prize_share      REAL NOT NULL,
    risk_probability REAL NOT NULL,
    setback_roll     REAL,
    setback          INTEGER NOT NULL,
    payoff_before_setback REAL NOT NULL,
    payoff           REAL NOT NULL,
    PRIMARY KEY (game_id, player_id)
);

CREATE TABLE IF NOT EXISTS provider_calls (
    game_id          TEXT NOT NULL,
    call_index       INTEGER NOT NULL,
    player_id        TEXT,
    phase            TEXT,
    requested_model  TEXT,
    served_model     TEXT,
    provider         TEXT,
    response_id      TEXT,
    prompt_tokens    INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd         REAL NOT NULL DEFAULT 0,
    latency_ms       INTEGER,
    trace_json       TEXT NOT NULL,
    PRIMARY KEY (game_id, call_index)
);
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
    # Trazabilidad del parser. Se añaden en caliente para no romper bases ya existentes.
    _ensure_column(conn, "games", "parse_failures", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column(conn, "games", "contaminated", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column(conn, "games", "integrity_confidence", "REAL NOT NULL DEFAULT 1.0")
    _ensure_column(conn, "game_players", "parse_failures", "INTEGER NOT NULL DEFAULT 0")
    if _ensure_column(conn, "game_players", "pledges_scored", "INTEGER NOT NULL DEFAULT 0"):
        _backfill_scored_pledges(conn)
    _ensure_column(conn, "web_runs", "parse_incidents_json", "TEXT NOT NULL DEFAULT '[]'")
    _ensure_column(conn, "web_runs", "parse_failures", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column(
        conn, "games", "benchmark_version", "TEXT NOT NULL DEFAULT 'legacy-moloch-v0'"
    )
    _ensure_column(
        conn, "games", "protocol_version", "TEXT NOT NULL DEFAULT 'legacy-council-v0'"
    )
    _ensure_column(conn, "games", "spec_hash", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "games", "protocol_hash", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "games", "admission_status", "TEXT NOT NULL DEFAULT 'legacy'")
    _ensure_column(conn, "games", "risk_treatment", "REAL")
    _ensure_column(conn, "games", "experiment_id", "TEXT")
    _ensure_column(conn, "games", "cell_id", "TEXT")
    _ensure_column(conn, "game_players", "unsafe_rate", "REAL")
    _ensure_column(conn, "game_players", "stage_payoff", "REAL")
    _ensure_column(conn, "game_players", "prize_share", "REAL")
    _ensure_column(conn, "game_players", "risk_probability", "REAL")
    _ensure_column(conn, "game_players", "setback", "INTEGER")
    _ensure_column(
        conn, "web_runs", "benchmark_version", "TEXT NOT NULL DEFAULT 'legacy-moloch-v0'"
    )
    _ensure_column(
        conn, "web_runs", "protocol_version", "TEXT NOT NULL DEFAULT 'legacy-council-v0'"
    )
    _ensure_column(conn, "web_runs", "risk_treatment", "REAL")
    _ensure_column(conn, "race_decisions", "strict_format", "INTEGER NOT NULL DEFAULT 1")
    _ensure_column(conn, "experiment_cells", "error_message", "TEXT")
    _ensure_column(conn, "experiment_cells", "usage_json", "TEXT")
    _ensure_column(conn, "experiment_cells", "partial_replay_json", "TEXT")
    _ensure_column(conn, "provider_calls", "experiment_id", "TEXT")
    _ensure_column(conn, "provider_calls", "cell_id", "TEXT")
    _ensure_column(conn, "provider_calls", "status_code", "INTEGER")
    conn.execute(
        """UPDATE provider_calls
           SET experiment_id = (SELECT g.experiment_id FROM games g
                                WHERE g.game_id = provider_calls.game_id),
               cell_id = (SELECT g.cell_id FROM games g
                          WHERE g.game_id = provider_calls.game_id)
           WHERE experiment_id IS NULL OR cell_id IS NULL"""
    )
    _register_benchmarks(conn)
    return conn


def _register_benchmarks(conn: sqlite3.Connection) -> None:
    from .benchmark.registry import list_benchmarks

    now = _utc_now()
    for definition in list_benchmarks():
        conn.execute(
            """INSERT INTO benchmark_versions
               (benchmark_version, protocol_version, spec_hash, protocol_hash,
                definition_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(benchmark_version) DO UPDATE SET
                 protocol_version=excluded.protocol_version,
                 spec_hash=excluded.spec_hash,
                 protocol_hash=excluded.protocol_hash,
                 definition_json=excluded.definition_json""",
            (
                definition["benchmark_version"],
                definition["protocol_version"],
                definition["spec_hash"],
                definition["protocol_hash"],
                json.dumps(definition, ensure_ascii=False, sort_keys=True),
                now,
            ),
        )
    conn.commit()


def _ensure_column(
    conn: sqlite3.Connection, table: str, column: str, declaration: str
) -> bool:
    """Añade la columna si falta. Devuelve ``True`` cuando la acaba de crear."""
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column in columns:
        return False
    conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")
    return True


def _backfill_scored_pledges(conn: sqlite3.Connection) -> None:
    """Las partidas anteriores al control de parseo se puntuaron enteras: así se registran.

    Sin esto, `pledges_scored` se quedaría a 0 en las filas antiguas y el leaderboard daría
    su integridad por desconocida, que es el error contrario al que se está corrigiendo.
    """
    conn.execute(
        "UPDATE game_players SET pledges_scored = pledges_made "
        "WHERE pledges_scored = 0 AND pledges_made > 0"
    )


def save_game(
    conn: sqlite3.Connection,
    record: dict[str, Any],
    contributor: dict[str, str | None] | None = None,
) -> str:
    metrics = record["metrics"]
    outcome = record["outcome"]
    parse_failures = int(metrics.get("parse_failures") or 0)
    conn.execute(
        """INSERT OR REPLACE INTO games
           (game_id, created_at, seed, backend, n_players, outcome_kind, winner_label,
            final_round, moloch_index, total_welfare, mean_integrity, replay_json,
            parse_failures, contaminated, integrity_confidence)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            record["game_id"],
            record["created_at"],
            record["seed"],
            record["backend"],
            len(record["players"]),
            outcome["kind"],
            outcome.get("winner_label"),
            outcome["final_round"],
            float(metrics.get("moloch_index") or 0.0),
            float(metrics.get("total_welfare") or 0.0),
            # La columna no admite nulo: se guarda 0 y se distingue con integrity_confidence.
            metrics["mean_integrity"] if metrics.get("mean_integrity") is not None else 0.0,
            json.dumps(record, ensure_ascii=False),
            parse_failures,
            1 if metrics.get("contaminated") else 0,
            float(metrics.get("integrity_confidence", 1.0)),
        ),
    )
    conn.execute(
        """UPDATE games SET benchmark_version = ?, protocol_version = ?, spec_hash = ?,
                  protocol_hash = ?, admission_status = ?, risk_treatment = ?,
                  experiment_id = ?, cell_id = ? WHERE game_id = ?""",
        (
            record.get("benchmark_version", "legacy-moloch-v0"),
            record.get("protocol_version", "legacy-council-v0"),
            record.get("spec_hash", ""),
            record.get("protocol_hash", ""),
            record.get("admission_status", "legacy"),
            record.get("risk_treatment"),
            record.get("experiment_id"),
            record.get("cell_id"),
            record["game_id"],
        ),
    )
    conn.execute("DELETE FROM game_players WHERE game_id = ?", (record["game_id"],))
    for p in metrics["players"]:
        conn.execute(
            """INSERT INTO game_players
               (game_id, player_id, label, model, progress, risk, payoff, integrity,
                fast_rate, pledges_made, pledges_kept, parse_failures, pledges_scored)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                record["game_id"],
                p["player_id"],
                p["label"],
                p["model"],
                p["progress"],
                p["risk"],
                p["payoff"],
                p["integrity"] if p.get("integrity") is not None else 0.0,
                p["fast_rate"],
                p["pledges_made"],
                p["pledges_kept"],
                int(p.get("parse_failures") or 0),
                int(p.get("pledges_scored", p.get("pledges_made") or 0)),
            ),
        )
        conn.execute(
            """UPDATE game_players SET unsafe_rate = ?, stage_payoff = ?, prize_share = ?,
                      risk_probability = ?, setback = ?
               WHERE game_id = ? AND player_id = ?""",
            (
                p.get("unsafe_rate"),
                p.get("stage_payoff"),
                p.get("prize_share"),
                p.get("risk"),
                None if p.get("setback") is None else int(bool(p.get("setback"))),
                record["game_id"],
                p["player_id"],
            ),
        )
    _save_normalized_paper_trace(conn, record)
    if contributor:
        conn.execute(
            "UPDATE games SET contributor_nick = ?, contributor_url = ? WHERE game_id = ?",
            (contributor.get("nick"), contributor.get("url"), record["game_id"]),
        )
    conn.commit()
    return record["game_id"]


def _save_normalized_paper_trace(conn: sqlite3.Connection, record: dict[str, Any]) -> None:
    if not str(record.get("benchmark_version", "")).startswith("moloch-arena-v1-paper"):
        return
    game_id = record["game_id"]
    conn.execute("DELETE FROM race_decisions WHERE game_id = ?", (game_id,))
    for round_record in record.get("rounds", []):
        for action in round_record.get("actions", []):
            conn.execute(
                """INSERT INTO race_decisions
                   (game_id, round_index, player_id, state_before_hash, action,
                    stage_payoff, action_readable, strict_format)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    game_id,
                    round_record["index"],
                    action["player_id"],
                    round_record.get("state_before_hash", ""),
                    action["action"],
                    float(action.get("stage_payoff") or 0),
                    int(bool(action.get("action_readable", True))),
                    int(bool(action.get("strict_format", True))),
                ),
            )
    conn.execute("DELETE FROM terminal_results WHERE game_id = ?", (game_id,))
    for result in record.get("outcome", {}).get("terminal_results", []):
        conn.execute(
            """INSERT INTO terminal_results
               (game_id, player_id, is_leader, stage_payoff, prize_share,
                risk_probability, setback_roll, setback, payoff_before_setback, payoff)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                game_id,
                result["player_id"],
                int(bool(result["is_leader"])),
                result["stage_payoff"],
                result["prize_share"],
                result["risk_probability"],
                result.get("setback_roll"),
                int(bool(result["setback"])),
                result["payoff_before_setback"],
                result["payoff"],
            ),
        )


def list_games(
    conn: sqlite3.Connection, limit: int | None = 50, offset: int = 0
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT game_id, created_at, backend, n_players, outcome_kind, winner_label,
                  final_round, moloch_index, total_welfare, mean_integrity,
                  contributor_nick, contributor_url, benchmark_version, protocol_version,
                  admission_status, risk_treatment, experiment_id,
                  json_extract(replay_json, '$.metrics.unsafe_rate') AS unsafe_rate,
                  json_extract(replay_json, '$.metrics.mean_payoff') AS mean_payoff,
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
    """Ranking por modelo, con los dos ejes: rendimiento e integridad.

    La integridad se calcula sobre las promesas realmente puntuables (``pledges_scored``), no
    promediando la columna ``integrity`` fila a fila. La diferencia importa: una fila sin
    ninguna ronda legible guarda 0.0 por restricción de esquema, y promediarla mentiría igual
    que el 1.0 que se guardaba antes. Las rondas que el parser no pudo leer se cuentan aparte,
    en ``parse_failures``, en vez de colarse como promesas cumplidas.
    """
    rows = conn.execute(
        """SELECT gp.model,
                  COUNT(DISTINCT gp.game_id) AS games,
                  AVG(gp.payoff)       AS avg_payoff,
                  AVG(gp.fast_rate)    AS avg_fast_rate,
                  AVG(gp.risk)         AS avg_risk,
                  SUM(gp.pledges_made)   AS pledges_made,
                  SUM(gp.pledges_kept)   AS pledges_kept,
                  SUM(gp.pledges_scored) AS pledges_scored,
                  SUM(gp.parse_failures) AS parse_failures,
                  COUNT(DISTINCT CASE WHEN gp.parse_failures > 0 THEN gp.game_id END)
                      AS contaminated_games
           FROM game_players gp
           JOIN games g ON g.game_id = gp.game_id
           WHERE g.benchmark_version = 'legacy-moloch-v0'
             AND (? = 0 OR g.backend LIKE 'openrouter%')
           GROUP BY gp.model""",
        (1 if openrouter_only else 0,),
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        scored = d["pledges_scored"] or 0
        rounds = scored + (d["parse_failures"] or 0)
        d["avg_payoff"] = round(d["avg_payoff"], 2)
        #: ``None`` cuando no hubo ni una ronda legible: desconocida, no perfecta.
        d["avg_integrity"] = round(d["pledges_kept"] / scored, 4) if scored else None
        #: Qué parte de las rondas de este modelo se pudo leer. Debajo de 1.0, desconfía.
        d["parse_success_rate"] = round(scored / rounds, 4) if rounds else 0.0
        d["avg_fast_rate"] = round(d["avg_fast_rate"], 4)
        d["avg_risk"] = round(d["avg_risk"], 2)
        out.append(d)
    out.sort(
        key=lambda d: (d["avg_integrity"] is not None, d["avg_integrity"] or 0, d["avg_payoff"]),
        reverse=True,
    )
    return out


def paper_leaderboard(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT gp.model, g.risk_treatment, g.protocol_version,
                  COUNT(DISTINCT gp.game_id) AS games,
                  SUM(CASE WHEN g.admission_status = 'admitted' THEN 1 ELSE 0 END)
                      AS admitted_trajectories,
                  AVG(CASE WHEN g.admission_status = 'admitted' THEN gp.payoff END)
                      AS avg_payoff,
                  AVG(CASE WHEN g.admission_status = 'admitted' THEN gp.unsafe_rate END)
                      AS avg_unsafe_rate,
                  SUM(gp.parse_failures) AS parse_failures,
                  COUNT(DISTINCT CASE WHEN g.contaminated = 1 THEN g.game_id END)
                      AS contaminated_games
           FROM game_players gp
           JOIN games g ON g.game_id = gp.game_id
           WHERE g.benchmark_version = 'moloch-arena-v1-paper-2608.01193v1'
           GROUP BY gp.model, g.risk_treatment, g.protocol_version
           ORDER BY gp.model, g.risk_treatment"""
    ).fetchall()
    return [
        {
            **dict(row),
            "avg_payoff": None
            if row["avg_payoff"] is None
            else round(float(row["avg_payoff"]), 6),
            "avg_unsafe_rate": None
            if row["avg_unsafe_rate"] is None
            else round(float(row["avg_unsafe_rate"]), 6),
        }
        for row in rows
    ]


def moloch_by_backend(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT backend, COUNT(*) AS games, AVG(moloch_index) AS avg_moloch,
                  SUM(outcome_kind = 'catastrophe') AS catastrophes,
                  SUM(outcome_kind = 'restraint')   AS restraints,
                  SUM(outcome_kind = 'aligned_win') AS aligned_wins
           FROM games WHERE benchmark_version = 'legacy-moloch-v0' GROUP BY backend"""
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
    benchmark_version: str = "legacy-moloch-v0",
    protocol_version: str = "legacy-council-v0",
    risk_treatment: float | None = None,
) -> None:
    now = _utc_now()
    conn.execute(
        """INSERT INTO web_runs
           (game_id, status, phase, created_at, updated_at, seed, contributor_nick,
            contributor_url, models_json, budget_limit)
           VALUES (?, 'queued', 'queued', ?, ?, ?, ?, ?, ?, ?)""",
        (game_id, now, now, seed, nick, url, json.dumps(models), budget_limit),
    )
    conn.execute(
        """UPDATE web_runs SET benchmark_version = ?, protocol_version = ?,
                  risk_treatment = ? WHERE game_id = ?""",
        (benchmark_version, protocol_version, risk_treatment, game_id),
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
    parse_incidents: list[dict[str, Any]] | None = None,
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
    if parse_incidents is not None:
        # Los fallos del parser se guardan aunque la partida termine bien: son la prueba de
        # que esa ejecución quedó contaminada y el material para arreglar el parser.
        fields.append("parse_incidents_json = ?")
        values.append(json.dumps(parse_incidents, ensure_ascii=False))
        fields.append("parse_failures = ?")
        values.append(len(parse_incidents))
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
                  replay_json, parse_incidents_json, parse_failures,
                  benchmark_version, protocol_version, risk_treatment
           FROM web_runs WHERE game_id = ?""",
        (game_id,),
    ).fetchone()
    if not row:
        return None
    result = dict(row)
    result["models"] = json.loads(result.pop("models_json"))
    # Público a propósito: a diferencia de private_analysis, una incidencia de parseo no
    # contiene el prompt ni el razonamiento, solo un extracto de la respuesta y el motivo.
    result["parse_incidents"] = json.loads(result.pop("parse_incidents_json") or "[]")
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
               WHERE g.backend = 'openrouter-web'
                 AND g.benchmark_version = 'legacy-moloch-v0'
                 AND g.contributor_nick IS NOT NULL
               ORDER BY g.created_at DESC, g.rowid DESC LIMIT ?""",
            (limit,),
        )
    ]


def save_provider_calls(
    conn: sqlite3.Connection,
    game_id: str,
    calls: list[dict[str, Any]],
    *,
    experiment_id: str | None = None,
    cell_id: str | None = None,
) -> None:
    conn.execute("DELETE FROM provider_calls WHERE game_id = ?", (game_id,))
    for index, call in enumerate(calls, start=1):
        usage = call.get("usage") or {}
        conn.execute(
            """INSERT INTO provider_calls
               (game_id, call_index, player_id, phase, requested_model, served_model,
                provider, response_id, prompt_tokens, completion_tokens, cost_usd,
                latency_ms, trace_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                game_id,
                index,
                call.get("player_id"),
                call.get("phase"),
                call.get("model"),
                call.get("served_model"),
                call.get("provider"),
                call.get("response_id"),
                int(usage.get("prompt_tokens") or 0),
                int(usage.get("completion_tokens") or 0),
                float(usage.get("cost") or 0),
                call.get("latency_ms"),
                json.dumps(call, ensure_ascii=False),
            ),
        )
        conn.execute(
            """UPDATE provider_calls SET experiment_id = ?, cell_id = ?
               WHERE game_id = ? AND call_index = ?""",
            (experiment_id, cell_id, game_id, index),
        )
        conn.execute(
            """UPDATE provider_calls SET status_code = ?
               WHERE game_id = ? AND call_index = ?""",
            (call.get("status_code"), game_id, index),
        )
    conn.commit()


def save_experiment(conn: sqlite3.Connection, manifest: dict[str, Any]) -> str:
    conn.execute(
        """INSERT INTO experiments
           (experiment_id, benchmark_version, protocol_version, preset, manifest_hash,
            status, created_at, manifest_json)
           VALUES (?, ?, ?, ?, ?, 'planned', ?, ?)
           ON CONFLICT(experiment_id) DO UPDATE SET manifest_json=excluded.manifest_json""",
        (
            manifest["experiment_id"],
            manifest["benchmark_version"],
            manifest["protocol_version"],
            manifest["preset"],
            manifest["manifest_hash"],
            manifest["created_at"],
            json.dumps(manifest, ensure_ascii=False, sort_keys=True),
        ),
    )
    for cell in manifest["cells"]:
        conn.execute(
            """INSERT INTO experiment_cells
               (experiment_id, cell_id, model, models_json, risk_treatment, repetition,
                seed, evidence, comparison_group)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(experiment_id, cell_id) DO NOTHING""",
            (
                manifest["experiment_id"],
                cell["cell_id"],
                cell["model"],
                json.dumps(cell["models"]),
                cell["risk_treatment"],
                cell["repetition"],
                cell["seed"],
                cell["evidence"],
                cell["comparison_group"],
            ),
        )
    conn.commit()
    return manifest["experiment_id"]


def get_experiment(conn: sqlite3.Connection, experiment_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT manifest_json, status FROM experiments WHERE experiment_id = ?",
        (experiment_id,),
    ).fetchone()
    if row is None:
        return None
    manifest = json.loads(row["manifest_json"])
    manifest["status"] = row["status"]
    manifest["cells"] = [
        {
            **dict(cell),
            "models": json.loads(cell["models_json"]),
        }
        for cell in conn.execute(
            """SELECT cell_id, model, models_json, risk_treatment, repetition, seed,
                      evidence, comparison_group, game_id, status, error_message,
                      usage_json, partial_replay_json
               FROM experiment_cells WHERE experiment_id = ? ORDER BY rowid""",
            (experiment_id,),
        )
    ]
    for cell in manifest["cells"]:
        cell.pop("models_json", None)
        cell["usage"] = json.loads(cell.pop("usage_json") or "null")
        cell["partial_replay"] = json.loads(cell.pop("partial_replay_json") or "null")
    return manifest


def update_experiment_cell(
    conn: sqlite3.Connection,
    experiment_id: str,
    cell_id: str,
    *,
    status: str,
    game_id: str | None = None,
    error_message: str | None = None,
    usage: dict[str, Any] | None = None,
    partial_replay: dict[str, Any] | None = None,
) -> None:
    conn.execute(
        """UPDATE experiment_cells SET status = ?, game_id = COALESCE(?, game_id),
                  error_message = ?, usage_json = ?, partial_replay_json = ?
           WHERE experiment_id = ? AND cell_id = ?""",
        (
            status,
            game_id,
            error_message,
            json.dumps(usage, ensure_ascii=False) if usage is not None else None,
            json.dumps(partial_replay, ensure_ascii=False)
            if partial_replay is not None
            else None,
            experiment_id,
            cell_id,
        ),
    )
    counts = conn.execute(
        """SELECT COUNT(*) AS total,
                  SUM(status = 'completed') AS completed,
                  SUM(status = 'failed') AS failed
           FROM experiment_cells WHERE experiment_id = ?""",
        (experiment_id,),
    ).fetchone()
    experiment_status = "running"
    if counts and counts["completed"] == counts["total"]:
        experiment_status = "completed"
    elif counts and counts["failed"]:
        experiment_status = "incomplete"
    conn.execute(
        "UPDATE experiments SET status = ? WHERE experiment_id = ?",
        (experiment_status, experiment_id),
    )
    conn.commit()


def experiment_records(
    conn: sqlite3.Connection, experiment_id: str
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT g.replay_json FROM games g
           JOIN experiment_cells c ON c.game_id = g.game_id
           WHERE c.experiment_id = ? AND c.status = 'completed'
           ORDER BY c.rowid""",
        (experiment_id,),
    ).fetchall()
    return [json.loads(row["replay_json"]) for row in rows]


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
        experiment_cell = conn.execute(
            """SELECT experiment_id, cell_id FROM experiment_cells
               WHERE game_id = ? AND status IN ('queued', 'running')""",
            (row["game_id"],),
        ).fetchone()
        if experiment_cell:
            update_experiment_cell(
                conn,
                experiment_cell["experiment_id"],
                experiment_cell["cell_id"],
                status="failed",
                game_id=row["game_id"],
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
