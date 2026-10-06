"use client";

import { useEffect, useState } from "react";
import type { PlayerMeta } from "@/lib/types";
import { readableReasoning, roundTraces, type ModelTrace, type ReplayTraces as TraceData } from "@/lib/replay-traces";

function CallEvidence({call}: {call: ModelTrace}) {
  const reasoning = readableReasoning(call);
  return <article className="trace-call">
    <header><strong>Llamada {call.call_index} · intento {call.attempt ?? "—"}</strong><span>{call.phase} · {call.finish_reason ?? (call.status_code ? `HTTP ${call.status_code}` : "sin respuesta final")}</span></header>
    <p className="note">Modelo servido: {call.served_model ?? call.model} · Proveedor: {call.provider ?? "no informado"} · Razonamiento solicitado: {call.reasoning_mode ?? "no informado"} · Tokens de razonamiento: {call.reasoning_tokens ?? "no informados"}</p>
    <h4>Respuesta original</h4>
    {call.response_content ? <pre>{call.response_content}</pre> : <p>El proveedor no devolvió texto de respuesta en este intento.</p>}
    <h4>Razonamiento devuelto por el proveedor</h4>
    {reasoning.length ? reasoning.map((text,i) => <pre key={i}>{text}</pre>) : <p>No se recibió razonamiento legible en este intento. Esto no demuestra ausencia de procesamiento interno.</p>}
    {call.encrypted_blocks > 0 && <p className="note">El proveedor también devolvió {call.encrypted_blocks} bloque(s) de razonamiento cifrado. Su contenido no se puede leer.</p>}
    {call.reasoning_details.some(d => d.type.includes("summary")) && <p className="note">El proveedor identifica parte del texto como un resumen de razonamiento.</p>}
    <details><summary>Ver el prompt completo de esta llamada</summary>{call.request_messages.length ? call.request_messages.map((message,i) => <div key={i}><h4>{message.role}</h4><pre>{message.content}</pre></div>) : <p>No se conservó el prompt en este registro.</p>}</details>
  </article>;
}

export function ReplayTraces({gameId, players, round, available, final}: {gameId: string; players: PlayerMeta[]; round: number; available: boolean; final: boolean}) {
  const [data,setData] = useState<TraceData | null>(null);
  const [error,setError] = useState<string | null>(null);
  const [retry,setRetry] = useState(0);
  const [player,setPlayer] = useState("all");
  const [selectedRound,setSelectedRound] = useState(round);
  useEffect(() => {setSelectedRound(round);},[round,gameId]);
  useEffect(() => {
    setData(null); setError(null);
    if (!available) return;
    const controller = new AbortController();
    fetch(`/api/games/${encodeURIComponent(gameId)}/traces`, {signal:controller.signal}).then(async response => {
      if (!response.ok) throw new Error(response.status === 404 ? "No hay trazas guardadas para esta partida." : "No se pudieron cargar las trazas. Puedes volver a intentarlo.");
      return response.json() as Promise<TraceData>;
    }).then(setData).catch(e => {if (!controller.signal.aborted) setError(e.message);});
    return () => controller.abort();
  },[gameId,available,retry]);
  const calls = data?.calls ?? [];
  const rounds = [...new Set(calls.map(c => c.round).filter((r): r is number => r !== null && (final || r <= round)))].sort((a,b) => a-b);
  return <section className="replay-traces" aria-label="Respuestas y razonamiento de los modelos">
    <h3>Respuestas y razonamiento · {selectedRound > 0 ? `ronda ${selectedRound}` : "inicio"}</h3>
    <p>Texto registrado durante la ejecución, sin recortes. El razonamiento puede ser una explicación o un resumen del proveedor; no da acceso completo al proceso interno del modelo. Las respuestas originales pueden usar códigos P/Q que el replay traduce a SAFE/UNSAFE.</p>
    {!available ? <p>Las trazas se podrán consultar al terminar la ejecución.</p> : error ? <div role="status"><p>{error}</p><button className="btn" onClick={() => setRetry(r => r+1)}>Reintentar</button></div> : !data ? <p role="status">Cargando las trazas guardadas…</p> : <>
      <p className="note">{calls.length} llamadas registradas, incluidos reintentos. {data.source === "campaign-archive" ? "Fuente: archivo congelado de la campaña." : "Fuente: registros de la ejecución."}</p>
      {rounds.length > 0 && <div><label htmlFor={`trace-round-${gameId}`}>Ronda</label><select id={`trace-round-${gameId}`} value={selectedRound} onChange={e => setSelectedRound(Number(e.target.value))}><option value={0}>Selecciona una ronda</option>{rounds.map(r => <option key={r} value={r}>Ronda {r}</option>)}</select></div>}
      {selectedRound === 0 ? <p>{final ? "Selecciona una ronda para consultar las llamadas registradas." : "Avanza hasta el revelado de una ronda para consultar sus respuestas."}</p> : <>
        <div><label htmlFor={`trace-player-${gameId}`}>Jugador</label><select id={`trace-player-${gameId}`} value={player} onChange={e => setPlayer(e.target.value)}><option value="all">Todos los jugadores</option>{players.map(p => <option key={p.player_id} value={p.player_id}>{p.label} · {p.model}</option>)}</select></div>
        {players.filter(p => player === "all" || p.player_id === player).map(p => {
          const entries = roundTraces(calls,selectedRound,p.player_id);
          return <details key={`${gameId}-${selectedRound}-${p.player_id}`} className="trace-player" open><summary>{p.label} · {p.model} · {entries.length} llamadas</summary>
            {entries.length ? entries.map(c => <CallEvidence key={c.call_index} call={c}/>) : <p>No hay llamadas guardadas para este jugador en esta ronda. Una estrategia programada no genera respuestas de un modelo.</p>}
          </details>;
        })}
      </>}
      {final && calls.some(c => c.round === null) && <details><summary>Llamadas sin ronda identificada</summary>{calls.filter(c => c.round === null).map(c => <CallEvidence key={c.call_index} call={c}/>)}</details>}
    </>}
  </section>;
}
