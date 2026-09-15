import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { buildTimeline } from "../lib/replay-timeline.ts";
import type { Replay } from "../lib/types.ts";

const games: Replay[] = fs.readdirSync("public/data/games").filter((file) => file.endsWith(".json")).map((file) => JSON.parse(fs.readFileSync(`public/data/games/${file}`, "utf8")));

test("every bundled V1 replay reveals sealed actions together and preserves resolved state", () => {
  assert.ok(games.length > 0);
  for (const replay of games) {
    assert.equal(replay.benchmark_version, "moloch-arena-v1-paper-2608.01193v1");
    const before = JSON.stringify(replay);
    const beats = buildTimeline(replay);
    assert.equal(beats[0].kind, "intro");
    assert.equal(beats.at(-1)?.kind, "outcome");
    assert.equal(beats.filter((beat) => beat.kind === "speech" || beat.kind === "vote" || beat.kind === "integrity").length, 0);
    for (const round of replay.rounds.filter((item) => item.actions.length)) {
      const reveal = beats.find((beat) => beat.kind === "action" && beat.round === round.index)!;
      const resolution = beats.find((beat) => beat.kind === "resolution" && beat.round === round.index)!;
      assert.deepEqual(Object.keys(reveal.revealedActions).sort(), round.actions.map((action) => action.player_id).sort());
      assert.deepEqual(resolution.states, round.state_after);
    }
    assert.equal(JSON.stringify(replay), before);
    assert.deepEqual(buildTimeline(replay), beats);
  }
});

test("live replay omits terminal outcome and retains the latest confirmed balance", () => {
  const replay = structuredClone(games.find((game) => game.rounds.length > 1)!);
  const first = replay.rounds[0];
  replay.rounds = [first, { ...replay.rounds[1], actions: [], state_after: [], events: [] }];
  const beats = buildTimeline(replay, false);
  assert.equal(beats.filter((beat) => beat.kind === "outcome").length, 0);
  assert.deepEqual(beats.at(-1)?.states, first.state_after);
});

test("an empty live replay contains only the truthful initial state", () => {
  const replay = structuredClone(games[0]);
  replay.rounds = [];
  assert.deepEqual(buildTimeline(replay, false).map((beat) => beat.kind), ["intro"]);
});
