"""Catálogo y validación de claves de OpenRouter, sin persistir credenciales."""

from __future__ import annotations

import threading
import time
from typing import Any

import httpx

MODELS_URL = "https://openrouter.ai/api/v1/models"
KEY_URL = "https://openrouter.ai/api/v1/key"
_CACHE_SECONDS = 600
_cache: tuple[float, list[dict[str, Any]]] | None = None
_lock = threading.Lock()


def list_text_models(force: bool = False) -> list[dict[str, Any]]:
    global _cache
    with _lock:
        if not force and _cache and time.monotonic() - _cache[0] < _CACHE_SECONDS:
            return _cache[1]
    response = httpx.get(
        MODELS_URL,
        params={"output_modalities": "text", "sort": "most-popular"},
        timeout=20.0,
        headers={"X-Title": "Moloch Arena"},
    )
    response.raise_for_status()
    models = []
    for raw in response.json().get("data", []):
        architecture = raw.get("architecture") or {}
        if "text" not in (architecture.get("output_modalities") or []):
            continue
        model_id = str(raw.get("id") or "")
        if not model_id or model_id.endswith(":online"):
            continue
        pricing = raw.get("pricing") or {}
        models.append(
            {
                "id": model_id,
                "name": raw.get("name") or model_id,
                "provider": model_id.split("/", 1)[0],
                "context_length": int(raw.get("context_length") or 0),
                "pricing": {
                    "prompt": _price(pricing.get("prompt")),
                    "completion": _price(pricing.get("completion")),
                    "request": _price(pricing.get("request")),
                },
                "supports_reasoning": bool(raw.get("reasoning")),
            }
        )
    with _lock:
        _cache = (time.monotonic(), models)
    return models


def validate_key(api_key: str) -> dict[str, Any]:
    response = httpx.get(
        KEY_URL,
        headers={"Authorization": f"Bearer {api_key}", "X-Title": "Moloch Arena"},
        timeout=15.0,
    )
    response.raise_for_status()
    data = response.json().get("data") or {}
    return {
        "limit_remaining": data.get("limit_remaining"),
        "expires_at": data.get("expires_at"),
        "is_free_tier": data.get("is_free_tier"),
    }


def _price(value: object) -> float:
    try:
        return max(0.0, float(value or 0))
    except (TypeError, ValueError):
        return 0.0
