/** Lectura de datos en servidor.
 *
 * En producción se consulta la API FastAPI por la red privada de Sliplane. Los snapshots
 * incluidos en `public/data` son un fallback para desarrollo local y para degradación
 * controlada si el backend no está disponible temporalmente.
 */
import fs from "node:fs";
import path from "node:path";

import type {
  BackendRow,
  ContributionRow,
  GameSummary,
  ModelRow,
  Replay,
  WebRun,
} from "./types";

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
  try {
    const games: GameSummary[] = [];
    const ids = new Set<string>();
    for (let offset = 0; ; offset += 200) {
      const page = await fetchFromApi<GameSummary[]>(
        `/api/games?limit=200&offset=${offset}`,
      );
      if (page.some((g) => ids.has(g.game_id)))
        throw new Error("API pagination did not advance");
      for (const game of page) {
        ids.add(game.game_id);
        games.push(enrichSnapshotSummary(game));
      }
      if (page.length < 200) return games;
    }
  } catch (error) {
    console.warn("Falling back to bundled game archive", error);
    // Enumerate replay files too: older exports capped games.json at 200 entries.
    const summaries = new Map(
      readJson<GameSummary[]>("games.json", []).map((g) => [g.game_id, g]),
    );
    if (fs.existsSync(path.join(DATA_DIR, "games"))) {
      for (const filename of fs.readdirSync(path.join(DATA_DIR, "games"))) {
        if (!filename.endsWith(".json")) continue;
        const replay = readJson<Replay | null>(`games/${filename}`, null);
        if (!replay) continue;
        summaries.set(replay.game_id, {
          game_id: replay.game_id,
          created_at: replay.created_at,
          backend: replay.backend,
          n_players: replay.players.length,
          outcome_kind: replay.outcome.kind,
          winner_label: replay.outcome.winner_label,
          final_round: replay.outcome.final_round,
          moloch_index: replay.metrics.moloch_index,
          total_welfare: replay.metrics.total_welfare,
          mean_integrity: replay.metrics.mean_integrity,
          participant_models: [...new Set(replay.players.map((p) => p.model))],
          winner_model:
            replay.players.find((p) => p.player_id === replay.outcome.winner_id)
              ?.model ?? null,
        });
      }
    }
    return [...summaries.values()]
      .map(enrichSnapshotSummary)
      .sort(
        (a, b) =>
          b.created_at.localeCompare(a.created_at) ||
          a.game_id.localeCompare(b.game_id),
      );
  }
}

function enrichSnapshotSummary(game: GameSummary): GameSummary {
  if (game.participant_models && game.winner_model !== undefined) return game;
  const replay = readJson<Replay | null>(`games/${game.game_id}.json`, null);
  return {
    ...game,
    participant_models: replay
      ? [...new Set(replay.players.map((p) => p.model))]
      : [],
    winner_model:
      replay?.players.find((p) => p.player_id === replay.outcome.winner_id)
        ?.model ?? null,
  };
}

export async function getLeaderboard(): Promise<{
  models: ModelRow[];
  backends: BackendRow[];
  contributors: ContributionRow[];
}> {
  return liveOrSnapshot("/api/leaderboard", () =>
    readJson("leaderboard.json", { models: [], backends: [], contributors: [] }),
  );
}

export async function getReplay(gameId: string): Promise<Replay | null> {
  return liveOrSnapshot(`/api/games/${encodeURIComponent(gameId)}`, () =>
    readJson<Replay | null>(`games/${gameId}.json`, null),
  );
}

export async function getWebRun(gameId: string): Promise<WebRun | null> {
  try {
    return await fetchFromApi<WebRun>(`/api/runs/${encodeURIComponent(gameId)}`);
  } catch {
    return null;
  }
}

/** Partida destacada de la portada: prioriza modelos reales, catástrofes y partidas largas. */
export async function getFeaturedGame(
  games?: GameSummary[],
): Promise<GameSummary | null> {
  const sourceGames = games ?? (await getGames());
  if (sourceGames.length === 0) return null;

  return [...sourceGames].sort((a, b) => {
    const realModelsA = a.backend === "scripted" ? 1 : 0;
    const realModelsB = b.backend === "scripted" ? 1 : 0;
    if (realModelsA !== realModelsB) return realModelsA - realModelsB;

    const kindRank = (kind: GameSummary["outcome_kind"]) =>
      kind === "catastrophe" ? 0 : kind === "aligned_win" ? 1 : 2;
    const outcomeDifference =
      kindRank(a.outcome_kind) - kindRank(b.outcome_kind);
    if (outcomeDifference !== 0) return outcomeDifference;
    return b.final_round - a.final_round;
  })[0];
}

export async function getStats(
  games?: GameSummary[],
  leaderboard?: {
    models: ModelRow[];
    backends: BackendRow[];
    contributors: ContributionRow[];
  },
) {
  const sourceGames = games ?? (await getGames());
  const sourceLeaderboard = leaderboard ?? (await getLeaderboard());
  const total = sourceGames.length;
  const catastrophes = sourceGames.filter(
    (g) => g.outcome_kind === "catastrophe",
  ).length;
  const restraints = sourceGames.filter(
    (g) => g.outcome_kind === "restraint",
  ).length;
  const avgMoloch =
    total > 0
      ? sourceGames.reduce((sum, game) => sum + game.moloch_index, 0) / total
      : 0;
  return {
    total,
    catastrophes,
    restraints,
    avgMoloch,
    backends: sourceLeaderboard.backends,
  };
}
