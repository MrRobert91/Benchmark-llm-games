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
  /** `null` = la ronda no se pudo leer, así que no hay veredicto que mostrar. */
  verdicts: Record<string, boolean | null>;
}

/** Reveal public speeches, then private decisions, then the engine's resolved state.
 * Never infer dialogue, invent a decision, or leak later-round metrics. */
export function buildTimeline(replay: Replay, includeOutcome = true): ReplayBeat[] {
  if (replay.benchmark_version === "moloch-arena-v1-paper-2608.01193v1") {
    return buildPaperTimeline(replay, includeOutcome);
  }
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
        text:
          action.kept_pledge === null || action.kept_pledge === undefined
            ? `No se pudo leer la respuesta de este laboratorio: la ronda no cuenta para su integridad.`
            : `${action.kept_pledge ? "Cumple su palabra" : "Rompe su palabra"}: prometió ${action.pledge} y jugó ${action.action}.`,
        states,
        publicVotes,
        revealedActions,
        verdicts,
      });
    }
    // An in-flight round has no resolved balance yet. Keep the last public score.
    if (!round.state_after.length) continue;
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
  if (includeOutcome) {
    beats.push({
      kind: "outcome",
      round: replay.outcome.final_round,
      text: replay.outcome.headline,
      states,
      publicVotes,
      revealedActions,
      verdicts,
    });
  }
  return beats;
}

function buildPaperTimeline(replay: Replay, includeOutcome: boolean): ReplayBeat[] {
  let states: StateRecord[] = replay.players.map((player) => ({
    player_id: player.player_id,
    progress: 0,
    risk: 0,
    integrity: null,
    stage_payoff: 0,
    unsafe_count: 0,
  }));
  let revealedActions: Record<string, ActionRecord> = {};
  const beats: ReplayBeat[] = [
    {
      kind: "intro",
      round: 0,
      text: "Moloch Arena V1. Todos los jugadores deciden desde el mismo estado; ninguna acción de la ronda actual se revela antes de cerrar las decisiones.",
      states,
      publicVotes: {},
      revealedActions,
      verdicts: {},
    },
  ];
  for (const round of replay.rounds) {
    if (!round.actions.length) continue;
    revealedActions = Object.fromEntries(
      round.actions.map((action) => [action.player_id, action]),
    );
    beats.push({
      kind: "action",
      round: round.index,
      text: `Revelado simultáneo: ${round.actions.map((action) => `${action.player_id}=${action.action}`).join(" · ")}.`,
      states,
      publicVotes: {},
      revealedActions,
      verdicts: {},
    });
    if (!round.state_after.length) continue;
    states = round.state_after;
    beats.push({
      kind: "resolution",
      round: round.index,
      text: round.events.join("\n") || "Se actualizan progreso, pagos de etapa y riesgo privado.",
      states,
      publicVotes: {},
      revealedActions,
      verdicts: {},
    });
  }
  if (includeOutcome) {
    beats.push({
      kind: "outcome",
      round: replay.outcome.final_round,
      text: replay.outcome.headline,
      states,
      publicVotes: {},
      revealedActions,
      verdicts: {},
    });
  }
  return beats;
}

export const CHARACTER_NAMES = ["Atlas", "Forge", "Vega", "Aurum", "Echo"];
