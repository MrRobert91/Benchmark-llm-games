const API_BASE_URL = (
  process.env.MOLOCH_API_URL ??
  process.env.API_URL ??
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

export function backendUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export function safeJsonResponse(response: Response, body: string): Response {
  return new Response(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
