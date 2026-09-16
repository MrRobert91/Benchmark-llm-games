const API_BASE_URL = (
  process.env.MOLOCH_API_URL ??
  process.env.API_URL ??
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

export function backendUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export function safeJsonResponse(
  response: Response,
  body: string,
  requestId?: string,
): Response {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json(
      {
        detail: "El servicio respondió con un formato inesperado.",
        request_id: requestId,
        retryable: true,
      },
      {
        status: 502,
        headers: responseHeaders(requestId),
      },
    );
  }

  if (!response.ok && payload && typeof payload === "object" && !Array.isArray(payload)) {
    payload = {
      ...(payload as Record<string, unknown>),
      request_id: requestId,
      retryable: [408, 425, 429, 500, 502, 503, 504].includes(response.status),
    };
  }
  return Response.json(payload, {
    status: response.status,
    headers: responseHeaders(requestId),
  });
}

export function proxyErrorResponse(detail: string, requestId: string): Response {
  return Response.json(
    { detail, request_id: requestId, retryable: true },
    { status: 502, headers: responseHeaders(requestId) },
  );
}

function responseHeaders(requestId?: string): HeadersInit {
  return {
    "cache-control": "no-store",
    ...(requestId ? { "x-moloch-request-id": requestId } : {}),
  };
}
