import { getReplayTraces } from "@/lib/data";

export async function GET(_request: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return Response.json({detail: "Identificador inválido"}, {status: 400});
  try {
    const traces = await getReplayTraces(id);
    if (!traces) return Response.json({detail: "No hay trazas guardadas para esta partida."}, {status: 404});
    return Response.json(traces, {headers: {"Cache-Control": "no-store"}});
  } catch {
    return Response.json({detail: "Las trazas estarán disponibles al terminar la ejecución."}, {status: 409});
  }
}
