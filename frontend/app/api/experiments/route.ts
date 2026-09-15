import { backendUrl, safeJsonResponse } from "@/lib/api-proxy";

export async function POST(request: Request) {
  const body = await request.text();
  try {
    const response = await fetch(backendUrl("/api/experiments"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    return safeJsonResponse(response, await response.text());
  } catch {
    return Response.json(
      { detail: "No se pudo iniciar el experimento." },
      { status: 502 },
    );
  }
}
