export interface ModelTrace {
  call_index: number;
  round: number | null;
  player_id: string;
  model: string;
  served_model: string | null;
  provider: string | null;
  phase: string;
  request_messages: {role: string; content: string}[];
  response_content: string | null;
  reasoning: string | null;
  reasoning_details: {type: string; text: string}[];
  encrypted_blocks: number;
  reasoning_tokens: number | null;
  reasoning_mode: string | null;
  finish_reason: string | null;
  attempt: number | null;
  status_code: number | null;
  usage: {prompt_tokens: number | null; completion_tokens: number | null; cost: number | null};
}
export interface ReplayTraces { game_id: string; calls: ModelTrace[]; source: string }

export function readableReasoning(call: ModelTrace): string[] {
  // Providers can duplicate the same text in reasoning and reasoning_details.
  return [...new Set([call.reasoning, ...call.reasoning_details.map(d => d.text)].filter((t): t is string => Boolean(t)))];
}

export function roundTraces(calls: ModelTrace[], round: number, player: string): ModelTrace[] {
  return calls.filter(c => c.round === round && c.player_id === player);
}
