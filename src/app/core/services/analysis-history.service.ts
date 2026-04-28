import { Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { ChurnAnalysis, MergecraftAnalysis } from '../models/analysis.model';

const HISTORY_KEY = 'mergecraft_history';
const HISTORY_CAP = 20;
const SUMMARY_PREVIEW_CHARS = 120;

export interface AnalysisHistoryEntry {
  id: string;
  repoFullName: string;
  analyzedAt: string;
  prCount: number;
  summaryPreview: string;
}

export interface LoadedReport {
  analysis: MergecraftAnalysis;
  churn: ChurnAnalysis;
}

@Injectable({ providedIn: 'root' })
export class AnalysisHistoryService {
  private readonly version = signal(0);

  /** Reactive view of history entries — components can read via computed/effect. */
  readonly entries = (): AnalysisHistoryEntry[] => {
    this.version();
    return this.read();
  };

  saveToHistory(entry: AnalysisHistoryEntry): void {
    const current = this.read();
    const next = [entry, ...current.filter((e) => e.id !== entry.id)].slice(0, HISTORY_CAP);
    this.write(next);
    this.version.update((v) => v + 1);
  }

  getHistory(): AnalysisHistoryEntry[] {
    return this.read();
  }

  clearHistory(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(HISTORY_KEY);
    }
    this.version.update((v) => v + 1);
  }

  buildEntry(
    analysis: MergecraftAnalysis,
    repoFullName: string,
    analyzedAt: Date = new Date(),
  ): AnalysisHistoryEntry {
    const stamp = formatStamp(analyzedAt);
    const safeRepo = repoFullName.replace('/', '-');
    return {
      id: `${safeRepo}-${stamp}`,
      repoFullName,
      analyzedAt: analyzedAt.toISOString(),
      prCount: analysis.prsAnalyzed,
      summaryPreview: previewOf(analysis.summary, SUMMARY_PREVIEW_CHARS),
    };
  }

  downloadReport(
    analysis: MergecraftAnalysis,
    churn: ChurnAnalysis,
    repoFullName: string,
    when: Date = new Date(),
  ): void {
    if (typeof document === 'undefined') return;
    const payload = {
      generatedBy: 'Mergecraft (https://github.com/brac/mergecraft)',
      disclaimer:
        'AI-generated. Findings may be inaccurate, fabricated, or shaped by prompt injection ' +
        'in PR text. Verify against linked PRs before acting on anything here. Do not republish ' +
        'as fact, and do not use as input to performance reviews.',
      analysis,
      churn,
      exportedAt: when.toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const filename = `mergecraft-${repoFullName.replace('/', '-')}-${formatStamp(when)}.json`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  loadReportFromFile(file: File): Observable<LoadedReport> {
    return new Observable<LoadedReport>((observer) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = reader.result as string;
          const parsed = JSON.parse(text);
          const result = this.validateReport(parsed);
          observer.next(result);
          observer.complete();
        } catch (err) {
          observer.error(err);
        }
      };
      reader.onerror = () => {
        observer.error(new Error('Could not read file'));
      };
      reader.readAsText(file);
    });
  }

  private validateReport(parsed: unknown): LoadedReport {
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('File is not a valid Mergecraft report (not a JSON object).');
    }
    const obj = parsed as Record<string, unknown>;
    const analysis = obj['analysis'];
    const churn = obj['churn'];
    if (!analysis || typeof analysis !== 'object') {
      throw new Error('File is missing the "analysis" section.');
    }
    if (!churn || typeof churn !== 'object') {
      throw new Error('File is missing the "churn" section.');
    }
    const a = analysis as Record<string, unknown>;
    if (!Array.isArray(a['antiPatterns']) || !Array.isArray(a['reviewFriction'])) {
      throw new Error('File analysis section is malformed.');
    }
    return {
      analysis: analysis as MergecraftAnalysis,
      churn: churn as ChurnAnalysis,
    };
  }

  private read(): AnalysisHistoryEntry[] {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidEntry);
    } catch {
      return [];
    }
  }

  private write(entries: AnalysisHistoryEntry[]): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  }
}

function isValidEntry(entry: unknown): entry is AnalysisHistoryEntry {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  return (
    typeof e['id'] === 'string' &&
    typeof e['repoFullName'] === 'string' &&
    typeof e['analyzedAt'] === 'string' &&
    typeof e['prCount'] === 'number' &&
    typeof e['summaryPreview'] === 'string'
  );
}

function previewOf(text: string, limit: number): string {
  if (!text) return '';
  if (text.length <= limit) return text;
  return text.slice(0, limit).trimEnd() + '…';
}

function formatStamp(date: Date): string {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}${m}${d}-${h}${min}${s}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
