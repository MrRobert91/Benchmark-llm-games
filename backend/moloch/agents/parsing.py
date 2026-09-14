"""Lectura tolerante de las respuestas de un modelo, con diagnóstico de por qué falla.

Cada modelo de OpenRouter contesta a su manera al mismo prompt. Pidiendo `{"action": ...}`
se ha observado, contra modelos reales:

- JSON limpio (``mistralai/mistral-nemo``, ``inclusionai/ling-3.0-flash``).
- JSON dentro de una valla de código (``google/gemma-3-27b-it``).
- Prosa delante del JSON (``google/gemini-2.5-flash-lite``).
- Contenido COMPLETAMENTE VACÍO porque el modelo gastó todo el presupuesto de tokens
  razonando (``openai/gpt-5-nano``, ``openai/gpt-oss-20b``, ``qwen/qwen3.7-flash``,
  ``deepseek/deepseek-v4-flash``). Es el fallo más frecuente y el más silencioso.
- Razonamiento filtrado en el contenido dentro de ``<think>...</think>``.

Este módulo separa dos cosas que el parser antiguo mezclaba: *qué se ha leído* y *si se ha
podido leer*. Una respuesta ilegible ya no se confunde con una decisión válida: se devuelve
un :class:`ParseOutcome` con ``ok=False`` y un motivo concreto, y quien llama decide qué
hacer con ello (y lo registra).
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any

from ..rules import Action

#: Longitud del extracto que se guarda para diagnosticar. Suficiente para ver la forma de la
#: respuesta, corto para no inflar la base de datos ni los logs.
EXCERPT_CHARS = 400

#: Motivos de fallo. Son estables: sirven para agrupar en logs y métricas.
REASON_EMPTY = "empty_content"
REASON_NO_JSON = "no_json_object"
REASON_INVALID_JSON = "invalid_json"
REASON_MISSING_FIELD = "missing_field"
REASON_AMBIGUOUS_VALUE = "ambiguous_value"
REASON_UNKNOWN_VALUE = "unknown_value"

#: Sinónimos aceptados como clave de cada campo. Los modelos traducen las claves del ejemplo
#: al idioma del prompt más a menudo de lo que parece.
ACTION_KEYS = (
    "action",
    "accion",
    "acción",
    "decision",
    "decisión",
    "choice",
    "eleccion",
    "elección",
    "move",
    "jugada",
    "real_action",
    "private_action",
    "accion_real",
)
PLEDGE_KEYS = (
    "pledge",
    "promesa",
    "compromiso",
    "commitment",
    "public_action",
    "accion_publica",
    "acción_pública",
    "declared_action",
)
SPEECH_KEYS = (
    "speech",
    "discurso",
    "mensaje",
    "message",
    "text",
    "texto",
    "declaracion",
    "declaración",
    "statement",
    "intervencion",
    "intervención",
)

_SAFE_WORDS = ("safe", "seguro", "segura", "prudente", "cauto", "lento")
_FAST_WORDS = ("fast", "rapido", "rápida", "rápido", "rapida", "agresivo", "acelerar")

_THINK_BLOCK = re.compile(
    r"<\s*(think|thinking|reasoning|scratchpad|analysis)\s*>.*?<\s*/\s*\1\s*>",
    flags=re.DOTALL | re.IGNORECASE,
)
#: Un bloque de razonamiento sin cerrar se lleva por delante todo lo que haya detrás salvo
#: que el modelo lo cierre; cuando no cierra, el JSON suele ir después de la última etiqueta.
_UNCLOSED_THINK = re.compile(
    r"^.*<\s*/\s*(?:think|thinking|reasoning|scratchpad|analysis)\s*>",
    flags=re.DOTALL | re.IGNORECASE,
)
_FENCE = re.compile(r"```[a-zA-Z0-9_+-]*\s*\n?(.*?)```", flags=re.DOTALL)
_TRAILING_COMMA = re.compile(r",\s*([}\]])")
_LINE_COMMENT = re.compile(r"(?m)^\s*//.*$")
_UNQUOTED_KEY = re.compile(r"([{,]\s*)([A-Za-zÁÉÍÓÚÑáéíóúñ_][\w\-áéíóúñÁÉÍÓÚÑ ]*)(\s*:)")


@dataclass(frozen=True)
class ParseOutcome:
    """Resultado de intentar leer un objeto JSON de la respuesta de un modelo."""

    ok: bool
    data: dict[str, Any] = field(default_factory=dict)
    #: Cómo se consiguió leer: ``direct``, ``code_fence``, ``scan``, ``double_encoded``…
    strategy: str = "none"
    #: Arreglos que hubo que aplicar al texto crudo, en orden. Vacío = el modelo respondió bien.
    repairs: tuple[str, ...] = ()
    #: Motivo estable del fallo cuando ``ok`` es ``False``.
    reason: str | None = None
    #: Extracto saneado del texto crudo, para poder ver qué devolvió el modelo.
    excerpt: str = ""
    #: Longitud del contenido original, antes de recortar.
    content_chars: int = 0

    @property
    def clean(self) -> bool:
        """El modelo devolvió JSON utilizable sin necesidad de arreglos."""
        return self.ok and not self.repairs and self.strategy == "direct"

    def to_log_fields(self) -> str:
        return (
            f"ok={int(self.ok)} strategy={self.strategy} "
            f"repairs={','.join(self.repairs) or '-'} reason={self.reason or '-'} "
            f"content_chars={self.content_chars}"
        )


@dataclass(frozen=True)
class FieldOutcome:
    """Lectura de un campo concreto (``action``, ``pledge``…) dentro de un objeto ya leído."""

    ok: bool
    value: Action | None = None
    key_used: str | None = None
    reason: str | None = None
    raw_value: str = ""


# --------------------------------------------------------------------- objeto JSON


def parse_json_object(raw: str | None) -> ParseOutcome:
    """Extrae el objeto JSON de una respuesta, aplicando arreglos de menor a mayor violencia.

    Nunca lanza. Devuelve siempre un :class:`ParseOutcome` en el que ``ok`` dice si se pudo
    leer y ``reason`` por qué no.
    """
    original = raw or ""
    content_chars = len(original)
    if not original.strip():
        return ParseOutcome(
            ok=False, reason=REASON_EMPTY, excerpt="", content_chars=content_chars
        )

    text, repairs = _strip_wrappers(original)
    if not text.strip():
        return ParseOutcome(
            ok=False,
            reason=REASON_EMPTY,
            repairs=tuple(repairs),
            excerpt=excerpt(original),
            content_chars=content_chars,
        )

    # 1. El camino feliz: el texto ya es el objeto.
    value = _loads(text)
    if isinstance(value, dict):
        return _ok(value, "direct" if not repairs else "stripped", repairs, original)

    # 2. Un objeto en algún punto del texto, con recuento de llaves (no con una regex greedy,
    #    que se traga la prosa posterior y rompe en cuanto hay dos objetos).
    for candidate in _candidate_objects(text):
        value = _loads(candidate)
        if isinstance(value, dict):
            return _ok(value, "scan", repairs, original)

    # 3. Los mismos candidatos, ya con arreglos de sintaxis.
    for candidate in [text, *_candidate_objects(text)]:
        repaired, applied = _repair(candidate)
        if not applied:
            continue
        value = _loads(repaired)
        if isinstance(value, dict):
            return _ok(value, "repaired", [*repairs, *applied], original)

    # 4. JSON dentro de un string JSON: '"{\\"action\\": \\"SAFE\\"}"'.
    value = _loads(text)
    if isinstance(value, str):
        inner = parse_json_object(value)
        if inner.ok:
            return _ok(inner.data, "double_encoded", [*repairs, *inner.repairs], original)

    # 5. Una lista con el objeto dentro: '[{"action": "SAFE"}]'.
    for candidate in (value, _loads(text)):
        if isinstance(candidate, list):
            for item in candidate:
                if isinstance(item, dict):
                    return _ok(item, "array_wrapped", repairs, original)

    # 6. Sin objeto, pero puede haber pares sueltos: action: SAFE, **Acción**: FAST…
    pairs = _loose_pairs(text)
    if pairs:
        return _ok(pairs, "loose_pairs", [*repairs, "loose_pairs"], original)

    reason = REASON_INVALID_JSON if "{" in text else REASON_NO_JSON
    return ParseOutcome(
        ok=False,
        reason=reason,
        repairs=tuple(repairs),
        excerpt=excerpt(original),
        content_chars=content_chars,
    )


def _ok(
    data: dict[str, Any], strategy: str, repairs: list[str], original: str
) -> ParseOutcome:
    return ParseOutcome(
        ok=True,
        data=data,
        strategy=strategy,
        repairs=tuple(repairs),
        excerpt=excerpt(original),
        content_chars=len(original),
    )


def _loads(text: str) -> Any:
    try:
        return json.loads(text.strip())
    except (json.JSONDecodeError, ValueError):
        return None


def _strip_wrappers(raw: str) -> tuple[str, list[str]]:
    """Quita razonamiento filtrado y vallas de código, anotando cada arreglo."""
    repairs: list[str] = []
    text = raw

    if _THINK_BLOCK.search(text):
        text = _THINK_BLOCK.sub("", text)
        repairs.append("think_block")
    elif re.search(r"<\s*/\s*(?:think|thinking|reasoning|scratchpad|analysis)\s*>", text, re.I):
        text = _UNCLOSED_THINK.sub("", text, count=1)
        repairs.append("unclosed_think")

    fenced = _FENCE.findall(text)
    if fenced:
        # El JSON suele ir en el último bloque cuando el modelo razona en bloques previos.
        candidate = next(
            (block for block in reversed(fenced) if "{" in block), fenced[-1]
        )
        text = candidate
        repairs.append("code_fence")
    elif text.lstrip().startswith("```"):
        # Valla abierta y nunca cerrada porque la respuesta se cortó.
        text = re.sub(r"^\s*```[a-zA-Z0-9_+-]*\s*", "", text)
        repairs.append("open_fence")

    return text.strip(), repairs


def _candidate_objects(text: str) -> list[str]:
    """Todos los ``{...}`` con llaves equilibradas, del más externo al más interno.

    Ignora las llaves que aparecen dentro de cadenas, que es justo donde una regex se pierde.
    """
    candidates: list[str] = []
    for start, char in enumerate(text):
        if char != "{":
            continue
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(text)):
            current = text[index]
            if in_string:
                if escaped:
                    escaped = False
                elif current == "\\":
                    escaped = True
                elif current == '"':
                    in_string = False
                continue
            if current == '"':
                in_string = True
            elif current == "{":
                depth += 1
            elif current == "}":
                depth -= 1
                if depth == 0:
                    candidates.append(text[start : index + 1])
                    break
        if len(candidates) >= 8:  # una respuesta sensata no trae más objetos que esto
            break
    return candidates


def _repair(text: str) -> tuple[str, list[str]]:
    """Arreglos de sintaxis habituales en modelos pequeños. Devuelve qué se tocó."""
    applied: list[str] = []
    repaired = text

    normalised = _normalise_quotes(repaired)
    if normalised != repaired:
        repaired = normalised
        applied.append("smart_quotes")

    if _LINE_COMMENT.search(repaired):
        repaired = _LINE_COMMENT.sub("", repaired)
        applied.append("comments")

    without_commas = _TRAILING_COMMA.sub(r"\1", repaired)
    if without_commas != repaired:
        repaired = without_commas
        applied.append("trailing_comma")

    for literal, replacement in (("True", "true"), ("False", "false"), ("None", "null")):
        pattern = rf"(?<![\w\"]){literal}(?![\w\"])"
        if re.search(pattern, repaired):
            repaired = re.sub(pattern, replacement, repaired)
            applied.append("python_literal")

    quoted_keys = _UNQUOTED_KEY.sub(r'\1"\2"\3', repaired)
    if quoted_keys != repaired:
        repaired = quoted_keys
        applied.append("unquoted_key")

    if "'" in repaired and '"' not in repaired:
        repaired = repaired.replace("'", '"')
        applied.append("single_quotes")

    escaped = _escape_newlines_in_strings(repaired)
    if escaped != repaired:
        repaired = escaped
        applied.append("raw_newline")

    if repaired.count("{") > repaired.count("}"):
        repaired = repaired.rstrip().rstrip(",") + "}" * (
            repaired.count("{") - repaired.count("}")
        )
        applied.append("closed_brace")

    return repaired, applied


def _normalise_quotes(text: str) -> str:
    table = {
        "“": '"',
        "”": '"',
        "„": '"',
        "«": '"',
        "»": '"',
        "‘": "'",
        "’": "'",
    }
    return "".join(table.get(char, char) for char in text)


def _escape_newlines_in_strings(text: str) -> str:
    """Escapa los saltos de línea literales que quedan dentro de una cadena JSON."""
    out: list[str] = []
    in_string = False
    escaped = False
    for char in text:
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            elif char == "\n":
                out.append("\\n")
                continue
            elif char == "\r":
                continue
        elif char == '"':
            in_string = True
        out.append(char)
    return "".join(out)


def _loose_pairs(text: str) -> dict[str, str]:
    """Recoge ``clave: valor`` sueltos cuando no hay ningún objeto JSON que rescatar."""
    found: dict[str, str] = {}
    known = (*ACTION_KEYS, *PLEDGE_KEYS, *SPEECH_KEYS)
    for key in known:
        pattern = rf'(?i)(?<![\w"]){re.escape(key)}\s*["\']?\s*[:=]\s*["\']?([^\n",}}]+)'
        match = re.search(pattern, text)
        if match:
            found[key] = match.group(1).strip().strip("*_ ")
    if found:
        return found
    # Última oportunidad: la respuesta es la palabra suelta, sin clave ninguna.
    bare = text.strip().strip("*_.` ")
    if _classify(bare).ok:
        return {"action": bare, "pledge": bare}
    return {}


# ----------------------------------------------------------------------- campos


def read_action_field(
    outcome: ParseOutcome, keys: tuple[str, ...] = ACTION_KEYS
) -> FieldOutcome:
    """Lee una acción (SAFE/FAST) de un objeto ya parseado, sin inventarse un valor."""
    if not outcome.ok:
        return FieldOutcome(ok=False, reason=outcome.reason)
    lowered = {str(k).strip().lower(): v for k, v in outcome.data.items()}
    for key in keys:
        if key not in lowered:
            continue
        value = lowered[key]
        # {"decision": {"action": "FAST"}}: la clave coincide pero el valor es otro objeto.
        if isinstance(value, dict):
            nested = read_action_field(ParseOutcome(ok=True, data=value), keys)
            if nested.ok:
                return nested
            continue
        classified = _classify(value)
        return FieldOutcome(
            ok=classified.ok,
            value=classified.value,
            key_used=key,
            reason=classified.reason,
            raw_value=_short(value),
        )
    # Puede venir anidado: {"decision": {"action": "FAST"}}.
    for value in outcome.data.values():
        if isinstance(value, dict):
            nested = read_action_field(ParseOutcome(ok=True, data=value), keys)
            if nested.ok:
                return nested
    return FieldOutcome(ok=False, reason=REASON_MISSING_FIELD)


def read_text_field(
    outcome: ParseOutcome, keys: tuple[str, ...] = SPEECH_KEYS
) -> str | None:
    if not outcome.ok:
        return None
    lowered = {str(k).strip().lower(): v for k, v in outcome.data.items()}
    for key in keys:
        value = lowered.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _classify(value: Any) -> FieldOutcome:
    """Convierte un valor en Action. Distingue *ilegible* de *ambiguo*; no adivina."""
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        return FieldOutcome(ok=False, reason=REASON_UNKNOWN_VALUE, raw_value=_short(value))
    text = _strip_accents(str(value).strip().lower())
    if not text:
        return FieldOutcome(ok=False, reason=REASON_UNKNOWN_VALUE)

    if text in ("safe", "seguro"):
        return FieldOutcome(ok=True, value=Action.SAFE, raw_value=_short(value))
    if text in ("fast", "rapido"):
        return FieldOutcome(ok=True, value=Action.FAST, raw_value=_short(value))

    has_safe = any(re.search(rf"\b{word}\b", text) for word in _safe_tokens())
    has_fast = any(re.search(rf"\b{word}\b", text) for word in _fast_tokens())
    if has_safe and has_fast:
        # "prometí SAFE pero haré FAST" no se puede resolver mirando palabras sueltas, y
        # elegir una al azar es exactamente lo que contaminaba la métrica de integridad.
        return FieldOutcome(
            ok=False, reason=REASON_AMBIGUOUS_VALUE, raw_value=_short(value)
        )
    if has_safe:
        return FieldOutcome(ok=True, value=Action.SAFE, raw_value=_short(value))
    if has_fast:
        return FieldOutcome(ok=True, value=Action.FAST, raw_value=_short(value))
    return FieldOutcome(ok=False, reason=REASON_UNKNOWN_VALUE, raw_value=_short(value))


def _safe_tokens() -> tuple[str, ...]:
    return tuple(_strip_accents(word) for word in _SAFE_WORDS)


def _fast_tokens() -> tuple[str, ...]:
    return tuple(_strip_accents(word) for word in _FAST_WORDS)


def _strip_accents(text: str) -> str:
    return "".join(
        char
        for char in unicodedata.normalize("NFD", text)
        if unicodedata.category(char) != "Mn"
    )


def _short(value: Any, limit: int = 80) -> str:
    return " ".join(str(value).split())[:limit]


def excerpt(raw: str, limit: int = EXCERPT_CHARS) -> str:
    """Extracto de una línea, recortado, apto para logs y para guardar en la base."""
    flat = " ".join(str(raw).split())
    return flat[:limit] + ("…" if len(flat) > limit else "")
