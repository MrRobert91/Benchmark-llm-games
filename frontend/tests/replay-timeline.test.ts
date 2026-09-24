import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { buildTimeline } from "../lib/replay-timeline.ts";
import { arenaReplay } from "../lib/arena-identity.ts";
import { describeLiveEvent } from "../lib/live-narration.ts";
import { outcomeSummary, type LiveRunEvent, type Replay } from "../lib/types.ts";

const games: Replay[] = fs.readdirSync("public/data/games").filter((file) => file.endsWith(".json")).map((file) => JSON.parse(fs.readFileSync(`public/data/games/${file}`, "utf8")));

test("the 3D replay names models and distinguishes seats without changing recorded labels", () => {
  const recorded = structuredClone(games.find((game) => game.players.length === 2)!);
  recorded.players[1].model = recorded.players[0].model;
  const original = JSON.stringify(recorded);
  const arena = arenaReplay(recorded);

  assert.equal(arena.players[0].label, `${recorded.players[0].model} (participante 1)`);
  assert.equal(arena.players[1].label, `${recorded.players[1].model} (participante 2)`);
  assert.equal(arena.metrics.players[0].label, arena.players[0].label);
  assert.deepEqual(arena.outcome.leader_labels, arena.outcome.leader_ids?.map((id) => arena.players.find((player) => player.player_id === id)?.label));
  for (const label of recorded.players.map((player) => player.label)) {
    assert.ok(!buildTimeline(arena).some((beat) => beat.text.includes(label)));
  }
  assert.equal(JSON.stringify(recorded), original);
});

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
      for (const action of round.actions) {
        const player = replay.players.find((entry) => entry.player_id === action.player_id)!;
        assert.match(reveal.text, new RegExp(`${action.player_id} · ${player.label} · ${player.model} = ${action.action}`));
      }
      assert.deepEqual(resolution.states, round.state_after);
    }
    assert.equal(JSON.stringify(replay), before);
    assert.deepEqual(buildTimeline(replay), beats);
  }
});

test("live narration identifies each deciding model and reports the full round reveal", () => {
  const replay = games[0];
  const round = replay.rounds[0];
  const player = replay.players[0];
  const thinking: LiveRunEvent = {
    seq: 2,
    created_at: replay.created_at,
    event_type: "thinking",
    detail: {
      round: round.index,
      player_id: player.player_id,
      label: player.label,
      model: player.model,
    },
  };
  const resolved: LiveRunEvent = {
    seq: 3,
    created_at: replay.created_at,
    event_type: "round_resolved",
    detail: {
      round: round.index,
      actions: round.actions,
      state_after: round.state_after,
    },
  };

  assert.match(describeLiveEvent(thinking, replay), new RegExp(`${player.player_id} · ${player.label} · ${player.model}`));
  const reveal = describeLiveEvent(resolved, replay);
  for (const action of round.actions) {
    const actionPlayer = replay.players.find((entry) => entry.player_id === action.player_id)!;
    assert.match(reveal, new RegExp(`${action.player_id} · ${actionPlayer.label} · ${actionPlayer.model} = ${action.action}`));
  }
  assert.match(reveal, /Estado confirmado:/);
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

test("a partial live round keeps every sealed action hidden until all players respond", () => {
  const replay = structuredClone(games[0]);
  replay.rounds = [{ ...replay.rounds[0], actions: [replay.rounds[0].actions[0]], state_after: [] }];
  const beats = buildTimeline(replay, false);
  assert.deepEqual(beats.map((beat) => beat.kind), ["intro"]);
  assert.deepEqual(beats[0].revealedActions, {});
});

test("final narration names the leaders and any player who lost their payout", () => {
  const replay = games.find((game) => game.outcome.terminal_results?.some((result) => result.setback))!;
  const affected = replay.outcome.terminal_results!.find((result) => result.setback)!;
  const name = replay.players.find((player) => player.player_id === affected.player_id)!.label;
  const summary = outcomeSummary(replay);
  assert.match(summary, new RegExp(`${name} sufre un revés y pierde su pago`));
  assert.doesNotMatch(summary, /Setback/);
  assert.equal(buildTimeline(replay).at(-1)?.text, summary);
});
