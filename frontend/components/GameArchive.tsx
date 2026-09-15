"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DEFAULT_FILTERS, filterGames, type GameFilters } from "@/lib/game-filters";
import { shortModel, type GameSummary } from "@/lib/types";

const PAGE_SIZE = 20;

export function GameArchive({ games }: { games: GameSummary[] }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const models = useMemo(() => [...new Set(games.flatMap((game) => game.participant_models ?? []))].sort(), [games]);
  const results = useMemo(() => filterGames(games, filters), [games, filters]);
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = results.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const update = <K extends keyof GameFilters>(key: K, value: GameFilters[K]) => { setFilters((previous) => ({ ...previous, [key]: value })); setPage(1); };

  return <div className="game-archive">
    <div className="archive-stats"><span><b>{games.length}</b> carreras V1</span><span><b>{models.length}</b> modelos y estrategias</span><span><b>{games.filter((game) => game.admission_status === "admitted").length}</b> admitidas</span></div>
    <form className="archive-filters" onSubmit={(event) => event.preventDefault()} aria-label="Filtros de carreras V1">
      <label className="archive-search">Buscar modelo o partida<input type="search" value={filters.query} onChange={(event) => update("query", event.target.value)} placeholder="Ej. qwen, mistral o ID de partida" /></label>
      <label>Tipo de agente<select value={filters.backend} onChange={(event) => update("backend", event.target.value as GameFilters["backend"])}><option value="all">Todos</option><option value="real">Modelos OpenRouter</option><option value="scripted">Estrategias de referencia</option></select></label>
      <label>Riesgo máximo<select value={filters.risk} onChange={(event) => update("risk", event.target.value as GameFilters["risk"])}><option value="all">Todos los tratamientos</option><option value="0.1">10%</option><option value="0.6">60%</option><option value="0.9">90%</option></select></label>
      <label>Admisión<select value={filters.admission} onChange={(event) => update("admission", event.target.value as GameFilters["admission"])}><option value="all">Admitidas y excluidas</option><option value="admitted">Solo admitidas</option><option value="excluded">Solo excluidas</option></select></label>
      <label>Ordenar por<select value={filters.sort} onChange={(event) => update("sort", event.target.value as GameFilters["sort"])}><option value="newest">Más recientes</option><option value="oldest">Más antiguas</option><option value="unsafe-desc">Mayor tasa UNSAFE</option><option value="payoff-desc">Mayor pago medio</option></select></label>
      <details className="archive-participants"><summary>Modelos participantes · {filters.participants.length ? `${filters.participants.length} seleccionados` : "cualquier modelo"}</summary>
        <label>Coincidencia<select value={filters.participantMatch} onChange={(event) => update("participantMatch", event.target.value as "all" | "any")}><option value="all">Todos los seleccionados</option><option value="any">Al menos uno</option></select></label>
        <div className="archive-models">{models.map((model) => <label key={model}><input type="checkbox" checked={filters.participants.includes(model)} onChange={(event) => update("participants", event.target.checked ? [...filters.participants, model] : filters.participants.filter((item) => item !== model))} />{model}</label>)}</div>
      </details>
      <div className="archive-filter-footer"><span role="status" aria-live="polite">{results.length} de {games.length} carreras</span><button type="button" className="btn" onClick={() => { setFilters(DEFAULT_FILTERS); setPage(1); }}>Limpiar filtros</button></div>
    </form>
    <p className="archive-explainer">La tasa UNSAFE y el pago medio solo describen la carrera indicada. El leaderboard es quien promedia repeticiones comparables y excluye carreras contaminadas.</p>
    {visible.length ? <><div className="card scroll-x archive-table"><table><thead><tr><th>Partida</th><th>Modelos</th><th className="num">UNSAFE</th><th className="num">Pago medio</th><th className="num">Admisión</th><th><span className="sr-only">Repetición</span></th></tr></thead><tbody>
      {visible.map((game) => <tr key={game.game_id}><td><span className="tag tag-warn">Final del horizonte</span><span className="archive-game-id">{game.game_id}</span><small>{game.n_players} jugadores · {game.final_round} rondas</small><small>{game.created_at.slice(0, 10)} · riesgo {Math.round((game.risk_treatment ?? 0) * 100)}%</small></td>
        <td><div className="archive-model-list">{(game.participant_models ?? []).map((model) => <span key={model}>{shortModel(model)}</span>)}</div></td><td className="num">{game.unsafe_rate == null ? "—" : `${(game.unsafe_rate * 100).toFixed(1)}%`}</td><td className="num">{game.mean_payoff?.toFixed(2) ?? "—"}</td><td className="num"><span className={`tag ${game.admission_status === "admitted" ? "tag-safe" : "tag-fast"}`}>{game.admission_status === "admitted" ? "Admitida" : "Excluida"}</span></td><td><Link className="btn" href={`/arena/${game.game_id}`}>Reproducir →</Link></td></tr>)}
    </tbody></table></div><nav className="archive-pagination" aria-label="Páginas del archivo"><button className="btn" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>← Anterior</button><span>Página {currentPage} de {pages}</span><button className="btn" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Siguiente →</button></nav></> : <div className="archive-empty"><h2>No hay carreras que coincidan</h2><p>Prueba con menos filtros o selecciona otro tratamiento de riesgo.</p><button className="btn" onClick={() => { setFilters(DEFAULT_FILTERS); setPage(1); }}>Ver todas las carreras</button></div>}
  </div>;
}
