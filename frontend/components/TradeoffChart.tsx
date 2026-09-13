"use client";

import { useId, useState } from "react";

import { SERIES_COLOR, shortModel, type ModelRow } from "@/lib/types";

/** Dispersión de los dos ejes del benchmark: rendimiento contra integridad.
 *
 * Serie única a propósito. Con más de tres series ninguna ordenación de la paleta supera
 * los suelos de separación en la lista de todos los pares, que es la que aplica a un
 * scatter. Como cada punto va etiquetado directamente, la identidad no la lleva el color.
 */
const W = 680;
const H = 420;
const PAD = { top: 40, right: 30, bottom: 52, left: 62 };
const CHAR_W = 6.4;

export function TradeoffChart({ rows }: { rows: ModelRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  if (rows.length === 0) return null;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const payoffs = rows.map((r) => r.avg_payoff);
  const xMin = 0;
  const xMax = Math.max(...payoffs) * 1.18 || 1;

  const x = (v: number) => PAD.left + ((v - xMin) / (xMax - xMin)) * plotW;
  const y = (v: number) => PAD.top + (1 - v) * plotH;

  const xTicks = niceTicks(xMin, xMax, 5);
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  // Etiquetas directas sin solaparse: cada una prueba posiciones hasta encontrar hueco.
  const placed = placeLabels(
    rows.map((r) => ({
      cx: x(r.avg_payoff),
      cy: y(r.avg_integrity),
      text: shortModel(r.model),
    })),
    {
      left: PAD.left,
      right: PAD.left + plotW,
      top: PAD.top - 16,
      bottom: PAD.top + plotH + 12,
    },
  );

  return (
    <figure className="chart-figure">
      <figcaption className="chart-caption">
        <h3 style={{ margin: 0, fontSize: 15 }}>Rendimiento contra integridad</h3>
        <p style={{ margin: "4px 0 0", fontSize: 13 }}>
          Cada punto es un modelo. Arriba a la derecha es lo deseable: gana puntos y cumple
          su palabra. Abajo a la derecha es el explotador: rinde rompiendo compromisos.
        </p>
      </figcaption>

      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="chart-svg"
          role="img"
          aria-label="Dispersión de modelos: pago medio en el eje horizontal, integridad en el vertical"
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
            </clipPath>
          </defs>

          {/* zona deseable, recesiva */}
          <rect
            x={x(xMax * 0.5)}
            y={y(1)}
            width={plotW - (x(xMax * 0.5) - PAD.left)}
            height={y(0.75) - y(1)}
            fill={SERIES_COLOR}
            opacity={0.05}
            clipPath={`url(#${clipId})`}
          />

          {/* rejilla */}
          {yTicks.map((t) => (
            <line
              key={`gy${t}`}
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--line-soft)"
              strokeWidth={1}
            />
          ))}
          {xTicks.map((t) => (
            <line
              key={`gx${t}`}
              y1={PAD.top}
              y2={H - PAD.bottom}
              x1={x(t)}
              x2={x(t)}
              stroke="var(--line-soft)"
              strokeWidth={1}
            />
          ))}

          {/* ejes */}
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={H - PAD.bottom}
            y2={H - PAD.bottom}
            stroke="var(--line)"
            strokeWidth={1}
          />
          <line
            x1={PAD.left}
            x2={PAD.left}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="var(--line)"
            strokeWidth={1}
          />

          {yTicks.map((t) => (
            <text
              key={`ly${t}`}
              x={PAD.left - 11}
              y={y(t) + 4}
              textAnchor="end"
              className="chart-tick"
            >
              {Math.round(t * 100)}%
            </text>
          ))}
          {xTicks.map((t) => (
            <text
              key={`lx${t}`}
              x={x(t)}
              y={H - PAD.bottom + 20}
              textAnchor="middle"
              className="chart-tick"
            >
              {t}
            </text>
          ))}

          <text x={PAD.left} y={H - 12} className="chart-axis-title">
            Pago medio por partida →
          </text>
          <text
            transform={`translate(15, ${PAD.top + plotH / 2}) rotate(-90)`}
            textAnchor="middle"
            className="chart-axis-title"
          >
            Integridad →
          </text>

          {/* marcas */}
          {rows.map((r, i) => {
            const p = placed[i];
            const active = hover === i;
            return (
              <g key={r.model}>
                {p.leader && (
                  <line
                    x1={p.cx}
                    y1={p.cy}
                    x2={p.labelX}
                    y2={p.labelY - 4}
                    stroke="var(--line)"
                    strokeWidth={1}
                  />
                )}
                {/* diana de interacción, mayor que la marca */}
                <circle
                  cx={p.cx}
                  cy={p.cy}
                  r={20}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: "pointer" }}
                />
                <circle
                  cx={p.cx}
                  cy={p.cy}
                  r={active ? 9 : 7}
                  fill={SERIES_COLOR}
                  stroke="var(--bg-raise)"
                  strokeWidth={2}
                  pointerEvents="none"
                />
                <text
                  x={p.labelX}
                  y={p.labelY}
                  textAnchor={p.anchor}
                  className="chart-point-label"
                  pointerEvents="none"
                >
                  {p.text}
                </text>
              </g>
            );
          })}
        </svg>

        {hover !== null && rows[hover] && (
          <div
            className="chart-tooltip"
            style={{
              left: `${(x(rows[hover].avg_payoff) / W) * 100}%`,
              top: `${(y(rows[hover].avg_integrity) / H) * 100}%`,
            }}
          >
            <strong>{shortModel(rows[hover].model)}</strong>
            <span>Pago medio · {rows[hover].avg_payoff.toFixed(1)}</span>
            <span>Integridad · {Math.round(rows[hover].avg_integrity * 100)}%</span>
            <span>Rondas rápidas · {Math.round(rows[hover].avg_fast_rate * 100)}%</span>
            <span>Partidas · {rows[hover].games}</span>
          </div>
        )}
      </div>
    </figure>
  );
}

interface PlacedLabel {
  cx: number;
  cy: number;
  text: string;
  labelX: number;
  labelY: number;
  anchor: "start" | "end" | "middle";
  leader: boolean;
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const LABEL_H = 13;

function boxOf(x: number, y: number, w: number, anchor: string): Box {
  const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  return { x0, x1: x0 + w, y0: y - LABEL_H + 3, y1: y + 3 };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** Coloca etiquetas directas probando posiciones hasta encontrar una libre.
 *
 * Se intentan, en orden: a la derecha del punto, centrada encima, centrada debajo y a la
 * izquierda. Las dos posiciones centradas son las que resuelven el caso feo, dos puntos a la
 * misma altura: uno se va arriba y otro abajo, y queda claro de quién es cada nombre sin
 * necesidad de guías. Si ninguna cabe se usa la primera y se dibuja una guía hasta el punto.
 */
function placeLabels(
  points: { cx: number; cy: number; text: string }[],
  bounds: { left: number; right: number; top: number; bottom: number },
): PlacedLabel[] {
  const taken: Box[] = [];
  const out: PlacedLabel[] = [];

  for (const p of points) {
    const w = p.text.length * CHAR_W;
    const candidates: { x: number; y: number; anchor: PlacedLabel["anchor"] }[] = [
      { x: p.cx + 14, y: p.cy + 4, anchor: "start" },
      { x: p.cx, y: p.cy - 15, anchor: "middle" },
      { x: p.cx, y: p.cy + 24, anchor: "middle" },
      { x: p.cx - 14, y: p.cy + 4, anchor: "end" },
    ];

    let chosen = candidates[0];
    let free = false;
    for (const c of candidates) {
      const box = boxOf(c.x, c.y, w, c.anchor);
      const inside =
        box.x0 >= bounds.left - 46 &&
        box.x1 <= bounds.right + 46 &&
        box.y0 >= bounds.top &&
        box.y1 <= bounds.bottom;
      if (inside && !taken.some((t) => overlaps(t, box))) {
        chosen = c;
        free = true;
        break;
      }
    }

    taken.push(boxOf(chosen.x, chosen.y, w, chosen.anchor));
    out.push({
      cx: p.cx,
      cy: p.cy,
      text: p.text,
      labelX: chosen.x,
      labelY: chosen.y,
      anchor: chosen.anchor,
      leader: !free,
    });
  }
  return out;
}

function niceTicks(min: number, max: number, count: number): number[] {
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) {
    out.push(Math.round(v * 100) / 100);
  }
  return out;
}
