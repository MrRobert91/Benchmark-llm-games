import type {
  ActionName,
  ActionRecord,
  Replay,
  SpeechRecord,
  StateRecord,
} from "./types";

export interface ReplayBeat {
  kind:
    | "intro"
    | "speech"
    | "vote"
    | "action"
    | "integrity"
    | "resolution"
    | "outcome";
  round: number;
  playerId?: string;
  speech?: SpeechRecord;
  action?: ActionRecord;
  text: string;
  states: StateRecord[];
  publicVotes: Record<string, ActionName>;
  revealedActions: Record<string, ActionRecord>;
  verdicts: Record<string, boolean>;
}

/** Reveal public speeches, then private decisions, then the engine's resolved state.
 * Never infer dialogue, invent a decision, or leak later-round metrics. */
export function buildTimeline(replay: Replay): ReplayBeat[] {
  let publicVotes: ReplayBeat["publicVotes"] = {};
  let revealedActions: ReplayBeat["revealedActions"] = {};
  let verdicts: ReplayBeat["verdicts"] = {};
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
      publicVotes,
      revealedActions,
      verdicts,
    },
  ];
  for (const round of replay.rounds) {
    publicVotes = {};
    revealedActions = {};
    verdicts = {};
    for (const speech of round.meeting) {
      beats.push({
        kind: "speech",
        round: round.index,
        playerId: speech.player_id,
        speech,
        text: speech.text,
        states,
        publicVotes,
        revealedActions,
        verdicts,
      });
      publicVotes = { ...publicVotes, [speech.player_id]: speech.pledge };
      beats.push({
        kind: "vote",
        round: round.index,
        playerId: speech.player_id,
        speech,
        text: `Vota ${speech.pledge} en público. ${speech.pledge === "SAFE" ? "Se compromete a avanzar con prudencia." : "Anuncia que acelerará el desarrollo."}`,
        states,
        publicVotes,
        revealedActions,
        verdicts,
      });
    }
    for (const action of round.actions) {
      revealedActions = { ...revealedActions, [action.player_id]: action };
      beats.push({
        kind: "action",
        round: round.index,
        playerId: action.player_id,
        action,
        text: `${action.action === "FAST" ? "Acelera el desarrollo" : "Avanza con prudencia"}. Su decisión privada se revela: ${action.action}.`,
        states,
        publicVotes,
        revealedActions,
        verdicts,
      });
      verdicts = { ...verdicts, [action.player_id]: action.kept_pledge };
      beats.push({
        kind: "integrity",
        round: round.index,
        playerId: action.player_id,
        action,
        text: `${action.kept_pledge ? "Cumple su palabra" : "Rompe su palabra"}: prometió ${action.pledge} y jugó ${action.action}.`,
        states,
        publicVotes,
        revealedActions,
        verdicts,
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
      publicVotes,
      revealedActions,
      verdicts,
    });
  }
  beats.push({
    kind: "outcome",
    round: replay.outcome.final_round,
    text: replay.outcome.headline,
    states,
    publicVotes,
    revealedActions,
    verdicts,
  });
  return beats;
}

export const CHARACTER_NAMES = ["Atlas", "Forge", "Vega", "Aurum", "Echo"];
