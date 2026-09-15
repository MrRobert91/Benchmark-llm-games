"""Immutable registry of game and protocol versions."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from typing import Any

from .versions.paper_2608_01193_v1.spec import PAPER_SPEC, PaperSpec

LEGACY_BENCHMARK_VERSION = "legacy-moloch-v0"
PAPER_BENCHMARK_VERSION = "moloch-arena-v1-paper-2608.01193v1"
DEFAULT_BENCHMARK_VERSION = PAPER_BENCHMARK_VERSION
PAPER_PROTOCOL_VERSION = "published-reconstruction-v1"
LEGACY_PROTOCOL_VERSION = "legacy-council-v0"


@dataclass(frozen=True)
class BenchmarkDefinition:
    benchmark_version: str
    protocol_version: str
    title: str
    paper_url: str | None
    status: str
    parity: dict[str, str]
    min_players: int
    max_players: int
    actions: tuple[str, ...]
    spec_hash: str
    protocol_hash: str
    capabilities: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["actions"] = list(self.actions)
        value["capabilities"] = list(self.capabilities)
        return value


def _hash(value: Any) -> str:
    raw = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


PAPER_PROTOCOL_CONTRACT = {
    "id": PAPER_PROTOCOL_VERSION,
    "same_pre_action_snapshot": True,
    "same_round_actions_hidden": True,
    "previous_actions_revealed": True,
    "calls_per_player_round": 1,
    "action_schema": {"action": ["SAFE", "UNSAFE"]},
    "fallback": "SAFE-and-contaminate-race",
    "prompt_provenance": "reconstructed-from-published-methods",
}

_PAPER = BenchmarkDefinition(
    benchmark_version=PAPER_BENCHMARK_VERSION,
    protocol_version=PAPER_PROTOCOL_VERSION,
    title="Moloch Arena V1 - paridad con arXiv:2608.01193v1",
    paper_url="https://arxiv.org/abs/2608.01193v1",
    status="active",
    parity={
        "P0": "implemented",
        "P1": "implemented",
        "P2": "published-reconstruction",
        "P3": "blocked-official-artifacts-unavailable",
        "P4": "partial",
    },
    min_players=2,
    max_players=5,
    actions=("SAFE", "UNSAFE"),
    spec_hash=_hash(asdict(PAPER_SPEC)),
    protocol_hash=_hash(PAPER_PROTOCOL_CONTRACT),
    capabilities=(
        "single-race",
        "paired-manifest",
        "scripted-strategy-matrix",
        "openrouter-byok",
        "private-setbacks",
        "paper-comparator",
    ),
)

_LEGACY = BenchmarkDefinition(
    benchmark_version=LEGACY_BENCHMARK_VERSION,
    protocol_version=LEGACY_PROTOCOL_VERSION,
    title="Moloch Arena legacy - consejo y promesas",
    paper_url=None,
    status="legacy-read-write",
    parity={"P0": "implemented", "P1": "not-applicable"},
    min_players=2,
    max_players=5,
    actions=("SAFE", "FAST"),
    spec_hash=_hash({"source": "moloch.rules.Rules"}),
    protocol_hash=_hash({"source": "legacy meeting/speak/act"}),
    capabilities=("single-race", "openrouter-byok", "council-negotiation"),
)

_REGISTRY = {
    _LEGACY.benchmark_version: _LEGACY,
    _PAPER.benchmark_version: _PAPER,
}


def get_benchmark(version: str) -> BenchmarkDefinition:
    try:
        return _REGISTRY[version]
    except KeyError as exc:
        raise ValueError(f"benchmark version desconocida: {version}") from exc


def list_benchmarks() -> list[dict[str, Any]]:
    return [definition.to_dict() for definition in (_PAPER, _LEGACY)]


def paper_spec() -> PaperSpec:
    return PAPER_SPEC
