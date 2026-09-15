"""Analysis generated from normalized race records, never from leaderboard aggregates."""

from __future__ import annotations

import hashlib
import json
import math
import random
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Iterable

from .versions.paper_2608_01193_v1.engine import derive_seed
from .versions.paper_2608_01193_v1.spec import PAPER_SPEC, PaperAction

PUBLISHED_REFERENCE = {
    "evolutionary_unsafe_low": 0.992,
    "evolutionary_unsafe_medium": 0.980,
    "evolutionary_unsafe_high": 0.019,
    "calculator_canonical_unsafe": 0.520,
    "calculator_card_unsafe": 0.608,
    "audit_overall_accuracy": 0.591,
    "audit_strict_format": 0.321,
}


def wilson_interval(successes: int, total: int, z: float = 1.959963984540054) -> tuple[float, float]:
    if total <= 0:
        return (0.0, 0.0)
    p = successes / total
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    radius = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator
    return (max(0.0, centre - radius), min(1.0, centre + radius))


def summarize(records: Iterable[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[tuple[str, float], list[dict[str, Any]]] = defaultdict(list)
    excluded = 0
    raw = list(records)
    for record in raw:
        metrics = record.get("metrics", {})
        if metrics.get("admission_status") != "admitted":
            excluded += 1
            continue
        risk = float(record["risk_treatment"])
        for player in metrics.get("players", []):
            grouped[(str(player["model"]), risk)].append(player)
    cells = []
    for (model, risk), players in sorted(grouped.items()):
        unsafe = sum(int(player["unsafe_count"]) for player in players)
        decisions = sum(int(player["rounds_played"]) for player in players)
        lower, upper = wilson_interval(unsafe, decisions)
        cells.append(
            {
                "model": model,
                "risk_treatment": risk,
                "trajectories": len(players),
                "decisions": decisions,
                "unsafe_rate": unsafe / decisions if decisions else 0.0,
                "unsafe_rate_ci95": [lower, upper],
                "mean_payoff": sum(float(player["payoff"]) for player in players) / len(players),
            }
        )
    data_hash = hashlib.sha256(
        json.dumps(raw, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {
        "schema_version": "paper-analysis-v1",
        "data_hash": data_hash,
        "races_total": len(raw),
        "races_excluded": excluded,
        "cells": cells,
    }


def compare_value(
    reference_key: str, reproduced: float | None, tolerance: float
) -> dict[str, Any]:
    published = PUBLISHED_REFERENCE.get(reference_key)
    if published is None:
        return {"key": reference_key, "status": "not_available"}
    if reproduced is None:
        return {
            "key": reference_key,
            "published": published,
            "reproduced": None,
            "status": "not_reproducible",
        }
    difference = reproduced - published
    return {
        "key": reference_key,
        "published": published,
        "reproduced": reproduced,
        "absolute_difference": abs(difference),
        "relative_difference": abs(difference) / abs(published) if published else None,
        "tolerance": tolerance,
        "status": "within_tolerance" if abs(difference) <= tolerance else "different",
    }


@dataclass(frozen=True)
class StrategyMatrixResult:
    strategies: tuple[str, ...]
    payoff_matrix: tuple[tuple[float, ...], ...]
    action_rates: tuple[tuple[float, ...], ...]
    simulations_per_matchup: int
    risk_treatment: float


def strategy_matrix(
    risk_treatment: float,
    *,
    simulations_per_matchup: int = 10_000,
    master_seed: int = 1,
) -> StrategyMatrixResult:
    if simulations_per_matchup < 1:
        raise ValueError("simulations_per_matchup debe ser positivo")
    strategies = ("AS", "AU", "CS", "CAS")
    payoff_rows: list[tuple[float, ...]] = []
    action_rows: list[tuple[float, ...]] = []
    for focal in strategies:
        payoff_row: list[float] = []
        action_row: list[float] = []
        for opponent in strategies:
            if focal in {"AS", "AU"} and opponent in {"AS", "AU"}:
                payoff, unsafe_rate = _closed_form_unconditional(
                    focal, opponent, risk_treatment
                )
                payoff_row.append(payoff)
                action_row.append(unsafe_rate)
                continue
            payoff_sum = 0.0
            unsafe_sum = 0
            decision_sum = 0
            for repetition in range(simulations_per_matchup):
                seed = derive_seed(master_seed, f"egt:{risk_treatment}:{focal}:{opponent}:{repetition}")
                payoff, unsafe, decisions = _simulate_strategy_pair(
                    focal, opponent, risk_treatment, seed
                )
                payoff_sum += payoff
                unsafe_sum += unsafe
                decision_sum += decisions
            payoff_row.append(payoff_sum / simulations_per_matchup)
            action_row.append(unsafe_sum / decision_sum)
        payoff_rows.append(tuple(payoff_row))
        action_rows.append(tuple(action_row))
    return StrategyMatrixResult(
        strategies=strategies,
        payoff_matrix=tuple(payoff_rows),
        action_rates=tuple(action_rows),
        simulations_per_matchup=simulations_per_matchup,
        risk_treatment=risk_treatment,
    )


def _closed_form_unconditional(
    focal: str, opponent: str, risk_treatment: float
) -> tuple[float, float]:
    """Published closed-form branch obtained with E[T]=9."""
    action_focal = PaperAction.SAFE if focal == "AS" else PaperAction.UNSAFE
    action_opponent = PaperAction.SAFE if opponent == "AS" else PaperAction.UNSAFE
    stage = PAPER_SPEC.stage_payoffs([action_focal, action_opponent])[0] * 9.0
    progress_focal = PAPER_SPEC.progress(action_focal)
    progress_opponent = PAPER_SPEC.progress(action_opponent)
    if progress_focal < progress_opponent:
        return stage, float(focal == "AU")
    prize = PAPER_SPEC.terminal_prize if progress_focal > progress_opponent else 50.0
    risk = risk_treatment if focal == "AU" else 0.0
    return (stage + prize) * (1.0 - risk), float(focal == "AU")


def _strategy_action(
    strategy: str, round_index: int, opponent_previous: PaperAction | None
) -> PaperAction:
    if strategy == "AS":
        return PaperAction.SAFE
    if strategy == "AU":
        return PaperAction.UNSAFE
    if round_index == 1:
        return PaperAction.SAFE if strategy == "CS" else PaperAction.UNSAFE
    assert opponent_previous is not None
    return opponent_previous


def _simulate_strategy_pair(
    focal: str, opponent: str, risk_treatment: float, seed: int
) -> tuple[float, int, int]:
    horizon = PAPER_SPEC.sample_horizon(random.Random(derive_seed(seed, "horizon")))
    progress = [0.0, 0.0]
    stage = [0.0, 0.0]
    unsafe = [0, 0]
    previous: tuple[PaperAction, PaperAction] | None = None
    for round_index in range(1, horizon + 1):
        actions = (
            _strategy_action(focal, round_index, previous[1] if previous else None),
            _strategy_action(opponent, round_index, previous[0] if previous else None),
        )
        round_payoffs = PAPER_SPEC.stage_payoffs(list(actions))
        for index, action in enumerate(actions):
            progress[index] += PAPER_SPEC.progress(action)
            stage[index] += round_payoffs[index]
            unsafe[index] += int(action == PaperAction.UNSAFE)
        previous = actions
    best = max(progress)
    leaders = [index for index, value in enumerate(progress) if value == best]
    payoff = stage[0] + (PAPER_SPEC.terminal_prize / len(leaders) if 0 in leaders else 0.0)
    if 0 in leaders:
        risk = PAPER_SPEC.risk_probability(risk_treatment, unsafe[0], horizon)
        roll = random.Random(derive_seed(seed, "terminal-risk:p0")).random()
        if roll < risk:
            payoff = 0.0
    return payoff, unsafe[0], horizon


def fixation_probability(
    resident: int,
    mutant: int,
    payoff_matrix: tuple[tuple[float, ...], ...],
    *,
    population: int = 100,
    beta: float = 2.0,
) -> float:
    cumulative = 0.0
    log_product = 0.0
    for mutants in range(1, population):
        residents = population - mutants
        pi_mutant = (
            (mutants - 1) * payoff_matrix[mutant][mutant]
            + residents * payoff_matrix[mutant][resident]
        ) / (population - 1)
        pi_resident = (
            mutants * payoff_matrix[resident][mutant]
            + (residents - 1) * payoff_matrix[resident][resident]
        ) / (population - 1)
        log_product += -beta * (pi_mutant - pi_resident)
        cumulative += math.exp(min(700.0, log_product))
    return 1.0 / (1.0 + cumulative)


def stationary_distribution(
    matrix: StrategyMatrixResult,
    *,
    population: int = 100,
    beta: float = 2.0,
    tolerance: float = 1e-14,
) -> dict[str, Any]:
    n = len(matrix.strategies)
    transition = [[0.0 for _ in range(n)] for _ in range(n)]
    for resident in range(n):
        for mutant in range(n):
            if resident == mutant:
                continue
            transition[resident][mutant] = fixation_probability(
                resident,
                mutant,
                matrix.payoff_matrix,
                population=population,
                beta=beta,
            ) / (n - 1)
        transition[resident][resident] = 1.0 - sum(transition[resident])
    distribution = [1.0 / n] * n
    for _ in range(100_000):
        updated = [
            sum(distribution[source] * transition[source][target] for source in range(n))
            for target in range(n)
        ]
        if max(abs(a - b) for a, b in zip(updated, distribution, strict=True)) < tolerance:
            distribution = updated
            break
        distribution = updated
    # Action prevalence in rare-mutation monomorphic states.
    unsafe = sum(
        distribution[index] * matrix.action_rates[index][index] for index in range(n)
    )
    return {
        "strategies": list(matrix.strategies),
        "distribution": {
            strategy: distribution[index]
            for index, strategy in enumerate(matrix.strategies)
        },
        "unsafe_prevalence": unsafe,
        "population": population,
        "beta": beta,
        "mutation": 1 / population,
        "transition_matrix": transition,
        "method": "small-mutation-limit",
    }


def finite_population_stationary_distribution(
    matrix: StrategyMatrixResult,
    *,
    population: int = 100,
    beta: float = 2.0,
    mutation: float | None = None,
    runs: int = 8,
    generations: int = 1_000_000,
    transitory: int = 10_000,
    seed: int = 1,
) -> dict[str, Any]:
    """Estimate the full finite-population chain using the paper's EGTtools method."""
    try:
        import egttools as egt
        import numpy as np
    except ImportError as exc:  # pragma: no cover - dependency error is explicit
        raise RuntimeError(
            "egttools y numpy son necesarios para la dinamica evolutiva del paper"
        ) from exc
    mu = beta / population if mutation is None else mutation
    egt.Random.seed(seed)
    payoffs = np.asarray(matrix.payoff_matrix, dtype=float)
    game = egt.games.Matrix2PlayerGameHolder(len(matrix.strategies), payoffs)
    evolver = egt.numerical.PairwiseComparisonNumerical(
        population, game, max(generations, 1_000_000)
    )
    distribution = evolver.estimate_strategy_distribution(
        runs, generations, transitory, beta, mu
    )
    unsafe_indices = [
        index for index, strategy in enumerate(matrix.strategies) if strategy in {"AU", "CAS"}
    ]
    unsafe = float(sum(distribution[index] for index in unsafe_indices))
    return {
        "strategies": list(matrix.strategies),
        "distribution": {
            strategy: float(distribution[index])
            for index, strategy in enumerate(matrix.strategies)
        },
        "unsafe_prevalence": unsafe,
        "population": population,
        "beta": beta,
        "mutation": mu,
        "runs": runs,
        "generations": generations,
        "transitory": transitory,
        "seed": seed,
        "method": "egttools-full-finite-population-numerical",
    }
