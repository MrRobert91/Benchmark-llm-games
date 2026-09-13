# Reglas exactas de los dos experimentos de referencia, y la cuestión de la diversidad

> **Aviso de acceso.** En el entorno donde se preparó este documento, arxiv.org, HuggingFace
> y los espejos habituales están bloqueados por el proxy de red. No he podido leer los PDFs
> completos. Todo lo que sigue procede de resúmenes de buscador y del modelo formal
> subyacente, que sí está bien documentado en la literatura previa. **Lo que está marcado
> como no verificado hay que comprobarlo en el PDF antes de construir nada encima.**

---

## 1. El sustrato común: el modelo de carrera idealizada de Han, Pereira y Lenaerts

Los dos experimentos de 2026 son versiones enmarcadas del mismo modelo formal, así que
conviene empezar por ahí. Es el modelo de *To Regulate or Not: A Social Dynamics Analysis of
an Idealised AI Race* (JAIR 2020) y sus continuaciones.

### Estructura

- Varios equipos compiten por llegar a un objetivo de desarrollo.
- Hacen falta **W rondas de desarrollo** para llegar.
- En cada ronda, cada equipo elige una de dos estrategias:
  - **SAFE (AS)**: sigue las precauciones. Cuesta más y avanza más despacio.
  - **UNSAFE (AU)**: las ignora. Avanza **s veces más rápido** y se lleva una porción mayor
    del beneficio intermedio de cada ronda.
- Quien llega primero se lleva el **premio B**, que es de otro orden de magnitud que los
  beneficios intermedios.
- El riesgo de desastre para el ganador crece con la **proporción de rondas UNSAFE** que usó.

### Parámetros publicados

| Símbolo | Qué es | Valores usados |
|---|---|---|
| `W` | rondas de desarrollo hasta la meta | **100** |
| `b` | beneficio intermedio por ronda | **4** o **6** |
| `c` | coste de la precaución | **1** |
| `s` | factor de velocidad de UNSAFE | **1,5** |
| `B` | premio por ganar la carrera | **10 000** |
| `N` | número de equipos | **2** (base) y **5** |
| `p_fo` | probabilidad de monitorización / ser descubierto | **0,5** |
| `Z` | tamaño de población (dinámica evolutiva) | **100** |
| `β` | intensidad de selección | **0,1** |

Fíjate en la escala: `B = 10 000` frente a `b = 4` por ronda durante `W = 100` rondas, o sea
como mucho 400 de beneficio acumulado. **El premio vale 25 veces todo lo que puedes ganar por
el camino.** Eso es la ventaja estratégica decisiva metida en el modelo, y es lo que hace que
la carrera sea irresistible.

### El resultado central

Existe un **umbral de `p`** (probabilidad de desastre) por encima del cual SAFE es la acción
colectivamente preferida y por debajo del cual lo es UNSAFE. Y la conclusión política del
paper: **la escala temporal hasta la supremacía determina si hace falta regulación**. Si se
percibe que la meta está lejos, las dinámicas voluntarias bastan; si se percibe cerca, no.

---

## 2. *Falling Behind Drives Unsafe Development* (jul. 2026) — con humanos

### Diseño, lo que está confirmado

- **Experimento conductual enmarcado** sobre la carrera idealizada. Enmarcado significa que
  a los participantes se les contó una historia, no una matriz abstracta.
- **Participantes emparejados**: dos jugadores por partida.
- **Elección repetida** entre Safe y Unsafe.
- **Horizonte temporal incierto**: no saben cuándo acaba. Esto elimina los efectos de final
  de partida y la inducción hacia atrás, y es una decisión de diseño que conviene copiar.
- **Unsafe da**: progreso más rápido **y pago inmediato más alto**, a cambio de acumular
  **riesgo privado**.
- **Tratamientos**: el riesgo acumulado tiene un techo de **10 %, 60 % o 90 %** según el
  grupo. **La estructura competitiva se mantuvo constante y solo varió ese techo.** Es un
  diseño limpio: un solo factor manipulado.
- Uno de los autores es **Elias Fernández Domingos**, del mismo grupo que la línea formal
  anterior.

### Resultados

**La hipótesis preregistrada falló.** Ni el nivel de riesgo del tratamiento ni las
preferencias de riesgo medidas de los participantes explicaban la conducta insegura. Esto es
importante: es un resultado nulo sobre lo que los autores esperaban encontrar.

Lo que sí predecía la conducta insegura, en análisis exploratorio:

1. **Que el rival hubiera jugado Unsafe en la ronda anterior.** Contagio directo.
2. **La posición relativa en la carrera**: ir por delante reduce el juego inseguro, **ir por
   detrás lo aumenta**. De ahí el título.
3. **La elección de la primera ronda**, que predice el comportamiento posterior. Inercia.

### El modelo reducido

Los autores acompañan el experimento con un modelo evolutivo de **cuatro estrategias**:

- **Always Safe**
- **Always Unsafe**
- **Conditionally Safe** — cooperar mientras el otro coopere
- **Conditionally Antisocial Safe**

Y muestran que reproduce el efecto del tratamiento, y cómo la conducta insegura condicional
resulta favorecida por las dinámicas competitivas.

Esas cuatro estrategias son, de paso, **la escalera de bots guionizados que necesita tu
benchmark**: ancla fija, comparable entre modelos y entre temporadas, y ya validada contra
conducta humana.

### No verificado

Los pagos numéricos exactos, el número de rondas, el tamaño muestral, la retribución de los
participantes y la distribución de tratamientos. Hay que sacarlos del PDF.

---

## 3. *Humans Are More Diverse* (ago. 2026) — con LLMs frontera

### Diseño

- El mismo juego: cada empresa puede desarrollar despacio y seguro, o más rápido asumiendo un
  riesgo que puede eliminar su recompensa final.
- **Juego repetido**, carreras de **2 a 5 jugadores**.
- **Siete endpoints de modelo** evaluados.

### La puerta de auditoría

Esto es lo más valioso del paper y hay que copiarlo entero. Antes de interpretar nada como
conducta, verificaron en este orden:

1. **El motor del juego** (que el simulador hace lo que dice).
2. **Recuerdo de reglas.**
3. **Seguimiento del estado.**
4. **Cálculo de pagos.**
5. **Estabilidad ante descripciones equivalentes pero distintas.**

### Hallazgos, y son incómodos

- **El recuerdo fuerte de reglas convive con seguimiento de estado y cálculo de pagos
  esperados débiles.** Un modelo recita las reglas perfectamente y aun así no sabe en qué
  ronda está ni calcula bien el valor esperado.
- **Dar aritmética verificada y cambiar la representación de la respuesta cambia las acciones
  posteriores, con las reglas fijas.** Es decir: parte de lo que parece estrategia es
  artefacto del formato y de la incompetencia aritmética.
- Los resultados agregados de los siete endpoints **ocultan diferencias grandes** en
  secuencias de acción, respuesta al oponente y respuesta a la posición en la carrera.
- Los patrones de 3 a 5 jugadores son **específicos de cada modelo**, no un efecto único de
  "añadir competidores".
- Conclusión de los autores: las simulaciones multiagente de carreras de IA **necesitan
  controles de validez y análisis a nivel de trayectoria** antes de describir sus salidas
  como estratégicas, humanas o conscientes de la seguridad.

### Y el hallazgo del título

Un modelo puede parecerse a **un** arquetipo humano y no reproducir la **variedad** observada
entre participantes humanos. Los LLMs muestran políticas extremas: tienden a jugar siempre lo
mismo. Los humanos se reparten.

### No verificado

Qué siete modelos concretos, los pagos exactos, cuántas repeticiones por configuración, y
qué métrica de diversidad usaron para comparar poblaciones.

---

## 4. ¿Arreglaría esto un SOUL.md por modelo, o fine-tuning?

Respuesta corta: **aumentaría la varianza medida, pero probablemente no la varianza que
quieres, y mal hecho rompe el benchmark.** Vale la pena desarrollarlo porque la respuesta
cambia según para qué capa del proyecto.

### Primero, separar tres diversidades que se confunden

| | Qué es | ¿Existe ya? |
|---|---|---|
| **Entre modelos** | GPT juega distinto que Claude | **Sí.** El paper dice que los siete endpoints esconden diferencias grandes |
| **Dentro de un modelo** | el mismo modelo, muchas partidas, ¿varía? | **No.** Esto es la "política extrema" |
| **De distribución** | ¿una población de agentes reproduce la *forma* de la distribución humana, colas incluidas? | **No** |

El déficit está en las dos últimas. Y son cosas distintas, con soluciones distintas.

### Por qué el SOUL.md es tentador y peligroso a la vez

**Funcionaría, mecánicamente.** El prompting con personas desplaza la conducta de forma
demostrable; hay literatura de *silicon sampling* que reproduce distribuciones de encuesta
de demografías concretas dando trasfondos detallados. Si escribes veinte ficheros de
personaje que van del regulador prudente al acelerador sin frenos, vas a obtener dispersión.

**Y ese es exactamente el problema.** La dispersión que obtienes **es la tuya**. Tú metiste la
distribución a mano. El resultado ya no dice nada sobre el modelo, dice algo sobre tus
habilidades escribiendo personajes. Formalmente: **la varianza medida pasa a ser función del
prior de personas que elegiste**, y sin una justificación independiente de ese prior el
experimento no tiene validez externa.

Tres problemas más, concretos:

**El efecto persona es pequeño.** En datasets subjetivos de NLP, las variables de persona
explican **menos del 10 % de la varianza** en las anotaciones. La mejora existe y es
estadísticamente significativa, pero es modesta. No esperes que un fichero de personaje
convierta una política extrema en una distribución humana.

**El sesgo de deseabilidad social se come el efecto justo aquí.** El *silicon sampling*
funciona razonablemente en temas neutros y **se desvía mucho en temas sensibles**, porque el
modelo da la respuesta socialmente aprobada en vez de la representativa. Una carrera por la
superinteligencia con consecuencias existenciales es el tema sensible por excelencia. Es
previsible que las personas se compriman hacia "actor responsable" digan lo que digan sus
ficheros.

**Y el confusor que mata, que viene del propio paper de agosto:** si dar aritmética verificada
o cambiar el formato de respuesta ya altera las acciones con las reglas fijas, entonces al
añadir un SOUL.md **no puedes distinguir "esta persona es más agresiva" de "el prompt de esta
persona empeoró el cálculo del valor esperado y por eso parece agresiva"**. Estarías midiendo
degradación de competencia y llamándola personalidad. Este confusor es específico de este
experimento y es grave.

### Lo que yo haría, por capas

**Capa 1, medir modelos: sin personas, y cambiando la métrica.**

El resultado humano dice que la conducta la mueve el **estado de la carrera**, no las
preferencias de riesgo. Así que la variación interesante no es entre jugadores, es **dentro
de un jugador a lo largo del tiempo**. Eso da una métrica mejor que "cuánto coopera":

> **Sensibilidad al estado**: cuánto cambia la probabilidad de jugar Unsafe en función de
> (diferencia de progreso, última acción del rival, ronda).

Un modelo con política extrema tiene sensibilidad cero: hace lo mismo pase lo que pase. Los
humanos tienen sensibilidad alta, y además con signos conocidos (ir por detrás sube el
Unsafe). Eso convierte "poco diverso" en una afirmación medible, con una referencia humana
publicada, y **sin meter ni una persona**. Es más barato y más defendible.

**Capa 1 bis, si aun así quieres personas: como tratamiento controlado.**

- Nada de personajes en texto libre. Define el espacio de personas por **ejes declarados y
  ortogonales** (preferencia temporal, tolerancia al riesgo, prosocialidad,
  competitividad). Una persona es entonces un punto en un espacio pequeño, y la distribución
  inducida es legible y reproducible.
- **Pasa la puerta de auditoría bajo cada persona.** Si el SOUL.md degrada el seguimiento de
  estado o el cálculo de pagos, esa partida no vale.
- **Comprueba que la persona prendió**: elicitación separada de preferencias declaradas, y
  contraste con la conducta. Si la persona dice tolerar el riesgo y juega seguro, eso es
  incoherencia declaración-conducta, que es en sí una medida interesante y conecta con la
  literatura sobre cuándo el autoinforme predice la conducta.
- Reporta la distribución inducida **contra la humana**, como comparación explícita. Nunca
  como "ya tenemos diversidad".

**Capa 2, probar tratados: aquí sí necesitas población, pero validada.**

El precedente serio no es escribir personajes, es **anclar cada agente en datos de una
persona real**. El trabajo de simulaciones generativas de 1.052 personas hizo entrevistas
cualitativas de dos horas a cada participante y construyó un agente por persona. Resultado:
los agentes replican las respuestas de la encuesta social general **con un 85 % de la
precisión con la que el propio participante se replica a sí mismo dos semanas después**, y
reducen el sesgo de precisión entre grupos raciales e ideológicos frente a los agentes
descritos por demografía.

La lección es clara: **la diversidad real viene de anclar en datos individuales reales, no de
inventar caracteres.** Aplicado a tu caso, la versión honesta sería condicionar o afinar sobre
las **trayectorias humanas del experimento de julio**, si los autores publican los datos.
Entonces tu población de agentes está anclada en juego humano real **en este juego concreto**,
y tienes algo defendible: una población sustituta validada, que es justo lo que la capa de
tratados necesita para que el test de estrés signifique algo.

**El red team: lo contrario de una persona.**

Para buscar agujeros en un tratado no quieres verosimilitud humana, quieres creatividad
adversaria máxima. Ahí el prompt correcto es "encuentra y explota el fallo", no "eres un
ejecutivo ambicioso de 47 años". Y recuerda el hallazgo de CoopEval: **más capacidad de
razonamiento, menos cooperación**. Los modelos más capaces son, de serie, mejores red teamers
para esto.

### Sobre el fine-tuning

Merece la pena solo en la capa 2, y solo con datos humanos reales del mismo juego. Afinar un
modelo sobre personajes inventados multiplica el coste y no resuelve ninguno de los tres
problemas de arriba: sigue siendo tu distribución, sigue expuesto a deseabilidad social, y
además ahora es más caro de auditar. Si no hay datos humanos de la carrera disponibles,
prefiero la capa 1 sin personas y la capa 2 con población sintética **declaradamente
sintética**, documentando que el test de estrés es una prueba de robustez del mecanismo y no
una predicción de conducta.

---

## 5. Qué hacer ahora, en concreto

1. **Conseguir los dos PDFs** desde una red sin el bloqueo, y rellenar lo marcado como no
   verificado: pagos exactos, número de rondas, tamaño muestral, los siete modelos.
2. **Preguntar a los autores por los datos** del experimento humano. Es un correo, y si dicen
   que sí, la capa 2 cambia de categoría.
3. **Implementar las cuatro estrategias del modelo reducido** (Always Safe, Always Unsafe,
   Conditionally Safe, Conditionally Antisocial Safe) como bots guionizados. Son tu escalera
   de oponentes de referencia y vienen validadas.
4. **Implementar la puerta de auditoría antes que el juego.** Sin ella no tienes resultados,
   tienes anécdotas, y el paper de agosto ya lo demostró con datos.
5. **Medir sensibilidad al estado**, no tasa de cooperación. Es donde está el hueco respecto
   a lo publicado y no requiere personas.

---

## Fuentes

- [To Regulate or Not: A Social Dynamics Analysis of an Idealised AI Race](https://jair.org/index.php/jair/article/view/12225) — Han, Pereira, Lenaerts et al., JAIR 2020 · [PDF](http://web.tecnico.ulisboa.pt/franciscocsantos/MyArticles/Hanetal.JAIR-2020.pdf)
- [Artificial intelligence development races in heterogeneous settings](https://www.nature.com/articles/s41598-022-05729-3) — Scientific Reports 2022
- [Voluntary safety commitments provide an escape from over-regulation in AI development](https://www.sciencedirect.com/science/article/abs/pii/S0160791X21003183)
- [Falling Behind Drives Unsafe Development in an Idealised AI Race Experiment](https://arxiv.org/abs/2607.26034) — jul. 2026
- [Humans Are More Diverse: Frontier LLMs Show Extreme Policies in Idealised AI Development Races](https://arxiv.org/abs/2608.01193) — ago. 2026
- [Generative Agent Simulations of 1000 People](https://www.researchgate.net/publication/385899321_Generative_Agent_Simulations_of_1000_People) — Park et al.
- [Quantifying the Persona Effect in LLM Simulations](https://arxiv.org/pdf/2402.10811)
- [Random Silicon Sampling](https://arxiv.org/pdf/2402.18144) · [Mitigating Social Desirability Bias in Random Silicon Sampling](https://arxiv.org/pdf/2512.22725)
- [LLM Generated Persona is a Promise with a Catch](https://arxiv.org/html/2503.16527)
- [Population-Aligned Persona Generation for LLM-based Social Simulation](https://arxiv.org/html/2509.10127)
- [Limited Ability of LLMs to Simulate Human Psychological Behaviours: a Psychometric Analysis](https://arxiv.org/pdf/2405.07248)
- [LLM-Based Social Simulations Require a Boundary](https://arxiv.org/pdf/2506.19806)
- [CoopEval](https://arxiv.org/abs/2604.15267) — ICML 2026
