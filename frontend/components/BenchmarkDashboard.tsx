"use client";

import { useEffect, useMemo, useState } from "react";
import type { LeaderboardData } from "@/lib/data";
import { shortModel } from "@/lib/types";

const RISK_COLOR: Record<string, string> = {
  "0.1": "var(--safe)", "0.6": "var(--warn)", "0.9": "var(--fast)",
};

function percent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function AverageBar({ value, color }: { value: number | null; color: string }) {
  return <div className="benchmark-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(1, value ?? 0)) * 100}%`, background: color }} /></div>;
}

export function BenchmarkDashboard({ initialData }: { initialData: LeaderboardData }) {
  const [data, setData] = useState(initialData);
  const [refreshState, setRefreshState] = useState<"live" | "stale">("live");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/leaderboard", { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const next = (await response.json()) as LeaderboardData;
        if (active) { setData(next); setRefreshState("live"); }
      } catch { if (active) setRefreshState("stale"); }
    };
    const timer = window.setInterval(refresh, 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const models = useMemo(
    () => [...data.paper_models].sort((a, b) => a.model.localeCompare(b.model) || a.n_players - b.n_players || a.risk_treatment - b.risk_treatment),
    [data.paper_models],
  );
  const summary = data.summary;

  return <>
    <div className="benchmark-live" role="status" aria-live="polite">
      <span className={refreshState === "live" ? "live-pulse" : ""} />
      {refreshState === "live" ? "Datos SQLite · actualización automática cada 5 segundos" : "Mostrando el último dato confirmado; reintentando conexión"}
    </div>
    <div className="grid grid-3" style={{ marginBottom: 28 }}>
      <div className="card metric"><span className="metric-label">Carreras V1 admitidas</span><span className="metric-value">{summary.admitted_games}/{summary.games}</span><p className="metric-note">{summary.trajectories} trayectorias guardadas.</p></div>
      <div className="card metric"><span className="metric-label">Tasa UNSAFE</span><span className="metric-value" style={{ color: "var(--fast)" }}>{percent(summary.avg_unsafe_rate)}</span><p className="metric-note">Solo decisiones de carreras admitidas.</p></div>
      <div className="card metric"><span className="metric-label">Pago medio</span><span className="metric-value" style={{ color: "var(--accent)" }}>{summary.avg_payoff?.toFixed(2) ?? "—"}</span><p className="metric-note">{summary.requested_models} modelos solicitados.</p></div>
    </div>

    <section>
      <p className="eyebrow">Todos los modelos</p><h2>Conducta por celda comparable</h2>
      <p style={{ maxWidth: "74ch" }}>Cada barra es el promedio del mismo modelo con idéntico protocolo, riesgo y número de jugadores. Una nueva ejecución comparable actualiza esa media; nunca se mezclan tratamientos distintos.</p>
      <div className="card benchmark-chart" aria-label="Tasa UNSAFE por modelo y celda comparable">
        {models.length ? models.map((row) => {
          const color = RISK_COLOR[String(row.risk_treatment)] ?? "var(--accent)";
          return <div className="benchmark-chart-row" key={`${row.model}-${row.protocol_version}-${row.n_players}-${row.risk_treatment}`}>
            <div><strong>{shortModel(row.model)}</strong><small>{row.n_players}P · riesgo {Math.round(row.risk_treatment * 100)}% · {row.games} carreras</small></div>
            <AverageBar value={row.avg_unsafe_rate} color={color} /><b>{percent(row.avg_unsafe_rate)}</b>
          </div>;
        }) : <p>Todavía no hay carreras V1 guardadas.</p>}
      </div>
      <div className="benchmark-legend" aria-label="Leyenda de riesgo"><span><i style={{ background: RISK_COLOR["0.1"] }} />10%</span><span><i style={{ background: RISK_COLOR["0.6"] }} />60%</span><span><i style={{ background: RISK_COLOR["0.9"] }} />90%</span></div>
    </section>

    <section><h2>Resultados por modelo</h2><div className="card scroll-x" style={{ padding: 0 }}><table>
      <thead><tr><th style={{ paddingLeft: 22 }}>Modelo / celda</th><th className="num">Carreras</th><th className="num">Trayectorias</th><th className="num">UNSAFE</th><th className="num">Pago</th><th className="num">Lidera</th><th className="num">Setback</th><th className="num" style={{ paddingRight: 22 }}>Excluidas</th></tr></thead>
      <tbody>{models.map((row) => <tr key={`table-${row.model}-${row.protocol_version}-${row.n_players}-${row.risk_treatment}`}>
        <td style={{ paddingLeft: 22 }}><strong>{shortModel(row.model)}</strong><small style={{ display: "block" }}>{row.n_players}P · riesgo {Math.round(row.risk_treatment * 100)}% · {row.protocol_version}</small></td>
        <td className="num">{row.games}</td><td className="num">{row.admitted_trajectories}/{row.trajectories}</td><td className="num">{percent(row.avg_unsafe_rate)}</td><td className="num">{row.avg_payoff?.toFixed(2) ?? "—"}</td><td className="num">{percent(row.leader_rate)}</td><td className="num">{percent(row.setback_rate)}</td><td className="num" style={{ paddingRight: 22 }}>{row.contaminated_games}</td>
      </tr>)}</tbody>
    </table></div></section>

    <section><p className="eyebrow">Ruta real</p><h2>Resultados por backend servido</h2>
      <p style={{ maxWidth: "72ch" }}>OpenRouter puede enrutar una trayectoria por varios proveedores. Cada fila muestra las trayectorias en las que participó ese proveedor, con sus llamadas y coste exactos; una ruta mixta aparece en todas las filas correspondientes.</p>
      <div className="card scroll-x" style={{ padding: 0 }}><table><thead><tr><th style={{ paddingLeft: 22 }}>Proveedor / celda</th><th>Motor</th><th className="num">Carreras</th><th className="num">Trayectorias</th><th className="num">UNSAFE</th><th className="num">Pago</th><th className="num">Llamadas</th><th className="num" style={{ paddingRight: 22 }}>Coste</th></tr></thead>
      <tbody>{data.paper_backends.map((row) => <tr key={`${row.provider}-${row.backend}-${row.protocol_version}-${row.n_players}-${row.risk_treatment}`}><td style={{ paddingLeft: 22 }}><strong>{row.provider}</strong><small style={{ display: "block" }}>{row.n_players}P · riesgo {Math.round(row.risk_treatment * 100)}% · {row.served_models} modelos servidos</small></td><td>{row.backend}</td><td className="num">{row.games}</td><td className="num">{row.admitted_trajectories}/{row.trajectories}</td><td className="num">{percent(row.avg_unsafe_rate)}</td><td className="num">{row.avg_payoff?.toFixed(2) ?? "—"}</td><td className="num">{row.calls}</td><td className="num" style={{ paddingRight: 22 }}>${row.cost_usd.toFixed(4)}</td></tr>)}</tbody></table></div>
    </section>

    {data.contributors.length > 0 && <section><p className="eyebrow">Ejecuciones web</p><h2>Aportaciones recientes</h2><div className="card scroll-x" style={{ padding: 0 }}><table><thead><tr><th style={{ paddingLeft: 22 }}>Aportación</th><th>Partida</th><th className="num">Riesgo</th><th className="num">UNSAFE</th><th className="num" style={{ paddingRight: 22 }}>Pago medio</th></tr></thead>
      <tbody>{data.contributors.map((row) => <tr key={row.game_id}><td style={{ paddingLeft: 22 }}><strong>{row.url ? <a className="link" href={row.url} target="_blank" rel="nofollow noreferrer">{row.nick} ↗</a> : row.nick}</strong></td><td><a className="archive-game-id" href={`/arena/${row.game_id}`}>{row.game_id}</a></td><td className="num">{Math.round(row.risk_treatment * 100)}%</td><td className="num">{percent(row.unsafe_rate)}</td><td className="num" style={{ paddingRight: 22 }}>{row.mean_payoff.toFixed(2)}</td></tr>)}</tbody>
    </table></div></section>}
  </>;
}
