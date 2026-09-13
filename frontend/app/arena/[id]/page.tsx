import Link from "next/link";
import { notFound } from "next/navigation";

import { ReplayViewer } from "@/components/ReplayViewer";
import { getGames, getReplay } from "@/lib/data";
import { OUTCOME_LABEL, labColor } from "@/lib/types";

export function generateStaticParams() {
  return getGames().map((g) => ({ id: g.game_id }));
}

export default async function ArenaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const replay = getReplay(id);
  if (!replay) notFound();

  const m = replay.metrics;
  const scripted = replay.backend === "scripted";

  return (
    <>
      <section style={{ marginTop: 34, marginBottom: 22 }}>
        <Link href="/arena" className="link" style={{ fontSize: 13, color: "var(--text-dim)" }}>
          ← Todas las partidas
        </Link>
        <div className="game-head">
          <div>
            <h1 style={{ fontSize: 28, marginBottom: 8, marginTop: 12 }}>
              {replay.outcome.headline}
            </h1>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span
                className={`tag ${
                  replay.outcome.kind === "catastrophe"
                    ? "tag-fast"
                    : replay.outcome.kind === "restraint"
                      ? "tag-safe"
                      : "tag-warn"
                }`}
              >
                {OUTCOME_LABEL[replay.outcome.kind]}
              </span>
              <span className="tag">{replay.players.length} laboratorios</span>
              <span className="tag">{replay.rounds.length} rondas</span>
              <span className="tag">semilla {replay.seed}</span>
              <span className="tag">
                {scripted ? "agentes guionizados" : `modelos reales · ${replay.backend}`}
              </span>
            </div>
          </div>
        </div>
      </section>

      {scripted && (
        <p className="note" style={{ marginBottom: 22 }}>
          Esta partida la jugaron los agentes guionizados de referencia: las cuatro
          estrategias del modelo evolutivo reducido de <em>Falling Behind</em>. No son
          modelos de lenguaje, y su diálogo se genera a partir del estado de la partida. Para
          jugar con modelos reales por OpenRouter, ver el README.
        </p>
      )}

      <ReplayViewer replay={replay} />

      <section style={{ marginTop: 44 }}>
        <p className="eyebrow">Resultado medido</p>
        <div className="grid grid-2">
          <div className="card metric">
            <span className="metric-label">Índice de Moloch</span>
            <span
              className="metric-value"
              style={{
                color:
                  m.moloch_index > 0.66
                    ? "var(--fast)"
                    : m.moloch_index > 0.25
                      ? "var(--warn)"
                      : "var(--safe)",
              }}
            >
              {m.moloch_index.toFixed(3)}
            </span>
            <div className="meter" style={{ marginTop: 4 }}>
              <span
                style={{
                  width: `${Math.min(100, Math.max(0, m.moloch_index * 100))}%`,
                  background:
                    m.moloch_index > 0.66
                      ? "var(--fast)"
                      : m.moloch_index > 0.25
                        ? "var(--warn)"
                        : "var(--safe)",
                }}
              />
            </div>
            <p className="metric-note">
              El grupo se llevó {m.total_welfare.toFixed(0)} de un óptimo colectivo de{" "}
              {m.collective_optimum.toFixed(0)}.
            </p>
          </div>
          <div className="card metric">
            <span className="metric-label">Integridad media</span>
            <span
              className="metric-value"
              style={{ color: m.mean_integrity > 0.85 ? "var(--safe)" : "var(--warn)" }}
            >
              {Math.round(m.mean_integrity * 100)}%
            </span>
            <div className="meter" style={{ marginTop: 4 }}>
              <span
                style={{
                  width: `${m.mean_integrity * 100}%`,
                  background: m.mean_integrity > 0.85 ? "var(--safe)" : "var(--warn)",
                }}
              />
            </div>
            <p className="metric-note">
              Compromisos públicos cumplidos sobre el total emitido en la mesa.
            </p>
          </div>
        </div>

        <div className="card scroll-x" style={{ padding: 0, marginTop: 14 }}>
          <table>
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Laboratorio</th>
                <th>Modelo</th>
                <th className="num">Progreso</th>
                <th className="num">Riesgo</th>
                <th className="num">Rápidas</th>
                <th className="num">Integridad</th>
                <th className="num" style={{ paddingRight: 22 }}>Pago</th>
              </tr>
            </thead>
            <tbody>
              {m.players.map((p) => {
                const seat = replay.players.find(
                  (x) => x.player_id === p.player_id,
                )?.seat ?? 0;
                return (
                  <tr key={p.player_id}>
                    <td style={{ paddingLeft: 22 }}>
                      <span
                        style={{ display: "inline-flex", alignItems: "center", gap: 9 }}
                      >
                        <span className="dot" style={{ color: labColor(seat) }} />
                        <strong>{p.label}</strong>
                      </span>
                    </td>
                    <td>
                      <span className="model-chip">{p.model}</span>
                    </td>
                    <td className="num">
                      {p.progress}/{replay.rules.goal}
                    </td>
                    <td className="num">{p.risk}</td>
                    <td className="num">{Math.round(p.fast_rate * 100)}%</td>
                    <td
                      className="num"
                      style={{ color: p.integrity < 0.8 ? "var(--warn)" : "var(--safe)" }}
                    >
                      {Math.round(p.integrity * 100)}%
                    </td>
                    <td className="num" style={{ paddingRight: 22 }}>
                      {p.payoff.toFixed(0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="note" style={{ marginTop: 16 }}>
          Umbral de racionalidad de esta configuración: contenerse deja de ser la jugada
          individualmente óptima si el premio por ganar supera{" "}
          <strong style={{ color: "var(--text)" }}>{m.critical_prize.toFixed(1)}</strong>.
          Aquí el premio es {replay.rules.payoff_win}, así que correr es individualmente
          racional y aun así hunde al grupo. Ahí está la trampa.
        </p>
      </section>
    </>
  );
}
