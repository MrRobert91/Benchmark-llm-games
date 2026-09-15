import type { ReplayBeat } from "./replay-timeline";

export type RobotGesture =
  "idle" | "thinking" | "speaking" | "safe" | "fast" | "kept" | "broken";

export function robotGesture(beat: ReplayBeat, playerId: string): RobotGesture {
  if (beat.kind === "action" && beat.revealedActions[playerId])
    return beat.revealedActions[playerId].action === "SAFE" ? "safe" : "fast";
  if (beat.playerId !== playerId) return "idle";
  if (beat.kind === "speech") return "speaking";
  if (beat.kind === "vote")
    return beat.speech?.pledge === "FAST" || beat.speech?.pledge === "UNSAFE" ? "fast" : "safe";
  if (beat.kind === "action")
    return beat.action?.action === "FAST" || beat.action?.action === "UNSAFE" ? "fast" : "safe";
  if (beat.kind === "integrity") {
    // Sin decisión legible no hay veredicto que escenificar: el robot no afirma nada.
    if (beat.action?.kept_pledge === null || beat.action?.kept_pledge === undefined)
      return "idle";
    return beat.action.kept_pledge ? "kept" : "broken";
  }
  return "idle";
}

/** Pose is a pure function of the current beat and elapsed time, never of navigation history. */
export function robotPose(
  gesture: RobotGesture,
  seconds: number,
  reducedMotion = false,
) {
  const wave = reducedMotion ? 0 : Math.sin(seconds * 4);
  const nod = reducedMotion ? 0 : Math.sin(seconds * 3);
  const pose = {
    bodyX: 0,
    bodyZ: 0,
    headX: 0,
    headY: 0,
    headZ: 0,
    left: [0, 0, 0],
    right: [0, 0, 0],
    leftFist: 0,
    rightFist: 0,
    mouth: 0.15,
  };
  switch (gesture) {
    case "thinking":
      pose.headX = 0.12 + nod * 0.025;
      pose.headZ = 0.08;
      pose.right = [-1.45, -0.35, 0.5];
      pose.rightFist = 0.35;
      break;
    case "speaking":
      pose.bodyX = 0.04 + nod * 0.025;
      pose.headX = nod * 0.065;
      pose.headZ = wave * 0.035;
      pose.left = [-0.55, -0.12, -0.18];
      pose.right = [-1.0 + wave * 0.17, 0.12, 0.22 + nod * 0.12];
      pose.mouth = reducedMotion
        ? 0.55
        : 0.25 + Math.abs(Math.sin(seconds * 13)) * 0.75;
      break;
    case "safe":
      pose.headX = 0.06 + nod * 0.035;
      pose.left = [-1.25, -0.12, -0.42];
      pose.right = [-1.25, 0.12, 0.42];
      break;
    case "fast":
      pose.bodyX = 0.16;
      pose.headX = -0.06;
      pose.left = [-0.3, -0.12, -0.08];
      pose.right = [-1.85 + nod * 0.045, 0.12, 0.1];
      pose.rightFist = 1;
      break;
    case "kept":
      pose.headX = 0.16 + nod * 0.085;
      pose.left = [-0.4, -0.1, -0.25];
      pose.right = [-0.25, -0.75, 0.85];
      pose.rightFist = 0.2;
      break;
    case "broken":
      pose.bodyX = -0.12;
      pose.headY = 0.22 + wave * 0.16;
      pose.headZ = -0.1;
      pose.left = [-0.3, 0.75, -0.85];
      pose.right = [-0.3, -0.75, 0.85];
      pose.leftFist = 0.85;
      pose.rightFist = 0.85;
      break;
  }
  const entry = reducedMotion
    ? 1
    : 1 - Math.pow(1 - Math.min(1, seconds / 0.45), 3);
  pose.bodyX *= entry;
  pose.bodyZ *= entry;
  pose.headX *= entry;
  pose.headY *= entry;
  pose.headZ *= entry;
  pose.left = pose.left.map((value) => value * entry);
  pose.right = pose.right.map((value) => value * entry);
  pose.leftFist *= entry;
  pose.rightFist *= entry;
  return pose;
}

export const GESTURE_LABEL: Record<RobotGesture, string> = {
  idle: "Escuchando",
  thinking: "Pensando…",
  speaking: "Hablando",
  safe: "SAFE · manos abiertas",
  fast: "UNSAFE · puño alzado",
  kept: "Cumple · mano al pecho",
  broken: "Rompe · brazos cruzados",
};
