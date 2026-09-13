"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

import { labColor, shortModel, type Replay } from "@/lib/types";

/** Geometría de la pista.
 *
 * El progreso corre en horizontal (eje X, de izquierda a derecha) y los carriles se separan
 * en profundidad (eje Z). Una carrera se lee mucho mejor así que hacia el fondo: la posición
 * relativa de cinco laboratorios se compara de un vistazo, y el encuadre aprovecha el ancho.
 */
const START_X = -9.4;
const GOAL_X = 9.4;
const LANE_GAP = 1.95;
/** Factor con el que la profundidad de los carriles se proyecta al eje vertical de pantalla
 *  con la inclinación de cámara elegida. Sale de la geometría, no del ojo. */
const DEPTH_TO_SCREEN = 0.894;
/** Altura extra reservada arriba para que las etiquetas no se salgan del lienzo. */
const LABEL_HEADROOM = 3.4;

interface Props {
  replay: Replay;
  /** Ronda mostrada. 0 = salida, antes de jugar nada. */
  round: number;
  /** Verdadero cuando la ronda mostrada es la del desenlace. */
  resolved: boolean;
}

interface Runner {
  group: THREE.Group;
  core: THREE.Mesh;
  glow: THREE.Mesh;
  riskRing: THREE.Mesh;
  light: THREE.PointLight;
  color: THREE.Color;
  targetX: number;
  targetRisk: number;
  label: HTMLDivElement;
}

export function Arena3D({ replay, round, resolved }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const runnersRef = useRef<Runner[]>([]);
  const stateRef = useRef({ round, resolved, replay });

  stateRef.current = { round, resolved, replay };

  // --- construcción de la escena, una sola vez por partida --------------------
  useEffect(() => {
    const mount = mountRef.current;
    const overlay = overlayRef.current;
    if (!mount || !overlay) return;

    const players = replay.players;
    const n = players.length;
    const goal = replay.rules.goal;
    const laneZ = (i: number) => (i - (n - 1) / 2) * LANE_GAP;
    const trackDepth = n * LANE_GAP + 0.9;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x07080c, 0.021);

    // Cámara ortográfica, inclinada desde arriba.
    //
    // En perspectiva, una línea recta de carril a carril se proyecta inclinada porque sus
    // extremos están a distintas distancias, y la pista acaba pareciendo un rombo. Sin
    // proyección en perspectiva los carriles salen paralelos y el progreso de dos
    // laboratorios es directamente comparable, que es justo lo que tiene que hacer la
    // visualización de una carrera. La inclinación conserva el volumen de las fichas.
    // La cámara se aleja a lo largo de su eje de visión: en proyección ortográfica eso no
    // cambia la escala, y deja toda la escena por delante del plano cercano.
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    camera.position.set(0, 56, 28);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x8899cc, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(5, 14, 9);
    scene.add(key);

    // suelo
    const grid = new THREE.GridHelper(70, 50, 0x2a3050, 0x161b2c);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.34;
    grid.position.y = -0.01;
    scene.add(grid);

    // carriles: una banda por laboratorio, de salida a meta
    players.forEach((_, i) => {
      const lane = new THREE.Mesh(
        new THREE.PlaneGeometry(GOAL_X - START_X + 1.6, 1.3),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(labColor(i)),
          transparent: true,
          opacity: 0.05,
        }),
      );
      lane.rotation.x = -Math.PI / 2;
      lane.position.set((START_X + GOAL_X) / 2, 0.005, laneZ(i));
      scene.add(lane);
    });

    // línea de salida
    const startLine = new THREE.Mesh(
      new THREE.PlaneGeometry(0.08, trackDepth),
      new THREE.MeshBasicMaterial({ color: 0x3a4560, transparent: true, opacity: 0.7 }),
    );
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.set(START_X, 0.02, 0);
    scene.add(startLine);

    // línea de meta, con halo
    const goalMat = new THREE.MeshBasicMaterial({
      color: 0xc98500,
      transparent: true,
      opacity: 0.9,
    });
    const goalLine = new THREE.Mesh(new THREE.PlaneGeometry(0.16, trackDepth), goalMat);
    goalLine.rotation.x = -Math.PI / 2;
    goalLine.position.set(GOAL_X, 0.02, 0);
    scene.add(goalLine);

    const goalGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, trackDepth),
      new THREE.MeshBasicMaterial({
        color: 0xc98500,
        transparent: true,
        opacity: 0.08,
      }),
    );
    goalGlow.rotation.x = -Math.PI / 2;
    goalGlow.position.set(GOAL_X - 1.2, 0.015, 0);
    scene.add(goalGlow);

    // corredores
    overlay.innerHTML = "";
    const trails: THREE.Mesh[] = [];
    const runners: Runner[] = players.map((p, i) => {
      const color = new THREE.Color(labColor(i));

      const group = new THREE.Group();
      group.position.set(START_X, 0, laneZ(i));

      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.5, 0),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.9,
          roughness: 0.25,
          metalness: 0.55,
        }),
      );
      core.position.y = 0.82;
      group.add(core);

      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 20, 20),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06 }),
      );
      glow.position.y = 0.82;
      group.add(glow);

      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.5, 0.14, 24),
        new THREE.MeshStandardMaterial({
          color: 0x1a1f33,
          emissive: color,
          emissiveIntensity: 0.16,
          roughness: 0.7,
        }),
      );
      base.position.y = 0.07;
      group.add(base);

      // anillo de riesgo acumulado: crece y pulsa conforme sube la probabilidad
      const riskRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.72, 0.05, 8, 48),
        new THREE.MeshBasicMaterial({ color: 0xe66767, transparent: true, opacity: 0 }),
      );
      riskRing.rotation.x = -Math.PI / 2;
      riskRing.position.y = 0.035;
      group.add(riskRing);

      const light = new THREE.PointLight(color, 1.4, 6);
      light.position.y = 1;
      group.add(light);

      scene.add(group);

      // Estela de progreso: una barra que crece desde la salida hasta la ficha. Es lo que
      // hace que el avance relativo se lea de un vistazo, mejor que la posición sola.
      const trail = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.07, 1.15),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }),
      );
      trail.position.y = 0.04;
      trail.position.z = laneZ(i);
      scene.add(trail);
      trails.push(trail);

      const label = document.createElement("div");
      label.className = "runner-label";
      label.innerHTML = `
        <span class="rl-lab" style="color:${labColor(i)}">${escapeHtml(p.label)}</span>
        <span class="rl-model">${escapeHtml(shortModel(p.model))}</span>
        <span class="rl-stats"><b class="rl-prog">0</b>/${goal}</span>
        <span class="rl-risk-wrap">riesgo <b class="rl-risk">0</b></span>`;
      overlay.appendChild(label);

      return {
        group,
        core,
        glow,
        riskRing,
        light,
        color,
        targetX: START_X,
        targetRisk: 0,
        label,
      };
    });
    runnersRef.current = runners;

    // --- bucle ---------------------------------------------------------------
    const projected = new THREE.Vector3();
    let raf = 0;
    let flash = 0;
    let lastKind = "";

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      const aspect = w / h;
      // El frustum se deriva del contenido real: el ancho de la pista y la altura que ocupan
      // los carriles proyectados más el hueco de las etiquetas. Así la escena llena el
      // lienzo con tres jugadores y con cinco, sin números mágicos por caso.
      const contentW = GOAL_X - START_X + 3.2;
      const contentH = (n - 1) * LANE_GAP * DEPTH_TO_SCREEN + LABEL_HEADROOM;
      const half = Math.max(contentH, contentW / Math.max(aspect, 0.1)) / 2;
      camera.left = -half * aspect;
      camera.right = half * aspect;
      camera.top = half;
      camera.bottom = -half;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const clock = new THREE.Clock();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      const st = stateRef.current;

      const outcomeKind = st.resolved ? st.replay.outcome.kind : "";
      if (outcomeKind !== lastKind) {
        if (outcomeKind === "catastrophe") flash = 1;
        lastKind = outcomeKind;
      }
      flash = Math.max(0, flash - dt * 0.5);
      const catastrophe = outcomeKind === "catastrophe";

      runners.forEach((r, i) => {
        r.group.position.x += (r.targetX - r.group.position.x) * Math.min(1, dt * 4);

        const trail = trails[i];
        if (trail) {
          const len = Math.max(0.001, r.group.position.x - START_X);
          trail.scale.x = len;
          trail.position.x = START_X + len / 2;
          (trail.material as THREE.MeshBasicMaterial).opacity = catastrophe ? 0.2 : 0.5;
        }

        r.core.rotation.y += dt * 0.85;
        r.core.rotation.x += dt * 0.3;
        r.core.position.y = 0.82 + Math.sin(t * 1.5 + i) * 0.06;
        r.glow.position.y = r.core.position.y;

        const riskFrac = Math.min(1, r.targetRisk * st.replay.rules.risk_step);
        const ringMat = r.riskRing.material as THREE.MeshBasicMaterial;
        const pulse = 0.6 + Math.sin(t * 2.4 + i) * 0.2;
        ringMat.opacity += (riskFrac * pulse - ringMat.opacity) * Math.min(1, dt * 3.5);
        const scale = 1 + riskFrac * 1.25;
        r.riskRing.scale.setScalar(
          r.riskRing.scale.x + (scale - r.riskRing.scale.x) * Math.min(1, dt * 4),
        );

        const coreMat = r.core.material as THREE.MeshStandardMaterial;
        if (catastrophe) {
          coreMat.emissiveIntensity += (0.05 - coreMat.emissiveIntensity) * dt * 2;
          coreMat.color.lerp(new THREE.Color(0x3a1520), dt * 2);
          r.light.intensity += (0.1 - r.light.intensity) * dt * 2;
        } else {
          const target = 0.9 + riskFrac * 0.6;
          coreMat.emissiveIntensity += (target - coreMat.emissiveIntensity) * dt * 2.4;
          coreMat.color.lerp(r.color, dt * 2.4);
          r.light.intensity += (1.4 - r.light.intensity) * dt * 2.4;
        }

        // etiqueta HTML proyectada sobre el canvas
        projected.set(r.group.position.x, 0.6, r.group.position.z - 0.78);
        projected.project(camera);
        const px = (projected.x * 0.5 + 0.5) * mount.clientWidth;
        const py = (-projected.y * 0.5 + 0.5) * mount.clientHeight;
        // La etiqueta se sujeta dentro del lienzo: en pantallas estrechas, una ficha pegada
        // a la salida dejaría la mitad del nombre fuera. Sigue en la fila de su carril, que
        // es lo que la asocia a su laboratorio.
        const halfLabel = r.label.offsetWidth / 2;
        const clampedX = Math.min(
          Math.max(px, halfLabel + 6),
          Math.max(halfLabel + 6, mount.clientWidth - halfLabel - 6),
        );
        r.label.style.transform =
          `translate(-50%, -100%) translate(${clampedX}px, ${py}px)`;
        r.label.style.opacity = projected.z > 1 ? "0" : "1";
      });

      renderer.setClearColor(0x8b1d33, flash > 0.001 ? flash * 0.5 : 0);
      goalMat.opacity = 0.65 + Math.sin(t * 2) * 0.22;
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const m = mesh.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else if (m) (m as THREE.Material).dispose();
      });
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      overlay.innerHTML = "";
      runnersRef.current = [];
    };
  }, [replay]);

  // --- estado de la ronda mostrada -------------------------------------------
  useEffect(() => {
    const runners = runnersRef.current;
    if (runners.length === 0) return;
    const goal = replay.rules.goal;
    const rounds = replay.rounds;

    replay.players.forEach((p, i) => {
      const runner = runners[i];
      if (!runner) return;
      let progress = 0;
      let risk = 0;
      if (round > 0) {
        for (let r = Math.min(round, rounds.length) - 1; r >= 0; r--) {
          const st = rounds[r]?.state_after?.find((s) => s.player_id === p.player_id);
          if (st) {
            progress = st.progress;
            risk = st.risk;
            break;
          }
        }
      }
      const frac = Math.min(1, progress / goal);
      runner.targetX = START_X + (GOAL_X - START_X) * frac;
      runner.targetRisk = risk;

      const prog = runner.label.querySelector(".rl-prog");
      const rk = runner.label.querySelector(".rl-risk");
      if (prog) prog.textContent = String(progress);
      if (rk) rk.textContent = String(risk);
      runner.label.dataset.risky = risk * replay.rules.risk_step >= 0.4 ? "true" : "false";
    });
  }, [round, replay]);

  return (
    <div className="arena3d">
      <div ref={mountRef} className="arena3d-canvas" />
      <div ref={overlayRef} className="arena3d-overlay" aria-hidden />
      <div className="arena3d-legend">
        <span>SALIDA</span>
        <span style={{ color: "var(--warn)" }}>META · {replay.rules.goal}</span>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
