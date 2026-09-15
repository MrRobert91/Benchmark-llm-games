"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  DEFAULT_FILTERS,
  filterGames,
  type GameFilters,
} from "@/lib/game-filters";
import { OUTCOME_LABEL, type GameSummary } from "@/lib/types";
import { formatIntegrity } from "@/lib/integrity";

const PAGE_SIZE = 20;
const KIND_CLASS = {
  catastrophe: "tag-fast",
  restraint: "tag-safe",
  aligned_win: "tag-warn",
  paper_terminal: "tag-warn",
};

export function GameArchive({ games }: { games: GameSummary[] }) {
  const [filters, setFilters] = useState<GameFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const models = useMemo(
    () =>
      [
        ...new Set(games.flatMap((game) => game.participant_models ?? [])),
      ].sort(),
    [games],
  );
  const winners = useMemo(
    () =>
      [
        ...new Set(
          games.flatMap((game) =>
            game.winner_model ? [game.winner_model] : [],
          ),
        ),
      ].sort(),
    [games],
  );
  const results = useMemo(() => filterGames(games, filters), [games, filters]);
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = results.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const update = <K extends keyof GameFilters>(
    key: K,
    value: GameFilters[K],
  ) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(1);
  };
  const invalidRange =
    filters.minMoloch !== "" &&
    filters.maxMoloch !== "" &&
    Number(filters.minMoloch) > Number(filters.maxMoloch);
  return (
    <div className="game-archive">
      <div className="archive-stats">
        <span>
          <b>{games.length}</b> partidas guardadas
        </span>
        <span>
          <b>{models.length}</b> modelos y estrategias
        </span>
        <span>
          Modelos reales: <b>{games.filter((g) => g.backend !== "scripted").length}</b>
        </span>
      </div>
      <form
        className="archive-filters"
        onSubmit={(event) => event.preventDefault()}
        aria-label="Filtros de partidas"
      >
        <label className="archive-search">
          Buscar modelos o partidas
          <input
            type="search"
            value={filters.query}
            onChange={(e) => update("query", e.target.value)}
            placeholder="Ej. always unsafe, gemini, Helios o ID de partida"
          />
        </label>
        <label>
          Modelo ganador / primero en llegar
          <select
            value={filters.winner}
            onChange={(e) => update("winner", e.target.value)}
          >
            <option value="">Todos los modelos</option>
            <option value="__none">Sin primero en llegar</option>
            {winners.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo de agentes
          <select
            value={filters.backend}
            onChange={(e) =>
              update("backend", e.target.value as GameFilters["backend"])
            }
          >
            <option value="all">Todos, incluidos scriptados</option>
            <option value="real">Modelos reales</option>
            <option value="scripted">Estrategias scriptadas</option>
          </select>
        </label>
        <label>
          Versión del benchmark
          <select
            value={filters.benchmarkVersion}
            onChange={(e) =>
              update(
                "benchmarkVersion",
                e.target.value as GameFilters["benchmarkVersion"],
              )
            }
          >
            <option value="all">Todas, sin mezclar métricas</option>
            <option value="moloch-arena-v1-paper-2608.01193v1">
              Moloch Arena V1 · paper
            </option>
            <option value="legacy-moloch-v0">Legacy · consejo</option>
          </select>
        </label>
        <label>
          Desenlace
          <select
            value={filters.outcome}
            onChange={(e) => update("outcome", e.target.value)}
          >
            <option value="">Todos los desenlaces</option>
            {Object.entries(OUTCOME_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Índice de Moloch mínimo (solo legacy)
          <input
            type="number"
            step="0.01"
            placeholder="0"
            value={filters.minMoloch}
            aria-invalid={invalidRange}
            onChange={(e) => update("minMoloch", e.target.value)}
          />
        </label>
        <label>
          Índice de Moloch máximo (solo legacy)
          <input
            type="number"
            step="0.01"
            placeholder="1"
            value={filters.maxMoloch}
            aria-invalid={invalidRange}
            onChange={(e) => update("maxMoloch", e.target.value)}
          />
        </label>
        <label>
          Integridad mínima (solo legacy, %)
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            placeholder="0"
            value={filters.minIntegrity}
            onChange={(e) => update("minIntegrity", e.target.value)}
          />
        </label>
        <label>
          Ordenar por
          <select
            value={filters.sort}
            onChange={(e) =>
              update("sort", e.target.value as GameFilters["sort"])
            }
          >
            <option value="newest">Más recientes</option>
            <option value="oldest">Más antiguas</option>
            <option value="moloch-desc">Mayor índice de Moloch</option>
            <option value="moloch-asc">Menor índice de Moloch</option>
            <option value="integrity-desc">Mayor integridad</option>
          </select>
        </label>
        <details className="archive-participants">
          <summary>
            Modelos participantes ·{" "}
            {filters.participants.length
              ? `${filters.participants.length} seleccionados`
              : "cualquier modelo"}
          </summary>
          <label>
            Coincidencia
            <select
              value={filters.participantMatch}
              onChange={(e) =>
                update("participantMatch", e.target.value as "all" | "any")
              }
            >
              <option value="all">
                Deben participar todos los seleccionados
              </option>
              <option value="any">Debe participar al menos uno</option>
            </select>
          </label>
          <div className="archive-models">
            {models.map((model) => (
              <label key={model}>
                <input
                  type="checkbox"
                  checked={filters.participants.includes(model)}
                  onChange={(e) =>
                    update(
                      "participants",
                      e.target.checked
                        ? [...filters.participants, model]
                        : filters.participants.filter((m) => m !== model),
                    )
                  }
                />
                {model}
              </label>
            ))}
          </div>
        </details>
        {filters.participants.length > 0 && (
          <div className="archive-selected">
            {filters.participants.map((model) => (
              <button
                type="button"
                key={model}
                onClick={() =>
                  update(
                    "participants",
                    filters.participants.filter((m) => m !== model),
                  )
                }
                aria-label={`Quitar filtro ${model}`}
              >
                {model} ×
              </button>
            ))}
          </div>
        )}
        {invalidRange && (
          <p className="archive-range-error" role="alert">
            El mínimo de Moloch no puede superar el máximo.
          </p>
        )}
        <div className="archive-filter-footer">
          <span role="status" aria-live="polite">
            {results.length} de {games.length} partidas
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
              setPage(1);
            }}
          >
            Limpiar filtros
          </button>
        </div>
      </form>
      <p className="archive-explainer">
        V1 muestra UNSAFE y pago, mientras que legacy conserva Índice de Moloch e
        integridad. Los filtros numéricos legacy excluyen automáticamente V1.
      </p>
      {results.length ? (
        <>
          <div className="card scroll-x archive-table">
            <table>
              <caption className="sr-only">
                Partidas guardadas y modelos participantes
              </caption>
              <thead>
                <tr>
                  <th>Partida</th>
                  <th>Modelo ganador / primero</th>
                  <th>Modelos participantes</th>
                  <th className="num">Métrica de conducta</th>
                  <th className="num">Pago / integridad</th>
                  <th>
                    <span className="sr-only">Repetición</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((game) => (
                  <tr key={game.game_id}>
                    <td>
                      <span className={`tag ${KIND_CLASS[game.outcome_kind]}`}>
                        {OUTCOME_LABEL[game.outcome_kind]}
                      </span>
                      <span className="archive-game-id">{game.game_id}</span>
                      <small>
                        {game.n_players} laboratorios · {game.final_round}{" "}
                        rondas
                      </small>
                      <small>
                        {game.created_at.slice(0, 10)} ·{" "}
                        {game.backend === "scripted"
                          ? "scriptados"
                          : "modelos reales"}
                      </small>
                      <small>
                        {game.benchmark_version ===
                        "moloch-arena-v1-paper-2608.01193v1"
                          ? `V1 · riesgo ${Math.round((game.risk_treatment ?? 0) * 100)}%`
                          : "Legacy · consejo"}
                      </small>
                      {game.contributor_nick && (
                        <small>
                          aportación de{" "}
                          {game.contributor_url ? (
                            <a
                              className="link"
                              href={game.contributor_url}
                              target="_blank"
                              rel="nofollow noreferrer"
                            >
                              {game.contributor_nick} ↗
                            </a>
                          ) : game.contributor_nick}
                        </small>
                      )}
                    </td>
                    <td>
                      <strong className="archive-model-name">
                        {game.winner_model ?? "Ninguno"}
                      </strong>
                      <small>
                        {game.winner_label ?? "Sin primero en llegar"}
                        {game.outcome_kind === "catastrophe" &&
                        game.winner_model
                          ? " · primero, sin victoria"
                          : ""}
                      </small>
                    </td>
                    <td>
                      <div className="archive-model-list">
                        {(game.participant_models ?? []).map((model) => (
                          <span key={model}>{model}</span>
                        ))}
                      </div>
                    </td>
                    <td className="num">
                      {game.benchmark_version ===
                      "moloch-arena-v1-paper-2608.01193v1"
                        ? game.unsafe_rate == null
                          ? "UNSAFE —"
                          : `UNSAFE ${Math.round(game.unsafe_rate * 100)}%`
                        : `Moloch ${game.moloch_index.toFixed(3)}`}
                    </td>
                    <td className="num">
                      {game.benchmark_version ===
                      "moloch-arena-v1-paper-2608.01193v1"
                        ? game.mean_payoff == null
                          ? "Pago —"
                          : `Pago ${game.mean_payoff.toFixed(2)}`
                        : formatIntegrity(game.mean_integrity)}
                    </td>
                    <td>
                      <Link
                        className="btn"
                        href={`/arena/${game.game_id}`}
                        aria-label={`Rejugar partida ${game.game_id}`}
                      >
                        Rejugar →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="archive-pagination" aria-label="Páginas del archivo">
            <button
              className="btn"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              ← Anterior
            </button>
            <span>
              Página {currentPage} de {pages}
            </span>
            <button
              className="btn"
              disabled={currentPage >= pages}
              onClick={() => setPage(currentPage + 1)}
            >
              Siguiente →
            </button>
          </nav>
        </>
      ) : (
        <div className="archive-empty">
          <h2>No hay partidas que coincidan</h2>
          <p>
            Prueba con menos modelos participantes o amplía el intervalo de
            Moloch.
          </p>
          <button
            className="btn"
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
              setPage(1);
            }}
          >
            Ver todas las partidas
          </button>
        </div>
      )}
    </div>
  );
}
