import { backendUrl, proxyErrorResponse, safeJsonResponse } from "@/lib/api-proxy";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const body = await request.text();
  try {
    const response = await fetch(backendUrl("/api/runs"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-moloch-request-id": requestId,
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(50_000),
    });
    return safeJsonResponse(response, await response.text(), requestId);
  } catch (error) {
    console.error(
      `run.proxy.failed request_id=${requestId} error_type=${error instanceof Error ? error.name : "unknown"}`,
    );
    return proxyErrorResponse(
      "No se pudo contactar con el runner. La partida no se creó; vuelve a intentarlo.",
      requestId,
    );
  }
}
