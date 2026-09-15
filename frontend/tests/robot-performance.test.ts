import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { buildTimeline } from "../lib/replay-timeline.ts";
import { robotGesture, robotPose, type RobotGesture } from "../lib/robot-performance.ts";

const replay = JSON.parse(fs.readFileSync(`public/data/games/${fs.readdirSync("public/data/games").find((file) => file.endsWith(".json"))}`, "utf8"));
const reveal = buildTimeline(replay).find((beat) => beat.kind === "action")!;

test("simultaneous reveal gives every participant the recorded SAFE/UNSAFE gesture", () => {
  for (const player of replay.players) {
    const action = reveal.revealedActions[player.player_id].action;
    assert.equal(robotGesture(reveal, player.player_id), action === "SAFE" ? "safe" : "fast");
  }
  assert.equal(robotGesture(reveal, "unknown-player"), "idle");
});

test("V1 gestures are deterministic, distinct and reduced-motion safe", () => {
  const gestures: RobotGesture[] = ["thinking", "safe", "fast"];
  assert.equal(new Set(gestures.map((gesture) => JSON.stringify(robotPose(gesture, 1)))).size, 3);
  assert.equal(robotPose("fast", 1).rightFist, 1);
  assert.equal(robotPose("safe", 1).rightFist, 0);
  for (const gesture of gestures) assert.deepEqual(robotPose(gesture, 1, true), robotPose(gesture, 20, true));
});
