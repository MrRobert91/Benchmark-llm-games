import { backendUrl, safeJsonResponse } from "@/lib/api-proxy";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const response = await fetch(
      backendUrl(`/api/experiments/${encodeURIComponent(id)}`),
      { cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    return safeJsonResponse(response, await response.text());
  } catch {
    return Response.json(
      { detail: "No se pudo consultar el experimento." },
      { status: 502 },
    );
  }
}
