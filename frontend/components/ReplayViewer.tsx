"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import dynamic from "next/dynamic";
import {
  OUTCOME_LABEL,
  outcomeSummary,
  labColor,
  type LiveRunEvent,
  type Replay,
} from "@/lib/types";
import { buildTimeline } from "@/lib/replay-timeline";
import { arenaReplay } from "@/lib/arena-identity";
import { describeLiveEvent, liveEventTitle } from "@/lib/live-narration";
import { ReplayResults } from "./ReplayResults";
import { ReplayTraces } from "./ReplayTraces";
import { robotGesture, GESTURE_LABEL } from "@/lib/robot-performance";

const Arena3D = dynamic(() => import("./Arena3D").then((m) => m.Arena3D), {
  ssr: false,
  loading: () => (
    <div className="council-loading">Preparando la arena 3D…</div>
  ),
});
const PHASE = {
  intro: "Inicio de la carrera",
  speech: "Decisión en curso",
  vote: "Decisión en curso",
  action: "Revelado simultáneo",
  integrity: "Validación de formato",
  resolution: "Balance de la ronda",
  outcome: "Resultado final",
};

export function ReplayViewer({
  replay: recordedReplay,
  live = false,
  completed = false,
  thinking = false,
  tracesAvailable = false,
  liveEvents = [],
}: {
  replay: Replay;
  live?: boolean;
  completed?: boolean;
  thinking?: boolean;
  tracesAvailable?: boolean;
  liveEvents?: LiveRunEvent[];
}) {
  const replay = useMemo(() => arenaReplay(recordedReplay), [recordedReplay]);
  const playerRef = useRef<HTMLDivElement>(null);
  const beats = useMemo(() => buildTimeline(replay, !live), [replay, live]);
  const phaseLabel = (kind: keyof typeof PHASE) => PHASE[kind];
  const [step, setStep] = useState(completed ? beats.length - 1 : 0);
  const [playing, setPlaying] = useState(false);
  const [overview, setOverview] = useState(false);
  const [speed, setSpeed] = useState(1);
  const currentStep = live ? beats.length - 1 : Math.min(step, beats.length - 1);
  const beat = beats[currentStep];
  const latestLiveEvent = liveEvents.at(-1);
  const displayRound = live ? latestLiveEvent?.detail.round ?? beat.round : beat.round;
  const activePlayerId = live
    ? latestLiveEvent?.detail.player_id
    : beat.playerId;
  const sceneBeat = live && thinking && activePlayerId
    ? { ...beat, playerId: activePlayerId }
    : beat;
  const resolved = !live && beat.kind === "outcome";
  const seat = replay.players.findIndex((p) => p.player_id === activePlayerId);
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
    const duration = (beat.kind === "intro" ? 3200 : beat.kind === "action" ? 4400 : 3600) / speed;
    const timer = setTimeout(
      () => setStep((s) => Math.min(s + 1, beats.length - 1)),
      duration,
    );
    return () => clearTimeout(timer);
  }, [playing, step, beats.length, beat.kind, speed]);
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
      <div
        ref={playerRef}
        className="council-player"
        tabIndex={0}
        onKeyDown={keyboard}
        aria-label={live ? "Partida en directo. Actualización automática." : "Reproductor de jugadas. Flechas para avanzar o retroceder y espacio para reproducir."}
        data-phase={live ? latestLiveEvent?.event_type ?? beat.kind : beat.kind}
        data-speaker={activePlayerId ?? "council"}
      >
        <div className="council-stage">
          <Arena3D replay={replay} beat={sceneBeat} overview={live || overview} thinking={thinking} />
          <div className="council-vignette" />
          <div className="council-topline">
            <div>
              <span className="council-live-dot" /> {live ? "EN DIRECTO" : "MOLOCH"}{" "}
              <span className="council-subtitle">/ V1</span>
            </div>
            <span>
              {displayRound
                ? `RONDA ${String(displayRound).padStart(2, "0")}`
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
              <span>UNA CARRERA, DECISIONES SIMULTÁNEAS</span>
              <h2>
                Cada modelo elige sin ver a los demás.
                <br />
                Después se revela la ronda.
              </h2>
              <p>{replay.players.length} participantes · horizonte incierto · premio para quienes lideren.</p>
            </div>
          )}
          {!live && beat.kind === "action" && (
            <div className="stage-panel stage-decisions" key={`decisions-${beat.round}`}>
              <span className="stage-kicker">Ronda {beat.round} · decisiones reveladas a la vez</span>
              <div className="stage-decision-grid">
                {replay.players.map((participant, i) => {
                  const action = beat.revealedActions[participant.player_id];
                  return <div key={participant.player_id} className="stage-decision" data-action={action?.action ?? "pending"} style={{ "--player-color": labColor(i) } as React.CSSProperties}>
                    <span>{participant.label}</span><strong>{action?.action ?? "Pendiente"}</strong>
                  </div>;
                })}
              </div>
            </div>
          )}
          {!live && beat.kind === "resolution" && (
            <div className="stage-panel stage-resolution" key={`resolution-${beat.round}`}>
              <span className="stage-kicker">Ronda {beat.round} · balance actualizado</span>
              <div className="stage-progress-grid">
                {replay.players.map((participant, i) => {
                  const state = beat.states.find((entry) => entry.player_id === participant.player_id);
                  const previous = replay.rounds.find((round) => round.index === beat.round - 1)?.state_after.find((entry) => entry.player_id === participant.player_id);
                  const gained = (state?.progress ?? 0) - (previous?.progress ?? 0);
                  return <div key={participant.player_id} className="stage-progress" style={{ "--player-color": labColor(i) } as React.CSSProperties}>
                    <span>{participant.label}</span><strong>{state?.progress.toFixed(1) ?? "0.0"}<small> +{gained.toFixed(1)}</small></strong>
                  </div>;
                })}
              </div>
            </div>
          )}
          {!live && resolved && (
            <div className="stage-panel stage-outcome" key="final-outcome">
              <span className="stage-kicker">Resultado · {replay.outcome.final_round} rondas</span>
              <h2>{OUTCOME_LABEL[replay.outcome.kind]}</h2>
              <p>{outcomeSummary(replay)}</p>
              <span>{replay.outcome.leader_labels?.length ? `Lideran: ${replay.outcome.leader_labels.join(", ")}` : "Sin líderes"}</span>
              <a href="#resultado-partida">Ver el resultado completo ↓</a>
            </div>
          )}
          <div className="council-cast" aria-label="Participantes">
            {replay.players.map((p, i) => (
              <span
                key={p.player_id}
                data-active={p.player_id === activePlayerId}
                style={{
                  borderColor:
                    p.player_id === activePlayerId ? labColor(i) : undefined,
                }}
              >
                <i style={{ background: labColor(i) }} />
                <strong>{p.model}</strong>
                <small>Participante {i + 1}</small>
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
              <span className="dialogue-phase">
                {live && latestLiveEvent
                  ? liveEventTitle(latestLiveEvent)
                  : phaseLabel(beat.kind)}
              </span>
              <h3>
                {player
                  ? player.model
                  : resolved
                    ? OUTCOME_LABEL[replay.outcome.kind]
                    : "La carrera"}
              </h3>
              {player && (
                <span className="dialogue-model">
                  Participante {seat + 1}
                </span>
              )}
            </div>
          </div>
          <div
            className="dialogue-content"
            aria-live="polite"
            aria-atomic="true"
            key={live ? latestLiveEvent?.seq ?? currentStep : currentStep}
          >
            <p className="dialogue-text">
              {live && latestLiveEvent
                ? describeLiveEvent(latestLiveEvent, replay)
                : resolved
                  ? "La partida ha terminado. Abre el resultado completo para revisar cada ronda y el pago final."
                : !live && beat.kind === "action"
                  ? "Todas las decisiones de esta ronda se muestran al mismo tiempo."
                : live && beat.kind === "intro"
                  ? "La carrera está preparada. Esperando las primeras decisiones selladas."
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
              {beat.action && (
                <>
                  <span
                    className={`tag tag-${beat.action.action === "SAFE" ? "safe" : "fast"}`}
                  >
                    Juega {beat.action.action}
                  </span>
                </>
              )}
              {live && latestLiveEvent?.event_type === "round_resolved" &&
                latestLiveEvent.detail.actions?.map((action) => {
                  const actionPlayer = replay.players.find(
                    (entry) => entry.player_id === action.player_id,
                  );
                  return (
                    <span
                      key={action.player_id}
                      className={`tag tag-${action.action === "SAFE" ? "safe" : "fast"}`}
                    >
                      {actionPlayer?.label ?? action.player_id} = {action.action}
                    </span>
                  );
                })}
              {resolved && (
                <>
                  <span className="tag">
                    UNSAFE {Math.round((replay.metrics.unsafe_rate ?? 0) * 100)}%
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
              resolved ? "Volver al inicio" : "Siguiente paso"
            }
            onClick={() => seek(resolved ? 0 : step + 1)}
          >
            {resolved ? "↻" : "→"}
          </button>}
        </div>
        {live && (
          <div className="council-controls" role="status">
            <span className="live-pulse" />{" "}
            {thinking
              ? `${player?.label ?? "Un modelo"} está decidiendo…`
              : latestLiveEvent?.event_type === "round_resolved"
                ? `Ronda ${latestLiveEvent.detail.round} confirmada`
                : "Esperando actualizaciones"}{" "}
            · Actualización automática
          </div>
        )}
        {!live && <div className="council-controls">
          <button className="btn btn-primary" onClick={toggle}>
            {playing ? "Ⅱ Pausa" : resolved ? "↻ Repetir desde el inicio" : "▶ Reproducir"}
          </button>
          <button
            className="btn"
            aria-label="Paso anterior"
            disabled={step === 0}
            onClick={() => seek(step - 1)}
          >
            ‹
          </button>
          <button
            className="btn"
            aria-label="Paso siguiente"
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
                  {p.model}
                </span>
                <strong>
                  {state?.progress ?? 0}
                  <small> progreso</small>
                </strong>
                <span className="balance-model">Participante {i + 1}</span>
                <span className="balance-public-vote">
                  {beat.revealedActions[p.player_id]
                    ? <>Decisión revelada: <b>{beat.revealedActions[p.player_id].action}</b></>
                    : "Decisión aún sellada"}
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
                          ((replay.realized_horizon ?? replay.outcome.final_round) * 1.5)) *
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
                      state?.risk ?? 0,
                    ) *
                      100,
                  )}
                  %
                </small>
                <small>Pago acumulado {state?.stage_payoff?.toFixed(2) ?? "0.00"}</small>
                {result && <strong>Pago {result.payoff.toFixed(0)}</strong>}
              </div>
            );
          })}
        </div>
      </div>
      <ReplayTraces gameId={replay.game_id} players={replay.players} round={beat.round} available={!live || completed || tracesAvailable} final={resolved || (live && tracesAvailable)} />
      {resolved && (
        <div id="resultado-partida" data-testid="replay-results" aria-label="Resultado completo de la partida">
          <ReplayResults replay={replay} />
          <div className="result-actions">
            <button className="btn" onClick={() => seek(0)}>Volver al inicio</button>
            <a className="btn btn-primary" href="/run">Preparar nueva partida</a>
          </div>
        </div>
      )}
      {live ? (
        <section className="live-turn-log" aria-label="Traza en directo de turnos">
          <header>
            <div>
              <p className="eyebrow">Traza en directo</p>
              <h3>Estado de cada ronda y decisión</h3>
            </div>
            <span>{liveEvents.length} eventos · último arriba</span>
          </header>
          <ol>
            {[...liveEvents].reverse().map((event) => (
              <li key={event.seq} data-event={event.event_type}>
                <span>{String(event.seq).padStart(2, "0")}</span>
                <div>
                  <strong>{liveEventTitle(event)}</strong>
                  <p>{describeLiveEvent(event, replay)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <details className="council-history">
          <summary>Historial de la partida · {currentStep} {currentStep === 1 ? "paso reproducido" : "pasos reproducidos"}</summary>
          <div>
            {beats.slice(1, currentStep + 1).map((b, i) => (
              <button key={i} onClick={() => seek(i + 1)}>
                <span>
                  R{b.round} · {phaseLabel(b.kind)}{" "}
                  {replay.players.find((p) => p.player_id === b.playerId)?.label}
                </span>
                <p>{b.text}</p>
              </button>
            ))}
          </div>
        </details>
      )}
      <details className="council-references">
        <summary>Dirección artística · referencias de la arena</summary>
        <p>
          Reparto y escenario de referencia. Cada participante está modelado en 3D.
        </p>
        <div>
          <img
            src="/art/council-reference.png"
            alt="Referencia visual de los robots de la arena V1"
            loading="lazy"
          />
          <img
            src="/art/character-reference.png"
            alt="Diseño de cinco robots de referencia"
            loading="lazy"
          />
        </div>
      </details>
    </div>
  );
}
