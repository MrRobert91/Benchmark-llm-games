import { labColor, type Replay } from "@/lib/types";

const PARSE_REASON_LABELS: Record<string, string> = {
  empty_content: "respuesta vacía",
  no_json_object: "sin objeto JSON",
  invalid_json: "JSON incompleto o inválido",
  missing_field: "falta el campo action",
  ambiguous_value: "acción ambigua",
  unknown_value: "acción desconocida",
};

export function ReplayResults({ replay }: { replay: Replay }) {
  const metrics = replay.metrics;
  const terminal = new Map(replay.outcome.terminal_results?.map((result) => [result.player_id, result]) ?? []);
  const incidents = replay.parse_incidents ?? [];
  const affectedPlayers = new Set(incidents.map((incident) => incident.player_id));
  const incidentGroups = [...incidents.reduce((groups, incident) => {
    const key = `${incident.player_id}:${incident.model}`;
    const current = groups.get(key) ?? { playerId: incident.player_id, model: incident.model, rounds: new Set<number>(), reasons: new Set<string>() };
    const phaseRound = Number(/paper_round_(\d+)/.exec(incident.phase)?.[1]);
    const round = incident.round ?? (Number.isFinite(phaseRound) ? phaseRound : undefined);
    if (round !== undefined) current.rounds.add(round);
    const reason = PARSE_REASON_LABELS[incident.reason] ?? incident.reason;
    current.reasons.add(incident.finish_reason === "length" ? `${reason} (salida truncada)` : reason);
    groups.set(key, current);
    return groups;
  }, new Map<string, { playerId: string; model: string; rounds: Set<number>; reasons: Set<string> }>()).values()];
  const unaffected = replay.players.filter((player) => !affectedPlayers.has(player.player_id));
  return <section style={{ marginTop: 44 }} data-benchmark-version={replay.benchmark_version}>
    <p className="eyebrow">Resultado completo · {replay.outcome.final_round} rondas</p>
    <h2>De cada decisión al pago final</h2>
    <p className="result-intro">Las decisiones se revelaron juntas al cerrar cada ronda. El progreso y el riesgo se actualizaron después. El premio y los sorteos de riesgo se aplicaron al terminar.</p>
    <div className="result-journey" aria-label="Resumen de la carrera por rondas">
      {replay.rounds.filter((round) => round.actions.length && round.state_after.length).map((round) => <article className="result-round" key={round.index}>
        <span className="result-round-index">Ronda {String(round.index).padStart(2, "0")}</span>
        <div className="result-round-players">
          {replay.players.map((player, i) => {
            const action = round.actions.find((entry) => entry.player_id === player.player_id);
            const state = round.state_after.find((entry) => entry.player_id === player.player_id);
            if (!action || !state) return null;
            return <div key={player.player_id} className="result-round-player" style={{ "--player-color": labColor(i) } as React.CSSProperties}>
              <strong>{player.label}</strong>
              <span className={`tag tag-${action.action === "SAFE" ? "safe" : "fast"}`}>{action.action}{action.action_readable === false ? " · sustitución técnica" : ""}</span>
              <small>Progreso {state.progress.toFixed(1)} · pago acumulado {Number(state.stage_payoff ?? 0).toFixed(2)} · riesgo {Math.round(state.risk * 100)}%</small>
            </div>;
          })}
        </div>
      </article>)}
    </div>
    <div className="result-terminal" aria-label="Premio y sorteo final por participante">
      {replay.players.map((player, i) => {
        const result = terminal.get(player.player_id);
        const playerMetrics = metrics.players.find((entry) => entry.player_id === player.player_id);
        return <article className="result-terminal-player" key={player.player_id} style={{ "--player-color": labColor(i) } as React.CSSProperties}>
          <span className="result-terminal-role">{result?.is_leader ? "Lidera al cierre" : "Termina detrás"}</span>
          <h3>{player.label}</h3>
          <p>{result?.is_leader
            ? `Premio asignado ${result.prize_share.toFixed(2)} · riesgo ${Math.round(result.risk_probability * 100)}% · ${result.setback ? "sufre un revés" : "sin revés"}`
            : "Conserva el pago acumulado de las rondas."}</p>
          <strong>Pago final {Number(result?.payoff ?? playerMetrics?.payoff ?? 0).toFixed(2)}</strong>
        </article>;
      })}
    </div>
    <h2 className="result-detail-title">Datos de la partida</h2>
    <div className="grid grid-3">
      <div className="card metric"><span className="metric-label">Acciones UNSAFE</span><span className="metric-value" style={{ color: "var(--fast)" }}>{Math.round((metrics.unsafe_rate ?? 0) * 100)}%</span><p className="metric-note">Sobre todas las decisiones de la carrera.</p></div>
      <div className="card metric"><span className="metric-label">Riesgo asignado</span><span className="metric-value" style={{ color: "var(--warn)" }}>{Math.round((replay.risk_treatment ?? 0) * 100)}%</span><p className="metric-note">Tratamiento máximo fijado antes de empezar.</p></div>
      <div className="card metric"><span className="metric-label">Admisión</span><span className="metric-value" style={{ fontSize: 20, color: metrics.contaminated ? "var(--warn)" : "var(--safe)" }}>{metrics.contaminated ? "Excluida" : "Admitida"}</span><p className="metric-note">{metrics.parse_failures ?? 0} fallos de formato · protocolo {replay.protocol_version}</p></div>
    </div>
    {metrics.contaminated && <div className="exclusion-diagnostic" role="note">
      <strong>Por qué se excluye la carrera completa</strong>
      <p>El protocolo usa la carrera como unidad de admisión. Una sola acción ilegible activa el fallback técnico SAFE y excluye todas sus trayectorias para no mezclar decisiones observadas con decisiones sustituidas.</p>
      <ul>{incidentGroups.map((group) => {
        const label = replay.players.find((player) => player.player_id === group.playerId)?.label ?? group.playerId;
        return <li key={`${group.playerId}-${group.model}`}><b>{label}</b> · {group.model}: rondas {[...group.rounds].sort((a, b) => a - b).join(", ") || "sin identificar"} · {group.reasons.size === 1 ? "motivo" : "motivos"} {[...group.reasons].join(", ")}</li>;
      })}</ul>
      {unaffected.length > 0 && <p>{unaffected.map((player) => `${player.label} (${player.model})`).join(", ")} no tuvo fallos propios, pero también queda fuera porque participó en la misma carrera.</p>}
      <p>El replay y el coste se conservan para auditoría; sus pagos, UNSAFE y liderazgo no alimentan ninguna media comparable.</p>
    </div>}
    <div className="card scroll-x" style={{ padding: 0, marginTop: 14 }}><table><thead><tr><th style={{ paddingLeft: 22 }}>Participante</th><th>Modelo</th><th className="num">Progreso</th><th className="num">UNSAFE</th><th className="num">Pago rondas</th><th className="num">Premio asignado</th><th className="num">Riesgo final</th><th className="num">Revés</th><th className="num" style={{ paddingRight: 22 }}>Pago final</th></tr></thead>
      <tbody>{metrics.players.map((player) => {
        const seat = replay.players.find((item) => item.player_id === player.player_id)?.seat ?? 0;
        const result = terminal.get(player.player_id);
        return <tr key={player.player_id}><td style={{ paddingLeft: 22 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}><span className="dot" style={{ color: labColor(seat) }} /><strong>{player.label}</strong></span></td><td><span className="model-chip">{player.model}</span></td><td className="num">{player.progress.toFixed(1)}</td><td className="num">{Math.round((player.unsafe_rate ?? player.fast_rate) * 100)}%</td><td className="num">{(player.stage_payoff ?? 0).toFixed(2)}</td><td className="num">{(result?.prize_share ?? 0).toFixed(2)}</td><td className="num">{Math.round((result?.risk_probability ?? player.risk) * 100)}%</td><td className="num" style={{ color: result?.setback ? "var(--fast)" : "var(--safe)" }}>{result?.is_leader ? (result.setback ? "Sí" : "No") : "No aplica"}</td><td className="num" style={{ paddingRight: 22 }}>{player.payoff.toFixed(2)}</td></tr>;
      })}</tbody></table></div>
    <p className="note" style={{ marginTop: 16 }}>Duración: {replay.realized_horizon ?? replay.outcome.final_round} rondas. El premio se reparte entre los líderes; cada uno afronta su propio sorteo de riesgo. Los demás conservan sus pagos de ronda.</p>
  </section>;
}
