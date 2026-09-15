"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

interface ExperimentCell {
  cell_id: string;
  model: string;
  risk_treatment: number;
  repetition: number;
  game_id: string | null;
  status: string;
}

interface Experiment {
  experiment_id: string;
  manifest_hash: string;
  preset: string;
  protocol_version: string;
  status: string;
  cells: ExperimentCell[];
}

export default function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/experiments/${encodeURIComponent(id)}`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "No se pudo cargar el experimento.");
        if (!active) return;
        setExperiment(data as Experiment);
        setError("");
        if (!["completed", "incomplete"].includes(data.status)) {
          timer = setTimeout(refresh, 1000);
        }
      } catch (reason) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Error desconocido");
        timer = setTimeout(refresh, 3000);
      }
    };
    void refresh();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  return (
    <>
      <section className="run-hero">
        <p className="eyebrow">Experimento reproducible</p>
        <h1>{experiment?.experiment_id ?? id}</h1>
        <p className="lede">
          {experiment
            ? `${experiment.preset} · ${experiment.protocol_version}`
            : "Cargando manifiesto y estado de las celdas…"}
        </p>
        {experiment && (
          <p className="note">Manifest SHA-256: <code>{experiment.manifest_hash}</code></p>
        )}
      </section>
      {error && <p className="run-error" role="alert">{error}</p>}
      {experiment && (
        <section>
          <div className="card scroll-x" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ paddingLeft: 22 }}>Modelo</th>
                  <th className="num">Riesgo</th>
                  <th className="num">Repetición</th>
                  <th>Estado</th>
                  <th style={{ paddingRight: 22 }}>Replay</th>
                </tr>
              </thead>
              <tbody>
                {experiment.cells.map((cell) => (
                  <tr key={cell.cell_id}>
                    <td style={{ paddingLeft: 22 }}>{cell.model}</td>
                    <td className="num">{Math.round(cell.risk_treatment * 100)}%</td>
                    <td className="num">{cell.repetition}</td>
                    <td><span className="tag">{cell.status}</span></td>
                    <td style={{ paddingRight: 22 }}>
                      {cell.game_id ? <Link href={`/arena/${cell.game_id}`}>Abrir</Link> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note" style={{ marginTop: 16 }}>
            Presupuesto compartido por todas las celdas. Una carrera contaminada permanece
            visible, pero queda excluida del leaderboard V1.
          </p>
        </section>
      )}
    </>
  );
}
