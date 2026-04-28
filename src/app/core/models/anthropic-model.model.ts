export type AnthropicModel = 'claude-haiku-4-5' | 'claude-sonnet-4-6' | 'claude-opus-4-7';

export interface AnthropicModelOption {
  value: AnthropicModel;
  label: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  summary: string;
}

export const ANTHROPIC_MODEL_OPTIONS: readonly AnthropicModelOption[] = [
  {
    value: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 5,
    summary: 'Fastest and cheapest. Good for shallow batches; can miss subtler patterns.',
  },
  {
    value: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
    summary: 'Balanced quality and cost. Good default for survey or deep scans.',
  },
  {
    value: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 25,
    summary: 'Best at nuanced patterns. Most expensive — pair with deep scans.',
  },
] as const;

export const DEFAULT_ANTHROPIC_MODEL: AnthropicModel = 'claude-haiku-4-5';

export function modelLabel(m: AnthropicModel): string {
  return ANTHROPIC_MODEL_OPTIONS.find(o => o.value === m)?.label ?? m;
}

export function modelPricing(m: AnthropicModel): { input: number; output: number } {
  const opt = ANTHROPIC_MODEL_OPTIONS.find(o => o.value === m);
  if (!opt) return { input: 0, output: 0 };
  return {
    input: opt.inputUsdPerMillion / 1_000_000,
    output: opt.outputUsdPerMillion / 1_000_000,
  };
}
