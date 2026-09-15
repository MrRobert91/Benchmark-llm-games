import { labColor, type Replay } from "@/lib/types";
import { formatIntegrity, integrityBarWidth } from "@/lib/integrity";

export function ReplayResults({ replay }: { replay: Replay }) {
  if (replay.benchmark_version === "moloch-arena-v1-paper-2608.01193v1") {
    return <PaperReplayResults replay={replay} />;
  }
  const m = replay.metrics;
  return (
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
            El grupo se llevó {m.total_welfare.toFixed(0)} de un óptimo
            colectivo de {m.collective_optimum.toFixed(0)}.
          </p>
        </div>
        <div className="card metric">
          <span className="metric-label">Integridad media</span>
          <span
            className="metric-value"
            style={{
              color:
                m.mean_integrity === null
                  ? "var(--warn)"
                  : m.mean_integrity > 0.85
                    ? "var(--safe)"
                    : "var(--warn)",
            }}
          >
            {formatIntegrity(m.mean_integrity)}
          </span>
          <div className="meter" style={{ marginTop: 4 }}>
            <span
              style={{
                width: integrityBarWidth(m.mean_integrity),
                background:
                  m.mean_integrity !== null && m.mean_integrity > 0.85
                    ? "var(--safe)"
                    : "var(--warn)",
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
              <th className="num" style={{ paddingRight: 22 }}>
                Pago
              </th>
            </tr>
          </thead>
          <tbody>
            {m.players.map((p) => {
              const seat =
                replay.players.find((x) => x.player_id === p.player_id)?.seat ??
                0;
              return (
                <tr key={p.player_id}>
                  <td style={{ paddingLeft: 22 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 9,
                      }}
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
                    style={{
                      color:
                        p.integrity === null || p.integrity < 0.8
                          ? "var(--warn)"
                          : "var(--safe)",
                    }}
                    title={
                      p.integrity === null
                        ? "Ninguna ronda legible: integridad desconocida"
                        : `${p.pledges_kept} de ${p.pledges_scored ?? p.pledges_made} promesas puntuables`
                    }
                  >
                    {formatIntegrity(p.integrity)}
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
        Umbral de racionalidad de esta configuración: contenerse deja de ser la
        jugada individualmente óptima si el premio por ganar supera{" "}
        <strong style={{ color: "var(--text)" }}>
          {m.critical_prize.toFixed(1)}
        </strong>
        . Aquí el premio es {replay.rules.payoff_win}, así que correr es
        individualmente racional y aun así hunde al grupo. Ahí está la trampa.
      </p>
    </section>
  );
}

function PaperReplayResults({ replay }: { replay: Replay }) {
  const metrics = replay.metrics;
  const terminal = new Map(
    replay.outcome.terminal_results?.map((result) => [result.player_id, result]) ?? [],
  );
  return (
    <section style={{ marginTop: 44 }} data-benchmark-version={replay.benchmark_version}>
      <p className="eyebrow">Moloch Arena V1 · resultado del paper</p>
      <div className="grid grid-3">
        <div className="card metric">
          <span className="metric-label">Acciones UNSAFE</span>
          <span className="metric-value" style={{ color: "var(--fast)" }}>
            {Math.round((metrics.unsafe_rate ?? 0) * 100)}%
          </span>
          <p className="metric-note">Sobre todas las decisiones de la carrera.</p>
        </div>
        <div className="card metric">
          <span className="metric-label">Riesgo asignado</span>
          <span className="metric-value" style={{ color: "var(--warn)" }}>
            {Math.round((replay.risk_treatment ?? 0) * 100)}%
          </span>
          <p className="metric-note">Tratamiento máximo fijado antes de empezar.</p>
        </div>
        <div className="card metric">
          <span className="metric-label">Admisión</span>
          <span className="metric-value" style={{ fontSize: 20, color: metrics.contaminated ? "var(--warn)" : "var(--safe)" }}>
            {metrics.contaminated ? "Excluida" : "Admitida"}
          </span>
          <p className="metric-note">
            {metrics.parse_failures ?? 0} fallos de formato · protocolo {replay.protocol_version}
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
              <th className="num">UNSAFE</th>
              <th className="num">Pago etapas</th>
              <th className="num">Premio</th>
              <th className="num">Riesgo privado</th>
              <th className="num">Setback</th>
              <th className="num" style={{ paddingRight: 22 }}>Pago final</th>
            </tr>
          </thead>
          <tbody>
            {metrics.players.map((player) => {
              const seat = replay.players.find((item) => item.player_id === player.player_id)?.seat ?? 0;
              const result = terminal.get(player.player_id);
              return (
                <tr key={player.player_id}>
                  <td style={{ paddingLeft: 22 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                      <span className="dot" style={{ color: labColor(seat) }} />
                      <strong>{player.label}</strong>
                    </span>
                  </td>
                  <td><span className="model-chip">{player.model}</span></td>
                  <td className="num">{player.progress.toFixed(1)}</td>
                  <td className="num">{Math.round((player.unsafe_rate ?? player.fast_rate) * 100)}%</td>
                  <td className="num">{(player.stage_payoff ?? 0).toFixed(2)}</td>
                  <td className="num">{(result?.prize_share ?? 0).toFixed(2)}</td>
                  <td className="num">{Math.round((result?.risk_probability ?? player.risk) * 100)}%</td>
                  <td className="num" style={{ color: result?.setback ? "var(--fast)" : "var(--safe)" }}>
                    {result?.is_leader ? (result.setback ? "Sí" : "No") : "No aplica"}
                  </td>
                  <td className="num" style={{ paddingRight: 22 }}>{player.payoff.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note" style={{ marginTop: 16 }}>
        Horizonte realizado: {replay.realized_horizon ?? replay.outcome.final_round} rondas.
        El premio de 100 se reparte entre todos los líderes; cada líder afronta un sorteo
        privado independiente y los jugadores rezagados conservan sus pagos de etapa.
      </p>
    </section>
  );
}
