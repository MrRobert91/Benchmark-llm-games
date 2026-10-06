"use client";

import { useEffect, useState } from "react";

import { readApiResponse } from "@/lib/api-response";
import type { LiveRunEvent, Replay, WebRun } from "@/lib/types";
import { ReplayViewer } from "./ReplayViewer";

export function LiveArena({ initialRun }: { initialRun: WebRun }) {
  const [run, setRun] = useState(initialRun);
  const [liveEvents, setLiveEvents] = useState<LiveRunEvent[]>([]);
  const [connection, setConnection] = useState<"connecting" | "live" | "polling">(
    initialRun.status === "completed" || initialRun.status === "failed" ? "live" : "connecting",
  );

  useEffect(() => {
    if (run.status === "completed" || run.status === "failed") return;
    const source = new EventSource(`/api/runs/${encodeURIComponent(run.game_id)}/events`);
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/runs/${encodeURIComponent(run.game_id)}`, {
          cache: "no-store",
        });
        const latest = await readApiResponse<WebRun>(
          response,
          "No se pudo recuperar el estado de la partida.",
        );
        if (!stopped) setRun(latest);
      } catch {
        // Se mantiene el último estado confirmado y se vuelve a intentar en el siguiente ciclo.
      }
    };

    const startPolling = () => {
      if (pollTimer || stopped) return;
      source.close();
      setConnection("polling");
      void poll();
      pollTimer = setInterval(poll, 2_000);
    };

    source.addEventListener("run", (event) => {
      let payload: { run: WebRun; events?: LiveRunEvent[] };
      try {
        payload = JSON.parse((event as MessageEvent).data) as typeof payload;
      } catch {
        startPolling();
        return;
      }
      setRun(payload.run);
      if (payload.events?.length) {
        setLiveEvents((current) => {
          const bySequence = new Map(current.map((entry) => [entry.seq, entry]));
          for (const entry of payload.events ?? []) bySequence.set(entry.seq, entry);
          return [...bySequence.values()].sort((a, b) => a.seq - b.seq);
        });
      }
      setConnection("live");
      if (payload.run.status === "completed" || payload.run.status === "failed") source.close();
    });
    source.onerror = startPolling;
    return () => {
      stopped = true;
      source.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [run.game_id, run.status]);

  const terminal = run.status === "completed" || run.status === "failed";
  const excluded = run.status === "completed" && Boolean(run.replay?.metrics.contaminated);
  const affectedModels = [...new Set(run.replay?.parse_incidents?.map((item) => item.model) ?? [])];
  return (
    <>
      <div className="live-status card" data-status={excluded ? "excluded" : run.status}>
        <div>
          <span className="live-pulse" />
          <strong>
            {run.status === "queued"
              ? "En cola"
              : run.status === "running"
                ? "Partida en directo"
                : run.status === "completed"
                  ? excluded ? "Resultado excluido" : "Partida completada"
                  : "Ejecución incompleta"}
          </strong>
          <p>{run.phase}</p>
        </div>
        <div className="live-usage">
          <span>{run.calls} llamadas</span>
          <span>{(run.prompt_tokens + run.completion_tokens).toLocaleString("es-ES")} tokens</span>
          <span>${run.spent_usd.toFixed(4)} / ${run.budget_limit.toFixed(2)}</span>
          {!terminal && (
            <span>
              {connection === "polling"
                ? "Directo degradado · actualizando"
                : connection === "connecting"
                  ? "Conectando…"
                  : "Conectado"}
            </span>
          )}
        </div>
      </div>

      {run.status === "failed" && (
        <div className="run-failed" role="alert">
          <strong>La partida no pudo completarse.</strong>
          <p>{run.error_message}</p>
          <p>No se incluye en la comparativa de modelos.</p>
          {run.error_message?.includes("HTTP 403") && (
            <p>
              Revisa los permisos, Privacy, Guardrails y la confirmación de edad en las{" "}
              <a href="https://openrouter.ai/settings/preferences" target="_blank" rel="noreferrer">
                preferencias de OpenRouter ↗
              </a>
              .
            </p>
          )}
          <a className="btn" href="/run">Preparar nueva partida</a>
        </div>
      )}

      {excluded && (
        <div className="run-excluded" role="alert">
          <strong>La partida terminó, pero no puede compararse con otras.</strong>
          <p>
            {run.replay?.metrics.parse_failures ?? 0} respuestas tenían un formato ilegible
            {affectedModels.length ? ` (${affectedModels.join(", ")})` : ""}. La partida queda
            fuera de las medias, pero puedes revisar la repetición y sus datos.
          </p>
        </div>
      )}

      {run.replay?.players?.length ? (
        <ReplayViewer
          replay={run.replay as Replay}
          live={run.status !== "completed"}
          completed={run.status === "completed"}
          tracesAvailable={terminal}
          thinking={run.status === "running" && liveEvents.at(-1)?.event_type === "thinking"}
          liveEvents={liveEvents}
        />
      ) : (
        <div className="queued-council card">
          <div className="queue-orbit" aria-hidden><i /><i /><i /></div>
          <h2>Preparando la partida</h2>
          <p>
            La clave ya se ha validado y solo permanece en la memoria del servidor.
            La partida empezará cuando haya capacidad disponible.
          </p>
          <div className="queued-models">
            {run.models.map((model, index) => <span key={`${model}-${index}`}>{model}</span>)}
          </div>
        </div>
      )}
    </>
  );
}
