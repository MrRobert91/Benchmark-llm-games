import { labColor, type Replay } from "@/lib/types";

export function ReplayResults({ replay }: { replay: Replay }) {
  const metrics = replay.metrics;
  const terminal = new Map(replay.outcome.terminal_results?.map((result) => [result.player_id, result]) ?? []);
  return <section style={{ marginTop: 44 }} data-benchmark-version={replay.benchmark_version}>
    <p className="eyebrow">Moloch Arena V1 · resultado reproducible</p>
    <div className="grid grid-3">
      <div className="card metric"><span className="metric-label">Acciones UNSAFE</span><span className="metric-value" style={{ color: "var(--fast)" }}>{Math.round((metrics.unsafe_rate ?? 0) * 100)}%</span><p className="metric-note">Sobre todas las decisiones de la carrera.</p></div>
      <div className="card metric"><span className="metric-label">Riesgo asignado</span><span className="metric-value" style={{ color: "var(--warn)" }}>{Math.round((replay.risk_treatment ?? 0) * 100)}%</span><p className="metric-note">Tratamiento máximo fijado antes de empezar.</p></div>
      <div className="card metric"><span className="metric-label">Admisión</span><span className="metric-value" style={{ fontSize: 20, color: metrics.contaminated ? "var(--warn)" : "var(--safe)" }}>{metrics.contaminated ? "Excluida" : "Admitida"}</span><p className="metric-note">{metrics.parse_failures ?? 0} fallos de formato · protocolo {replay.protocol_version}</p></div>
    </div>
    <div className="card scroll-x" style={{ padding: 0, marginTop: 14 }}><table><thead><tr><th style={{ paddingLeft: 22 }}>Laboratorio</th><th>Modelo</th><th className="num">Progreso</th><th className="num">UNSAFE</th><th className="num">Pago etapas</th><th className="num">Premio</th><th className="num">Riesgo privado</th><th className="num">Setback</th><th className="num" style={{ paddingRight: 22 }}>Pago final</th></tr></thead>
      <tbody>{metrics.players.map((player) => {
        const seat = replay.players.find((item) => item.player_id === player.player_id)?.seat ?? 0;
        const result = terminal.get(player.player_id);
        return <tr key={player.player_id}><td style={{ paddingLeft: 22 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}><span className="dot" style={{ color: labColor(seat) }} /><strong>{player.label}</strong></span></td><td><span className="model-chip">{player.model}</span></td><td className="num">{player.progress.toFixed(1)}</td><td className="num">{Math.round((player.unsafe_rate ?? player.fast_rate) * 100)}%</td><td className="num">{(player.stage_payoff ?? 0).toFixed(2)}</td><td className="num">{(result?.prize_share ?? 0).toFixed(2)}</td><td className="num">{Math.round((result?.risk_probability ?? player.risk) * 100)}%</td><td className="num" style={{ color: result?.setback ? "var(--fast)" : "var(--safe)" }}>{result?.is_leader ? (result.setback ? "Sí" : "No") : "No aplica"}</td><td className="num" style={{ paddingRight: 22 }}>{player.payoff.toFixed(2)}</td></tr>;
      })}</tbody></table></div>
    <p className="note" style={{ marginTop: 16 }}>Horizonte realizado: {replay.realized_horizon ?? replay.outcome.final_round} rondas. El premio de 100 se reparte entre todos los líderes; cada líder afronta un sorteo privado independiente y los jugadores rezagados conservan sus pagos de etapa.</p>
  </section>;
}
