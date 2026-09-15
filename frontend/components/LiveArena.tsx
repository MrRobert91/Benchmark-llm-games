"use client";

import { useEffect, useState } from "react";

import type { Replay, WebRun } from "@/lib/types";
import { ReplayViewer } from "./ReplayViewer";

export function LiveArena({ initialRun }: { initialRun: WebRun }) {
  const [run, setRun] = useState(initialRun);
  const [connection, setConnection] = useState<"connecting" | "live" | "retrying">(
    initialRun.status === "completed" || initialRun.status === "failed" ? "live" : "connecting",
  );

  useEffect(() => {
    if (run.status === "completed" || run.status === "failed") return;
    const source = new EventSource(`/api/runs/${encodeURIComponent(run.game_id)}/events`);
    source.addEventListener("run", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { run: WebRun };
      setRun(payload.run);
      setConnection("live");
      if (payload.run.status === "completed" || payload.run.status === "failed") source.close();
    });
    source.onerror = () => setConnection("retrying");
    return () => source.close();
  }, [run.game_id, run.status]);

  const terminal = run.status === "completed" || run.status === "failed";
  return (
    <>
      <div className="live-status card" data-status={run.status}>
        <div>
          <span className="live-pulse" />
          <strong>
            {run.status === "queued"
              ? "En cola"
              : run.status === "running"
                ? "Partida en directo"
                : run.status === "completed"
                  ? "Partida completada"
                  : "Ejecución incompleta"}
          </strong>
          <p>{run.phase}</p>
        </div>
        <div className="live-usage">
          <span>{run.calls} llamadas</span>
          <span>{(run.prompt_tokens + run.completion_tokens).toLocaleString("es-ES")} tokens</span>
          <span>${run.spent_usd.toFixed(4)} / ${run.budget_limit.toFixed(2)}</span>
          {!terminal && <span>{connection === "retrying" ? "Reconectando…" : "Conectado"}</span>}
        </div>
      </div>

      {run.status === "failed" && (
        <div className="run-failed" role="alert">
          <strong>La partida no pudo completarse.</strong>
          <p>{run.error_message}</p>
          <p>No se incluye en las métricas ni en el leaderboard.</p>
          <a className="btn" href="/run">Preparar nueva partida</a>
        </div>
      )}

      {run.replay?.players?.length ? (
        <ReplayViewer
          replay={run.replay as Replay}
          live={run.status !== "completed"}
          completed={run.status === "completed"}
          thinking={run.status === "running"}
        />
      ) : (
        <div className="queued-council card">
          <div className="queue-orbit" aria-hidden><i /><i /><i /></div>
          <h2>Preparando la carrera V1</h2>
          <p>
            La clave ya fue validada y permanece solamente en la memoria del proceso. La
            ejecución comenzará cuando quede libre el runner.
          </p>
          <div className="queued-models">
            {run.models.map((model, index) => <span key={`${model}-${index}`}>{model}</span>)}
          </div>
        </div>
      )}
    </>
  );
}
