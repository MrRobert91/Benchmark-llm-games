import type {
  ActionRecord,
  LiveRunEvent,
  PlayerMeta,
  Replay,
  StateRecord,
} from "./types";

function playerFor(
  replay: Replay,
  playerId: string | undefined,
  fallback?: Pick<PlayerMeta, "label" | "model">,
): Pick<PlayerMeta, "player_id" | "label" | "model"> {
  const player = replay.players.find((entry) => entry.player_id === playerId);
  return {
    player_id: playerId ?? "jugador",
    label: player?.label ?? fallback?.label ?? "Laboratorio",
    model: player?.model ?? fallback?.model ?? "modelo desconocido",
  };
}

export function describeSimultaneousReveal(
  replay: Replay,
  actions: ActionRecord[],
): string {
  const revealed = actions.map((action) => {
    const player = playerFor(replay, action.player_id);
    return `${player.player_id} · ${player.label} · ${player.model} = ${action.action}`;
  });
  return `Revelado simultáneo: ${revealed.join(" · ")}.`;
}

function describeRoundState(replay: Replay, states: StateRecord[]): string {
  const summary = states.map((state) => {
    const player = playerFor(replay, state.player_id);
    return `${state.player_id} · ${player.label}: progreso ${state.progress}, pago acumulado ${(state.stage_payoff ?? 0).toFixed(2)}, riesgo ${Math.round((state.risk ?? 0) * 100)}%`;
  });
  return `Estado confirmado: ${summary.join(" · ")}.`;
}

export function liveEventTitle(event: LiveRunEvent): string {
  const round = event.detail.round ? `Ronda ${event.detail.round}` : "Partida";
  switch (event.event_type) {
    case "thinking":
      return `${round} · decisión privada`;
    case "speaking":
    case "speech":
      return `${round} · intervención pública`;
    case "round_resolved":
      return `${round} · acciones reveladas`;
    case "finished":
    case "completed":
      return "Resultado terminal";
    case "failed":
      return "Ejecución detenida";
    default:
      return "Preparación";
  }
}

export function describeLiveEvent(event: LiveRunEvent, replay: Replay): string {
  const detail = event.detail;
  const player = playerFor(replay, detail.player_id, {
    label: detail.label ?? "Laboratorio",
    model: detail.model ?? "modelo desconocido",
  });
  const identity = `${player.player_id} · ${player.label} · ${player.model}`;
  switch (event.event_type) {
    case "queued":
      return "Ejecución en cola. La clave permanece sólo en memoria.";
    case "started":
      return "Partida iniciada. Se prepara la primera ronda.";
    case "speaking":
      return `${identity} prepara su intervención pública de la ronda ${detail.round}.`;
    case "speech":
      return detail.speech
        ? `${identity}: “${detail.speech.text}”`
        : `${identity} ha completado su intervención pública.`;
    case "thinking":
      return `${identity} está preparando su decisión privada de la ronda ${detail.round}. Su acción permanece sellada hasta que respondan todos los jugadores.`;
    case "round_resolved": {
      const reveal = describeSimultaneousReveal(replay, detail.actions ?? []);
      const state = describeRoundState(replay, detail.state_after ?? []);
      const messages = detail.messages?.join(" ") ?? "";
      return `${reveal} ${state}${messages ? ` ${messages}` : ""}`;
    }
    case "finished":
      return "El horizonte ha terminado. Calculando premios, riesgo y pagos finales.";
    case "completed":
      return detail.headline ?? "Partida completada.";
    case "failed":
      return detail.message ?? "La ejecución se ha detenido antes de completar la partida.";
  }
}
