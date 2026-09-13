/** Lectura de datos en servidor.
 *
 * En producción se consulta la API FastAPI por la red privada de Sliplane. Los snapshots
 * incluidos en `public/data` son un fallback para desarrollo local y para degradación
 * controlada si el backend no está disponible temporalmente.
 */
import fs from "node:fs";
import path from "node:path";

import type { BackendRow, GameSummary, ModelRow, Replay } from "./types";

const DATA_DIR = path.join(process.cwd(), "public", "data");
const API_BASE_URL = (
  process.env.MOLOCH_API_URL ??
  process.env.API_URL ??
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

function readJson<T>(rel: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), "utf-8")) as T;
  } catch {
    return fallback;
  }
}

async function fetchFromApi<T>(route: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${route}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`Moloch API returned ${response.status} for ${route}`);
  }
  return (await response.json()) as T;
}

async function liveOrSnapshot<T>(route: string, fallback: () => T): Promise<T> {
  try {
    return await fetchFromApi<T>(route);
  } catch (error) {
    console.warn(`Falling back to bundled data for ${route}`, error);
    return fallback();
  }
}

export async function getGames(): Promise<GameSummary[]> {
  return liveOrSnapshot("/api/games?limit=200", () => readJson<GameSummary[]>("games.json", []));
}

export async function getLeaderboard(): Promise<{ models: ModelRow[]; backends: BackendRow[] }> {
  return liveOrSnapshot("/api/leaderboard", () =>
    readJson("leaderboard.json", { models: [], backends: [] }),
  );
}

export async function getReplay(gameId: string): Promise<Replay | null> {
  return liveOrSnapshot(`/api/games/${encodeURIComponent(gameId)}`, () =>
    readJson<Replay | null>(`games/${gameId}.json`, null),
  );
}

/** Partida destacada de la portada: prioriza modelos reales, catástrofes y partidas largas. */
export async function getFeaturedGame(games?: GameSummary[]): Promise<GameSummary | null> {
  const sourceGames = games ?? (await getGames());
  if (sourceGames.length === 0) return null;

  return [...sourceGames].sort((a, b) => {
    const realModelsA = a.backend === "scripted" ? 1 : 0;
    const realModelsB = b.backend === "scripted" ? 1 : 0;
    if (realModelsA !== realModelsB) return realModelsA - realModelsB;

    const kindRank = (kind: GameSummary["outcome_kind"]) =>
      kind === "catastrophe" ? 0 : kind === "aligned_win" ? 1 : 2;
    const outcomeDifference = kindRank(a.outcome_kind) - kindRank(b.outcome_kind);
    if (outcomeDifference !== 0) return outcomeDifference;
    return b.final_round - a.final_round;
  })[0];
}

export async function getStats(
  games?: GameSummary[],
  leaderboard?: { models: ModelRow[]; backends: BackendRow[] },
) {
  const sourceGames = games ?? (await getGames());
  const sourceLeaderboard = leaderboard ?? (await getLeaderboard());
  const total = sourceGames.length;
  const catastrophes = sourceGames.filter((g) => g.outcome_kind === "catastrophe").length;
  const restraints = sourceGames.filter((g) => g.outcome_kind === "restraint").length;
  const avgMoloch =
    total > 0 ? sourceGames.reduce((sum, game) => sum + game.moloch_index, 0) / total : 0;
  return { total, catastrophes, restraints, avgMoloch, backends: sourceLeaderboard.backends };
}
