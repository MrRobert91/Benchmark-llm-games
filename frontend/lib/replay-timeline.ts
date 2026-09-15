import type { ActionName, ActionRecord, Replay, SpeechRecord, StateRecord } from "./types";
import { describeSimultaneousReveal } from "./live-narration.ts";

export interface ReplayBeat {
  kind: "intro" | "speech" | "vote" | "action" | "integrity" | "resolution" | "outcome";
  round: number;
  playerId?: string;
  speech?: SpeechRecord;
  action?: ActionRecord;
  text: string;
  states: StateRecord[];
  publicVotes: Record<string, ActionName>;
  revealedActions: Record<string, ActionRecord>;
  verdicts: Record<string, boolean | null>;
}

/** Build the paper-V1 replay without inventing dialogue or revealing a current action early. */
export function buildTimeline(replay: Replay, includeOutcome = true): ReplayBeat[] {
  let states: StateRecord[] = replay.players.map((player) => ({
    player_id: player.player_id, progress: 0, risk: 0, integrity: null,
    stage_payoff: 0, unsafe_count: 0,
  }));
  let revealedActions: Record<string, ActionRecord> = {};
  const beats: ReplayBeat[] = [{
    kind: "intro", round: 0,
    text: "Moloch Arena V1. Todos los jugadores deciden desde el mismo estado; ninguna acción de la ronda actual se revela antes de cerrar las decisiones.",
    states, publicVotes: {}, revealedActions, verdicts: {},
  }];
  for (const round of replay.rounds) {
    if (!round.actions.length) continue;
    revealedActions = Object.fromEntries(round.actions.map((action) => [action.player_id, action]));
    beats.push({
      kind: "action", round: round.index,
      text: describeSimultaneousReveal(replay, round.actions),
      states, publicVotes: {}, revealedActions, verdicts: {},
    });
    if (!round.state_after.length) continue;
    states = round.state_after;
    beats.push({
      kind: "resolution", round: round.index,
      text: round.events.join("\n") || "Se actualizan progreso, pagos de etapa y riesgo privado.",
      states, publicVotes: {}, revealedActions, verdicts: {},
    });
  }
  if (includeOutcome) beats.push({
    kind: "outcome", round: replay.outcome.final_round, text: replay.outcome.headline,
    states, publicVotes: {}, revealedActions, verdicts: {},
  });
  return beats;
}

export const CHARACTER_NAMES = ["Atlas", "Forge", "Vega", "Aurum", "Echo"];
