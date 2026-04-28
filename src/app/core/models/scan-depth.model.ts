export type ScanDepth = 'shallow' | 'survey' | 'deep';

export interface ScanDepthOption {
  value: ScanDepth;
  label: string;
  summary: string;
}

export const SCAN_DEPTH_OPTIONS: readonly ScanDepthOption[] = [
  {
    value: 'shallow',
    label: 'Shallow',
    summary: 'Metadata + reviews + inline comments. Cheapest. No file or diff data.',
  },
  {
    value: 'survey',
    label: 'Survey',
    summary:
      'Adds per-PR file lists. Enables churn hotspots and lets the model cite churn-prone files.',
  },
  {
    value: 'deep',
    label: 'Deep',
    summary:
      'Adds truncated PR diffs (skipped for PRs with >30 changed files). Unlocks code-pattern analysis. Most expensive.',
  },
] as const;

export const DEFAULT_SCAN_DEPTH: ScanDepth = 'shallow';

export function scanDepthLabel(depth: ScanDepth): string {
  return SCAN_DEPTH_OPTIONS.find(o => o.value === depth)?.label ?? depth;
}
