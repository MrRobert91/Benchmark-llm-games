"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { ModelCatalog, OpenRouterModel } from "@/lib/types";

function usd(value: number): string {
  if (value === 0) return "gratis";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function perMillion(value: number): string {
  return value === 0 ? "$0" : `$${(value * 1_000_000).toFixed(2)}`;
}

export function RunExperimentForm() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [models, setModels] = useState<string[]>(["", "", ""]);
  const [nick, setNick] = useState("");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [budget, setBudget] = useState(0.5);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/openrouter/models", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "No se pudo cargar el catálogo.");
        return data as ModelCatalog;
      })
      .then((data) => {
        setCatalog(data);
        setBudget(data.limits.default_budget_usd);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const byId = useMemo(
    () => new Map(catalog?.models.map((model) => [model.id, model]) ?? []),
    [catalog],
  );
  const selected = models.map((id) => byId.get(id)).filter(Boolean) as OpenRouterModel[];
  const limits = catalog?.limits;
  const estimate = useMemo(() => {
    if (!limits) return null;
    const expectedCallsPerSeat = Math.round(limits.calls_per_player_max * 0.7);
    const costFor = (model: OpenRouterModel, calls: number) =>
      calls *
      (limits.estimated_input_tokens_per_call * model.pricing.prompt +
        limits.estimated_output_tokens_per_call * model.pricing.completion +
        model.pricing.request);
    return {
      expectedCalls: models.length * expectedCallsPerSeat,
      maxCalls: models.length * limits.calls_per_player_max,
      expectedTokens:
        models.length *
        expectedCallsPerSeat *
        (limits.estimated_input_tokens_per_call + limits.estimated_output_tokens_per_call),
      maxTokens:
        models.length *
        limits.calls_per_player_max *
        (limits.estimated_input_tokens_per_call + limits.estimated_output_tokens_per_call),
      expectedCost: selected.reduce(
        (sum, model) => sum + costFor(model, expectedCallsPerSeat),
        0,
      ),
      maxCost: selected.reduce(
        (sum, model) => sum + costFor(model, limits.calls_per_player_max),
        0,
      ),
    };
  }, [limits, models.length, selected]);

  const updateModel = (index: number, value: string) =>
    setModels((current) => current.map((model, i) => (i === index ? value : model)));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (models.some((model) => !byId.has(model))) {
      setError("Selecciona todos los modelos desde el catálogo de OpenRouter.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          nick,
          url: url.trim() ? `https://${url.trim()}` : null,
          models,
          budget_usd: budget,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "No se pudo iniciar la partida.");
      setApiKey("");
      router.push(`/arena/${data.game_id}`);
    } catch (reason) {
      setApiKey("");
      setError(reason instanceof Error ? reason.message : "No se pudo iniciar la partida.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="run-form" onSubmit={submit}>
      <section className="card run-section">
        <div className="run-section-head">
          <span className="run-step">01</span>
          <div>
            <h2>Elige los laboratorios</h2>
            <p>Entre 3 y 5 asientos. Puedes repetir un modelo tantas veces como quieras.</p>
          </div>
        </div>
        {!catalog && !error && <p className="note">Cargando el catálogo en tiempo real…</p>}
        <datalist id="openrouter-models">
          {catalog?.models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name} · {model.provider}
            </option>
          ))}
        </datalist>
        <div className="model-seats">
          {models.map((modelId, index) => {
            const model = byId.get(modelId);
            return (
              <div className="model-seat" key={index}>
                <label htmlFor={`model-${index}`}>Laboratorio {index + 1}</label>
                <input
                  id={`model-${index}`}
                  list="openrouter-models"
                  value={modelId}
                  onChange={(event) => updateModel(index, event.target.value)}
                  placeholder="Busca por nombre o proveedor…"
                  required
                  autoComplete="off"
                />
                {model && (
                  <p>
                    {model.provider} · {(model.context_length / 1000).toFixed(0)}k contexto ·
                    entrada {perMillion(model.pricing.prompt)}/M · salida{" "}
                    {perMillion(model.pricing.completion)}/M
                  </p>
                )}
                {models.length > 3 && (
                  <button
                    type="button"
                    className="seat-remove"
                    onClick={() => setModels((current) => current.filter((_, i) => i !== index))}
                  >
                    Quitar asiento
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {models.length < 5 && (
          <button type="button" className="btn" onClick={() => setModels((m) => [...m, ""])}>
            + Añadir laboratorio
          </button>
        )}
      </section>

      <section className="card run-section">
        <div className="run-section-head">
          <span className="run-step">02</span>
          <div>
            <h2>Tu aportación</h2>
            <p>Cada partida es una colaboración independiente. No hay cuenta ni perfil.</p>
          </div>
        </div>
        <div className="field-grid">
          <label>
            Nick público
            <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={40} required />
          </label>
          <label>
            Web pública <span>(opcional, solo HTTPS)</span>
            <div className="website-input">
              <span aria-hidden="true">https://</span>
              <input
                type="text"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value.replace(/^https?:\/\//i, ""))}
                placeholder="www.tu-web.example"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
          </label>
        </div>
      </section>

      <section className="card run-section key-section">
        <div className="run-section-head">
          <span className="run-step">03</span>
          <div>
            <h2>Autoriza esta partida</h2>
            <p>La ejecución usa tu saldo de OpenRouter y nunca nuestra cuenta.</p>
          </div>
        </div>
        <div className="key-safety">
          <strong>Tu clave es efímera.</strong>
          <p>
            Viaja cifrada por HTTPS al backend, se valida directamente con OpenRouter, vive
            únicamente en memoria mientras esta partida está en cola o ejecutándose y se
            sobrescribe al terminar o fallar. No se guarda en SQLite, archivos, analítica ni
            logs. Para máxima protección, crea una clave dedicada con límite de gasto en{" "}
            <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">
              OpenRouter
            </a>
            .
          </p>
        </div>
        <div className="field-grid key-fields">
          <label>
            OpenRouter API key
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-…"
              minLength={10}
              required
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            Presupuesto máximo de esta partida
            <div className="budget-input">
              <span>$</span>
              <input
                type="number"
                min={limits?.min_budget_usd ?? 0.5}
                max={limits?.max_budget_usd ?? 10}
                step={0.05}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                required
              />
              <span>USD</span>
            </div>
          </label>
        </div>
        {estimate && (
          <div className="estimate-grid" aria-label="Estimación de consumo">
            <div><span>Participantes</span><strong>{models.length}</strong></div>
            <div>
              <span>Llamadas aproximadas</span>
              <strong>{estimate.expectedCalls}–{estimate.maxCalls}</strong>
            </div>
            <div>
              <span>Tokens aproximados</span>
              <strong>{Math.round(estimate.expectedTokens / 1000)}k–{Math.round(estimate.maxTokens / 1000)}k</strong>
            </div>
            <div>
              <span>Precio estimado</span>
              <strong>{selected.length === models.length ? `${usd(estimate.expectedCost)}–${usd(estimate.maxCost)}` : "elige modelos"}</strong>
            </div>
          </div>
        )}
        <p className="note">
          Es una estimación: la partida puede acabar antes, los tokens de razonamiento cuentan
          como salida y OpenRouter decide el proveedor final. El servidor limita tiempo, tamaño
          de respuesta y presupuesto antes de cada nueva llamada; la protección más estricta es
          el límite configurado en tu propia clave.
        </p>
      </section>

      {error && <p className="run-error" role="alert">{error}</p>}
      <button className="btn btn-primary run-submit" disabled={submitting || !catalog}>
        {submitting ? "Validando clave y reservando asiento…" : "Lanzar partida en directo →"}
      </button>
    </form>
  );
}
