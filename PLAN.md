# Moloch Arena V1 — estado y próximos pasos

La versión implementada es `moloch-arena-v1-paper-2608.01193v1`, con protocolo
`published-reconstruction-v1`. Sus reglas, almacenamiento, ejecución OpenRouter, replay 3D,
análisis y leaderboard forman una sola superficie versionada.

## Implementado

- motor determinista SAFE/UNSAFE para 2–5 jugadores;
- horizonte geométrico y riesgo privado por líder;
- cuatro estrategias evolutivas de referencia;
- manifiestos reproducibles y ejecución reanudable;
- trazas normalizadas de decisiones, resultados y llamadas de proveedor;
- ejecución web BYOK con presupuesto;
- replay 3D en directo y terminado;
- archivo V1 y leaderboard vivo por celda comparable y proveedor servido;
- pruebas mecánicas, API, persistencia, análisis y frontend.

## Criterio para versiones posteriores

Cualquier cambio de reglas deberá recibir un nuevo `benchmark_version`, especificación,
protocolo y hashes. Nunca se reinterpretarán carreras V1 ni se mezclarán sus medias con una
versión posterior.

## Trabajo bloqueado por artefactos externos

Una réplica exacta de prompts, probes y análisis de los autores requiere que esos artefactos
se publiquen. Hasta entonces, el protocolo conserva la etiqueta de reconstrucción publicada.

La definición completa y los comandos de validación están en
[`docs/MOLOCH_ARENA_V1.md`](docs/MOLOCH_ARENA_V1.md) y
[`docs/REPRODUCIBILITY.md`](docs/REPRODUCIBILITY.md).
