import { backendUrl, proxyErrorResponse, safeJsonResponse } from "@/lib/api-proxy";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const requestId = crypto.randomUUID();
  try {
    const response = await fetch(backendUrl(`/api/runs/${encodeURIComponent(id)}`), {
      headers: { "x-moloch-request-id": requestId },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return safeJsonResponse(response, await response.text(), requestId);
  } catch (error) {
    console.error(
      `run.status.proxy.failed request_id=${requestId} run_id=${id} error_type=${error instanceof Error ? error.name : "unknown"}`,
    );
    return proxyErrorResponse("Ejecución no disponible temporalmente.", requestId);
  }
}
