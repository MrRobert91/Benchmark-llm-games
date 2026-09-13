import { TradeoffChart } from "@/components/TradeoffChart";
import { getLeaderboard, getStats } from "@/lib/data";
import { shortModel } from "@/lib/types";

export default function LeaderboardPage() {
  const { models, backends } = getLeaderboard();
  const stats = getStats();

  const mostAligned = [...models].sort((a, b) => b.avg_integrity - a.avg_integrity)[0];
  const bestPerformer = [...models].sort((a, b) => b.avg_payoff - a.avg_payoff)[0];

  return (
    <>
      <section style={{ marginTop: 44, marginBottom: 26 }}>
        <p className="eyebrow">Clasificación</p>
        <h1 style={{ fontSize: 34 }}>Leaderboard</h1>
        <p className="lede">
          Dos ejes, porque una sola cifra no distingue a un agente que coopera de uno que
          simplemente es predecible. El rendimiento dice cuánto se lleva. La integridad dice
          cuánto de lo que prometió cumplió.
        </p>
      </section>

      {models.length > 0 && (
        <>
          <div className="grid grid-3" style={{ marginBottom: 20 }}>
            <div className="card metric">
              <span className="metric-label">Más alineado</span>
              <span className="metric-value" style={{ fontSize: 21, color: "var(--safe)" }}>
                {shortModel(mostAligned.model)}
              </span>
              <p className="metric-note">
                {Math.round(mostAligned.avg_integrity * 100)}% de compromisos cumplidos en{" "}
                {mostAligned.games} partidas.
              </p>
            </div>
            <div className="card metric">
              <span className="metric-label">Mejor rendimiento</span>
              <span className="metric-value" style={{ fontSize: 21, color: "var(--accent)" }}>
                {shortModel(bestPerformer.model)}
              </span>
              <p className="metric-note">
                {bestPerformer.avg_payoff.toFixed(1)} de pago medio, con{" "}
                {Math.round(bestPerformer.avg_integrity * 100)}% de integridad.
              </p>
            </div>
            <div className="card metric">
              <span className="metric-label">Índice de Moloch medio</span>
              <span className="metric-value" style={{ color: "var(--fast)" }}>
                {stats.avgMoloch.toFixed(3)}
              </span>
              <p className="metric-note">
                Sobre {stats.total} partidas. {stats.catastrophes} acabaron en catástrofe.
              </p>
            </div>
          </div>

          <TradeoffChart rows={models} />
        </>
      )}

      <section style={{ marginTop: 34 }}>
        <h2>Por modelo</h2>
        <div className="card scroll-x" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Modelo</th>
                <th className="num">Partidas</th>
                <th className="num">Pago medio</th>
                <th className="num">Rondas rápidas</th>
                <th className="num">Riesgo medio</th>
                <th style={{ paddingRight: 22, textAlign: "right" }}>Integridad</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.model}>
                  <td style={{ paddingLeft: 22 }}>
                    <strong>{shortModel(m.model)}</strong>
                    <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 2 }}>
                      {m.model}
                    </div>
                  </td>
                  <td className="num">{m.games}</td>
                  <td className="num">{m.avg_payoff.toFixed(1)}</td>
                  <td className="num">{Math.round(m.avg_fast_rate * 100)}%</td>
                  <td className="num">{m.avg_risk.toFixed(1)}</td>
                  <td style={{ paddingRight: 22 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        justifyContent: "flex-end",
                      }}
                    >
                      <div className="meter" style={{ width: 84 }}>
                        <span
                          style={{
                            width: `${m.avg_integrity * 100}%`,
                            background:
                              m.avg_integrity > 0.85 ? "var(--safe)" : "var(--warn)",
                          }}
                        />
                      </div>
                      <span className="num" style={{ minWidth: 40 }}>
                        {Math.round(m.avg_integrity * 100)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 16 }}>
          Correr sin frenos no paga. El agente que acelera en el 100 % de las rondas tiene el
          peor pago medio de la tabla: llega antes y se lleva por delante su propio premio.
          Esa es la lección de la trampa, medida en vez de argumentada.
        </p>
      </section>

      {backends.length > 0 && (
        <section>
          <h2>Por backend</h2>
          <div className="card scroll-x" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ paddingLeft: 22 }}>Backend</th>
                  <th className="num">Partidas</th>
                  <th className="num">Índice de Moloch</th>
                  <th className="num">Catástrofes</th>
                  <th className="num">Contenciones</th>
                  <th className="num" style={{ paddingRight: 22 }}>Victorias limpias</th>
                </tr>
              </thead>
              <tbody>
                {backends.map((b) => (
                  <tr key={b.backend}>
                    <td style={{ paddingLeft: 22 }}>
                      <strong>{b.backend}</strong>
                      {b.backend === "scripted" && (
                        <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 2 }}>
                          agentes de referencia, no modelos de lenguaje
                        </div>
                      )}
                    </td>
                    <td className="num">{b.games}</td>
                    <td className="num">{b.avg_moloch.toFixed(3)}</td>
                    <td className="num" style={{ color: "var(--fast)" }}>{b.catastrophes}</td>
                    <td className="num" style={{ color: "var(--safe)" }}>{b.restraints}</td>
                    <td className="num" style={{ paddingRight: 22 }}>{b.aligned_wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
