"""Reproducible experiment manifests and paper presets."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Iterable

from .registry import PAPER_BENCHMARK_VERSION, PAPER_PROTOCOL_VERSION, get_benchmark
from .versions.paper_2608_01193_v1.engine import derive_seed


@dataclass(frozen=True)
class ExperimentCell:
    cell_id: str
    model: str
    models: tuple[str, ...]
    risk_treatment: float
    repetition: int
    seed: int
    evidence: str
    comparison_group: str


@dataclass(frozen=True)
class ExperimentManifest:
    experiment_id: str
    created_at: str
    benchmark_version: str
    protocol_version: str
    preset: str
    master_seed: int
    repetitions: int
    cells: tuple[ExperimentCell, ...]
    assumptions: tuple[str, ...]
    manifest_hash: str

    def to_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["cells"] = [asdict(cell) for cell in self.cells]
        result["assumptions"] = list(self.assumptions)
        return result


PRESETS = {
    "paper-2p-neutral": {
        "description": "Self-play, 10 races per model-risk cell, 2 players.",
        "risks": (0.10, 0.60, 0.90),
        "repetitions": 10,
        "players": 2,
        "evidence": "confirmatory",
    },
    "paper-extension-2p": {
        "description": "New-model extension under the same 2P paper protocol.",
        "risks": (0.10, 0.60, 0.90),
        "repetitions": 10,
        "players": 2,
        "evidence": "exploratory-extension",
    },
    "paper-n-player": {
        "description": "Published N-player robustness design; player count supplied by caller.",
        "risks": (0.10, 0.60, 0.90),
        "repetitions": 10,
        "players": None,
        "evidence": "confirmatory",
    },
    "smoke-cheap-2p": {
        "description": "Low-cost end-to-end validation; not inferential evidence.",
        "risks": (0.10, 0.60, 0.90),
        "repetitions": 1,
        "players": 2,
        "evidence": "diagnostic",
    },
}


def list_presets() -> list[dict[str, Any]]:
    return [{"id": key, **value} for key, value in PRESETS.items()]


def build_manifest(
    *,
    models: Iterable[str],
    preset: str = "paper-2p-neutral",
    master_seed: int = 1,
    repetitions: int | None = None,
    risks: Iterable[float] | None = None,
    players: int | None = None,
    benchmark_version: str = PAPER_BENCHMARK_VERSION,
    created_at: str | None = None,
) -> ExperimentManifest:
    definition = get_benchmark(benchmark_version)
    if benchmark_version != PAPER_BENCHMARK_VERSION:
        raise ValueError("los manifiestos experimentales solo estan disponibles para V1")
    try:
        preset_spec = PRESETS[preset]
    except KeyError as exc:
        raise ValueError(f"preset desconocido: {preset}") from exc
    roster = tuple(model.strip() for model in models if model.strip())
    if not roster:
        raise ValueError("hace falta al menos un modelo")
    n_players = players or preset_spec["players"] or 2
    definition_min = definition.min_players
    definition_max = definition.max_players
    if not definition_min <= n_players <= definition_max:
        raise ValueError(f"players debe estar entre {definition_min} y {definition_max}")
    cell_repetitions = repetitions or int(preset_spec["repetitions"])
    if not 1 <= cell_repetitions <= 10_000:
        raise ValueError("repetitions debe estar entre 1 y 10000")
    risk_values = tuple(float(value) for value in (risks or preset_spec["risks"]))
    if any(value not in (0.10, 0.60, 0.90) for value in risk_values):
        raise ValueError("los riesgos V1 deben ser 0.10, 0.60 o 0.90")

    cells: list[ExperimentCell] = []
    for model_index, model in enumerate(roster):
        seats = tuple(model for _ in range(n_players))
        for risk in risk_values:
            for repetition in range(1, cell_repetitions + 1):
                namespace = f"{preset}:{model_index}:{model}:{risk:.2f}:{n_players}:{repetition}"
                seed = derive_seed(master_seed, namespace)
                cell_id = hashlib.sha256(namespace.encode("utf-8")).hexdigest()[:16]
                cells.append(
                    ExperimentCell(
                        cell_id=cell_id,
                        model=model,
                        models=seats,
                        risk_treatment=risk,
                        repetition=repetition,
                        seed=seed,
                        evidence=str(preset_spec["evidence"]),
                        comparison_group=(
                            "paper" if preset == "paper-2p-neutral" else "extension"
                        ),
                    )
                )

    base = {
        "benchmark_version": benchmark_version,
        "protocol_version": PAPER_PROTOCOL_VERSION,
        "preset": preset,
        "master_seed": int(master_seed),
        "repetitions": cell_repetitions,
        "cells": [asdict(cell) for cell in cells],
        "assumptions": [
            "Prompt reconstructed from published methods; authors' exact prompt unavailable.",
            "Model route and served model must be recorded at execution time.",
            "A race with any fallback is excluded from admitted analyses.",
        ],
    }
    digest = hashlib.sha256(
        json.dumps(base, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return ExperimentManifest(
        experiment_id=f"exp-{digest[:12]}",
        created_at=created_at or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        manifest_hash=digest,
        cells=tuple(cells),
        assumptions=tuple(base["assumptions"]),
        benchmark_version=benchmark_version,
        protocol_version=PAPER_PROTOCOL_VERSION,
        preset=preset,
        master_seed=int(master_seed),
        repetitions=cell_repetitions,
    )
