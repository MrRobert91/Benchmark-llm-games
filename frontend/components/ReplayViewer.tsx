"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import dynamic from "next/dynamic";
import { OUTCOME_LABEL, labColor, shortModel, type Replay } from "@/lib/types";
import { buildTimeline, CHARACTER_NAMES } from "@/lib/replay-timeline";
import { ReplayResults } from "./ReplayResults";
import { robotGesture, GESTURE_LABEL } from "@/lib/robot-performance";
import { pledgeVerdict } from "@/lib/integrity";

const Arena3D = dynamic(() => import("./Arena3D").then((m) => m.Arena3D), {
  ssr: false,
  loading: () => (
    <div className="council-loading">Preparando la arena 3D…</div>
  ),
});
const PHASE = {
  intro: "Apertura de la sesión",
  speech: "Compromiso público",
  vote: "Voto público",
  action: "Decisión privada · revelada",
  integrity: "¿Cumple su palabra?",
  resolution: "Balance de la ronda",
  outcome: "El desenlace",
};

export function ReplayViewer({ replay, live = false, completed = false, thinking = false }: { replay: Replay; live?: boolean; completed?: boolean; thinking?: boolean }) {
  const playerRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const beats = useMemo(() => buildTimeline(replay, !live), [replay, live]);
  const isPaper = replay.benchmark_version === "moloch-arena-v1-paper-2608.01193v1";
  const phaseLabel = (kind: keyof typeof PHASE) =>
    isPaper && kind === "intro"
      ? "Inicio de la carrera"
      : isPaper && kind === "action"
        ? "Revelado simultáneo"
        : isPaper && kind === "outcome"
          ? "Resultado terminal"
          : PHASE[kind];
  const [step, setStep] = useState(completed ? beats.length - 1 : 0);
  const [playing, setPlaying] = useState(false);
  const [overview, setOverview] = useState(false);
  const [speed, setSpeed] = useState(1);
  const currentStep = live ? beats.length - 1 : Math.min(step, beats.length - 1);
  const beat = beats[currentStep];
  const resolved = !live && beat.kind === "outcome";
  useEffect(() => {
    if (resolved) resultsRef.current?.focus();
  }, [resolved]);
  const seat = replay.players.findIndex((p) => p.player_id === beat.playerId);
  const player = replay.players[seat];
  const color = player ? labColor(seat) : "#d8b87f";
  useEffect(() => {
    setStep(completed ? Math.max(0, beats.length - 1) : 0);
    setPlaying(false);
  }, [replay.game_id, completed]);
  useEffect(() => {
    if (!playing) return;
    if (step >= beats.length - 1) {
      setPlaying(false);
      return;
    }
    const duration =
      Math.max(3500, beat.text.split(/\s+/).length * 280 + 1200) / speed;
    const timer = setTimeout(
      () => setStep((s) => Math.min(s + 1, beats.length - 1)),
      duration,
    );
    return () => clearTimeout(timer);
  }, [playing, step, beats.length, beat.text, speed]);
  const seek = (value: number) => {
    setPlaying(false);
    setStep(Math.max(0, Math.min(beats.length - 1, value)));
  };
  const toggle = () => {
    if (resolved) setStep(0);
    setPlaying((p) => !p);
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (live) return;
    if ((event.target as HTMLElement).closest("button,input,select,summary,a"))
      return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      seek(step + 1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      seek(step - 1);
    }
    if (event.key === " ") {
      event.preventDefault();
      toggle();
    }
    if (event.key === "Home") {
      event.preventDefault();
      seek(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      seek(beats.length - 1);
    }
  };
  return (
    <div className="viewer">
      {resolved && (
        <div data-testid="replay-results" ref={resultsRef} tabIndex={-1} aria-label="Resultados finales">
          {replay.rounds.at(-1)?.events.length ? (
            <ul className="events">
              {replay.rounds.at(-1)!.events.map((event, i) => (
                <li key={i}>{event}</li>
              ))}
            </ul>
          ) : null}
          <section className="card live-ending" role="status">
            <p className="eyebrow">Partida finalizada</p>
            <h2>{OUTCOME_LABEL[replay.outcome.kind]}</h2>
            <p>{replay.outcome.headline}</p>
            <p>
              Ronda final: {replay.outcome.final_round} ·{" "}
              {isPaper
                ? `Líderes: ${replay.outcome.leader_labels?.join(", ") ?? "sin datos"}`
                : replay.outcome.kind === "aligned_win"
                  ? `Ganador: ${replay.outcome.winner_label}`
                  : "Sin ganador"}
            </p>
            <button className="btn" onClick={() => seek(0)}>Reiniciar visualización</button>{" "}
            <a className="btn btn-primary" href="/run">Preparar nueva partida</a>
          </section>
          <ReplayResults replay={replay} />
        </div>
      )}

      <div
        ref={playerRef}
        className="council-player"
        tabIndex={0}
        onKeyDown={keyboard}
        aria-label={live ? "Partida en directo. Actualización automática." : "Reproductor de jugadas. Flechas para avanzar o retroceder y espacio para reproducir."}
        data-phase={beat.kind}
        data-speaker={beat.playerId ?? "council"}
      >
        <div className="council-stage">
          <Arena3D replay={replay} beat={beat} overview={live || overview} thinking={thinking} />
          <div className="council-vignette" />
          <div className="council-topline">
            <div>
              <span className="council-live-dot" /> {live ? "EN DIRECTO" : "MOLOCH"}{" "}
              <span className="council-subtitle">/ {isPaper ? "PAPER V1" : "THE COUNCIL"}</span>
            </div>
            <span>
              {beat.round
                ? `RONDA ${String(beat.round).padStart(2, "0")}`
                : "PRÓLOGO"}
            </span>
          </div>
          {!live && <button
            className="council-camera"
            onClick={() => setOverview((v) => !v)}
            aria-pressed={overview}
          >
            {overview ? "◎ Cámara narrativa" : "◉ Ver toda la mesa"}
          </button>}
          {!live && beat.kind === "intro" && (
            <div className="council-intro">
              <span>{isPaper ? "BENCHMARK DEL PAPER" : "EL PRECIO DE AVANZAR"}</span>
              <h2>
                {isPaper ? "Decisiones selladas." : "Una mesa."}
                <br />
                {isPaper ? "Un horizonte incierto." : "Ninguna salida fácil."}
              </h2>
              <p>{replay.players.length} laboratorios. Un futuro en juego.</p>
            </div>
          )}
          <div className="council-cast" aria-label="Participantes">
            {replay.players.map((p, i) => (
              <span
                key={p.player_id}
                data-active={p.player_id === beat.playerId}
                style={{
                  borderColor:
                    p.player_id === beat.playerId ? labColor(i) : undefined,
                }}
              >
                <i style={{ background: labColor(i) }} />
                {p.label}
                <small>{CHARACTER_NAMES[i % 5]}</small>
              </span>
            ))}
          </div>
        </div>
        <div className="council-dialogue" style={{ borderTopColor: color }}>
          <div className="dialogue-identity">
            <span className="dialogue-number" style={{ color }}>
              {player ? String(seat + 1).padStart(2, "0") : "M"}
            </span>
            <div>
              <span className="dialogue-phase">{phaseLabel(beat.kind)}</span>
              <h3>
                {player
                  ? player.label
                  : resolved
                    ? OUTCOME_LABEL[replay.outcome.kind]
                    : isPaper
                      ? "La carrera"
                      : "El consejo"}
              </h3>
              {player && (
                <span className="dialogue-model">
                  {CHARACTER_NAMES[seat % 5]} · {shortModel(player.model)}
                </span>
              )}
            </div>
          </div>
          <div
            className="dialogue-content"
            aria-live="polite"
            aria-atomic="true"
            key={currentStep}
          >
            <p className="dialogue-text">
              {live && beat.kind === "intro"
                ? isPaper
                  ? "La carrera está preparada. Esperando las primeras decisiones selladas."
                  : "El consejo está reunido. Esperando las primeras respuestas de los modelos."
                : live && beat.kind === "resolution"
                  ? isPaper
                    ? "Balance actualizado. Esperando la siguiente ronda."
                    : "Balance actualizado. Esperando la siguiente intervención."
                  : beat.kind === "speech"
                    ? `“${beat.text}”`
                    : beat.text}
            </p>
            <div className="dialogue-tags">
              {player && (
                <span className="tag gesture-tag">
                  {GESTURE_LABEL[thinking ? "thinking" : robotGesture(beat, player.player_id)]}
                </span>
              )}
              {beat.speech && beat.kind === "vote" && (
                <span
                  className={`tag tag-${beat.speech.pledge === "SAFE" ? "safe" : "fast"}`}
                >
                  Promete {beat.speech.pledge}
                </span>
              )}
              {beat.action && (
                <>
                  <span
                    className={`tag tag-${beat.action.action === "SAFE" ? "safe" : "fast"}`}
                  >
                    Juega {beat.action.action}
                  </span>
                  {beat.kind === "integrity" && (
                    <span
                      className={`tag ${
                        pledgeVerdict(beat.action.kept_pledge) === "kept"
                          ? "tag-safe"
                          : pledgeVerdict(beat.action.kept_pledge) === "broken"
                            ? "tag-warn"
                            : ""
                      }`}
                    >
                      {pledgeVerdict(beat.action.kept_pledge) === "kept"
                        ? "Palabra cumplida"
                        : pledgeVerdict(beat.action.kept_pledge) === "broken"
                          ? `Prometió ${beat.action.pledge} · palabra rota`
                          : "Respuesta ilegible · ronda sin puntuar"}
                    </span>
                  )}
                </>
              )}
              {resolved && (
                <>
                  <span className="tag">
                    {isPaper
                      ? `UNSAFE ${Math.round((replay.metrics.unsafe_rate ?? 0) * 100)}%`
                      : `Índice de Moloch ${replay.metrics.moloch_index.toFixed(3)}`}
                  </span>
                  <span className="tag">
                    Bienestar {replay.metrics.total_welfare.toFixed(0)}
                  </span>
                  {replay.outcome.disaster_probability !== undefined && (
                    <span className="tag">
                      Riesgo al cruzar{" "}
                      {Math.round(replay.outcome.disaster_probability * 100)}% ·
                      tirada {replay.outcome.roll?.toFixed(3)}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          {!live && <button
            className="dialogue-next"
            aria-label={
              resolved ? "Volver al inicio" : isPaper ? "Siguiente paso" : "Siguiente intervención"
            }
            onClick={() => seek(resolved ? 0 : step + 1)}
          >
            {resolved ? "↻" : "→"}
          </button>}
        </div>
        {live && <div className="council-controls" role="status"><span className="live-pulse" /> {thinking ? "Los modelos están pensando…" : "Esperando actualizaciones"} · Actualización automática</div>}
        {!live && <div className="council-controls">
          <button className="btn btn-primary" onClick={toggle}>
            {playing ? "Ⅱ Pausa" : resolved ? "↻ Repetir" : "▶ Reproducir"}
          </button>
          <button
            className="btn"
            aria-label={isPaper ? "Paso anterior" : "Intervención anterior"}
            disabled={step === 0}
            onClick={() => seek(step - 1)}
          >
            ‹
          </button>
          <button
            className="btn"
            aria-label={isPaper ? "Paso siguiente" : "Intervención siguiente"}
            disabled={resolved || step >= beats.length - 1}
            onClick={() => seek(step + 1)}
          >
            ›
          </button>
          <input
            type="range"
            className="scrubber"
            min={0}
            max={beats.length - 1}
            value={step}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Intervención"
            aria-valuetext={`${PHASE[beat.kind]}, ronda ${beat.round}, paso ${step + 1} de ${beats.length}`}
          />
          <span className="round-counter">
            {String(step + 1).padStart(2, "0")} / {beats.length}
          </span>
          <select
            aria-label="Velocidad de reproducción"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
          </select>
          <button
            className="btn"
            aria-label="Alternar pantalla completa"
            onClick={() => {
              const request = document.fullscreenElement
                ? document.exitFullscreen()
                : playerRef.current?.requestFullscreen?.();
              request?.catch(() => {
                playerRef.current?.focus();
              });
            }}
          >
            ⛶
          </button>
        </div>
        }
        <div className="council-balance" aria-label="Último balance revelado">
          {replay.players.map((p, i) => {
            const state = beat.states.find((s) => s.player_id === p.player_id);
            const result = resolved
              ? replay.metrics.players.find((m) => m.player_id === p.player_id)
              : undefined;
            return (
              <div key={p.player_id}>
                <span>
                  <i style={{ background: labColor(i) }} />
                  {p.label}
                </span>
                <strong>
                  {state?.progress ?? 0}
                  <small>{isPaper ? " progreso" : ` / ${replay.rules.goal}`}</small>
                </strong>
                <span className="balance-model">{p.model}</span>
                <span className="balance-public-vote">
                  {isPaper ? "Decisión sellada:" : "Voto público:"}{" "}
                  {!isPaper && <b>{beat.publicVotes[p.player_id] ?? "Pendiente"}</b>}
                  {beat.revealedActions[p.player_id] && (
                    <>
                      {" "}
                      · Juega <b>{beat.revealedActions[p.player_id].action}</b>
                    </>
                  )}
                  {beat.verdicts[p.player_id] !== undefined && (
                    <>
                      {" "}
                      · {beat.verdicts[p.player_id] ? "✓ Cumple" : "✕ Rompe"}
                    </>
                  )}
                </span>
                <div className="meter">
                  <span
                    style={{
                      width: `${Math.min(
                        100,
                        ((state?.progress ?? 0) /
                          (isPaper
                            ? (replay.realized_horizon ?? replay.outcome.final_round) * 1.5
                            : replay.rules.goal ?? 1)) *
                          100,
                      )}%`,
                      background: labColor(i),
                    }}
                  />
                </div>
                <small>
                  Riesgo{" "}
                  {Math.round(
                    Math.min(
                      1,
                      isPaper
                        ? state?.risk ?? 0
                        : (state?.risk ?? 0) * (replay.rules.risk_step ?? 0),
                    ) *
                      100,
                  )}
                  %
                </small>
                {isPaper && (
                  <small>Pago de etapa {state?.stage_payoff?.toFixed(2) ?? "0.00"}</small>
                )}
                {result && <strong>Pago {result.payoff.toFixed(0)}</strong>}
              </div>
            );
          })}
        </div>
      </div>
      <details className="council-history">
        <summary>{isPaper ? "Traza de la carrera" : "Acta de la sesión"} · {currentStep} pasos {live ? "recibidos" : "reproducidos"}</summary>
        <div>
          {beats.slice(1, currentStep + 1).map((b, i) => (
            <button key={i} disabled={live} onClick={() => seek(i + 1)}>
              <span>
                R{b.round} · {phaseLabel(b.kind)}{" "}
                {replay.players.find((p) => p.player_id === b.playerId)?.label}
              </span>
              <p>{b.text}</p>
            </button>
          ))}
        </div>
      </details>
      <details className="council-references">
        <summary>Dirección artística · referencias de la arena</summary>
        <p>
          Reparto y escenario de referencia. Cada participante está modelado en 3D.
        </p>
        <div>
          <img
            src="/art/council-reference.png"
            alt="Referencia visual de los robots cartoon en la mesa del consejo"
            loading="lazy"
          />
          <img
            src="/art/character-reference.png"
            alt="Diseño de Atlas, Forge, Vega, Aurum y Echo"
            loading="lazy"
          />
        </div>
      </details>
    </div>
  );
}
