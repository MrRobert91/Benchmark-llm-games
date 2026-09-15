import Link from "next/link";
import { notFound } from "next/navigation";

import { ReplayViewer } from "@/components/ReplayViewer";
import { LiveArena } from "@/components/LiveArena";
import { getReplay, getWebRun } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ArenaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const run = await getWebRun(id);
  if (run) {
    if (run.benchmark_version !== "moloch-arena-v1-paper-2608.01193v1") notFound();
    return (
      <>
        <section style={{ marginTop: 34, marginBottom: 22 }}>
          <Link href="/arena" className="link" style={{ fontSize: 13, color: "var(--text-dim)" }}>
            ← Todas las partidas
          </Link>
          <div className="game-head">
            <div>
              <h1 style={{ fontSize: 28, marginBottom: 8, marginTop: 12 }}>
                Moloch Arena V1 · carrera del paper
              </h1>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="tag">{run.models.length} laboratorios</span>
                <span className="tag">OpenRouter · ejecución web</span>
                <span className="tag">semilla {run.seed}</span>
                {run.risk_treatment !== null && run.risk_treatment !== undefined && (
                  <span className="tag">riesgo {Math.round(run.risk_treatment * 100)}%</span>
                )}
                <span className="tag">
                  aportación de{" "}
                  {run.contributor.url ? (
                    <a href={run.contributor.url} target="_blank" rel="nofollow noreferrer">
                      {run.contributor.nick} ↗
                    </a>
                  ) : run.contributor.nick}
                </span>
              </div>
            </div>
          </div>
        </section>
        <LiveArena initialRun={run} />
      </>
    );
  }
  const replay = await getReplay(id);
  if (!replay || replay.benchmark_version !== "moloch-arena-v1-paper-2608.01193v1") notFound();

  const scripted = replay.backend.includes("scripted");

  return (
    <>
      <section style={{ marginTop: 34, marginBottom: 22 }}>
        <Link href="/arena" className="link" style={{ fontSize: 13, color: "var(--text-dim)" }}>
          ← Todas las partidas
        </Link>
        <div className="game-head">
          <div>
            <h1 style={{ fontSize: 28, marginBottom: 8, marginTop: 12 }}>
              Moloch Arena V1 · carrera del paper
            </h1>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="tag">{replay.players.length} laboratorios</span>
              <span className="tag">{replay.rounds.length} rondas</span>
              <span className="tag">semilla {replay.seed}</span>
              <span className="tag">
                {scripted ? "agentes guionizados" : `modelos reales · ${replay.backend}`}
              </span>
              {replay.risk_treatment !== undefined && (
                <span className="tag">riesgo {Math.round(replay.risk_treatment * 100)}%</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {scripted && (
        <p className="note" style={{ marginBottom: 22 }}>
          Esta partida la jugaron los agentes guionizados de referencia: las cuatro
          estrategias del modelo evolutivo reducido de <em>Falling Behind</em>. Son un ancla
          determinista del benchmark, no modelos de lenguaje.
        </p>
      )}

      <ReplayViewer replay={replay} />
    </>
  );
}
