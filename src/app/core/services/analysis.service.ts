import { Injectable, inject, signal } from '@angular/core';
import { Subscription, from, throwError } from 'rxjs';
import { catchError, map, mergeMap, switchMap, tap, toArray } from 'rxjs/operators';
import {
  ChurnAnalysis,
  ChurnHotspot,
  MergecraftAnalysis,
  PrReference,
} from '../models/analysis.model';
import { AnthropicModel } from '../models/anthropic-model.model';
import { PrData } from '../models/pr-data.model';
import { ScanDepth } from '../models/scan-depth.model';
import { AnalysisHistoryService } from './analysis-history.service';
import { AnthropicService, CostEstimate } from './anthropic.service';
import { GitHubService } from './github.service';
import { SettingsService } from './settings.service';

const FETCH_CONCURRENCY = 4;
const CHURN_TOP_N = 10;

export type AnalysisStatus =
  | 'idle'
  | 'fetching'
  | 'estimating'
  | 'awaiting_confirmation'
  | 'analyzing'
  | 'done'
  | 'error';

export interface AnalysisRequest {
  owner: string;
  repo: string;
  prNumbers: number[];
  depth: ScanDepth;
  model: AnthropicModel;
}

@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private readonly github = inject(GitHubService);
  private readonly anthropic = inject(AnthropicService);
  private readonly settings = inject(SettingsService);
  private readonly history = inject(AnalysisHistoryService);

  readonly status = signal<AnalysisStatus>('idle');
  readonly progress = signal<{ current: number; total: number }>({ current: 0, total: 0 });
  readonly result = signal<MergecraftAnalysis | null>(null);
  readonly error = signal<string | null>(null);
  readonly request = signal<AnalysisRequest | null>(null);
  readonly estimate = signal<CostEstimate | null>(null);
  readonly lastSavedAt = signal<string | null>(null);
  readonly resultSource = signal<'analysis' | 'loaded'>('analysis');

  private pendingPrs: PrData[] = [];
  private inFlight: Subscription | null = null;

  runAnalysis(owner: string, repo: string, prNumbers: number[]): void {
    this.cancelInFlight();
    const depth = this.settings.getScanDepth();
    const model = this.settings.getModel();
    this.request.set({ owner, repo, prNumbers, depth, model });
    this.status.set('fetching');
    this.progress.set({ current: 0, total: prNumbers.length });
    this.result.set(null);
    this.error.set(null);
    this.estimate.set(null);
    this.lastSavedAt.set(null);
    this.resultSource.set('analysis');
    this.pendingPrs = [];

    let fetched = 0;
    const includeFiles = depth === 'survey' || depth === 'deep';
    const includeDiff = depth === 'deep';

    this.inFlight = from(prNumbers)
      .pipe(
        mergeMap(
          (num) =>
            this.github.fetchPrDetails(owner, repo, num, { includeFiles, includeDiff }).pipe(
              tap(() => {
                fetched += 1;
                this.progress.set({ current: fetched, total: prNumbers.length });
              }),
            ),
          FETCH_CONCURRENCY,
        ),
        toArray(),
        switchMap((prs) => {
          this.pendingPrs = prs;
          if (this.settings.getCostPreviewEnabled()) {
            this.status.set('estimating');
            return this.anthropic.estimateCost(prs).pipe(
              tap((estimate) => {
                this.estimate.set(estimate);
                this.status.set('awaiting_confirmation');
              }),
            );
          }
          return this.runAnthropic(prs);
        }),
        catchError((err) => {
          this.recordError(err);
          return throwError(() => err);
        }),
      )
      .subscribe({ error: () => {} });
  }

  confirmAndAnalyze(): void {
    if (this.status() !== 'awaiting_confirmation' || this.pendingPrs.length === 0) return;
    this.cancelInFlight();
    this.inFlight = this.runAnthropic(this.pendingPrs).subscribe({ error: () => {} });
  }

  cancelPending(): void {
    if (this.status() !== 'awaiting_confirmation') return;
    this.cancelInFlight();
    this.pendingPrs = [];
    this.estimate.set(null);
    this.status.set('idle');
  }

  reset(): void {
    this.cancelInFlight();
    this.status.set('idle');
    this.result.set(null);
    this.error.set(null);
    this.request.set(null);
    this.estimate.set(null);
    this.progress.set({ current: 0, total: 0 });
    this.pendingPrs = [];
  }

  private cancelInFlight(): void {
    this.inFlight?.unsubscribe();
    this.inFlight = null;
  }

  private runAnthropic(prs: PrData[]) {
    this.status.set('analyzing');
    const churn = this.computeChurn(prs);
    return this.anthropic.analyze(prs).pipe(
      map((result) => ({ ...result, churn })),
      tap((result) => {
        this.result.set(result);
        this.status.set('done');
        this.persistAndDownload(result);
      }),
      catchError((err) => {
        this.recordError(err);
        return throwError(() => err);
      }),
    );
  }

  private persistAndDownload(result: MergecraftAnalysis): void {
    const req = this.request();
    if (!req) return;
    const repoFullName = `${req.owner}/${req.repo}`;
    const when = new Date();
    const entry = this.history.buildEntry(result, repoFullName, when);
    this.history.saveToHistory(entry);
    this.history.downloadReport(result, result.churn, repoFullName, when);
    this.lastSavedAt.set(when.toISOString());
  }

  loadResult(analysis: MergecraftAnalysis, churn: ChurnAnalysis): void {
    this.cancelInFlight();
    const merged: MergecraftAnalysis = { ...analysis, churn };
    this.request.set(null);
    this.error.set(null);
    this.estimate.set(null);
    this.progress.set({ current: 0, total: 0 });
    this.result.set(merged);
    this.lastSavedAt.set(null);
    this.resultSource.set('loaded');
    this.status.set('done');
  }

  private computeChurn(prs: PrData[]): ChurnAnalysis {
    const fileTouches = new Map<string, Set<number>>();
    const refLookup = new Map<number, PrReference>(
      prs.map((p) => [p.number, { number: p.number, title: p.title, url: p.url }]),
    );

    for (const pr of prs) {
      for (const file of pr.files) {
        if (!fileTouches.has(file.filename)) fileTouches.set(file.filename, new Set());
        fileTouches.get(file.filename)!.add(pr.number);
      }
    }

    const hotspots: ChurnHotspot[] = Array.from(fileTouches.entries())
      .map(([path, prNums]) => ({
        path,
        prCount: prNums.size,
        prReferences: Array.from(prNums)
          .sort((a, b) => a - b)
          .map((n) => refLookup.get(n)!)
          .filter(Boolean),
      }))
      .filter((h) => h.prCount >= 2)
      .sort((a, b) => b.prCount - a.prCount)
      .slice(0, CHURN_TOP_N);

    return {
      hotspots,
      totalFilesTouched: fileTouches.size,
      totalPrsAnalyzed: prs.length,
    };
  }

  private recordError(err: unknown): void {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    this.error.set(message);
    this.status.set('error');
  }
}
