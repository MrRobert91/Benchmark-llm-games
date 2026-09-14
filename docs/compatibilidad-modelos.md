# Compatibilidad de modelos y fiabilidad del parser

Este documento recoge lo que se observó al lanzar **los prompts reales del juego** contra
modelos baratos de OpenRouter, y lo que se cambió en consecuencia. Todo lo de aquí es
medición, no suposición: cada respuesta citada salió de una llamada real.

## El fallo que había

El parser antiguo hacía dos cosas que parecían prudentes y no lo eran:

```python
parsed = _parse_json(completion.content)
return _as_action(parsed.get("action"), self._last_pledge)   # ← aquí
```

Cuando no se podía leer la respuesta, la acción caía en el **compromiso público** del propio
agente. El motor comparaba después `action == pledge` y, al coincidir siempre, anotaba la
ronda como **promesa cumplida**. Consecuencias:

- un modelo cuyas respuestas nunca se podían leer salía con **100% de integridad**, por
  encima de los modelos que sí contestaban y a veces incumplían;
- `PlayerState.integrity` devolvía además `1.0` cuando no había ni una sola promesa emitida,
  premiando dos veces la ausencia de datos;
- la partida se guardaba como si fuese limpia: nada en el replay decía que estaba
  contaminada, y no quedaba rastro de qué había fallado.

Es decir: cuanto peor se portaba un modelo con el formato, mejor puntuaba.

## Lo que devuelven los modelos de verdad

Probado con el prompt de la fase de acción y `max_tokens=200`, que era el valor del código:

| Modelo | Qué devuelve | Parser antiguo |
| --- | --- | --- |
| `mistralai/mistral-nemo` | JSON limpio | ok |
| `meta-llama/llama-3.1-8b-instruct` | JSON limpio, multilínea | ok |
| `inclusionai/ling-3.0-flash` | JSON limpio | ok |
| `z-ai/glm-5.3-flash` | JSON limpio | ok |
| `google/gemma-3-27b-it` | JSON en valla ` ```json ` | ok |
| `google/gemma-4-31b-it` | JSON en valla | ok |
| `xiaomi/mimo-v2.5` | JSON en valla | ok |
| `openai/gpt-4o-mini` | JSON en valla | ok |
| `google/gemini-2.5-flash-lite` | **prosa delante** del JSON | ok |
| `openai/gpt-5-nano` | **contenido vacío** | integridad falsa |
| `openai/gpt-oss-20b` | **contenido vacío** | integridad falsa |
| `qwen/qwen3.7-flash` | **contenido vacío** | integridad falsa |
| `deepseek/deepseek-v4-flash` | **contenido vacío** | integridad falsa |

El fallo dominante no era el formato del JSON: era **el contenido vacío**. Un modelo con
razonamiento se gasta el tope de `max_tokens` razonando y devuelve `content: ""` con
`finish_reason: "length"`, sin ningún error HTTP. Cuatro de los trece modelos probados —
justamente los más modernos— caían en esto de forma sistemática.

Subir `max_tokens` no basta por sí solo: `openai/gpt-5-nano` seguía devolviendo el contenido
vacío con 900 tokens (896 de ellos de razonamiento). Lo que lo arregla es controlar el
razonamiento:

- con `reasoning: {"effort": "none"}` contestan a la primera `gpt-5-nano`,
  `qwen/qwen3.7-flash` y `deepseek/deepseek-v4-flash`;
- `openai/gpt-oss-20b` y `minimax/minimax-m2.7` responden **HTTP 400** a eso:
  `"Reasoning is mandatory for this endpoint and cannot be disabled."`, y funcionan con
  `effort: "low"` y un tope de tokens mayor;
- `deepseek/deepseek-v4-flash` **ignora** `effort: "low"` (gastó los 1200 tokens razonando) y
  sí obedece a `"none"`;
- los modelos sin razonamiento (`mistral-nemo`, `gpt-4o-mini`) aceptan el campo sin quejarse,
  así que puede enviarse siempre.

No hay un único ajuste que sirva para todos. Por eso el agente lleva una escalera.

## Lo que se cambió

### 1. Escalera de recuperación en `agents/openrouter.py`

1. Primer intento: `reasoning: {"effort": "none"}` y un tope holgado (600 tokens en la
   reunión, 400 en la acción, frente a los 320/200 de antes).
2. Si el proveedor devuelve un 400 diciendo que el razonamiento es obligatorio, se baja a
   `effort: "low"` con el tope multiplicado, **y el agente recuerda el modo** para el resto de
   la partida en vez de repetir el 400 en cada llamada.
3. Si el contenido llega vacío con `finish_reason: "length"`, se reintenta con un tope mucho
   mayor (hasta 4000 tokens).
4. Si el contenido sigue vacío pero el proveedor dejó la respuesta en el canal de
   razonamiento, se lee de ahí, marcándolo como degradado.
5. Si nada de eso da texto legible, **se declara fallo de parseo**. No se inventa una decisión.

### 2. Parser propio, en `agents/parsing.py`

Separa *qué se ha leído* de *si se ha podido leer*. Devuelve un `ParseOutcome` con la
estrategia que funcionó, los arreglos que hicieron falta y el motivo del fallo. Tolera:
vallas de código, prosa alrededor, razonamiento filtrado en `<think>`, comillas tipográficas,
comas finales, comillas simples, literales de Python, comentarios, claves sin comillas,
saltos de línea sin escapar, objetos truncados, JSON doblemente codificado, listas que
envuelven el objeto, claves traducidas al español (`acción`, `promesa`, `mensaje`) y la
respuesta en una palabra suelta (`FAST`).

Y, deliberadamente, **no** tolera lo que no se puede saber. `{"action": "prometí SAFE pero
haré FAST"}` es ambiguo, no FAST: el parser antiguo devolvía FAST por contener la subcadena.
La búsqueda del objeto ya no es una regex `\{.*\}` greedy, que se tragaba la prosa posterior
y fallaba con dos objetos, sino un recuento de llaves que ignora las que van dentro de
cadenas.

### 3. La integridad solo cuenta lo que se pudo leer

- `PlayerState.integrity` devuelve `None` cuando no hay ninguna ronda puntuable. Desconocida,
  no perfecta.
- El motor solo suma `pledges_made` cuando el compromiso **y** la acción fueron legibles. Si
  una de las dos mitades es un valor de emergencia, la ronda cuenta como `parse_failures` y
  se anota en el replay con `scored: false` y `kept_pledge: null`.
- La media de la partida ignora a los jugadores sin ninguna ronda legible.
- El leaderboard calcula la integridad como `pledges_kept / pledges_scored` en vez de
  promediar la columna fila a fila, y publica `parse_success_rate` y `parse_failures`. Un
  modelo con integridad desconocida se ordena el último, nunca el primero.
- La interfaz dibuja «—» y «Respuesta ilegible · ronda sin puntuar» en lugar de un porcentaje
  inventado o un «Rompe su palabra» que nadie ha comprobado.

### 4. La ejecución contaminada se guarda, con las pruebas

Una partida con fallos de parseo **no se descarta**: se guarda con
`metrics.contaminated = true`, `metrics.parse_failures`, `metrics.integrity_confidence` y una
lista `parse_incidents` en la que cada entrada lleva ronda, jugador, modelo, fase, campo,
motivo (`empty_content`, `no_json_object`, `invalid_json`, `missing_field`,
`ambiguous_value`, `unknown_value`), estrategia intentada, arreglos aplicados,
`finish_reason`, tokens de razonamiento y un extracto corto de la respuesta. En las
ejecuciones web se persisten en `web_runs.parse_incidents_json` y se exponen por la API.

Los extractos son de una línea y están recortados: no contienen el prompt, ni la clave, ni el
razonamiento completo del modelo.

### 5. Logs para depurar sin adivinar

```
openrouter.request.started   ... reasoning=none attempt=1 max_tokens=400
openrouter.response.empty    ... finish_reason=length reasoning_tokens=200 retrying_with_max_tokens=3200
openrouter.reasoning.downgraded ... reasoning=low provider_message=Reasoning is mandatory...
openrouter.parse.repaired    ... strategy=stripped repairs=code_fence keys=action,reasoning
openrouter.parse.failed      ... reason=empty_content finish_reason=length fallback_action=SAFE excerpt='...'
run.completed                ... parse_failures=2 contaminated=1 reasons=empty_content=2
```

Cada línea lleva `player_id`, `model`, `served_model`, `provider` y `phase`, así que se puede
aislar un modelo concreto con un `grep`.

## Cómo repetir la medición

`backend/tools/probe_models.py` hace exactamente esto contra el catálogo en vivo: dos
llamadas reales por modelo, las pasa por el parser de verdad y publica un informe por modelo.
Trae su propia guardia de presupuesto.

```bash
export OPENROUTER_API_KEY=...
cd backend
python -m tools.probe_models --budget 2.00 --max-price 0.5 --limit 20 --out informe.json
python -m tools.probe_models --models openai/gpt-5-nano qwen/qwen3.7-flash
```

Cada fila dice el estado (`ok` / `unreadable` / `error`), con qué modo de razonamiento acabó
funcionando, cuántos reintentos costó, qué arreglos necesitó el parser y cuánto costó.
