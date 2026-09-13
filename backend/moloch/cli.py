"""Línea de comandos de Moloch Arena.

    python -m moloch.cli run --backend scripted --seed 7
    python -m moloch.cli run --backend openrouter --budget 0.50
    python -m moloch.cli export --out ../frontend/public/data
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import db
from .agents import scripted
from .agents.base import Agent
from .engine import Game
from .rules import Rules

#: Nombres de los laboratorios. Puramente escénicos; el modelo real se muestra aparte.
LAB_NAMES = ["Helios", "Vantage", "Kepler", "Meridian", "Aurora"]

DEFAULT_ROSTER = [
    "conditionally-safe",
    "always-unsafe",
    "conditionally-antisocial-safe",
]


def build_scripted(strategies: list[str], seed: int) -> list[Agent]:
    return [
        scripted.build(s, player_id=f"p{i}", label=LAB_NAMES[i % len(LAB_NAMES)], seed=seed)
        for i, s in enumerate(strategies)
    ]


def build_openrouter(models: list[str], seed: int, budget_usd: float):
    from .agents.openrouter import BudgetGuard, OpenRouterAgent

    guard = BudgetGuard(limit_usd=budget_usd)
    agents = [
        OpenRouterAgent(
            player_id=f"p{i}",
            label=LAB_NAMES[i % len(LAB_NAMES)],
            model=m,
            budget=guard,
        )
        for i, m in enumerate(models)
    ]
    return agents, guard


def cmd_run(args: argparse.Namespace) -> int:
    rules = Rules()
    guard = None

    if args.backend == "scripted":
        strategies = args.strategies or DEFAULT_ROSTER
        agents = build_scripted(strategies, args.seed)
    elif args.backend == "openrouter":
        from .agents.openrouter import CHEAP_MODELS, BudgetExceeded

        models = args.models or CHEAP_MODELS[: args.players]
        agents, guard = build_openrouter(models, args.seed, args.budget)
    else:  # pragma: no cover
        print(f"backend desconocido: {args.backend}", file=sys.stderr)
        return 2

    game = Game(agents, rules=rules, seed=args.seed, backend=args.backend)

    try:
        record = game.play()
    except Exception as exc:  # noqa: BLE001 - se reporta y se sale limpio
        print(f"la partida falló: {exc}", file=sys.stderr)
        if guard:
            print(f"gasto hasta el fallo: {json.dumps(guard.summary())}", file=sys.stderr)
        return 1

    payload = record.to_dict()
    if guard:
        payload["budget"] = guard.summary()

    conn = db.connect(args.db)
    db.save_game(conn, payload)
    conn.close()

    _print_summary(payload)
    if guard:
        print(f"\nGasto: {guard.spent_usd:.4f} USD en {guard.calls} llamadas "
              f"(límite {guard.limit_usd:.2f})")
    return 0


def _print_summary(payload: dict) -> None:
    m = payload["metrics"]
    o = payload["outcome"]
    print(f"\nPartida {payload['game_id']}  ·  backend {payload['backend']}  "
          f"·  semilla {payload['seed']}")
    print(f"Resultado: {o['headline']}")
    print(f"Rondas jugadas: {len(payload['rounds'])}")
    print(f"\nÍndice de Moloch: {m['moloch_index']:.3f}   "
          f"(bienestar {m['total_welfare']:.0f} de un óptimo de {m['collective_optimum']:.0f})")
    print(f"Integridad media: {m['mean_integrity']:.0%}\n")
    print(f"{'LABORATORIO':<12} {'MODELO':<38} {'PROG':>5} {'RIESGO':>7} "
          f"{'PAGO':>6} {'INTEGRIDAD':>11}")
    print("-" * 84)
    for p in m["players"]:
        print(f"{p['label']:<12} {p['model']:<38} {p['progress']:>5} {p['risk']:>7} "
              f"{p['payoff']:>6.0f} {p['integrity']:>10.0%}")


def cmd_export(args: argparse.Namespace) -> int:
    """Vuelca la base a JSON estático para que el frontend funcione sin servidor."""
    conn = db.connect(args.db)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    games = db.list_games(conn, limit=None)
    (out / "games.json").write_text(
        json.dumps(games, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out / "leaderboard.json").write_text(
        json.dumps(
            {
                "models": db.leaderboard(conn),
                "backends": db.moloch_by_backend(conn),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    games_dir = out / "games"
    games_dir.mkdir(exist_ok=True)
    for g in games:
        replay = db.get_game(conn, g["game_id"])
        if replay:
            (games_dir / f"{g['game_id']}.json").write_text(
                json.dumps(replay, ensure_ascii=False), encoding="utf-8"
            )
    conn.close()
    print(f"Exportadas {len(games)} partidas a {out}")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    conn = db.connect(args.db)
    for g in db.list_games(conn, limit=args.limit):
        print(f"{g['game_id']}  {g['created_at']}  {g['backend']:<10} "
              f"IM={g['moloch_index']:.3f}  {g['outcome_kind']}")
    conn.close()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="moloch", description="Moloch Arena")
    parser.add_argument("--db", default=str(db.DEFAULT_DB), help="ruta de la base SQLite")
    sub = parser.add_subparsers(dest="cmd", required=True)

    run = sub.add_parser("run", help="jugar una partida")
    run.add_argument("--backend", default="scripted", choices=["scripted", "openrouter"])
    run.add_argument("--seed", type=int, default=1)
    run.add_argument("--players", type=int, default=3)
    run.add_argument("--strategies", nargs="*", help="estrategias guionizadas")
    run.add_argument("--models", nargs="*", help="modelos de OpenRouter")
    run.add_argument("--budget", type=float, default=1.0, help="techo de gasto en USD")
    run.set_defaults(func=cmd_run)

    exp = sub.add_parser("export", help="exportar JSON estático para el frontend")
    exp.add_argument("--out", default="../frontend/public/data")
    exp.set_defaults(func=cmd_export)

    lst = sub.add_parser("list", help="listar partidas")
    lst.add_argument("--limit", type=int, default=20)
    lst.set_defaults(func=cmd_list)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
