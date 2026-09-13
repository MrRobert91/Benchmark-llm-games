import { backendUrl } from "@/lib/api-proxy";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const response = await fetch(
      backendUrl(`/api/runs/${encodeURIComponent(id)}/events`),
      { cache: "no-store" },
    );
    if (!response.ok || !response.body) {
      return Response.json({ detail: "Directo no disponible." }, { status: response.status });
    }
    return new Response(response.body, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  } catch {
    return Response.json({ detail: "Directo no disponible." }, { status: 502 });
  }
}
