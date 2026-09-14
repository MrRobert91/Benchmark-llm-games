import { labColor, type Replay } from "@/lib/types";
import { formatIntegrity, integrityBarWidth } from "@/lib/integrity";

export function ReplayResults({ replay }: { replay: Replay }) {
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
