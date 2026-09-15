import argparse
import copy
import json

from fastapi.testclient import TestClient

from moloch import api, db
from moloch.benchmark.versions.paper_2608_01193_v1.agents import build_scripted
from moloch.benchmark.versions.paper_2608_01193_v1.engine import PaperGame
from moloch.cli import cmd_export


def paper_replay(seed=1):
    return PaperGame(
        [build_scripted("AS", "p0", "Safe"), build_scripted("AU", "p1", "Unsafe")],
        risk_treatment=0.6,
        seed=seed,
    ).play().to_dict()


def test_archive_models_resolve_by_player_id_and_preserve_all_strategies(tmp_path):
    conn = db.connect(tmp_path / "models.db")
    replays = [paper_replay(seed) for seed in range(1, 5)]
    try:
        for replay in replays:
            db.save_game(conn, replay)
        by_id = {game["game_id"]: game for game in db.list_games(conn, limit=None)}
        assert len(by_id) == len(replays)
        for replay in replays:
            game = by_id[replay["game_id"]]
            assert set(game["participant_models"]) == {p["model"] for p in replay["players"]}
            winner = next((p["model"] for p in replay["players"] if p["player_id"] == replay["outcome"]["winner_id"]), None)
            assert game["winner_model"] == winner
    finally:
        conn.close()


def test_paginated_api_and_export_include_games_beyond_200(tmp_path, monkeypatch):
    database = tmp_path / "archive.db"
    conn = db.connect(database)
    replay = paper_replay()
    try:
        for index in range(205):
            record = copy.deepcopy(replay)
            record["game_id"] = f"archive-{index:03}"
            db.save_game(conn, record)
    finally:
        conn.close()
    monkeypatch.setattr(api, "DB_PATH", database)
    with TestClient(api.app) as client:
        first = client.get("/api/games?limit=200&offset=0").json()
        last = client.get("/api/games?limit=200&offset=200").json()
        assert len(first) == 200 and len(last) == 5
        assert len({g["game_id"] for g in first + last}) == 205
        assert first[0]["game_id"] == "archive-204"
        assert last[-1]["game_id"] == "archive-000"
        assert client.get(f"/api/games/{last[-1]['game_id']}").status_code == 200
        for query in ["limit=0", "limit=501", "offset=-1"]:
            assert client.get(f"/api/games?{query}").status_code == 422
    out = tmp_path / "export"
    assert cmd_export(argparse.Namespace(db=str(database), out=str(out))) == 0
    assert len(json.loads((out / "games.json").read_text(encoding="utf-8"))) == 205
    assert len(list((out / "games").glob("*.json"))) == 205
