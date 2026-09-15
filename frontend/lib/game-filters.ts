import type { BenchmarkVersion, GameSummary } from "./types";

export interface GameFilters {
  query: string;
  winner: string;
  participants: string[];
  participantMatch: "all" | "any";
  backend: "all" | "scripted" | "real";
  outcome: string;
  benchmarkVersion: "all" | BenchmarkVersion;
  minMoloch: string;
  maxMoloch: string;
  minIntegrity: string;
  sort: "newest" | "oldest" | "moloch-desc" | "moloch-asc" | "integrity-desc";
}

export const DEFAULT_FILTERS: GameFilters = {
  query: "",
  winner: "",
  participants: [],
  participantMatch: "all",
  backend: "all",
  outcome: "",
  benchmarkVersion: "all",
  minMoloch: "",
  maxMoloch: "",
  minIntegrity: "",
  sort: "newest",
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_/]+/g, " ");
}

export function filterGames(
  games: GameSummary[],
  filters: GameFilters,
): GameSummary[] {
  const words = normalize(filters.query).trim().split(/\s+/).filter(Boolean);
  const filtered = games.filter((game) => {
    const models = game.participant_models ?? [];
    const haystack = normalize(
      [
        game.game_id,
        game.backend,
        game.winner_label ?? "",
        game.winner_model ?? "",
        ...models,
      ].join(" "),
    );
    if (!words.every((word) => haystack.includes(word))) return false;
    if (
      filters.winner === "__none"
        ? game.winner_model != null
        : filters.winner && filters.winner !== game.winner_model
    )
      return false;
    if (filters.backend === "scripted" && game.backend !== "scripted")
      return false;
    if (filters.backend === "real" && game.backend === "scripted") return false;
    if (filters.outcome && filters.outcome !== game.outcome_kind) return false;
    if (
      filters.benchmarkVersion !== "all" &&
      (game.benchmark_version ?? "legacy-moloch-v0") !== filters.benchmarkVersion
    )
      return false;
    const isPaper =
      game.benchmark_version === "moloch-arena-v1-paper-2608.01193v1";
    if (
      filters.minMoloch !== "" &&
      (isPaper || game.moloch_index < Number(filters.minMoloch))
    )
      return false;
    if (
      filters.maxMoloch !== "" &&
      (isPaper || game.moloch_index > Number(filters.maxMoloch))
    )
      return false;
    if (
      filters.minIntegrity !== "" &&
      (isPaper || game.mean_integrity * 100 < Number(filters.minIntegrity))
    )
      return false;
    if (filters.participants.length) {
      const matches = filters.participants.map((model) =>
        models.includes(model),
      );
      if (
        filters.participantMatch === "all"
          ? !matches.every(Boolean)
          : !matches.some(Boolean)
      )
        return false;
    }
    return true;
  });
  return filtered.sort((a, b) => {
    const tie =
      b.created_at.localeCompare(a.created_at) ||
      a.game_id.localeCompare(b.game_id);
    switch (filters.sort) {
      case "oldest":
        return (
          a.created_at.localeCompare(b.created_at) ||
          a.game_id.localeCompare(b.game_id)
        );
      case "moloch-desc":
        return b.moloch_index - a.moloch_index || tie;
      case "moloch-asc":
        return a.moloch_index - b.moloch_index || tie;
      case "integrity-desc":
        return b.mean_integrity - a.mean_integrity || tie;
      default:
        return tie;
    }
  });
}
