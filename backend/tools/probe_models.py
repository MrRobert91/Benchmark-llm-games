"""Sonda de compatibilidad: qué modelos de OpenRouter saben jugar esta partida.

POR QUÉ EXISTE
--------------
El benchmark deja elegir cualquier modelo del catálogo, pero no todos contestan igual al
mismo prompt. Antes de este script, la única forma de descubrir que un modelo era ilegible
era lanzar una partida entera y mirar un replay con la integridad inflada. La sonda hace las
dos llamadas reales de una ronda (reunión y acción) contra cada modelo, pasa la respuesta por
el parser de verdad (`moloch.agents.parsing`) y dice, por modelo:

- si el JSON salió limpio, con arreglos, o directamente ilegible;
- qué arreglos hicieron falta (valla de código, prosa alrededor, comillas tipográficas…);
- cuántos tokens se fueron en razonamiento y si el contenido llegó vacío;
- con qué modo de razonamiento acabó funcionando y cuántos reintentos costó;
- cuánto costó en dólares.

Gasta dinero real, así que trae su propia guardia de presupuesto y se para al llegar al tope.

USO
---
    export OPENROUTER_API_KEY=...
    python -m tools.probe_models --budget 2.00
    python -m tools.probe_models --models openai/gpt-5-nano qwen/qwen3.7-flash
    python -m tools.probe_models --max-price 0.5 --limit 20 --out informe.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from moloch.agents import parsing  # noqa: E402
from moloch.agents.base import GameView, PlayerState  # noqa: E402
from moloch.agents.openrouter import (  # noqa: E402
    BudgetExceeded,
    BudgetGuard,
    OpenRouterAgent,
    OpenRouterError,
)
from moloch.openrouter_catalog import list_text_models  # noqa: E402
from moloch.rules import Action, Rules  # noqa: E402

RULES = Rules()


def build_view(round_index: int = 3) -> GameView:
    """Un estado de media partida: hay líder, hay riesgo acumulado y hay tentación."""
    me = PlayerState(player_id="p0", label="Helios", model="probe", progress=8, risk=4)
    rivals = [
        PlayerState(player_id="p1", label="Vantage", model="rival", progress=10, risk=3),
        PlayerState(player_id="p2", label="Kepler", model="rival", progress=6, risk=1),
    ]
    return GameView(
        rules=RULES,
        round_index=round_index,
        me=me,
        others=rivals,
        meeting_so_far=[],
        last_round_actions={"p1": Action.FAST, "p2": Action.SAFE},
        pledges={"p1": Action.SAFE, "p2": Action.FAST},
    )


def probe(model: str, guard: BudgetGuard, api_key: str, timeout: float) -> dict[str, Any]:
    """Juega media ronda contra un modelo y describe cómo responde."""
    calls: list[dict[str, Any]] = []

    def audit(entry: dict[str, Any]) -> None:
        calls.append(entry)

    agent = OpenRouterAgent(
        player_id="p0",
        label="Helios",
        model=model,
        budget=guard,
        api_key=api_key,
        timeout=timeout,
        audit_sink=audit,
    )
    report: dict[str, Any] = {"model": model, "phases": {}}
    started = time.monotonic()
    try:
        view = build_view()
        speech = agent.speak(view)
        report["phases"]["meeting"] = {
            "pledge": speech.pledge.value,
            "readable": agent.last_pledge_readable,
            "speech": speech.text[:160],
        }
        view.pledges["p0"] = speech.pledge
        action = agent.act(view)
        report["phases"]["action"] = {
            "action": action.value,
            "readable": agent.last_action_readable,
        }
        report["status"] = (
            "ok"
            if agent.last_pledge_readable and agent.last_action_readable
            else "unreadable"
        )
    except OpenRouterError as exc:
        report["status"] = "error"
        report["error"] = exc.public_message()
        report["status_code"] = exc.status_code
    except BudgetExceeded:
        report["status"] = "budget_exhausted"
        raise
    finally:
        report["incidents"] = agent.pop_parse_incidents()
        report["calls"] = [
            {
                "phase": call.get("phase"),
                "attempt": call.get("attempt"),
                "reasoning_mode": call.get("reasoning_mode"),
                "finish_reason": call.get("finish_reason"),
                "max_tokens": call.get("max_tokens"),
                "content_chars": len(call.get("response_content") or ""),
                "served_model": call.get("served_model"),
                "provider": call.get("provider"),
                "excerpt": parsing.excerpt(call.get("response_content") or "", 200),
                "parse": _describe(call.get("response_content") or ""),
            }
            for call in calls
        ]
        report["elapsed_s"] = round(time.monotonic() - started, 2)
        report["cost_usd"] = round(guard.per_model.get(model, 0.0), 6)
        agent.close()
    return report


def _describe(content: str) -> dict[str, Any]:
    outcome = parsing.parse_json_object(content)
    return {
        "ok": outcome.ok,
        "strategy": outcome.strategy,
        "repairs": list(outcome.repairs),
        "reason": outcome.reason,
        "clean": outcome.clean,
    }


def pick_models(args: argparse.Namespace) -> list[str]:
    if args.models:
        return list(args.models)
    catalog = list_text_models()
    priced = [
        m
        for m in catalog
        if 0 < m["pricing"]["prompt"] <= args.max_price and m["pricing"]["request"] == 0
    ]
    priced.sort(key=lambda m: m["pricing"]["prompt"] + m["pricing"]["completion"])
    return [m["id"] for m in priced[: args.limit]]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="probe_models", description="Sonda de compatibilidad de modelos"
    )
    parser.add_argument("--models", nargs="*", help="modelos concretos a probar")
    parser.add_argument("--budget", type=float, default=2.0, help="tope de gasto en USD")
    parser.add_argument("--max-price", type=float, default=0.5, help="$/M de prompt máximo")
    parser.add_argument("--limit", type=int, default=15, help="cuántos modelos del catálogo")
    parser.add_argument("--timeout", type=float, default=90.0)
    parser.add_argument("--out", help="fichero JSON con el informe completo")
    args = parser.parse_args(argv)

    import os

    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key:
        print("falta OPENROUTER_API_KEY", file=sys.stderr)
        return 2

    try:
        models = pick_models(args)
    except httpx.HTTPError as exc:
        print(f"no se pudo leer el catálogo de OpenRouter: {exc}", file=sys.stderr)
        return 1
    if not models:
        print("ningún modelo seleccionado", file=sys.stderr)
        return 1

    guard = BudgetGuard(limit_usd=args.budget)
    reports: list[dict[str, Any]] = []
    for model in models:
        try:
            reports.append(probe(model, guard, api_key, args.timeout))
        except BudgetExceeded as exc:
            print(f"\npresupuesto agotado: {exc}", file=sys.stderr)
            break
        except Exception as exc:  # noqa: BLE001 - una sonda no debe morir por un modelo
            reports.append({"model": model, "status": "crash", "error": str(exc)[:200]})
        _print_row(reports[-1])

    print(f"\nGasto total: {guard.spent_usd:.4f} USD en {guard.calls} llamadas")
    ok = [r for r in reports if r.get("status") == "ok"]
    print(f"Modelos utilizables: {len(ok)}/{len(reports)}")
    if args.out:
        Path(args.out).write_text(
            json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"Informe completo en {args.out}")
    return 0


def _print_row(report: dict[str, Any]) -> None:
    status = report.get("status", "?")
    repairs = sorted(
        {r for call in report.get("calls", []) for r in call["parse"]["repairs"]}
    )
    modes = sorted({str(call.get("reasoning_mode")) for call in report.get("calls", [])})
    attempts = max((call.get("attempt") or 1) for call in report.get("calls", [])) if report.get("calls") else 0
    reasons = sorted({str(i.get("reason")) for i in report.get("incidents", [])})
    print(
        f"{status:<16} {report['model']:<45} "
        f"reasoning={','.join(modes) or '-':<12} attempts={attempts} "
        f"repairs={','.join(repairs) or '-':<24} "
        f"fallos={','.join(reasons) or '-':<20} "
        f"{report.get('cost_usd', 0):.5f} USD"
    )
    if report.get("error"):
        print(f"{'':<16} └─ {report['error'][:150]}")


if __name__ == "__main__":
    raise SystemExit(main())
