"use client";
import { useEffect, useRef, useState } from "react";
import type { Replay } from "@/lib/types";
import type { ReplayBeat } from "@/lib/replay-timeline";
import { createCouncil } from "@/lib/council-scene";

export function Arena3D({
  replay,
  beat,
  overview,
  thinking = false,
}: {
  replay: Replay;
  beat: ReplayBeat;
  overview: boolean;
  thinking?: boolean;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createCouncil> | null>(null);
  const latest = useRef({ replay, beat, overview, thinking });
  latest.current = { replay, beat, overview, thinking };
  const sceneKey = JSON.stringify([replay.game_id, replay.players, replay.rules]);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!mount.current) return;
    setFailed(false);
    try {
      scene.current = createCouncil(
        mount.current,
        latest.current.replay,
        latest.current.beat,
        () => setFailed(true),
      );
      scene.current.update(latest.current.beat, latest.current.overview, latest.current.thinking, latest.current.replay);
    } catch {
      mount.current.replaceChildren();
      setFailed(true);
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, [sceneKey, retry]);
  useEffect(() => {
    scene.current?.update(beat, overview, thinking, replay);
  }, [beat, overview, thinking, replay]);
  return (
    <div
      className="council-render"
      aria-label={`Reunión 3D de ${replay.players.length} robots alrededor de una mesa redonda`}
    >
      <div ref={mount} className="council-canvas" />
      {failed && (
        <div className="council-fallback">
          <p>
            No se pudo mostrar la escena 3D. Puedes seguir leyendo la partida
            con los controles.
          </p>
          <button className="btn" onClick={() => setRetry((r) => r + 1)}>
            Reintentar 3D
          </button>
        </div>
      )}
    </div>
  );
}
