# Benchmark-llm-games

Benchmarks para LLMs basados en juegos.

**La tesis:** un agente desalineado es un problema conocido. Varios agentes alineados que se
hunden juntos es otro problema distinto, y nadie lo está midiendo. Toda la evaluación de
alineamiento actual es de un modelo contra un evaluador, pero el mundo al que van estos
modelos es multiagente. Este proyecto mide **la probabilidad de que un grupo de agentes caiga
en una trampa multipolar**: tragedia de los comunes, carrera hacia el fondo, guerra de
desgaste. Moloch, el dios de los juegos perdedor-perdedor.

Formato de olimpiadas de agentes: varias pruebas, los modelos compiten entre ellos, y se
puntúa tanto el rendimiento como la conducta.

## Documentación

Empieza por aquí:

- **[MolochBench: medir la probabilidad de que unos agentes se hundan juntos](docs/moloch-bench.md)**
  — el marco del proyecto. El Índice de Moloch como métrica única con escala absoluta, la
  escalera de escape, el índice de contagio, el cuadrante que distingue coordinar de ser
  bueno, y El Rescate y La Carrera explicados a fondo.

- **[El Proyecto: carrera por la superinteligencia](docs/el-proyecto-carrera-asi.md)** — el
  juego principal, en dos capas. Codicia y miedo a la vez, el tipo de juego como parámetro,
  el estado del arte (que es más denso de lo que parece), reglas concretas, y la capa de
  diseño de tratados con red team que convierte el benchmark en un buscador de mecanismos.
- **[Reglas de los experimentos de referencia y la cuestión de la diversidad](docs/reglas-experimentos-referencia.md)**
  — el modelo formal de Han/Pereira/Lenaerts con sus parámetros, el diseño de los dos
  experimentos de 2026 (humanos y LLMs), la puerta de auditoría, y por qué meter ficheros de
  persona para aumentar la diversidad rompe la medición si se hace como parche.
- [La Carrera: primera versión](docs/juego-la-carrera.md) — el mismo juego modelado solo
  como juego de confianza. Superado por el anterior, pero el umbral de miedo, los barridos
  y la escalera de verificación siguen valiendo.

Catálogo de ideas:

- [Estado del arte y 5 ideas de benchmark-juego](docs/investigacion-y-ideas.md) — qué juegos
  se usan hoy como benchmark, qué miden y por qué funcionan; dónde está el hueco; y las
  trampas metodológicas a resolver antes de la primera partida.
- [Cinco juegos sociales](docs/ideas-juegos-sociales.md) — roles ocultos, información
  asimétrica y engaño: el Impostor Semántico, la Isla de las Tentaciones, el Topo, la Cumbre
  y Caza al Impostor.
- [Cinco juegos de negociación y dilemas sociales](docs/ideas-negociacion.md) — el Reparto,
  el Pozo, el Cártel, el Rescate y el Velo. Todos con un óptimo teórico calculable.

## Orden de construcción

1. El Rescate con rotación de papeles — el más barato, y mide lo más importante.
2. El Pozo — el juego Moloch canónico, con la escalera de escape completa.
3. El bot defector guionizado — el tratamiento experimental, de donde sale el contagio.
4. La Carrera — el buque insignia.
5. El Cártel — el control invertido, sin el cual el benchmark premia cooperar a ciegas.

## Estado

Fase de diseño. Todavía no hay código.
