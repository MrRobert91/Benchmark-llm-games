import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { buildTimeline } from "../lib/replay-timeline.ts";
import type { Replay } from "../lib/types.ts";

const games: Replay[] = fs
  .readdirSync("public/data/games")
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(`public/data/games/${f}`, "utf8")));

test("all saved games preserve every recorded speech and decision in phase order", () => {
  assert.ok(games.length > 0);
  for (const replay of games) {
    const beats = buildTimeline(replay);
    assert.equal(beats[0].kind, "intro");
    assert.equal(beats.at(-1)?.kind, "outcome");
    assert.equal(beats.filter((b) => b.kind === "outcome").length, 1);
    let cursor = 1;
    let states = beats[0].states;
    for (const round of replay.rounds) {
      const votes: Record<string, string> = {};
      for (const speech of round.meeting) {
        const beat = beats[cursor++];
        assert.equal(beat.kind, "speech");
        assert.equal(beat.playerId, speech.player_id);
        assert.equal(beat.text, speech.text);
        assert.equal(beat.speech, speech);
        assert.equal(beat.action, undefined);
        assert.deepEqual(beat.states, states);
        assert.deepEqual(beat.publicVotes, votes);
        assert.deepEqual(beat.revealedActions, {});
        const vote = beats[cursor++];
        votes[speech.player_id] = speech.pledge;
        assert.equal(vote.kind, "vote");
        assert.equal(vote.speech, speech);
        assert.deepEqual(vote.publicVotes, votes);
        assert.deepEqual(vote.states, states);
      }
      const decisions: Record<string, unknown> = {};
      const verdicts: Record<string, boolean> = {};
      for (const action of round.actions) {
        const beat = beats[cursor++];
        assert.equal(beat.kind, "action");
        assert.equal(beat.playerId, action.player_id);
        assert.equal(beat.action, action);
        assert.deepEqual(beat.states, states);
        decisions[action.player_id] = action;
        assert.deepEqual(beat.revealedActions, decisions);
        assert.deepEqual(beat.verdicts, verdicts);
        const integrity = beats[cursor++];
        verdicts[action.player_id] = action.kept_pledge;
        assert.equal(integrity.kind, "integrity");
        assert.equal(integrity.action, action);
        assert.deepEqual(integrity.verdicts, verdicts);
        assert.deepEqual(integrity.publicVotes, votes);
        assert.deepEqual(integrity.states, states);
      }
      const resolution = beats[cursor++];
      assert.equal(resolution.kind, "resolution");
      assert.deepEqual(resolution.states, round.state_after);
      states = round.state_after;
    }
    assert.equal(cursor, beats.length - 1);
    assert.deepEqual(beats[cursor].states, states);
    assert.equal(beats[cursor].text, replay.outcome.headline);
  }
});

test("seeking backward cannot mutate an earlier state or reveal terminal events", () => {
  for (const replay of games) {
    const before = JSON.stringify(replay);
    const beats = buildTimeline(replay);
    assert.ok(beats[0].states.every((s) => s.progress === 0 && s.risk === 0));
    const lastResolution = beats.findLast((b) => b.kind === "resolution");
    if (lastResolution)
      assert.ok(!lastResolution.text.includes(replay.outcome.headline));
    assert.equal(JSON.stringify(replay), before);
    assert.deepEqual(buildTimeline(replay), beats);
  }
});

test("empty meetings and missing participant speeches still reveal real actions", () => {
  const replay = structuredClone(games[0]);
  replay.rounds = [replay.rounds[0]];
  replay.rounds[0].meeting = [];
  const beats = buildTimeline(replay);
  assert.equal(beats.filter((b) => b.kind === "speech").length, 0);
  assert.equal(
    beats.filter((b) => b.kind === "action").length,
    replay.rounds[0].actions.length,
  );
  replay.rounds = [];
  assert.deepEqual(
    buildTimeline(replay).map((b) => b.kind),
    ["intro", "outcome"],
  );
});

test("live timeline never invents a terminal outcome", () => {
  const replay = structuredClone(games[0]);
  const beats = buildTimeline(replay, false);
  assert.notEqual(beats.at(-1)?.kind, "outcome");
  assert.equal(beats.filter((beat) => beat.kind === "outcome").length, 0);
});


test("live updates retain the previous score until the next round resolves", () => {
  const replay = structuredClone(games.find((g) => g.rounds.length > 1)!);
  const first = replay.rounds[0];
  const next = replay.rounds[1];
  replay.rounds = [first, { ...next, actions: [], state_after: [], events: [] }];
  const waiting = buildTimeline(replay, false).at(-1)!;
  assert.deepEqual(waiting.states, first.state_after);
  assert.notEqual(waiting.kind, "resolution");
  replay.rounds[1] = next;
  assert.deepEqual(buildTimeline(replay, false).at(-1)!.states, next.state_after);
});
