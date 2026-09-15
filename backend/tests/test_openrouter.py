"""Pruebas del adaptador de OpenRouter que no necesitan red.

Cubren lo que de verdad rompe en producción: que la respuesta del modelo se interprete aunque
venga envuelta en prosa o en vallas de código, que una acción ilegible caiga en un valor
seguro en vez de reventar la partida, y que la guardia de presupuesto corte antes de gastar
de más.
"""

from __future__ import annotations

import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from moloch.agents.openrouter import (  # noqa: E402
    BudgetExceeded,
    BudgetGuard,
    OpenRouterAgent,
    OpenRouterError,
    _as_action,
    _parse_json,
)
from moloch.rules import Action  # noqa: E402


# ------------------------------------------------------------------ parseo

def test_parse_plain_json():
    assert _parse_json('{"action": "FAST"}') == {"action": "FAST"}


def test_parse_json_in_code_fence():
    raw = '```json\n{"speech": "hola", "pledge": "SAFE"}\n```'
    assert _parse_json(raw) == {"speech": "hola", "pledge": "SAFE"}


def test_parse_json_surrounded_by_prose():
    raw = 'Claro, aquí tienes:\n{"action": "SAFE"}\nEspero que sirva.'
    assert _parse_json(raw) == {"action": "SAFE"}


def test_parse_garbage_returns_empty_dict():
    assert _parse_json("lo siento, no puedo responder") == {}
    assert _parse_json("") == {}
    assert _parse_json("[1, 2, 3]") == {}


# ------------------------------------------------------------ acciones

@pytest.mark.parametrize(
    "value,expected",
    [
        ("FAST", Action.FAST),
        ("safe", Action.SAFE),
        ("  Fast  ", Action.FAST),
        ("elijo SAFE esta ronda", Action.SAFE),
    ],
)
def test_as_action_reads_the_choice(value, expected):
    assert _as_action(value, Action.SAFE) == expected


def test_as_action_falls_back_when_unreadable():
    """Una respuesta ilegible no puede tumbar la partida: se usa el compromiso público."""
    assert _as_action(None, Action.FAST) == Action.FAST
    assert _as_action("no sé", Action.SAFE) == Action.SAFE
    assert _as_action(42, Action.FAST) == Action.FAST


# ---------------------------------------------------------- presupuesto

def test_budget_accumulates_per_model():
    g = BudgetGuard(limit_usd=1.0)
    g.charge("modelo-a", 0.10)
    g.charge("modelo-b", 0.25)
    g.charge("modelo-a", 0.05)
    assert g.calls == 3
    assert g.spent_usd == pytest.approx(0.40)
    assert g.per_model["modelo-a"] == pytest.approx(0.15)


def test_budget_raises_when_exceeded():
    g = BudgetGuard(limit_usd=0.20)
    g.charge("m", 0.15)
    with pytest.raises(BudgetExceeded):
        g.charge("m", 0.10)


def test_budget_check_blocks_further_calls_once_spent():
    g = BudgetGuard(limit_usd=0.10)
    g.check()  # todavía hay margen
    try:
        g.charge("m", 0.10)
    except BudgetExceeded:
        pass
    with pytest.raises(BudgetExceeded):
        g.check()


def test_budget_summary_is_serialisable():
    g = BudgetGuard(limit_usd=0.5)
    g.charge("m", 0.123456789)
    s = g.summary()
    assert s["limit_usd"] == 0.5
    assert s["calls"] == 1
    assert isinstance(s["per_model"], dict)


def test_agent_requires_an_api_key(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
        OpenRouterAgent("p0", "Helios", "un/modelo", BudgetGuard())


def test_403_preserves_provider_context_and_returns_actionable_message(caplog):
    def handler(request):
        assert request.headers["x-openrouter-metadata"] == "enabled"
        assert "test-secret" not in str(request.url)
        return httpx.Response(
            403,
            headers={"x-request-id": "req-safe-123"},
            json={
                "error": {
                    "code": 403,
                    "message": "Provider not allowed by API key allowlist",
                    "metadata": {"prompt": "must not leak"},
                },
                "openrouter_metadata": {"pipeline": [{"data": {"secret": "hidden"}}]},
            },
        )

    agent = OpenRouterAgent(
        "p0",
        "Helios",
        "deepseek/deepseek-v4.1-flash",
        BudgetGuard(),
        api_key="test-secret",
    )
    agent._client.close()
    agent._client = httpx.Client(transport=httpx.MockTransport(handler))
    with caplog.at_level("INFO"):
        with pytest.raises(OpenRouterError) as caught:
            agent._call([], phase="round_1_meeting")
    agent.close()

    message = str(caught.value)
    assert "HTTP 403" in message
    assert "deepseek/deepseek-v4.1-flash" in message
    assert "ronda 1, intervención pública" in message
    assert "Provider not allowed by API key allowlist" in message
    assert "req-safe-123" in message
    assert "Privacy" in message and "Guardrails" in message
    logs = caplog.text
    assert "openrouter.request.started" in logs
    assert "openrouter.request.failed" in logs
    assert "test-secret" not in logs
    assert "must not leak" not in logs
    assert "hidden" not in logs


def test_429_retries_with_bounded_backoff(monkeypatch):
    attempts = 0

    def handler(_request):
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            return httpx.Response(429, json={"error": {"message": "rate limited"}})
        return httpx.Response(
            200,
            json={
                "id": "gen-ok",
                "model": "vendor/model",
                "provider": "provider",
                "choices": [{"message": {"content": '{"action":"SAFE"}'}, "finish_reason": "stop"}],
                "usage": {"cost": 0.001, "prompt_tokens": 2, "completion_tokens": 1},
            },
        )

    delays = []
    monkeypatch.setattr("moloch.agents.openrouter.time.sleep", delays.append)
    trace = []
    agent = OpenRouterAgent(
        "p0",
        "Helios",
        "vendor/model",
        BudgetGuard(),
        api_key="test-secret",
        audit_sink=trace.append,
    )
    agent._client.close()
    agent._client = httpx.Client(transport=httpx.MockTransport(handler))
    result = agent._call([], phase="paper_round_1_action")
    agent.close()
    assert result.content == '{"action":"SAFE"}'
    assert attempts == 3
    assert delays == [20, 40]
    assert [entry.get("status_code") for entry in trace] == [429, 429, None]
