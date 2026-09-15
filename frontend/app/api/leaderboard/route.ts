import { backendUrl, safeJsonResponse } from "@/lib/api-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(backendUrl("/api/leaderboard"), {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    return safeJsonResponse(response, await response.text());
  } catch {
    return Response.json(
      { detail: "No se pudo actualizar el leaderboard V1." },
      { status: 502 },
    );
  }
}
