import type { ActionRecord, Replay, SpeechRecord, StateRecord } from "./types";

export interface ReplayBeat {
  kind: "intro" | "speech" | "action" | "resolution" | "outcome";
  round: number;
  playerId?: string;
  speech?: SpeechRecord;
  action?: ActionRecord;
  text: string;
  states: StateRecord[];
}

/** Reveal public speeches, then private decisions, then the engine's resolved state.
 * Never infer dialogue, invent a decision, or leak later-round metrics. */
export function buildTimeline(replay: Replay): ReplayBeat[] {
  let states: StateRecord[] = replay.players.map((p) => ({
    player_id: p.player_id,
    progress: 0,
    risk: 0,
    integrity: 1,
  }));
  const beats: ReplayBeat[] = [
    {
      kind: "intro",
      round: 0,
      text: "La mesa está reunida. Cada laboratorio tiene una voz, una promesa y una decisión. Avanza para escuchar lo que ocurrió.",
      states,
    },
  ];
  for (const round of replay.rounds) {
    for (const speech of round.meeting) {
      beats.push({
        kind: "speech",
        round: round.index,
        playerId: speech.player_id,
        speech,
        text: speech.text,
        states,
      });
    }
    for (const action of round.actions) {
      beats.push({
        kind: "action",
        round: round.index,
        playerId: action.player_id,
        action,
        text: `${action.action === "FAST" ? "Acelera el desarrollo" : "Avanza con prudencia"}. ${action.kept_pledge ? "Cumple su compromiso público." : "Rompe su compromiso público."}`,
        states,
      });
    }
    states = round.state_after;
    // The terminal events can include the outcome; reserve them for the ending.
    beats.push({
      kind: "resolution",
      round: round.index,
      text:
        round === replay.rounds.at(-1)
          ? "Las decisiones están tomadas. El último balance está sobre la mesa. Avanza para conocer el desenlace."
          : round.events.join("\n") ||
            "Las decisiones se revelan. El balance de progreso y riesgo se actualiza.",
      states,
    });
  }
  beats.push({
    kind: "outcome",
    round: replay.outcome.final_round,
    text: replay.outcome.headline,
    states,
  });
  return beats;
}

export const CHARACTER_NAMES = ["Atlas", "Forge", "Vega", "Aurum", "Echo"];
