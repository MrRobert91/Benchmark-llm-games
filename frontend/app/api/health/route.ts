const API_BASE_URL = (
  process.env.MOLOCH_API_URL ??
  process.env.API_URL ??
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new Error(`backend returned ${response.status}`);
    }

    return Response.json({
      status: "ok",
      service: "moloch-frontend",
      backend: await response.json(),
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        service: "moloch-frontend",
        backend: error instanceof Error ? error.message : "unavailable",
      },
      { status: 503 },
    );
  }
}

