export interface ResearchCell {
  model: string; risk: number; players: number; condition: string; module: string;
  races: number; trajectories: number; decisions: number; unsafe: number;
  first5: number; ci95: [number, number]; payoff: number; setback: number;
  leader: number; rates: number[]; decision_pooled_unsafe: number;
}
export interface ResearchReport {
  supplement?: unknown;
  opaque_mapping_validation?: { checked_decisions: number; invalid_codes: number; mismatched_actions: number };
  roster?: { model: string; repetitions_per_risk: number; scope: string; prompt_usd_million: number; completion_usd_million: number }[];
  data_hash: string;
  manifest: { created_at: string; plan_hash: string; master_seed: number; limit_eur: number;
    limit_usd: number; usd_per_eur: number; fx_date: string; fx_source: string; jobs: unknown[] };
  total: number; admitted: number; excluded: number; failed: number;
  spent_usd: number; uncertain_usd: number; provider_attempts: number; successful_calls: number;
  cells: ResearchCell[];
  audit: { model: string; variant: string; category: string; outputs: number; completed: number; correct: number; strict: number }[];
  paired: { risk: number; pairs: { seed: number; horizon: number; canonical: number; card: number; first_round_flips: number }[] }[];
  positions: { model: string; players: number; risk: number; position: string; unsafe: number; decisions: number; races: number }[];
  position_bands?: { model: string; band: string; position: string; unsafe: number; decisions: number; races: number }[];
  replays: { job: string; status?: string; model?: string; race?: string; risk?: number; round?: number; skin?: string; mapping?: string; action?: string; readable?: boolean }[];
  published2p: Record<string, number[]>; publishedFirst5: Record<string, number>; publishedN: Record<string, number[]>;
  embedding: { trajectories: number; clusters?: number; unclustered?: number; sensitivity?: { literal_sklearn_min_samples6_clusters: number; literal_sklearn_min_samples6_unclustered: number; adjusted_rand_6_vs_7: number; convention_source: string } };
  drivers: { model: string; status: string; races: number; decisions: number; auc?: number; balanced_accuracy?: number; shares?: number[]; train_races?: number; test_races?: number }[];
  context?: { risk: number; mapping: string; skin: string; pairs: number; unsafe_delta: number | null; first_flip: number | null; sequence_changed: number | null }[];
  identity_tree?: { accuracy: number; sd: number; populations: number; majority_baseline: number; folds: number };
  logistic?: { model: string; status?: string; deviance?: number; aic?: number; parameters?: number; converged?: boolean; unstable?: boolean; outputs?: number; races?: number; warnings?: string[] }[];
  contributions: { id: string; model: string; module: string; condition: string; players: number; risk: number; seed: string; repetition: number; scope?: string; replaces_failed_cell?: string; status: string; error?: string; cost_usd: number; contributor: { nick: string; url: string } }[];
}
