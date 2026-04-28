export type Severity = 'low' | 'medium' | 'high';

export interface PrReference {
  number: number;
  title: string;
  url: string;
}

export interface AntiPatternFinding {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  prReferences: PrReference[];
}

export interface ReviewFrictionFinding {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  prReferences: PrReference[];
}

export interface ChurnHotspot {
  path: string;
  prCount: number;
  prReferences: PrReference[];
}

export interface ChurnAnalysis {
  hotspots: ChurnHotspot[];
  totalFilesTouched: number;
  totalPrsAnalyzed: number;
}

export interface AuthorTendency {
  author: string;
  prCount: number;
  averagePrSize: number;
  themes: string[];
  prReferences: PrReference[];
}

export interface MergecraftAnalysis {
  generatedAt: string;
  prsAnalyzed: number;
  summary: string;
  antiPatterns: AntiPatternFinding[];
  reviewFriction: ReviewFrictionFinding[];
  churn: ChurnAnalysis;
  authorTendencies: AuthorTendency[];
}
