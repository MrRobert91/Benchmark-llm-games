/** Lectura de datos en servidor.
 *
 * El snapshot que exporta el backend (`python -m moloch.cli export`) vive en
 * `public/data`, así que el sitio se construye y se sirve sin depender de que la API esté
 * levantada. Quien quiera datos en vivo puede apuntar a la API de FastAPI.
 */
import fs from "node:fs";
import path from "node:path";

import type { BackendRow, GameSummary, ModelRow, Replay } from "./types";

const DATA_DIR = path.join(process.cwd(), "public", "data");

function readJson<T>(rel: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export function getGames(): GameSummary[] {
  return readJson<GameSummary[]>("games.json", []);
}

export function getLeaderboard(): { models: ModelRow[]; backends: BackendRow[] } {
  return readJson("leaderboard.json", { models: [], backends: [] });
}

export function getReplay(gameId: string): Replay | null {
  return readJson<Replay | null>(`games/${gameId}.json`, null);
}

/** Partida destacada de la portada: la más didáctica de las guardadas.
 *
 * Criterios, en orden: que sea una catástrofe (es donde la trampa se ve de un vistazo), que
 * la mesa tenga estrategias distintas (un monocultivo no enseña nada sobre la interacción),
 * y que haya durado muchas rondas, porque cuanto más tarda en romperse la cooperación más
 * interesante es la transcripción.
 */
export function getFeaturedGame(): GameSummary | null {
  const games = getGames();
  if (games.length === 0) return null;

  const distinctModels = (id: string) => {
    const replay = getReplay(id);
    if (!replay) return 0;
    return new Set(replay.players.map((p) => p.model)).size;
  };

  const scored = games.map((g) => ({
    game: g,
    // Una partida jugada por modelos reales manda sobre cualquier partida guionizada:
    // es la que enseña de qué va el benchmark.
    realModels: g.backend === "scripted" ? 1 : 0,
    kindRank:
      g.outcome_kind === "catastrophe" ? 0 : g.outcome_kind === "aligned_win" ? 1 : 2,
    variety: distinctModels(g.game_id),
  }));

  scored.sort((a, b) => {
    if (a.realModels !== b.realModels) return a.realModels - b.realModels;
    if (a.kindRank !== b.kindRank) return a.kindRank - b.kindRank;
    if (a.variety !== b.variety) return b.variety - a.variety;
    return b.game.final_round - a.game.final_round;
  });

  return scored[0].game;
}

export function getStats() {
  const games = getGames();
  const { backends } = getLeaderboard();
  const total = games.length;
  const catastrophes = games.filter((g) => g.outcome_kind === "catastrophe").length;
  const restraints = games.filter((g) => g.outcome_kind === "restraint").length;
  const avgMoloch =
    total > 0 ? games.reduce((s, g) => s + g.moloch_index, 0) / total : 0;
  return { total, catastrophes, restraints, avgMoloch, backends };
}
