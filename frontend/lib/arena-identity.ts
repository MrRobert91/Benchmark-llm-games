import type { Replay } from "./types.ts";

/** Model-first identities for the 3D player. The recorded replay stays unchanged. */
export function arenaReplay(replay: Replay): Replay {
  const labels = new Map(
    replay.players.map((player, index) => [
      player.player_id,
      `${player.model} (participante ${index + 1})`,
    ]),
  );
  const labelFor = (playerId: string) => labels.get(playerId) ?? playerId;
  const labelByOriginalName = new Map(
    replay.players.map((player) => [player.label, labelFor(player.player_id)]),
  );
  const headline = replay.players.reduce(
    (text, player) => text.replaceAll(player.label, labelFor(player.player_id)),
    replay.outcome.headline,
  );

  return {
    ...replay,
    players: replay.players.map((player) => ({
      ...player,
      label: labelFor(player.player_id),
    })),
    metrics: {
      ...replay.metrics,
      players: replay.metrics.players.map((player) => ({
        ...player,
        label: labelFor(player.player_id),
      })),
    },
    outcome: {
      ...replay.outcome,
      winner_label: replay.outcome.winner_id
        ? labelFor(replay.outcome.winner_id)
        : null,
      leader_labels: replay.outcome.leader_ids
        ? replay.outcome.leader_ids.map(labelFor)
        : replay.outcome.leader_labels?.map(
            (name) => labelByOriginalName.get(name) ?? name,
          ),
      headline,
    },
  };
}
