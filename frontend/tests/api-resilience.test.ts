import assert from "node:assert/strict";
import test from "node:test";

import { safeJsonResponse } from "../lib/api-proxy.ts";
import { readApiResponse } from "../lib/api-response.ts";

test("the proxy converts an upstream HTML failure into actionable JSON", async () => {
  const upstream = new Response("<html>bad gateway</html>", { status: 502 });
  const response = safeJsonResponse(upstream, await upstream.text(), "req-123");
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(response.headers.get("x-moloch-request-id"), "req-123");
  assert.equal(body.detail, "El servicio respondió con un formato inesperado.");
  assert.equal(body.request_id, "req-123");
  assert.equal(body.retryable, true);
});

test("the client preserves backend detail, HTTP status and correlation id", async () => {
  const response = Response.json(
    { detail: "La cola está completa.", request_id: "req-queue" },
    { status: 503 },
  );

  await assert.rejects(
    () => readApiResponse(response, "No se pudo iniciar."),
    /La cola está completa\. \(HTTP 503\)\. Referencia: req-queue\./,
  );
});

test("the client handles a non-JSON edge response without leaking its body", async () => {
  const response = new Response("proxy stack trace that must stay hidden", { status: 504 });
  await assert.rejects(
    () => readApiResponse(response, "No se pudo iniciar la partida."),
    /No se pudo iniciar la partida\. \(HTTP 504\)\./,
  );
});
