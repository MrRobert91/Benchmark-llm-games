import { TradeoffChart } from "@/components/TradeoffChart";
import { getGames, getLeaderboard, getStats } from "@/lib/data";
import { shortModel } from "@/lib/types";
import {
  formatIntegrity,
  integrityBarWidth,
  integritySortKey,
} from "@/lib/integrity";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const [games, leaderboard] = await Promise.all([getGames(), getLeaderboard()]);
  const { models, paper_models: paperModels = [], backends, contributors = [] } = leaderboard;
  const stats = await getStats(games, leaderboard);

  // Un modelo con integridad desconocida no puede encabezar el ranking de alineamiento.
  const mostAligned = [...models].sort(
    (a, b) => integritySortKey(b.avg_integrity) - integritySortKey(a.avg_integrity),
  )[0];
  const bestPerformer = [...models].sort((a, b) => b.avg_payoff - a.avg_payoff)[0];

  return (
    <>
      <section style={{ marginTop: 44, marginBottom: 26 }}>
        <p className="eyebrow">Clasificación</p>
        <h1 style={{ fontSize: 34 }}>Leaderboard</h1>
        <p className="lede">
          Los resultados de Moloch Arena V1 se separan por versión, protocolo y riesgo. Las
          métricas legacy de promesas e integridad permanecen debajo y nunca se mezclan con
          el benchmark del paper.
        </p>
        <p className="note" style={{ marginTop: 14 }}>
          El ranking principal incluye únicamente partidas completadas con modelos de
          OpenRouter. Los agentes guionizados siguen disponibles como referencia.
        </p>
      </section>

      <section style={{ marginTop: 34 }}>
        <p className="eyebrow">Moloch Arena V1 · paper</p>
        <h2>Resultados por modelo y tratamiento de riesgo</h2>
        <div className="card scroll-x" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Modelo</th>
                <th className="num">Riesgo</th>
                <th className="num">Carreras</th>
                <th className="num">Trayectorias admitidas</th>
                <th className="num">UNSAFE</th>
                <th className="num">Pago medio</th>
                <th className="num" style={{ paddingRight: 22 }}>Contaminadas</th>
              </tr>
            </thead>
            <tbody>
              {paperModels.length ? paperModels.map((row) => (
                <tr key={`${row.model}-${row.risk_treatment}-${row.protocol_version}`}>
                  <td style={{ paddingLeft: 22 }}>
                    <strong>{shortModel(row.model)}</strong>
                    <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 2 }}>
                      {row.protocol_version}
                    </div>
                  </td>
                  <td className="num">{Math.round(row.risk_treatment * 100)}%</td>
                  <td className="num">{row.games}</td>
                  <td className="num">{row.admitted_trajectories}</td>
                  <td className="num">{row.avg_unsafe_rate === null ? "—" : `${Math.round(row.avg_unsafe_rate * 100)}%`}</td>
                  <td className="num">{row.avg_payoff === null ? "—" : row.avg_payoff.toFixed(2)}</td>
                  <td className="num" style={{ paddingRight: 22 }}>{row.contaminated_games}</td>
                </tr>
              )) : (
                <tr><td colSpan={7} style={{ padding: 22 }}>Todavía no hay carreras V1 guardadas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 16 }}>
          Solo las carreras con admisión válida contribuyen a UNSAFE y pago medio. Los
          fallos de parseo conservan su trazabilidad, pero excluyen la carrera completa.
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
                {formatIntegrity(mostAligned.avg_integrity)} de compromisos cumplidos en{" "}
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
                {formatIntegrity(bestPerformer.avg_integrity)} de integridad.
              </p>
            </div>
            <div className="card metric">
              <span className="metric-label">Índice de Moloch medio</span>
              <span className="metric-value" style={{ color: "var(--fast)" }}>
                {stats.avgMoloch.toFixed(3)}
              </span>
              <p className="metric-note">
                Sobre {stats.legacyTotal} partidas legacy. {stats.catastrophes} acabaron en
                catástrofe.
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
                            width: integrityBarWidth(m.avg_integrity),
                            background:
                              m.avg_integrity !== null && m.avg_integrity > 0.85
                                ? "var(--safe)"
                                : "var(--warn)",
                          }}
                        />
                      </div>
                      <span className="num" style={{ minWidth: 40 }}>
                        {formatIntegrity(m.avg_integrity)}
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

      {contributors.length > 0 && (
        <section>
          <p className="eyebrow">Créditos de ejecución</p>
          <h2>Personas colaboradoras</h2>
          <p style={{ maxWidth: "70ch" }}>
            Cada fila representa una aportación independiente, aunque el nick o la URL se
            repitan. No existen cuentas ni se intenta vincular identidades entre partidas.
          </p>
          <div className="card scroll-x" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ paddingLeft: 22 }}>Colaboración</th>
                  <th>Partida</th>
                  <th className="num">Modelos</th>
                  <th className="num">Índice de Moloch</th>
                  <th className="num" style={{ paddingRight: 22 }}>Integridad</th>
                </tr>
              </thead>
              <tbody>
                {contributors.map((contribution) => (
                  <tr key={contribution.game_id}>
                    <td style={{ paddingLeft: 22 }}>
                      <strong>
                        {contribution.url ? (
                          <a
                            className="link"
                            href={contribution.url}
                            target="_blank"
                            rel="nofollow noreferrer"
                          >
                            {contribution.nick} ↗
                          </a>
                        ) : contribution.nick}
                      </strong>
                      <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
                        {new Date(contribution.created_at).toLocaleDateString("es-ES")}
                      </div>
                    </td>
                    <td>
                      <a className="archive-game-id" href={`/arena/${contribution.game_id}`}>
                        {contribution.game_id}
                      </a>
                    </td>
                    <td className="num">{contribution.n_players}</td>
                    <td className="num">{contribution.moloch_index.toFixed(3)}</td>
                    <td className="num" style={{ paddingRight: 22 }}>
                      {formatIntegrity(contribution.mean_integrity)}
                    </td>
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
