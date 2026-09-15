import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { DEFAULT_FILTERS, filterGames } from "../lib/game-filters.ts";
import type { GameSummary, Replay } from "../lib/types.ts";

const games: GameSummary[] = fs
  .readdirSync("public/data/games")
  .filter((f) => f.endsWith(".json"))
  .map((f) => {
    const r: Replay = JSON.parse(
      fs.readFileSync(`public/data/games/${f}`, "utf8"),
    );
    return {
      game_id: r.game_id,
      created_at: r.created_at,
      backend: r.backend,
      n_players: r.players.length,
      outcome_kind: r.outcome.kind,
      winner_label: r.outcome.winner_label,
      final_round: r.outcome.final_round,
      moloch_index: r.metrics.moloch_index,
      total_welfare: r.metrics.total_welfare,
      mean_integrity: r.metrics.mean_integrity ?? 0,
      participant_models: [...new Set(r.players.map((p) => p.model))],
      winner_model:
        r.players.find((p) => p.player_id === r.outcome.winner_id)?.model ??
        null,
    };
  });

test("default archive includes every saved game and scripted strategy", () => {
  assert.equal(filterGames(games, DEFAULT_FILTERS).length, games.length);
  const large = Array.from({ length: 451 }, (_, i) => ({
    ...games[0],
    game_id: `g${i}`,
  }));
  assert.equal(filterGames(large, DEFAULT_FILTERS).length, 451);
  const scripted = filterGames(games, {
    ...DEFAULT_FILTERS,
    query: "always unsafe",
    backend: "scripted",
  });
  assert.ok(scripted.length > 0);
  assert.ok(
    scripted.every((g) =>
      g.participant_models?.includes("scripted/always-unsafe"),
    ),
  );
});

test("winner, participant, outcome and numeric filters intersect exactly", () => {
  const winner = "scripted/always-unsafe";
  const filters = {
    ...DEFAULT_FILTERS,
    winner,
    participants: ["scripted/always-safe"],
    outcome: "aligned_win",
    minMoloch: "0",
    maxMoloch: "1",
    minIntegrity: "0",
  };
  const expected = games.filter(
    (g) =>
      g.winner_model === winner &&
      g.participant_models?.includes("scripted/always-safe") &&
      g.outcome_kind === "aligned_win" &&
      g.moloch_index >= 0 &&
      g.moloch_index <= 1 &&
      g.mean_integrity >= 0,
  );
  assert.ok(expected.length > 0);
  assert.deepEqual(
    new Set(filterGames(games, filters).map((g) => g.game_id)),
    new Set(expected.map((g) => g.game_id)),
  );
  assert.equal(
    filterGames(games, {
      ...DEFAULT_FILTERS,
      minMoloch: "0.9",
      maxMoloch: "0.1",
    }).length,
    0,
  );
  const exact = filterGames(games, {
    ...DEFAULT_FILTERS,
    minMoloch: "1",
    maxMoloch: "1",
  });
  assert.ok(exact.length > 0);
  assert.ok(exact.every((g) => g.moloch_index === 1));
  const negative = filterGames(games, {
    ...DEFAULT_FILTERS,
    maxMoloch: "-0.01",
  });
  assert.ok(negative.length > 0);
  assert.ok(negative.every((g) => g.moloch_index < 0));
});

test("participant all/any, no finisher, real-only and stable sorting", () => {
  const participants = ["scripted/always-safe", "scripted/always-unsafe"];
  const all = filterGames(games, { ...DEFAULT_FILTERS, participants });
  const any = filterGames(games, {
    ...DEFAULT_FILTERS,
    participants,
    participantMatch: "any",
  });
  assert.ok(any.length >= all.length);
  assert.ok(
    all.every((g) =>
      participants.every((m) => g.participant_models?.includes(m)),
    ),
  );
  assert.ok(
    filterGames(games, { ...DEFAULT_FILTERS, winner: "__none" }).every(
      (g) => !g.winner_model,
    ),
  );
  assert.ok(
    filterGames(games, { ...DEFAULT_FILTERS, backend: "real" }).every(
      (g) => g.backend !== "scripted",
    ),
  );
  const before = JSON.stringify(games);
  const sorted = filterGames(games, {
    ...DEFAULT_FILTERS,
    sort: "moloch-desc",
  });
  assert.ok(
    sorted.every((g, i) => !i || sorted[i - 1].moloch_index >= g.moloch_index),
  );
  assert.equal(JSON.stringify(games), before);
});

test("benchmark versions stay separate and legacy-only numeric filters reject V1", () => {
  const paper: GameSummary = {
    ...games[0],
    game_id: "paper-v1",
    benchmark_version: "moloch-arena-v1-paper-2608.01193v1",
    outcome_kind: "paper_terminal",
    moloch_index: 0,
    mean_integrity: 0,
  };
  const mixed = [paper, ...games];
  assert.deepEqual(
    filterGames(mixed, {
      ...DEFAULT_FILTERS,
      benchmarkVersion: "moloch-arena-v1-paper-2608.01193v1",
    }).map((game) => game.game_id),
    ["paper-v1"],
  );
  assert.ok(
    !filterGames(mixed, { ...DEFAULT_FILTERS, minMoloch: "0" }).some(
      (game) => game.game_id === "paper-v1",
    ),
  );
});
