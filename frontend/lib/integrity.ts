/**
 * Presentación de la integridad, que ahora puede ser desconocida.
 *
 * Una ronda cuya respuesta el parser no pudo leer no se puntúa: no se sabe si el modelo
 * cumplió su promesa o la rompió. Antes se resolvía dando por cumplida la promesa, lo que
 * inflaba la métrica justo en los modelos que peor se portaban con el formato. Aquí se
 * dibuja como "sin datos" en vez de como un 100%.
 */

export const UNKNOWN_INTEGRITY = "—";

/** Porcentaje entero, o un guion cuando no hay ninguna ronda puntuable. */
export function formatIntegrity(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return UNKNOWN_INTEGRITY;
  }
  return `${Math.round(value * 100)}%`;
}

/** Ancho de barra. Una integridad desconocida no dibuja barra. */
export function integrityBarWidth(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "0%";
  return `${Math.max(0, Math.min(1, value)) * 100}%`;
}

/** Para ordenar: lo desconocido va al final, nunca arriba del ranking. */
export function integritySortKey(value: number | null | undefined): number {
  return value === null || value === undefined || Number.isNaN(value) ? -1 : value;
}

/** Veredicto de una ronda, con el tercer estado explícito. */
export type PledgeVerdict = "kept" | "broken" | "unreadable";

export function pledgeVerdict(
  keptPledge: boolean | null | undefined,
): PledgeVerdict {
  if (keptPledge === null || keptPledge === undefined) return "unreadable";
  return keptPledge ? "kept" : "broken";
}
