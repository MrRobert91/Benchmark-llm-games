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
      for (const speech of round.meeting) {
        const beat = beats[cursor++];
        assert.equal(beat.kind, "speech");
        assert.equal(beat.playerId, speech.player_id);
        assert.equal(beat.text, speech.text);
        assert.equal(beat.speech, speech);
        assert.equal(beat.action, undefined);
        assert.deepEqual(beat.states, states);
      }
      for (const action of round.actions) {
        const beat = beats[cursor++];
        assert.equal(beat.kind, "action");
        assert.equal(beat.playerId, action.player_id);
        assert.equal(beat.action, action);
        assert.deepEqual(beat.states, states);
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
