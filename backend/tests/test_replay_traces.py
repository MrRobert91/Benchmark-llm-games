import json

from fastapi.testclient import TestClient
from moloch import api, db
from moloch.traces import public_trace
from moloch.benchmark.versions.paper_2608_01193_v1.agents import build_scripted
from moloch.benchmark.versions.paper_2608_01193_v1.engine import PaperGame


def test_trace_preserves_full_text_and_marks_ciphertext_without_publishing_it():
    text = "observed reasoning " * 2000
    projected = public_trace({"phase": "paper_round_12_action", "reasoning": text,
        "response_content": '{"action":"SAFE"}',
        "request_messages": [{"role": "user", "content": "state", "secret": "credential"}],
        "reasoning_details": [{"type": "reasoning.encrypted", "data": "ciphertext"},
                              {"type": "reasoning.summary", "summary": "readable summary"}],
        "authorization": "credential"}, 3)
    assert projected["reasoning"] == text
    assert projected["round"] == 12
    assert projected["encrypted_blocks"] == 1
    assert projected["reasoning_details"] == [{"type": "reasoning.summary", "text": "readable summary"}]
    assert "ciphertext" not in json.dumps(projected)
    assert "credential" not in json.dumps(projected)


def test_trace_endpoint_keeps_live_decisions_sealed_and_preserves_attempt_order(tmp_path, monkeypatch):
    database = tmp_path / "traces.db"
    monkeypatch.setattr(api, "DB_PATH", database)
    conn = db.connect(database)
    db.create_web_run(conn, game_id="recorded", seed=7, nick="Ada", url=None,
                      models=["vendor/model"] * 2, budget_limit=1)
    db.update_web_run(conn, "recorded", status="running")
    record = PaperGame([build_scripted("AS", "p0", "A"), build_scripted("AU", "p1", "B")],
                       risk_treatment=.6, seed=7).play().to_dict()
    record["game_id"] = "recorded"
    db.save_game(conn, record)
    db.save_provider_calls(conn, "recorded", [
        {"player_id": "p0", "phase": "paper_round_1_action", "status_code": 400},
        {"player_id": "p0", "phase": "paper_round_1_action", "response_content": "SAFE", "reasoning": "observed"},
    ])
    with TestClient(api.app) as client:
        assert client.get("/api/games/recorded/traces").status_code == 409
        assert client.get("/api/games/missing/traces").status_code == 404
        db.update_web_run(conn, "recorded", status="completed")
        result = client.get("/api/games/recorded/traces").json()
        assert [c["call_index"] for c in result["calls"]] == [1, 2]
        assert result["calls"][1]["reasoning"] == "observed"
        assert result["calls"][0]["response_content"] is None
    conn.close()
