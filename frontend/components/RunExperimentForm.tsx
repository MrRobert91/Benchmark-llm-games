"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { BenchmarkVersion, ModelCatalog, OpenRouterModel } from "@/lib/types";

const PAPER_V1: BenchmarkVersion = "moloch-arena-v1-paper-2608.01193v1";

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
  const [models, setModels] = useState<string[]>(["", ""]);
  const [benchmarkVersion, setBenchmarkVersion] = useState<BenchmarkVersion>(PAPER_V1);
  const [riskTreatment, setRiskTreatment] = useState(0.6);
  const [mode, setMode] = useState<"single" | "smoke">("single");
  const [seed, setSeed] = useState(20260915);
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
        setBenchmarkVersion(data.default_benchmark_version ?? PAPER_V1);
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
    const expectedCallsPerSeat = limits.calls_per_player_expected ?? 9;
    const seatModels =
      mode === "smoke"
        ? Array.from({ length: 6 }, () => selected[0]).filter(Boolean)
        : selected;
    const seatCount = mode === "smoke" ? 6 : models.length;
    const costFor = (model: OpenRouterModel, calls: number) =>
      calls *
      (limits.estimated_input_tokens_per_call * model.pricing.prompt +
        limits.estimated_output_tokens_per_call * model.pricing.completion +
        model.pricing.request);
    return {
      expectedCalls: seatCount * expectedCallsPerSeat,
      maxCalls: seatCount * limits.calls_per_player_max,
      expectedTokens:
        seatCount *
        expectedCallsPerSeat *
        (limits.estimated_input_tokens_per_call + limits.estimated_output_tokens_per_call),
      maxTokens:
        seatCount *
        limits.calls_per_player_max *
        (limits.estimated_input_tokens_per_call + limits.estimated_output_tokens_per_call),
      expectedCost: seatModels.reduce(
        (sum, model) => sum + costFor(model, expectedCallsPerSeat),
        0,
      ),
      maxCost: seatModels.reduce(
        (sum, model) => sum + costFor(model, limits.calls_per_player_max),
        0,
      ),
    };
  }, [limits, mode, models.length, selected]);

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
      const isSmoke = mode === "smoke";
      const response = await fetch(isSmoke ? "/api/experiments" : "/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          nick,
          url: url.trim() ? `https://${url.trim()}` : null,
          models: isSmoke ? [models[0]] : models,
          budget_usd: budget,
          benchmark_version: benchmarkVersion,
          risk_treatment: riskTreatment,
          seed,
          master_seed: seed,
          preset: isSmoke ? "smoke-cheap-2p" : undefined,
          players: isSmoke ? 2 : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "No se pudo iniciar la partida.");
      setApiKey("");
      router.push(isSmoke ? `/experiments/${data.experiment_id}` : `/arena/${data.game_id}`);
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
            <h2>Elige versión y laboratorios</h2>
            <p>V1 reproduce las reglas publicadas y admite entre 2 y 5 asientos.</p>
          </div>
        </div>
        <div className="field-grid" style={{ marginBottom: 20 }}>
          <label>
            Versión del benchmark
            <select
              value={benchmarkVersion}
              onChange={(event) => {
                const version = event.target.value as BenchmarkVersion;
                setBenchmarkVersion(version);
                if (version !== PAPER_V1) setMode("single");
              }}
            >
              {catalog?.benchmark_versions?.map((version) => (
                <option key={version.benchmark_version} value={version.benchmark_version}>
                  {version.title}
                </option>
              )) ?? <option value={PAPER_V1}>Moloch Arena V1 · paper</option>}
            </select>
          </label>
          <label>
            Riesgo máximo asignado
            <select
              value={riskTreatment}
              onChange={(event) => setRiskTreatment(Number(event.target.value))}
              disabled={benchmarkVersion !== PAPER_V1}
            >
              <option value={0.1}>Bajo · 10%</option>
              <option value={0.6}>Medio · 60%</option>
              <option value={0.9}>Alto · 90%</option>
            </select>
          </label>
        </div>
        {benchmarkVersion === PAPER_V1 && (
          <div className="key-safety" style={{ marginBottom: 20 }}>
            <strong>Protocolo fiel al mecanismo del paper.</strong>
            <p>
              Una decisión sellada SAFE/UNSAFE por jugador y ronda; horizonte geométrico
              oculto, pagos de etapa, premio compartido y setback privado. La conversación
              del consejo se conserva solo como replay visual y no cambia las decisiones.
            </p>
          </div>
        )}
        <div className="field-grid" style={{ marginBottom: 20 }}>
          <label>
            Tipo de ejecución
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as "single" | "smoke")}
            >
              <option value="single">Carrera individual</option>
              {benchmarkVersion === PAPER_V1 && (
                <option value="smoke">Smoke reproducible · 3 riesgos</option>
              )}
            </select>
          </label>
          <label>
            Semilla maestra
            <input
              type="number"
              min={0}
              step={1}
              value={seed}
              onChange={(event) => setSeed(Number(event.target.value))}
              required
            />
          </label>
        </div>
        {mode === "smoke" && (
          <p className="note" style={{ marginBottom: 20 }}>
            Ejecuta el primer modelo en self-play de dos jugadores una vez con riesgo 10%,
            60% y 90%. Es diagnóstico, no evidencia confirmatoria.
          </p>
        )}
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
                {models.length > 2 && (
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
          Es una estimación: en V1 el horizonte no tiene máximo matemático (su media es 9
          rondas). Los tokens de razonamiento cuentan como salida y OpenRouter decide el
          proveedor final. Si se alcanza un límite operativo, la carrera queda incompleta y
          nunca entra en los resultados admitidos.
        </p>
      </section>

      {error && <p className="run-error" role="alert">{error}</p>}
      <button className="btn btn-primary run-submit" disabled={submitting || !catalog}>
        {submitting ? "Validando clave y reservando asiento…" : "Lanzar partida en directo →"}
      </button>
    </form>
  );
}
