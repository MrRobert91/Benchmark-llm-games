"""API HTTP de Moloch Arena.

    uvicorn moloch.api:app --reload --port 8000
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import db

DB_PATH = Path(os.environ.get("MOLOCH_DB", str(db.DEFAULT_DB)))

app = FastAPI(
    title="Moloch Arena",
    description="Benchmark de carrera armamentística para modelos de lenguaje.",
    version="1.0.0",
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
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _conn():
    return db.connect(DB_PATH)


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
        return {"models": db.leaderboard(conn), "backends": db.moloch_by_backend(conn)}
    finally:
        conn.close()
