import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_FILTERS, filterGames } from "../lib/game-filters.ts";
import type { GameSummary } from "../lib/types.ts";

const paper = (id: string, risk: number, unsafe: number, payoff: number, model: string): GameSummary => ({
  game_id: id, created_at: `2026-09-${id === "a" ? "14" : "15"}T00:00:00Z`, backend: "paper-openrouter", n_players: 2,
  outcome_kind: "paper_terminal", winner_label: null, final_round: 9, moloch_index: 0,
  total_welfare: payoff * 2, mean_integrity: 0, participant_models: [model], winner_model: null,
  benchmark_version: "moloch-arena-v1-paper-2608.01193v1", protocol_version: "published-reconstruction-v1",
  admission_status: "admitted", risk_treatment: risk, unsafe_rate: unsafe, mean_payoff: payoff,
});

const games = [paper("a", 0.1, 0.2, 30, "vendor/alpha"), paper("b", 0.9, 0.8, 10, "vendor/beta")];

test("archive exposes only V1 and filters its benchmark metrics", () => {
  const old = { ...games[0], game_id: "old", benchmark_version: "legacy-moloch-v0" as const };
  assert.deepEqual(filterGames([old, ...games], DEFAULT_FILTERS).map((game) => game.game_id), ["b", "a"]);
  assert.deepEqual(filterGames(games, { ...DEFAULT_FILTERS, risk: "0.1" }).map((game) => game.game_id), ["a"]);
  assert.deepEqual(filterGames(games, { ...DEFAULT_FILTERS, query: "beta" }).map((game) => game.game_id), ["b"]);
  assert.deepEqual(filterGames(games, { ...DEFAULT_FILTERS, sort: "payoff-desc" }).map((game) => game.game_id), ["a", "b"]);
});
