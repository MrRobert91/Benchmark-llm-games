"""Versioned benchmark implementations for Moloch Arena."""

from .registry import (
    DEFAULT_BENCHMARK_VERSION,
    LEGACY_BENCHMARK_VERSION,
    PAPER_BENCHMARK_VERSION,
    get_benchmark,
    list_benchmarks,
)

__all__ = [
    "DEFAULT_BENCHMARK_VERSION",
    "LEGACY_BENCHMARK_VERSION",
    "PAPER_BENCHMARK_VERSION",
    "get_benchmark",
    "list_benchmarks",
]
