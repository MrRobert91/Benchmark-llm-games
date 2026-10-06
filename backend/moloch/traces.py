"""Readable provider evidence for completed replays, independent of game semantics."""
from __future__ import annotations

import re
from typing import Any


def public_trace(call: dict[str, Any], index: int) -> dict[str, Any]:
    """Publish recorded text, never credentials, arbitrary response keys or ciphertext."""
    phase = str(call.get("phase") or "")
    match = re.search(r"(?:^|_)round_(\d+)(?:_|$)", phase)
    details = call.get("reasoning_details") or []
    readable = []
    encrypted = 0
    for detail in details:
        if not isinstance(detail, dict):
            continue
        if detail.get("type") == "reasoning.encrypted":
            encrypted += 1
            continue
        for field in ("text", "summary"):
            value = detail.get(field)
            if isinstance(value, str) and value:
                readable.append({"type": str(detail.get("type") or field), "text": value})
    result = {key: call.get(key) for key in (
        "player_id", "model", "served_model", "provider", "response_id",
        "response_content", "reasoning", "reasoning_mode", "finish_reason",
        "native_finish_reason", "refusal", "attempt", "max_tokens", "latency_ms",
        "status_code",
    )}
    usage = call.get("usage") or {}
    result.update({
        "call_index": index, "phase": phase,
        "round": int(match.group(1)) if match else None,
        "request_messages": [
            {"role": m.get("role"), "content": m.get("content")}
            for m in call.get("request_messages", []) if isinstance(m, dict)
        ],
        "reasoning_details": readable, "encrypted_blocks": encrypted,
        "usage": {key: usage.get(key) for key in ("prompt_tokens", "completion_tokens", "cost")},
        "reasoning_tokens": (usage.get("completion_tokens_details") or {}).get("reasoning_tokens"),
    })
    return result
