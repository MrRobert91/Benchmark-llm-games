"""CLI implementation for versioned paper benchmarks."""

from __future__ import annotations

import json
import os
import random
from html import escape
from pathlib import Path
from typing import Any

from . import db
from .agents.openrouter import BudgetGuard
from .benchmark.analysis import (
    compare_value,
    finite_population_stationary_distribution,
    strategy_matrix,
    summarize,
)
from .benchmark.manifest import build_manifest
from .benchmark.registry import PAPER_BENCHMARK_VERSION, get_benchmark
from .benchmark.versions.paper_2608_01193_v1.agents import (
    PaperOpenRouterAgent,
    build_scripted,
)
from .benchmark.versions.paper_2608_01193_v1.engine import PaperGame
from .benchmark.versions.paper_2608_01193_v1.spec import PAPER_SPEC, PaperAction

LAB_NAMES = ["Helios", "Vantage", "Kepler", "Meridian", "Aurora"]


def _manifest_from_args(args: Any) -> dict[str, Any]:
    if getattr(args, "manifest", None):
        return json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    return build_manifest(
        models=args.models,
        preset=args.preset,
        master_seed=args.seed,
        repetitions=args.repetitions,
        risks=args.risks,
        players=args.players,
        created_at=getattr(args, "created_at", None),
    ).to_dict()


def cmd_plan(args: Any) -> int:
    manifest = _manifest_from_args(args)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    conn = db.connect(args.db)
    try:
        db.save_experiment(conn, manifest)
    finally:
        conn.close()
    print(
        f"{manifest['experiment_id']}: {len(manifest['cells'])} carreras planificadas; "
        f"manifest {manifest['manifest_hash']} -> {out}"
    )
    return 0


def cmd_run(args: Any) -> int:
    manifest = _manifest_from_args(args)
    definition = get_benchmark(PAPER_BENCHMARK_VERSION)
    conn = db.connect(args.db)
    db.save_experiment(conn, manifest)
    current = db.get_experiment(conn, manifest["experiment_id"])
    completed = {
        cell["cell_id"] for cell in (current or {}).get("cells", []) if cell["status"] == "completed"
    }
    previous_calls = conn.execute(
        """SELECT requested_model, COALESCE(SUM(cost_usd), 0) AS spent,
                  COUNT(*) AS calls, COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                  COALESCE(SUM(completion_tokens), 0) AS completion_tokens
           FROM provider_calls WHERE experiment_id = ? GROUP BY requested_model""",
        (manifest["experiment_id"],),
    ).fetchall()
    conn.close()
    previous_spent = sum(float(row["spent"]) for row in previous_calls)
    if previous_spent >= args.budget:
        raise RuntimeError(
            f"el experimento ya consumió {previous_spent:.6f} USD del límite {args.budget:.2f}"
        )
    guard = BudgetGuard(
        limit_usd=args.budget,
        spent_usd=previous_spent,
        calls=sum(int(row["calls"]) for row in previous_calls),
        prompt_tokens=sum(int(row["prompt_tokens"]) for row in previous_calls),
        completion_tokens=sum(int(row["completion_tokens"]) for row in previous_calls),
        per_model={str(row["requested_model"]): float(row["spent"]) for row in previous_calls},
    )
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if args.backend == "openrouter" and not api_key:
        raise RuntimeError("falta OPENROUTER_API_KEY")
    completed_now = 0
    failed_now = 0
    for cell in manifest["cells"]:
        if cell["cell_id"] in completed:
            continue
        private_calls: list[dict[str, Any]] = []
        agents: list[Any] = []
        game: PaperGame | None = None
        try:
            for seat, model in enumerate(cell["models"]):
                if args.backend == "scripted":
                    agents.append(build_scripted(model, f"p{seat}", LAB_NAMES[seat]))
                else:
                    agents.append(
                        PaperOpenRouterAgent(
                            player_id=f"p{seat}",
                            label=LAB_NAMES[seat],
                            model=model,
                            budget=guard,
                            api_key=api_key,
                            timeout=args.timeout,
                            audit_sink=private_calls.append,
                        )
                    )
            game = PaperGame(
                agents,
                risk_treatment=cell["risk_treatment"],
                seed=cell["seed"],
                backend=f"paper-{args.backend}",
                spec_hash=definition.spec_hash,
                protocol_hash=definition.protocol_hash,
                experiment_id=manifest["experiment_id"],
                cell_id=cell["cell_id"],
                repetition=cell["repetition"],
            )
            payload = game.play().to_dict()
            payload["budget"] = guard.summary()
            conn = db.connect(args.db)
            try:
                db.save_game(conn, payload)
                db.save_provider_calls(
                    conn,
                    payload["game_id"],
                    private_calls,
                    experiment_id=manifest["experiment_id"],
                    cell_id=cell["cell_id"],
                )
                db.update_experiment_cell(
                    conn,
                    manifest["experiment_id"],
                    cell["cell_id"],
                    status="completed",
                    game_id=payload["game_id"],
                )
            finally:
                conn.close()
            completed_now += 1
            print(
                f"[{completed_now}] {cell['cell_id']} risk={cell['risk_treatment']:.1f} "
                f"T={payload['realized_horizon']} admitted={payload['admission_status']}"
            )
        except Exception as exc:
            conn = db.connect(args.db)
            try:
                partial = game.record.to_dict() if game is not None else None
                failed_game_id = (
                    game.record.game_id if game is not None else f"failed-{cell['cell_id']}"
                )
                db.save_provider_calls(
                    conn,
                    failed_game_id,
                    private_calls,
                    experiment_id=manifest["experiment_id"],
                    cell_id=cell["cell_id"],
                )
                db.update_experiment_cell(
                    conn,
                    manifest["experiment_id"],
                    cell["cell_id"],
                    status="failed",
                    error_message=str(exc)[:800],
                    usage=guard.summary(),
                    partial_replay=partial,
                )
            finally:
                conn.close()
            failed_now += 1
            print(
                f"[fallida] {cell['cell_id']} {cell['model']} "
                f"risk={cell['risk_treatment']:.1f}: {exc}"
            )
            if args.fail_fast:
                raise
        finally:
            for agent in agents:
                close = getattr(agent, "close", None)
                if callable(close):
                    close()
    summary = guard.summary()
    summary["completed_now"] = completed_now
    summary["failed_now"] = failed_now
    print(json.dumps(summary, indent=2))
    return 1 if failed_now else 0


def cmd_analyse(args: Any) -> int:
    conn = db.connect(args.db)
    try:
        records = db.experiment_records(conn, args.experiment_id)
        experiment = db.get_experiment(conn, args.experiment_id)
        usage = conn.execute(
            """SELECT COUNT(*) AS attempts,
                      SUM(CASE WHEN status_code IS NULL THEN 1 ELSE 0 END) AS successful_calls,
                      COALESCE(SUM(cost_usd), 0) AS spent_usd,
                      COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                      COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                      COUNT(DISTINCT game_id) AS traced_attempts
               FROM provider_calls WHERE experiment_id = ?""",
            (args.experiment_id,),
        ).fetchone()
        decisions = conn.execute(
            """SELECT COUNT(*) AS decisions FROM race_decisions d
               JOIN games g ON g.game_id = d.game_id WHERE g.experiment_id = ?""",
            (args.experiment_id,),
        ).fetchone()["decisions"]
    finally:
        conn.close()
    if experiment is None:
        raise ValueError(f"experimento desconocido: {args.experiment_id}")
    report = summarize(records)
    report["experiment_id"] = args.experiment_id
    report["benchmark_version"] = experiment["benchmark_version"]
    report["protocol_version"] = experiment["protocol_version"]
    report["manifest_hash"] = experiment["manifest_hash"]
    definition = get_benchmark(experiment["benchmark_version"])
    report["spec_hash"] = definition.spec_hash
    report["protocol_hash"] = definition.protocol_hash
    report["parity"] = definition.parity
    report["execution"] = {
        "cells_by_status": {
            status: sum(1 for cell in experiment["cells"] if cell["status"] == status)
            for status in sorted({cell["status"] for cell in experiment["cells"]})
        },
        "final_decisions": decisions,
        "provider_attempts": int(usage["attempts"]),
        "successful_provider_calls": int(usage["successful_calls"]),
        "traced_attempts": int(usage["traced_attempts"]),
        "prompt_tokens": int(usage["prompt_tokens"]),
        "completion_tokens": int(usage["completion_tokens"]),
        "spent_usd": round(float(usage["spent_usd"]), 9),
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    html_out = Path(args.html_out)
    html_out.parent.mkdir(parents=True, exist_ok=True)
    html_out.write_text(_report_html(report), encoding="utf-8")
    print(f"Analizadas {len(records)} carreras -> {out} y {html_out}")
    return 0


def _report_html(report: dict[str, Any]) -> str:
    rows = "".join(
        "<tr>"
        f"<td>{escape(str(cell['model']))}</td>"
        f"<td>{cell['risk_treatment']:.0%}</td>"
        f"<td>{cell['trajectories']}</td>"
        f"<td>{cell['decisions']}</td>"
        f"<td>{cell['unsafe_rate']:.1%}</td>"
        f"<td>{cell['mean_payoff']:.3f}</td>"
        "</tr>"
        for cell in report["cells"]
    )
    return f"""<!doctype html>
<html lang=\"es\"><meta charset=\"utf-8\"><title>Informe {escape(report['experiment_id'])}</title>
<style>body{{font:16px system-ui;max-width:1100px;margin:40px auto;padding:0 20px;color:#17202a}}
table{{border-collapse:collapse;width:100%}}th,td{{padding:9px;border:1px solid #ccd1d1;text-align:right}}
th:first-child,td:first-child{{text-align:left}}code{{overflow-wrap:anywhere}}</style>
<h1>Moloch Arena V1 · informe</h1>
<p><b>Experimento:</b> <code>{escape(report['experiment_id'])}</code><br>
<b>Versión:</b> {escape(report['benchmark_version'])}<br>
<b>Protocolo:</b> {escape(report['protocol_version'])}<br>
<b>Manifest:</b> <code>{escape(report['manifest_hash'])}</code><br>
<b>Spec:</b> <code>{escape(report['spec_hash'])}</code><br>
<b>Contrato:</b> <code>{escape(report['protocol_hash'])}</code><br>
<b>Datos:</b> <code>{escape(report['data_hash'])}</code></p>
<p>{report['races_total']} carreras; {report['races_excluded']} excluidas por contaminación.</p>
<p>{report['execution']['final_decisions']} decisiones finales;
{report['execution']['provider_attempts']} intentos de proveedor trazados
({report['execution']['successful_provider_calls']} con respuesta válida);
coste {report['execution']['spent_usd']:.9f} USD.</p>
<table><thead><tr><th>Modelo</th><th>Riesgo</th><th>Trayectorias</th><th>Decisiones</th>
<th>UNSAFE</th><th>Pago medio</th></tr></thead><tbody>{rows}</tbody></table>
<h2>Estado de paridad</h2><pre>{escape(json.dumps(report['parity'], indent=2))}</pre>
</html>"""


def cmd_verify(args: Any) -> int:
    assert PAPER_SPEC.stage_payoffs([PaperAction.SAFE, PaperAction.SAFE]) == [1.0, 1.0]
    mixed = PAPER_SPEC.stage_payoffs([PaperAction.SAFE, PaperAction.UNSAFE])
    assert abs(mixed[0] - 0.6) < 1e-12 and abs(mixed[1] - 2.4) < 1e-12
    rng = random.Random(args.seed)
    horizons = [PAPER_SPEC.sample_horizon(rng) for _ in range(args.samples)]
    mean = sum(horizons) / len(horizons)
    if not abs(mean - 9.0) <= args.tolerance:
        raise RuntimeError(f"media de horizonte fuera de tolerancia: {mean}")
    result: dict[str, Any] = {
        "stage_matrix": "match",
        "horizon_samples": len(horizons),
        "horizon_mean": mean,
        "horizon_support_min": min(horizons),
        "horizon_support_max": max(horizons),
        "status": "match",
        "benchmark_version": PAPER_BENCHMARK_VERSION,
        "spec_hash": get_benchmark(PAPER_BENCHMARK_VERSION).spec_hash,
        "protocol_hash": get_benchmark(PAPER_BENCHMARK_VERSION).protocol_hash,
    }
    if args.evolutionary:
        result["evolutionary"] = {}
        comparisons = []
        for risk in PAPER_SPEC.risk_treatments:
            matrix = strategy_matrix(
                risk,
                simulations_per_matchup=args.simulations_per_matchup,
                master_seed=args.seed,
            )
            distribution = finite_population_stationary_distribution(
                matrix,
                population=100,
                beta=2.0,
                mutation=0.02,
                runs=args.evolutionary_runs,
                generations=args.evolutionary_generations,
                transitory=args.evolutionary_transitory,
                seed=args.seed,
            )
            key = {
                0.1: "evolutionary_unsafe_low",
                0.6: "evolutionary_unsafe_medium",
                0.9: "evolutionary_unsafe_high",
            }[risk]
            distribution["paper_comparison"] = compare_value(
                key, distribution["unsafe_prevalence"], args.evolutionary_tolerance
            )
            distribution["payoff_matrix"] = [list(row) for row in matrix.payoff_matrix]
            distribution["action_rate_matrix"] = [list(row) for row in matrix.action_rates]
            distribution["simulations_per_conditional_matchup"] = (
                matrix.simulations_per_matchup
            )
            comparisons.append(distribution["paper_comparison"])
            result["evolutionary"][str(risk)] = distribution
        if any(item["status"] == "different" for item in comparisons):
            result["status"] = "different"
    rendered = json.dumps(result, indent=2)
    if getattr(args, "out", None):
        output = Path(args.out)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered, encoding="utf-8")
    print(rendered)
    return 0
