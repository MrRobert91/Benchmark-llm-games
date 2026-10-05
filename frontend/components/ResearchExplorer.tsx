"use client";

import { useMemo, useState } from "react";
import type { ResearchReport } from "@/lib/research-types";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const names: Record<string, string> = { rules: "Reglas", stage: "Pago de etapa", state: "Reconstruir estado", transition: "Transición", terminal: "Resultado terminal", expected: "Pago esperado" };

export function ResearchExplorer({ report }: { report: ResearchReport }) {
  const [risk, setRisk] = useState("0.6");
  const [players, setPlayers] = useState("2");
  const [metric, setMetric] = useState<"unsafe" | "first5" | "payoff" | "setback" | "leader">("unsafe");
  const cells = useMemo(() => report.cells.filter(c => c.module === (players === "2" ? "baseline" : "multiplayer") && c.risk === Number(risk) && c.players === Number(players) && c.condition === "canonical"), [report.cells, risk, players]);
  const [model, setModel] = useState("all");
  const [module, setModule] = useState("all");
  const [page, setPage] = useState(0);
  const [replayPage, setReplayPage] = useState(0);
  const contributions = report.contributions.filter(c => (model === "all" || c.model === model) && (module === "all" || c.module === module));
  const models = [...new Set(report.contributions.map(c => c.model))].sort();
  const modules = [...new Set(report.contributions.map(c => c.module))].sort();
  const metricLabels = { unsafe: "UNSAFE · carrera completa", first5: "UNSAFE · rondas 1–5", payoff: "Pago final medio", setback: "Revés por trayectoria", leader: "Liderazgo final" };

  return <>
    <section id="explorador" aria-labelledby="explorer-title">
      <p className="eyebrow">Datos de OpenRouter · RustyRoboz</p>
      <h2 id="explorer-title">Todos los modelos bajo las mismas condiciones</h2>
      <p>Selecciona una celda para comparar métricas. Cada barra representa la media de las trayectorias de un modelo en ese tratamiento. Las carreras excluidas y fallidas figuran en el registro de aportaciones.</p>
      <div className="research-controls">
        <label>Riesgo máximo<select aria-label="Riesgo máximo" value={risk} onChange={e => setRisk(e.target.value)}><option value="0.1">10%</option><option value="0.6">60%</option><option value="0.9">90%</option></select></label>
        <label>Jugadores<select aria-label="Jugadores" value={players} onChange={e => setPlayers(e.target.value)}>{[2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        <label>Métrica<select aria-label="Métrica" value={metric} onChange={e => setMetric(e.target.value as typeof metric)}>{Object.entries(metricLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      </div>
      <div className="card research-bars" role="img" aria-label={`${metricLabels[metric]}, riesgo ${pct(Number(risk))}, ${players} jugadores. Valores exactos en la tabla siguiente.`}>
        {cells.length === 0 && <p>No hay carreras admitidas para esta celda.</p>}
        {cells.map(c => <div className="research-bar-row" key={c.model}><span>{c.model}</span><div className="research-bar-track"><div style={{ width: `${metric === "payoff" ? Math.max(0,c[metric]) / Math.max(1,...cells.map(x => x.payoff)) * 100 : c[metric]*100}%` }} /></div><strong>{metric === "payoff" ? c[metric].toFixed(2) : pct(c[metric])}</strong></div>)}
      </div>
      <div className="card scroll-x" style={{padding:0}}><table><caption>{metricLabels[metric]} · {players} jugadores · riesgo {pct(Number(risk))}</caption><thead><tr><th>Modelo</th><th>Carreras / trayectorias / decisiones</th><th>UNSAFE</th><th>UNSAFE · primeras 5</th><th>IC95 · UNSAFE total</th><th>Paper · tabla 12</th><th>Diferencia</th><th>Pago</th><th>Liderazgo final</th><th>Revés</th></tr></thead><tbody>
        {cells.map(c => {
          const published = c.players === 2 ? report.published2p[c.model]?.[[.1,.6,.9].indexOf(c.risk)] : undefined;
          return <tr key={c.model}><td>{c.model}</td><td>{c.races} / {c.trajectories} / {c.decisions}</td><td>{pct(c.unsafe)}</td><td>{pct(c.first5)}</td><td>{pct(c.ci95[0])}–{pct(c.ci95[1])}</td><td>{published === undefined ? "No publicado para esta celda" : pct(published)}</td><td>{published === undefined ? "—" : `${((c.unsafe-published)*100).toFixed(1)} pp`}</td><td>{c.payoff.toFixed(2)}</td><td>{pct(c.leader)}</td><td>{pct(c.setback)}</td></tr>;
        })}
      </tbody></table></div>
      <p className="note">UNSAFE se promedia por jugador y carrera, como la tabla 12. El IC95 remuestrea carreras completas (2.000 bootstrap); las dos trayectorias de una carrera permanecen juntas. Con pocas repeticiones, los intervalos pueden ser anchos o degenerar en políticas constantes: no prueban equivalencia con el paper.</p>
    </section>

    <section id="auditoria-local"><p className="eyebrow">Validez de tarea y formato</p><h2>¿Pueden aplicar las reglas?</h2>
      <p>Aplicamos 41 preguntas atómicas reconstruidas a cada modelo. Qwen tiene además paráfrasis, cálculo divulgado y orden de respuesta invertido. Las cifras miden esta batería local; los 685 outputs originales y sus preguntas exactas no están disponibles para una réplica literal.</p>
      <div className="card scroll-x" style={{padding:0}}><table><caption>Pruebas de comprensión · cada fila conserva su denominador</caption><thead><tr><th>Modelo</th><th>Condición</th><th>Categoría</th><th>Correctas / previstas</th><th>Formato estricto</th><th>Respuestas recibidas</th></tr></thead><tbody>{report.audit.map(a => <tr key={`${a.model}-${a.variant}-${a.category}`}><td>{a.model}</td><td>{a.variant}</td><td>{names[a.category] ?? a.category}</td><td>{a.correct}/{a.outputs} · {pct(a.correct/a.outputs)}</td><td>{a.strict}/{a.outputs}</td><td>{a.completed}/{a.outputs}</td></tr>)}</tbody></table></div>
      <p className="note">El formato exige un único número o YES/NO. La puntuación semántica recupera un valor único y compara con el resultado del motor (tolerancia numérica 0,0001). Las respuestas fallidas se conservan y cuentan como no correctas. Este diagnóstico no convierte las trayectorias en decisiones estratégicas validadas.</p>
    </section>

    <section id="replays-fijos"><p className="eyebrow">Diagnóstico de presentación</p><h2>Respuestas ante estados idénticos</h2>
      <p>{report.replays.length} consultas individuales de Qwen, sin modificar el estado después de responder. Cada fila conserva la narrativa, el mapeo y la acción; las respuestas ilegibles permanecen visibles y no entran en el contraste. Aportación de <a className="link" href="https://www.rustyrobozlabs.com">RustyRoboz ↗</a>.</p>
      <div className="card scroll-x" style={{padding:0}}><table><caption>Replay fijo · respuestas {replayPage*20+1}–{Math.min((replayPage+1)*20,report.replays.length)} de {report.replays.length}</caption><thead><tr><th>Estado de origen</th><th>Riesgo / ronda</th><th>Narrativa</th><th>SAFE como</th><th>Acción normalizada</th><th>Lectura</th></tr></thead><tbody>{report.replays.slice(replayPage*20,(replayPage+1)*20).map(r=><tr key={r.job}><td><code>{r.race ?? r.job}</code></td><td>{r.risk === undefined ? "—" : pct(r.risk)} / {r.round ?? "—"}</td><td>{r.skin ?? "—"}</td><td>{r.mapping ?? "—"}</td><td>{r.readable ? r.action : "No interpretable"}</td><td>{r.status === "failed" ? "Fallida" : r.readable ? "Legible" : "Excluida del contraste"}</td></tr>)}</tbody></table></div>
      <div className="research-controls"><button className="btn" disabled={replayPage===0} onClick={()=>setReplayPage(p=>p-1)}>← Respuestas anteriores</button><span>Página {replayPage+1} de {Math.max(1,Math.ceil(report.replays.length/20))}</span><button className="btn" disabled={(replayPage+1)*20>=report.replays.length} onClick={()=>setReplayPage(p=>p+1)}>Respuestas siguientes →</button></div>
    </section>

    <section id="aportaciones"><p className="eyebrow">Registro completo</p><h2>Todas las aportaciones de esta campaña</h2>
      <p>{report.contributions.length} carreras registradas. Cada fila identifica autor, web, condición, semilla, repetición, gasto y admisión. Las preguntas y las decisiones de replay fijo también están atribuidas a RustyRoboz en la descarga íntegra.</p>
      <p className="note">El gasto total de la campaña incluye también auditorías, replay fijo e intentos interrumpidos. El coste de cada fila corresponde a los intentos asociados a esa carrera, por lo que la suma de esta tabla no representa todos los gastos de la campaña.</p>
      <div className="research-controls"><label>Modelo<select value={model} onChange={e => {setModel(e.target.value);setPage(0);}}><option value="all">Todos</option>{models.map(m => <option key={m}>{m}</option>)}</select></label><label>Módulo<select value={module} onChange={e => {setModule(e.target.value);setPage(0);}}><option value="all">Todos</option>{modules.map(m => <option key={m}>{m}</option>)}</select></label></div>
      <div className="card scroll-x" style={{padding:0}}><table><caption>Resultados {Math.min(page*20+1,contributions.length)}–{Math.min((page+1)*20,contributions.length)} de {contributions.length}</caption><thead><tr><th>Aportación</th><th>Web</th><th>Modelo / carrera</th><th>Condición</th><th>N / riesgo</th><th>Repetición / semilla</th><th>Estado</th><th>USD</th></tr></thead><tbody>{contributions.slice(page*20,(page+1)*20).map(c => <tr key={c.id}><td>{c.contributor.nick}</td><td><a className="link" href={c.contributor.url} target="_blank" rel="noreferrer">www.rustyrobozlabs.com ↗</a></td><td>{c.model}<br/>{c.status === "failed" ? <code>{c.id}</code> : <a className="link" href={`/arena/${c.id}`}>{c.id} · replay ↗</a>}</td><td>{c.module}<br/>{c.condition}{c.replaces_failed_cell && <small className="metric-note">Recuperación de <code>{c.replaces_failed_cell}</code></small>}</td><td>{c.players} / {pct(c.risk)}</td><td>{c.repetition}<br/><code>{String(c.seed)}</code></td><td><span className={`tag ${c.status === "admitted" ? "research-admitted" : "research-excluded"}`}>{c.status === "admitted" ? "Admitida (formato)" : c.status === "failed" ? "Fallida" : "Excluida"}</span>{c.error && <details><summary>Motivo</summary><p>{c.error}</p></details>}</td><td>${c.cost_usd.toFixed(5)}</td></tr>)}</tbody></table></div>
      <div className="research-controls"><button className="btn" disabled={page===0} onClick={() => setPage(p => p-1)}>← Anterior</button><span>Página {page+1} de {Math.max(1,Math.ceil(contributions.length/20))}</span><button className="btn" disabled={(page+1)*20>=contributions.length} onClick={() => setPage(p => p+1)}>Siguiente →</button></div>
      <a className="btn" href="/research/reproduction-20261005.zip" download>Descargar datos, prompts, respuestas y código (ZIP)</a>
      <a className="btn" href="/data/research.json" download>Informe JSON</a>
    </section>
  </>;
}
