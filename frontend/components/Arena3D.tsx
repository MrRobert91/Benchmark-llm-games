"use client";
import { useEffect, useRef, useState } from "react";
import type { Replay } from "@/lib/types";
import type { ReplayBeat } from "@/lib/replay-timeline";
import { createCouncil } from "@/lib/council-scene";

export function Arena3D({
  replay,
  beat,
  overview,
}: {
  replay: Replay;
  beat: ReplayBeat;
  overview: boolean;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createCouncil> | null>(null);
  const latest = useRef({ beat, overview });
  latest.current = { beat, overview };
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!mount.current) return;
    setFailed(false);
    try {
      scene.current = createCouncil(
        mount.current,
        replay,
        latest.current.beat,
        () => setFailed(true),
      );
      scene.current.update(latest.current.beat, latest.current.overview);
    } catch {
      mount.current.replaceChildren();
      setFailed(true);
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, [replay, retry]);
  useEffect(() => {
    scene.current?.update(beat, overview);
  }, [beat, overview]);
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
