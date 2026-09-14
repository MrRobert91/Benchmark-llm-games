export type ActionName = "SAFE" | "FAST";

export interface PlayerMeta {
  player_id: string;
  label: string;
  model: string;
  seat: number;
}

export interface SpeechRecord {
  player_id: string;
  text: string;
  pledge: ActionName;
}

export interface ActionRecord {
  player_id: string;
  action: ActionName;
  pledge: ActionName;
  /** `null` cuando la respuesta del modelo no se pudo leer: no se sabe si cumplió. */
  kept_pledge: boolean | null;
  /** `false` si la ronda no cuenta para la integridad por un fallo de parseo. */
  scored?: boolean;
  action_readable?: boolean;
  pledge_readable?: boolean;
}

export interface StateRecord {
  player_id: string;
  progress: number;
  risk: number;
  integrity: number | null;
  parse_failures?: number;
}

export interface RoundRecord {
  index: number;
  meeting: SpeechRecord[];
  actions: ActionRecord[];
  state_after: StateRecord[];
  events: string[];
}

export interface PlayerMetrics {
  player_id: string;
  label: string;
  model: string;
  progress: number;
  risk: number;
  payoff: number;
  pledges_made: number;
  pledges_kept: number;
  /** Rondas puntuables: el denominador real de `integrity`. */
  pledges_scored?: number;
  parse_failures?: number;
  /** `null` cuando ninguna ronda fue legible. Desconocida, no perfecta. */
  integrity: number | null;
  fast_rate: number;
  rounds_played: number;
}

export interface GameRules {
  goal: number;
  max_rounds: number;
  uncertain_from_round: number;
  stop_probability: number;
  progress_safe: number;
  progress_fast: number;
  risk_fast: number;
  risk_step: number;
  payoff_win: number;
  payoff_lose: number;
  payoff_stalemate: number;
  payoff_catastrophe: number;
}

export interface Outcome {
  kind: "aligned_win" | "catastrophe" | "restraint";
  winner_id: string | null;
  winner_label: string | null;
  final_round: number;
  disaster_probability?: number;
  roll?: number;
  headline: string;
}

export interface Replay {
  game_id: string;
  created_at: string;
  seed: number;
  backend: string;
  rules: GameRules;
  players: PlayerMeta[];
  rounds: RoundRecord[];
  outcome: Outcome;
  /** Respuestas que el parser no pudo interpretar, con el motivo de cada una. */
  parse_incidents?: ParseIncident[];
  metrics: {
    moloch_index: number;
    total_welfare: number;
    collective_optimum: number;
    collective_floor: number;
    mean_integrity: number | null;
    /** Proporción de rondas legibles. Por debajo de 1, la partida está contaminada. */
    integrity_confidence?: number;
    parse_failures?: number;
    contaminated?: boolean;
    critical_prize: number;
    players: PlayerMetrics[];
  };
  budget?: {
    limit_usd: number;
    spent_usd: number;
    calls: number;
    per_model: Record<string, number>;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  contributor?: Contributor;
}

export interface ParseIncident {
  round?: number;
  player_id: string;
  model: string;
  phase: string;
  field: string;
  reason: string;
  strategy: string;
  repairs: string[];
  finish_reason: string | null;
  content_chars: number;
  reasoning_tokens: number;
  excerpt: string;
  fallback_action: string | null;
  served_model: string | null;
  provider: string | null;
}

export interface Contributor {
  nick: string;
  url: string | null;
}

export interface GameSummary {
  game_id: string;
  created_at: string;
  backend: string;
  n_players: number;
  outcome_kind: Outcome["kind"];
  winner_label: string | null;
  final_round: number;
  moloch_index: number;
  total_welfare: number;
  mean_integrity: number;
  participant_models?: string[];
  /** Recorded first finisher. A catastrophe is not an aligned victory. */
  winner_model?: string | null;
  contributor_nick?: string | null;
  contributor_url?: string | null;
}

export interface ModelRow {
  model: string;
  games: number;
  avg_payoff: number;
  /** `null` si el modelo no tuvo ninguna ronda legible. */
  avg_integrity: number | null;
  avg_fast_rate: number;
  avg_risk: number;
  pledges_made: number;
  pledges_kept: number;
  pledges_scored?: number;
  parse_failures?: number;
  contaminated_games?: number;
  parse_success_rate?: number;
}

export interface BackendRow {
  backend: string;
  games: number;
  avg_moloch: number;
  catastrophes: number;
  restraints: number;
  aligned_wins: number;
}

export interface ContributionRow {
  game_id: string;
  created_at: string;
  nick: string;
  url: string | null;
  n_players: number;
  outcome_kind: Outcome["kind"];
  moloch_index: number;
  mean_integrity: number;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  provider: string;
  context_length: number;
  pricing: {
    prompt: number;
    completion: number;
    request: number;
  };
  supports_reasoning: boolean;
}

export interface ModelCatalog {
  models: OpenRouterModel[];
  limits: {
    min_players: number;
    max_players: number;
    min_budget_usd: number;
    default_budget_usd: number;
    max_budget_usd: number;
    queue_size: number;
    max_rounds: number;
    calls_per_player_max: number;
    estimated_input_tokens_per_call: number;
    estimated_output_tokens_per_call: number;
  };
}

export interface WebRun {
  game_id: string;
  status: "queued" | "running" | "completed" | "failed";
  phase: string;
  created_at: string;
  updated_at: string;
  seed: number;
  contributor: Contributor;
  models: string[];
  budget_limit: number;
  spent_usd: number;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  error_message: string | null;
  replay: Replay | null;
}

/** Identidad de cada laboratorio.
 *
 * Slots 1-5 de la paleta categórica de referencia, pasos de modo oscuro. Validados como
 * conjunto contra la superficie #07080c: banda de luminosidad, suelo de croma, separación
 * para daltonismo (peor par adyacente ΔE 8.4), suelo de visión normal (19.3) y contraste
 * >= 3:1. El orden es el mecanismo de seguridad, no decoración: no reordenar sin revalidar.
 */
export const LAB_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];

/** Serie única del gráfico de dispersión del leaderboard.
 *
 * Con más de tres series ninguna ordenación supera los suelos en la lista de todos los
 * pares, que es la que aplica a un scatter. Como cada punto lleva etiqueta directa, la
 * identidad no depende del color y basta una sola serie. */
export const SERIES_COLOR = "#3987e5";

export function labColor(seat: number): string {
  return LAB_COLORS[seat % LAB_COLORS.length];
}

export const OUTCOME_LABEL: Record<Outcome["kind"], string> = {
  aligned_win: "Victoria alineada",
  catastrophe: "Catástrofe",
  restraint: "Contención",
};

/** Nombre corto y legible del modelo, para etiquetas y ejes. */
export function shortModel(model: string): string {
  const tail = model.includes("/") ? model.split("/").slice(1).join("/") : model;
  return tail.replace(/-instruct$/, "");
}
