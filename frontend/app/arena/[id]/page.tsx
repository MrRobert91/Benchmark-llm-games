import Link from "next/link";
import { notFound } from "next/navigation";

import { ReplayViewer } from "@/components/ReplayViewer";
import { getReplay } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ArenaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const replay = await getReplay(id);
  if (!replay) notFound();

  const scripted = replay.backend === "scripted";

  return (
    <>
      <section style={{ marginTop: 34, marginBottom: 22 }}>
        <Link href="/arena" className="link" style={{ fontSize: 13, color: "var(--text-dim)" }}>
          ← Todas las partidas
        </Link>
        <div className="game-head">
          <div>
            <h1 style={{ fontSize: 28, marginBottom: 8, marginTop: 12 }}>
              El consejo de los laboratorios
            </h1>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="tag">{replay.players.length} laboratorios</span>
              <span className="tag">{replay.rounds.length} rondas</span>
              <span className="tag">semilla {replay.seed}</span>
              <span className="tag">
                {scripted ? "agentes guionizados" : `modelos reales · ${replay.backend}`}
              </span>
            </div>
          </div>
        </div>
      </section>

      {scripted && (
        <p className="note" style={{ marginBottom: 22 }}>
          Esta partida la jugaron los agentes guionizados de referencia: las cuatro
          estrategias del modelo evolutivo reducido de <em>Falling Behind</em>. No son
          modelos de lenguaje, y su diálogo se genera a partir del estado de la partida. Para
          jugar con modelos reales por OpenRouter, ver el README.
        </p>
      )}

      <ReplayViewer replay={replay} />
    </>
  );
}
