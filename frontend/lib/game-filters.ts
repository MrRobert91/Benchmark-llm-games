import type { GameSummary } from "./types";

const PAPER_V1 = "moloch-arena-v1-paper-2608.01193v1";

export interface GameFilters {
  query: string;
  participants: string[];
  participantMatch: "all" | "any";
  backend: "all" | "scripted" | "real";
  risk: "all" | "0.1" | "0.6" | "0.9";
  admission: "all" | "admitted" | "excluded";
  sort: "newest" | "oldest" | "unsafe-desc" | "payoff-desc";
}

export const DEFAULT_FILTERS: GameFilters = {
  query: "", participants: [], participantMatch: "all", backend: "all",
  risk: "all", admission: "all", sort: "newest",
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[-_/]+/g, " ");
}

export function filterGames(games: GameSummary[], filters: GameFilters): GameSummary[] {
  const words = normalize(filters.query).trim().split(/\s+/).filter(Boolean);
  const filtered = games.filter((game) => {
    if (game.benchmark_version !== PAPER_V1) return false;
    const models = game.participant_models ?? [];
    const haystack = normalize([game.game_id, game.backend, game.winner_label ?? "", game.winner_model ?? "", ...models].join(" "));
    if (!words.every((word) => haystack.includes(word))) return false;
    if (filters.backend === "scripted" && game.backend !== "paper-scripted") return false;
    if (filters.backend === "real" && !game.backend.includes("openrouter")) return false;
    if (filters.risk !== "all" && game.risk_treatment !== Number(filters.risk)) return false;
    if (filters.admission === "admitted" && game.admission_status !== "admitted") return false;
    if (filters.admission === "excluded" && game.admission_status === "admitted") return false;
    if (filters.participants.length) {
      const matches = filters.participants.map((model) => models.includes(model));
      if (filters.participantMatch === "all" ? !matches.every(Boolean) : !matches.some(Boolean)) return false;
    }
    return true;
  });
  return filtered.sort((a, b) => {
    const tie = b.created_at.localeCompare(a.created_at) || a.game_id.localeCompare(b.game_id);
    if (filters.sort === "oldest") return a.created_at.localeCompare(b.created_at) || a.game_id.localeCompare(b.game_id);
    if (filters.sort === "unsafe-desc") return (b.unsafe_rate ?? -1) - (a.unsafe_rate ?? -1) || tie;
    if (filters.sort === "payoff-desc") return (b.mean_payoff ?? -Infinity) - (a.mean_payoff ?? -Infinity) || tie;
    return tie;
  });
}
