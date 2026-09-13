import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { buildTimeline } from "../lib/replay-timeline.ts";
import {
  robotGesture,
  robotPose,
  type RobotGesture,
} from "../lib/robot-performance.ts";

const replay = JSON.parse(
  fs.readFileSync("public/data/games/a29f546cf168.json", "utf8"),
);
const beats = buildTimeline(replay);

test("only the current speaker/voter performs the gesture and each phase is distinct", () => {
  assert.ok(beats.some((b) => b.kind === "integrity" && b.action?.kept_pledge));
  assert.ok(
    beats.some((b) => b.kind === "integrity" && !b.action?.kept_pledge),
  );
  for (const beat of beats) {
    assert.equal(robotGesture(beat, "not-the-speaker"), "idle");
    if (!beat.playerId) continue;
    const gesture = robotGesture(beat, beat.playerId);
    if (beat.kind === "speech") assert.equal(gesture, "speaking");
    if (beat.kind === "vote")
      assert.equal(gesture, beat.speech?.pledge === "SAFE" ? "safe" : "fast");
    if (beat.kind === "integrity")
      assert.equal(gesture, beat.action?.kept_pledge ? "kept" : "broken");
  }
});

test("speaking articulates over time; SAFE, FAST, kept and broken have unique poses", () => {
  assert.notDeepEqual(robotPose("speaking", 1), robotPose("speaking", 1.25));
  const gestures: RobotGesture[] = [
    "speaking",
    "safe",
    "fast",
    "kept",
    "broken",
  ];
  assert.equal(
    new Set(gestures.map((g) => JSON.stringify(robotPose(g, 1)))).size,
    5,
  );
  assert.equal(robotPose("fast", 1).rightFist, 1);
  assert.equal(robotPose("safe", 1).rightFist, 0);
  for (const gesture of gestures) {
    const first = robotPose(gesture, 1);
    robotPose("broken", 7); // seeking through a different state cannot change the target pose
    assert.deepEqual(robotPose(gesture, 1), first);
    assert.deepEqual(robotPose(gesture, 1, true), robotPose(gesture, 20, true));
  }
});


test("thinking stays seated, animates gently and respects reduced motion", () => {
  assert.equal(robotPose("thinking", 1).bodyX, 0);
  assert.notEqual(robotPose("thinking", 1).headX, robotPose("thinking", 2).headX);
  assert.deepEqual(robotPose("thinking", 1, true), robotPose("thinking", 2, true));
});
