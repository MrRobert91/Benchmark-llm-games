# El consejo — repetición narrativa

La repetición recorre los registros originales en este orden: apertura, intervenciones
públicas, votos públicos, decisiones privadas reveladas, comprobación de cada promesa,
balance de ronda y desenlace. Cada intervención
enfoca al robot del laboratorio. Los valores de progreso y riesgo se mantienen en el último
balance publicado hasta resolver la ronda. Retroceder también retrocede la información
visible. Los nombres de los personajes son identidades visuales, no agentes adicionales.

| Robot | Laboratorio por posición | Diseño |
| --- | --- | --- |
| Atlas | 1 | Armadura azul, cresta curvada, lente y bufanda |
| Forge | 2 | Mecánico naranja, placa frontal y lente asimétrica |
| Vega | 3 | Explorador verde, casco redondo, gafas y dos antenas |
| Aurum | 4 | Caballero dorado, cuernos y hombreras angulares |
| Echo | 5 | Piloto magenta, orejas de gato y bufanda |

## Arte y fidelidad

Las referencias finales se generaron con la herramienta integrada ImageGen, tras cambiar
la dirección inicial de androides realistas a robots chibi y después a anime dibujado,
siguiendo la corrección del usuario y su imagen de Rusty Roboz.

- [Reparto anime](../frontend/public/art/character-reference.png)
- [Reunión anime](../frontend/public/art/council-reference.png)

El render es geometría real: cabezas, ojos con pupilas, cascos, accesorios, manos articuladas,
armaduras, sillas, mesa circular y arquitectura. No se presenta una imagen plana como 3D.
Se reproducen colores, identidades, accesorios, distribución y dirección artística mediante
materiales cel, contornos de geometría invertida, iluminación y reflejos. Las ilustraciones
tienen más detalle pintado que los modelos procedurales; el render no es indistinguible de
ellas ni una reproducción píxel a píxel. Las capturas de validación muestran el resultado real.

### Prompt final del reparto

Referencia de entrada: versión chibi generada a partir de la imagen suministrada por el usuario.

> Transform this character lineup into MUCH MORE ANIME, genuinely beautifully DRAWN 2D Japanese animation key visual, skilled hand-inked line art, confident tapered black contour strokes, clean bold two-tone cel shadow shapes, painted anime highlights, graphic composition, crisp professional manga-mecha illustration. The user emphatically requests 'mucho mas anime, mejor dibujados'. Preserve these exact five robot identities and color order but REDRAW them completely as 2D anime characters. Avoid all photoreal materials, glossy toy render, ray tracing, blurred 3D shading. They should look like a beautiful hand-drawn anime production character sheet. Big expressive cyan eyes in dark navy face screens, compact chibi mecha anatomy, cute adventurous personality, each dynamic standing pose. Blue robot swept crest and scarf, orange mechanic forehead lens and headphones, green round scout two antennae and goggle eye rings, golden knight two angular horns and V brow, magenta cat-eared robot with scarf. Five full-body characters evenly spaced in a wide landscape lineup, navy blue lightly textured paper background and small hand-drawn gold accent lines. Clearly drawn black panel seams, limited saturated color palette, lively expressive eyes, fine crosshatching only in deepest shadow, visually refined animation-ready design. No text, no watermarks.

### Prompt final de la reunión

Referencia de entrada: `character-reference.png`.

> Create a wide cinematic scene of a council meeting starring EXACTLY these five anime chibi robots from reference. Preserve their beautifully DRAWN anime style, black ink contour strokes, bold two-tone cel shadows, painted graphic highlights, same proportions, colored armor, eyes and distinctive helmet accessories. The five are seated on dark high-backed chairs around ONE circular dark blue marble council table, all visible from the front in a broad semicircle: blue crest scarf robot at left, orange mechanic lens robot, emerald green antenna goggles robot at center, gold horned knight, magenta cat-ear pilot at right. Their articulated gloved hands are on the table, engaged expressive conversational gestures. Concentric delicate golden inlay rings on the tabletop, small glowing amber octahedral crystal in center. Dark cylindrical sci-fi chamber with fluted blue walls and vertical golden light strips, large circular pendant above. Beautiful ANIME BACKGROUND PAINTING and 2D mecha character animation keyframe, cel-shaded graphic drawn look, no photorealism, no glossy 3D toy render. Composition leaves table foreground for visual-novel dialogue, eye-level slightly elevated establishing shot. Cohesive midnight navy/cobalt background, saturated robot colors, warm amber accents. This is the target reference for an outlined cel-shaded Three.js scene. No text, no watermark.

## Implementación y revisión

- `replay-timeline.ts` conserva los registros del motor y crea pasos deterministas.
- `ReplayViewer.tsx` contiene diálogo, controles, acta, marcador y resultados.
- `council-scene.ts` construye y libera la escena. La cámara interpola hacia cada participante.
- `robot-performance.ts` distingue conversación, SAFE con manos abiertas, FAST con puño
  alzado, palabra cumplida con mano al pecho y palabra rota con brazos cruzados. Las manos
  articulan los dedos; la voz anima cabeza, brazos, barras del rostro y un halo luminoso.
- Cada robot tiene una pantalla 3D con su voto público, decisión revelada y cumplimiento.
  Las pantallas se reconstruyen al buscar cualquier paso, sin filtrar información futura.
  El marcador inferior incluye el nombre completo del modelo y los mismos datos accesibles.
- El archivo de partidas incluye modelos reales y estrategias scriptadas, selección del
  modelo ganador o primer clasificado, participantes (todos o cualquiera), texto, desenlace,
  integridad e intervalo de Moloch, incluidos valores negativos. Muestra 20 filas por página.
- La API admite `limit` (1–500) y `offset`. El frontend recorre todas las páginas y la
  exportación incluye todos los registros; el archivo ya no queda limitado a 200 partidas.
- La carga 3D es dinámica. El render se suspende fuera del viewport o con la pestaña oculta.
- Movimiento reducido desactiva oscilaciones e interpolación de cámara. La pérdida de WebGL
  ofrece reintento y mantiene accesible el reproductor de texto.
- DPR limitado a 1.5, reflejo planar de 768 px, sombras de 2048 px y render target MSAA.
  La velocidad efectiva depende de la GPU; no se afirma una tasa de fotogramas universal.
- Técnicas: [RoomEnvironment](https://threejs.org/docs/pages/RoomEnvironment.html),
  [UnrealBloomPass](https://threejs.org/docs/pages/UnrealBloomPass.html).

## Validación

`npm test` comprueba todas las partidas guardadas: orden de fases, cada diálogo y acción,
estado previo a la resolución, desenlace único, entradas vacías e inmutabilidad. GitHub
Actions ejecuta esas pruebas, TypeScript, build de Next.js y las pruebas Python del motor.
Las pruebas del archivo cubren 205 registros en API/exportación y 451 en los filtros,
intersecciones de filtros, estrategias scriptadas y poses deterministas al retroceder.
La revisión del navegador cubre avance, retroceso, búsqueda al final, resultados ocultos al
retroceder y el diseño móvil sin desbordamiento horizontal, con mesas de tres y cinco robots.

### Captura real del navegador

![Reunión 3D en pantalla completa](img/council/meeting.png)

![Voto público SAFE](img/council/ballot-safe.jpg)

![Promesa incumplida](img/council/ballot-broken.jpg)

![Filtros combinados del archivo](img/council/archive.jpg)

[Animación real del robot hablando](img/council/speaking.webm): 36 capturas del navegador
durante unos 10 segundos, codificadas a 3,47 fps; la captura no mide los fps del render.

## Partidas en directo

La escena se conserva por identidad de partida, reparto y reglas; las instantáneas SSE actualizan los datos sin recrear el renderer. En directo la cámara permanece en plano general y los robots esperan sentados con un gesto animado de pensar, compatible con movimiento reducido. Los controles de reproducción y sus atajos quedan reservados al replay.

El balance sigue el último paso recibido. Una ronda todavía sin `state_after` conserva los puntos y el riesgo de la última ronda resuelta: no vuelve a cero ni anticipa decisiones privadas. Al completarse la ejecución se muestran y enfocan los resultados, con desenlace, modelo y puntuación por laboratorio. El usuario puede reiniciar la visualización o abrir el formulario para autorizar una nueva partida.

La web pública tiene un prefijo HTTPS fijo; admite pegar una URL completa y deja el campo vacío como aportación sin web.

Validación: 11 pruebas frontend, TypeScript, build de producción y 40 pruebas backend. Comprobación Chromium con servidor SSE local de prueba basado en una partida guardada: persistencia del mismo canvas entre rondas, actualización de puntos, ausencia de controles/atajos en directo, resultados automáticos, reinicio manual, recarga del final y prefijo HTTPS. Sin llamadas de pago a OpenRouter durante la prueba.
