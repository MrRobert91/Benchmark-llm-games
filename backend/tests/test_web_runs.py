import json
from pathlib import Path

from fastapi.testclient import TestClient

from moloch import api, db, runs
from moloch.agents.openrouter import OpenRouterError
from moloch.agents.base import Speech
from moloch.rules import Action

SNAPSHOT = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "public"
    / "data"
    / "games"
    / "a29f546cf168.json"
)


def test_web_run_keeps_private_analysis_out_of_public_payload(tmp_path):
    conn = db.connect(tmp_path / "runs.db")
    db.create_web_run(
        conn,
        game_id="run-1",
        seed=7,
        nick="Ada",
        url="https://example.com",
        models=["vendor/model"] * 3,
        budget_limit=0.5,
    )
    private = [{"reasoning": "secret", "response_content": "private raw output"}]
    db.update_web_run(
        conn,
        "run-1",
        status="running",
        private_analysis=private,
        event_type="speech",
    )
    public = db.get_web_run(conn, "run-1")
    assert public is not None
    assert "private_analysis" not in public
    assert "secret" not in json.dumps(public)
    assert db.get_private_analysis(conn, "run-1") == private
    conn.close()


def test_openrouter_leaderboard_excludes_scripted_and_keeps_each_contribution(tmp_path):
    conn = db.connect(tmp_path / "leaderboard.db")
    scripted = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    scripted["game_id"] = "scripted-one"
    scripted["backend"] = "scripted"
    web = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    web["game_id"] = "web-one"
    web["backend"] = "openrouter-web"
    db.save_game(conn, scripted)
    db.save_game(conn, web, contributor={"nick": "Ada", "url": "https://example.com"})
    board = db.leaderboard(conn, openrouter_only=True)
    assert sum(row["games"] for row in board) == len(web["players"])
    contributions = db.list_contributions(conn)
    assert contributions == [
        {
            "game_id": "web-one",
            "created_at": web["created_at"],
            "nick": "Ada",
            "url": "https://example.com",
            "n_players": len(web["players"]),
            "outcome_kind": web["outcome"]["kind"],
            "moloch_index": web["metrics"]["moloch_index"],
            "mean_integrity": web["metrics"]["mean_integrity"],
        }
    ]
    conn.close()


def test_create_run_validates_key_but_never_persists_it(tmp_path, monkeypatch):
    database = tmp_path / "api.db"

    class DummyQueue:
        max_waiting = 8
        database_path = database

        def start(self):
            pass

        def submit(self, **kwargs):
            conn = db.connect(database)
            db.create_web_run(
                conn,
                game_id="web-run",
                seed=9,
                nick=kwargs["nick"],
                url=kwargs["url"],
                models=kwargs["models"],
                budget_limit=kwargs["budget"],
            )
            conn.close()
            return "web-run"

    monkeypatch.setattr(api, "DB_PATH", database)
    monkeypatch.setattr(api, "RUN_QUEUE", DummyQueue())
    monkeypatch.setattr(api, "validate_key", lambda key: {"limit_remaining": 2.0})
    monkeypatch.setattr(
        api,
        "list_text_models",
        lambda: [{"id": "vendor/model"}],
    )
    secret = "test-openrouter-key-must-never-be-written"
    with TestClient(api.app) as client:
        response = client.post(
            "/api/runs",
            json={
                "api_key": secret,
                "nick": "Ada",
                "url": "https://example.com",
                "models": ["vendor/model"] * 3,
                "budget_usd": 0.5,
            },
        )
        assert response.status_code == 202
        assert response.json()["game_id"] == "web-run"
    raw_database = database.read_bytes()
    assert secret.encode() not in raw_database


def test_contributor_url_must_use_https():
    try:
        api.CreateRunRequest(
            api_key="test-openrouter-key-shape",
            nick="Ada",
            url="http://example.com",
            models=["vendor/model"] * 3,
        )
    except ValueError as error:
        assert "https://" in str(error)
    else:
        raise AssertionError("HTTP URLs must be rejected")


def test_run_budget_accepts_only_values_between_fifty_cents_and_server_maximum():
    common = {
        "api_key": "test-openrouter-key-shape",
        "nick": "Ada",
        "models": ["vendor/model"] * 3,
    }
    assert api.CreateRunRequest(**common, budget_usd=0.5).budget_usd == 0.5
    assert api.CreateRunRequest(**common, budget_usd=10).budget_usd == 10

    for invalid_budget in (0.49, 10.01):
        try:
            api.CreateRunRequest(**common, budget_usd=invalid_budget)
        except ValueError as error:
            assert "0.50" in str(error)
            assert "10.00" in str(error)
        else:
            raise AssertionError(f"Budget {invalid_budget} should be rejected")


def test_runner_persists_live_events_result_and_private_trace(tmp_path, monkeypatch):
    database = tmp_path / "runner.db"

    class FakeAgent:
        def __init__(self, player_id, label, model, budget, audit_sink, **_kwargs):
            self.player_id = player_id
            self.label = label
            self.model = model
            self.budget = budget
            self.audit_sink = audit_sink

        def speak(self, _view):
            self.budget.charge(self.model, 0.001, prompt_tokens=10, completion_tokens=2)
            self.audit_sink({"player_id": self.player_id, "reasoning": "private"})
            return Speech(self.player_id, "Contengamos la carrera.", Action.SAFE)

        def act(self, _view):
            self.budget.charge(self.model, 0.001, prompt_tokens=10, completion_tokens=2)
            self.audit_sink({"player_id": self.player_id, "reasoning": "private action"})
            return Action.SAFE

        def close(self):
            pass

    monkeypatch.setattr(runs, "OpenRouterAgent", FakeAgent)
    conn = db.connect(database)
    db.create_web_run(
        conn,
        game_id="played-live",
        seed=3,
        nick="Grace",
        url=None,
        models=["vendor/model"] * 3,
        budget_limit=0.5,
    )
    conn.close()
    runner = runs.RunQueue(database)
    item = runs.WorkItem(
        game_id="played-live",
        api_key="ephemeral-secret",
        nick="Grace",
        url=None,
        models=["vendor/model"] * 3,
        seed=3,
        budget=0.5,
    )
    runner._play(item)
    assert item.api_key == ""
    conn = db.connect(database)
    public = db.get_web_run(conn, "played-live")
    assert public is not None and public["status"] == "completed"
    assert public["replay"]["outcome"]["kind"] == "restraint"
    assert "private" not in json.dumps(public)
    assert len(db.get_private_analysis(conn, "played-live")) > 0
    event_types = [event["event_type"] for event in db.get_events_after(conn, "played-live", 0)]
    assert "speaking" in event_types
    assert "speech" in event_types
    assert "round_resolved" in event_types
    assert event_types[-1] == "completed"
    conn.close()


def test_runner_persists_descriptive_openrouter_failure_and_logs_context(
    tmp_path, monkeypatch, caplog
):
    database = tmp_path / "failed-run.db"

    class ForbiddenAgent:
        def __init__(self, player_id, label, model, **_kwargs):
            self.player_id = player_id
            self.label = label
            self.model = model

        def speak(self, _view):
            raise OpenRouterError(
                model=self.model,
                phase="round_1_meeting",
                status_code=403,
                provider_message="Model disabled for this API key",
                request_id="req-403-test",
            )

        def close(self):
            pass

    monkeypatch.setattr(runs, "OpenRouterAgent", ForbiddenAgent)
    conn = db.connect(database)
    db.create_web_run(
        conn,
        game_id="failed-live",
        seed=3,
        nick="Grace",
        url=None,
        models=[
            "deepseek/deepseek-v4.1-flash",
            "meta/muse-spark-1.3-contributor",
            "anthropic/claude-haiku-4.5",
        ],
        budget_limit=0.5,
    )
    conn.close()
    runner = runs.RunQueue(database)
    item = runs.WorkItem(
        game_id="failed-live",
        api_key="ephemeral-secret",
        nick="Grace",
        url=None,
        models=[
            "deepseek/deepseek-v4.1-flash",
            "meta/muse-spark-1.3-contributor",
            "anthropic/claude-haiku-4.5",
        ],
        seed=3,
        budget=0.5,
    )

    with caplog.at_level("INFO"):
        runner._play(item)

    conn = db.connect(database)
    public = db.get_web_run(conn, "failed-live")
    assert public is not None and public["status"] == "failed"
    assert "HTTP 403" in public["error_message"]
    assert "deepseek/deepseek-v4.1-flash" in public["error_message"]
    assert "ronda 1, intervención pública" in public["error_message"]
    assert "Model disabled for this API key" in public["error_message"]
    event_types = [
        event["event_type"] for event in db.get_events_after(conn, "failed-live", 0)
    ]
    assert event_types == ["queued", "started", "speaking", "failed"]
    conn.close()
    assert "run.started run_id=failed-live" in caplog.text
    assert "run.progress run_id=failed-live event=speaking" in caplog.text
    assert "run.failed run_id=failed-live" in caplog.text
    assert "ephemeral-secret" not in caplog.text


def test_public_budget_error_explains_how_to_continue():
    message = runs._public_error(runs.BudgetExceeded("presupuesto agotado: 0.50 / 0.50 USD"))
    assert "presupuesto máximo" in message
    assert "modelos más económicos" in message
