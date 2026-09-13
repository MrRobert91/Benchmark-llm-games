"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Arena3D } from "./Arena3D";
import { OUTCOME_LABEL, labColor, type Replay } from "@/lib/types";

const STEP_MS = 2600;

export function ReplayViewer({ replay }: { replay: Replay }) {
  const total = replay.rounds.length;
  const [round, setRound] = useState(0);
  const [playing, setPlaying] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const seatOf = useMemo(() => {
    const m = new Map<string, number>();
    replay.players.forEach((p, i) => m.set(p.player_id, i));
    return m;
  }, [replay]);

  const labelOf = useMemo(() => {
    const m = new Map<string, string>();
    replay.players.forEach((p) => m.set(p.player_id, p.label));
    return m;
  }, [replay]);

  // reproducción automática
  useEffect(() => {
    if (!playing) return;
    if (round >= total) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setRound((r) => Math.min(total, r + 1)), STEP_MS);
    return () => clearTimeout(id);
  }, [playing, round, total]);

  // el panel sigue a la ronda visible
  useEffect(() => {
    const el = transcriptRef.current?.querySelector(`[data-round="${round}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [round]);

  const toggle = useCallback(() => {
    if (round >= total) setRound(0);
    setPlaying((p) => !p);
  }, [round, total]);

  const resolved = round >= total;
  const current = round > 0 ? replay.rounds[Math.min(round, total) - 1] : null;
  const states = current?.state_after ?? [];

  return (
    <div className="viewer">
      <Arena3D replay={replay} round={round} resolved={resolved} />

      {/* ------------------------------------------------------ controles */}
      <div className="controls">
        <button className="btn btn-primary" onClick={toggle}>
          {playing ? "❚❚ Pausa" : round >= total ? "↻ Repetir" : "▶ Reproducir"}
        </button>
        <button
          className="btn"
          onClick={() => {
            setPlaying(false);
            setRound((r) => Math.max(0, r - 1));
          }}
          disabled={round === 0}
        >
          ‹
        </button>
        <button
          className="btn"
          onClick={() => {
            setPlaying(false);
            setRound((r) => Math.min(total, r + 1));
          }}
          disabled={round >= total}
        >
          ›
        </button>
        <input
          type="range"
          min={0}
          max={total}
          value={round}
          onChange={(e) => {
            setPlaying(false);
            setRound(Number(e.target.value));
          }}
          className="scrubber"
          aria-label="Ronda"
        />
        <span className="round-counter">
          {round === 0 ? "Salida" : `Ronda ${round}`}
          <span style={{ color: "var(--text-faint)" }}> / {total}</span>
        </span>
      </div>

      {/* ------------------------------------------------- marcador en vivo */}
      <div className="standings">
        {replay.players.map((p, i) => {
          const st = states.find((s) => s.player_id === p.player_id);
          const progress = st?.progress ?? 0;
          const risk = st?.risk ?? 0;
          const pDisaster = Math.min(1, risk * replay.rules.risk_step);
          return (
            <div className="standing" key={p.player_id}>
              <div className="standing-head">
                <span className="dot" style={{ color: labColor(i) }} />
                <strong>{p.label}</strong>
                <span className="model-chip">{p.model}</span>
              </div>
              <div className="standing-bars">
                <div>
                  <div className="bar-label">
                    <span>Progreso</span>
                    <span className="num">
                      {progress}/{replay.rules.goal}
                    </span>
                  </div>
                  <div className="meter">
                    <span
                      style={{
                        width: `${Math.min(100, (progress / replay.rules.goal) * 100)}%`,
                        background: labColor(i),
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="bar-label">
                    <span>Riesgo de desalineamiento</span>
                    <span
                      className="num"
                      style={{ color: pDisaster >= 0.4 ? "var(--fast)" : undefined }}
                    >
                      {Math.round(pDisaster * 100)}%
                    </span>
                  </div>
                  <div className="meter">
                    <span
                      style={{ width: `${pDisaster * 100}%`, background: "var(--fast)" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ------------------------------------------------------ transcripción */}
      <div className="transcript" ref={transcriptRef}>
        <div className="transcript-head">
          <h3 style={{ margin: 0 }}>Transcripción</h3>
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
            Lo que dijeron en público, y lo que hicieron en privado
          </span>
        </div>

        {replay.rounds.map((r, idx) => {
          const visible = idx < round;
          return (
            <div
              key={r.index}
              data-round={idx + 1}
              className="round-block"
              data-visible={visible}
              data-current={idx + 1 === round}
            >
              <div className="round-title">
                <span>Ronda {r.index}</span>
                <span className="round-rule" />
              </div>

              {!visible ? (
                <p className="round-hidden">Aún no reproducida</p>
              ) : (
                <>
                  {r.meeting.map((s) => {
                    const seat = seatOf.get(s.player_id) ?? 0;
                    const act = r.actions.find((a) => a.player_id === s.player_id);
                    return (
                      <div className="speech" key={s.player_id}>
                        <div className="speech-head">
                          <span className="dot" style={{ color: labColor(seat) }} />
                          <strong>{labelOf.get(s.player_id)}</strong>
                          <span
                            className={`tag ${s.pledge === "SAFE" ? "tag-safe" : "tag-fast"}`}
                          >
                            promete {s.pledge}
                          </span>
                          {act && (
                            <span
                              className={`tag ${act.action === "SAFE" ? "tag-safe" : "tag-fast"}`}
                            >
                              juega {act.action}
                            </span>
                          )}
                          {act && !act.kept_pledge && (
                            <span className="tag tag-warn">palabra rota</span>
                          )}
                        </div>
                        <p className="speech-text">{s.text}</p>
                      </div>
                    );
                  })}
                  {r.events.length > 0 && (
                    <ul className="events">
                      {r.events.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          );
        })}

        <div className="round-block" data-visible={resolved} data-current={resolved}>
          <div className="round-title">
            <span>Desenlace</span>
            <span className="round-rule" />
          </div>
          {resolved ? (
            <div className={`outcome outcome-${replay.outcome.kind}`}>
              <span className="outcome-kind">{OUTCOME_LABEL[replay.outcome.kind]}</span>
              <p style={{ margin: "6px 0 0", color: "var(--text)" }}>
                {replay.outcome.headline}
              </p>
              {replay.outcome.disaster_probability !== undefined && (
                <p style={{ margin: "8px 0 0", fontSize: 12.5 }}>
                  Probabilidad de desalineamiento al cruzar:{" "}
                  {Math.round(replay.outcome.disaster_probability * 100)}% · tirada{" "}
                  {replay.outcome.roll?.toFixed(3)}
                </p>
              )}
            </div>
          ) : (
            <p className="round-hidden">Reproduce hasta el final</p>
          )}
        </div>
      </div>
    </div>
  );
}
