import { backendUrl, safeJsonResponse } from "@/lib/api-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(backendUrl("/api/openrouter/models"), {
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    return safeJsonResponse(response, await response.text());
  } catch {
    return Response.json(
      { detail: "No se pudo cargar el catálogo de OpenRouter." },
      { status: 502 },
    );
  }
}
