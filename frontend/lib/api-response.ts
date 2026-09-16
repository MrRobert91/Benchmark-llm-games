export interface ApiFailure {
  detail?: string;
  request_id?: string;
  retryable?: boolean;
}

export async function readApiResponse<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // El proxy normaliza respuestas no JSON, pero este fallback también cubre proxies/CDN
    // que puedan contestar antes de que la petición llegue a Next.js.
  }

  if (response.ok && payload !== null) return payload as T;

  const failure = isFailure(payload) ? payload : {};
  const reference =
    failure.request_id || response.headers.get("x-moloch-request-id") || undefined;
  const detail = failure.detail || fallback;
  const status = response.status ? `HTTP ${response.status}` : "sin respuesta HTTP";
  const suffix = reference ? ` Referencia: ${reference}.` : "";
  throw new Error(`${detail} (${status}).${suffix}`);
}

function isFailure(value: unknown): value is ApiFailure {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
