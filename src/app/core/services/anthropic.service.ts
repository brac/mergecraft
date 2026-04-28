import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  AntiPatternFinding,
  AuthorTendency,
  ChurnAnalysis,
  MergecraftAnalysis,
  PrReference,
  ReviewFrictionFinding,
  Severity,
} from '../models/analysis.model';
import { AnthropicModel, modelPricing } from '../models/anthropic-model.model';
import { PrData } from '../models/pr-data.model';
import { SettingsService } from './settings.service';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_COUNT_TOKENS_URL = 'https://api.anthropic.com/v1/messages/count_tokens';
const MAX_TOKENS = 4096;
const PR_BODY_TRUNCATE = 500;
const COMMENT_TRUNCATE = 240;
const MAX_REVIEWS_PER_PR = 12;
const MAX_REVIEW_COMMENTS_PER_PR = 20;
const MAX_FILES_PER_PR = 50;
const DIFF_TRUNCATE = 6000;

export interface CostEstimate {
  inputTokens: number;
  maxOutputTokens: number;
  inputCostUsd: number;
  maxOutputCostUsd: number;
  minTotalUsd: number;
  maxTotalUsd: number;
  model: AnthropicModel;
}

const SYSTEM_PROMPT = `You analyze a batch of merged GitHub pull requests for cross-PR patterns. You will receive PR metadata, review summaries, inline review comments, and (when available) per-PR file lists and truncated diffs as JSON.

Identify patterns ACROSS the batch — not single-PR observations. Focus on:
- antiPatterns: recurring problems (oversized PRs, missing/thin descriptions, weak commit hygiene, frequent fix-ups). When file lists are present, call out churn-prone files or directories that appear in many PRs. When diffs are present, also flag recurring code smells (copy-paste, naming inconsistencies, dead code, missing error handling).
- reviewFriction: where review took long, was contentious, or had many rounds
- authorTendencies: per-author patterns in PR size, response style, recurring themes

For each finding, cite specific PRs by number in prReferences as evidence. Only cite PRs you actually saw in the input.

Return ONLY a JSON object with this exact shape — no prose, no markdown fences:
{
  "summary": "1-2 sentences summarizing the most notable cross-PR observations from this batch. Plain text, no markdown.",
  "antiPatterns": [
    {"id": "kebab-id", "title": "Short title", "description": "1-2 sentences", "severity": "low|medium|high", "prReferences": [{"number": 123}]}
  ],
  "reviewFriction": [
    {"id": "kebab-id", "title": "...", "description": "...", "severity": "low|medium|high", "prReferences": [{"number": 123}]}
  ],
  "authorTendencies": [
    {"author": "login", "prCount": N, "averagePrSize": N, "themes": ["theme1", "theme2"], "prReferences": [{"number": 123}]}
  ]
}

Keep to 3-5 findings per category. Be concrete. If a category has no patterns, return [].`;

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicMessageResponse {
  id: string;
  content: AnthropicTextBlock[];
  stop_reason: string;
  usage?: { input_tokens: number; output_tokens: number };
}

interface RawFinding {
  id?: string;
  title?: string;
  description?: string;
  severity?: string;
  prReferences?: { number?: number }[];
}

interface RawAuthorTendency {
  author?: string;
  prCount?: number;
  averagePrSize?: number;
  themes?: string[];
  prReferences?: { number?: number }[];
}

interface RawAnalysis {
  summary?: string;
  antiPatterns?: RawFinding[];
  reviewFriction?: RawFinding[];
  authorTendencies?: RawAuthorTendency[];
}

export class AnthropicApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AnthropicApiError';
  }
}

@Injectable({ providedIn: 'root' })
export class AnthropicService {
  private readonly http = inject(HttpClient);
  private readonly settings = inject(SettingsService);

  analyze(prs: PrData[]): Observable<MergecraftAnalysis> {
    const apiKey = this.settings.getAnthropicApiKey();
    if (!apiKey) {
      return throwError(() => new AnthropicApiError('Anthropic API key not set', 0));
    }

    const model = this.settings.getModel();
    const body = this.buildMessagesBody(prs, model, true);
    return this.http
      .post<AnthropicMessageResponse>(ANTHROPIC_URL, body, { headers: this.headers(apiKey) })
      .pipe(
        map((response) => this.buildAnalysis(response, prs)),
        catchError((err) => this.mapError(err)),
      );
  }

  estimateCost(prs: PrData[]): Observable<CostEstimate> {
    const apiKey = this.settings.getAnthropicApiKey();
    if (!apiKey) {
      return throwError(() => new AnthropicApiError('Anthropic API key not set', 0));
    }

    const model = this.settings.getModel();
    const pricing = modelPricing(model);
    const body = this.buildMessagesBody(prs, model, false);
    return this.http
      .post<{
        input_tokens: number;
      }>(ANTHROPIC_COUNT_TOKENS_URL, body, { headers: this.headers(apiKey) })
      .pipe(
        map((response) => {
          const inputTokens = response.input_tokens;
          const inputCostUsd = inputTokens * pricing.input;
          const maxOutputCostUsd = MAX_TOKENS * pricing.output;
          return {
            inputTokens,
            maxOutputTokens: MAX_TOKENS,
            inputCostUsd,
            maxOutputCostUsd,
            minTotalUsd: inputCostUsd,
            maxTotalUsd: inputCostUsd + maxOutputCostUsd,
            model,
          };
        }),
        catchError((err) => this.mapError(err)),
      );
  }

  private buildMessagesBody(prs: PrData[], model: AnthropicModel, includeMaxTokens: boolean) {
    const compact = prs.map((p) => this.compactPr(p));
    const userMessage = `Here are ${prs.length} merged PRs from a single repository. Analyze cross-PR patterns and return the JSON object as specified.

PRs:
${JSON.stringify(compact, null, 2)}`;

    const body: Record<string, unknown> = {
      model,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    };
    if (includeMaxTokens) {
      body['max_tokens'] = MAX_TOKENS;
    }
    return body;
  }

  private headers(apiKey: string): HttpHeaders {
    return new HttpHeaders({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
  }

  private compactPr(pr: PrData) {
    const compact: Record<string, unknown> = {
      number: pr.number,
      title: pr.title,
      body: this.truncate(pr.body, PR_BODY_TRUNCATE),
      author: pr.author.login,
      authorType: pr.author.type,
      createdAt: pr.createdAt,
      mergedAt: pr.mergedAt,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changedFiles,
      labels: pr.labels,
      reviews: pr.reviews.slice(0, MAX_REVIEWS_PER_PR).map((r) => ({
        author: r.author,
        state: r.state,
        submittedAt: r.submittedAt,
        body: this.truncate(r.body, COMMENT_TRUNCATE),
      })),
      reviewComments: pr.reviewComments.slice(0, MAX_REVIEW_COMMENTS_PER_PR).map((c) => ({
        author: c.author,
        path: c.path,
        body: this.truncate(c.body, COMMENT_TRUNCATE),
      })),
    };
    if (pr.files.length > 0) {
      compact['files'] = pr.files.slice(0, MAX_FILES_PER_PR).map((f) => ({
        path: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
      }));
    }
    if (pr.diff) {
      compact['diff'] = this.truncate(pr.diff, DIFF_TRUNCATE);
    }
    return compact;
  }

  private truncate(text: string, max: number): string {
    if (!text) return '';
    if (text.length <= max) return text;
    return text.slice(0, max) + '…';
  }

  private buildAnalysis(response: AnthropicMessageResponse, prs: PrData[]): MergecraftAnalysis {
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const raw = this.extractJson(text);
    const refLookup = new Map<number, PrReference>(
      prs.map((p) => [p.number, { number: p.number, title: p.title, url: p.url }]),
    );

    return {
      generatedAt: new Date().toISOString(),
      prsAnalyzed: prs.length,
      summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
      antiPatterns: this.mapFindings<AntiPatternFinding>(raw.antiPatterns, refLookup),
      reviewFriction: this.mapFindings<ReviewFrictionFinding>(raw.reviewFriction, refLookup),
      churn: this.emptyChurn(prs.length),
      authorTendencies: this.mapAuthors(raw.authorTendencies, refLookup),
    };
  }

  private extractJson(text: string): RawAnalysis {
    const trimmed = text.trim();
    const candidates = [trimmed, this.stripFences(trimmed), this.firstObject(trimmed)];
    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        return JSON.parse(candidate) as RawAnalysis;
      } catch {
        // try next
      }
    }
    throw new AnthropicApiError('Could not parse analysis JSON from model response', 0);
  }

  private stripFences(text: string): string | null {
    const match = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(text);
    return match ? match[1] : null;
  }

  private firstObject(text: string): string | null {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    return text.slice(start, end + 1);
  }

  private mapFindings<T extends AntiPatternFinding | ReviewFrictionFinding>(
    raw: RawFinding[] | undefined,
    refs: Map<number, PrReference>,
  ): T[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((f) => f && (f.title || f.description))
      .map((f, i) => ({
        id: f.id || `finding-${i + 1}`,
        title: f.title || 'Untitled finding',
        description: f.description || '',
        severity: this.normalizeSeverity(f.severity),
        prReferences: this.resolveRefs(f.prReferences, refs),
      })) as T[];
  }

  private mapAuthors(
    raw: RawAuthorTendency[] | undefined,
    refs: Map<number, PrReference>,
  ): AuthorTendency[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((a) => a && a.author)
      .map((a) => ({
        author: a.author!,
        prCount: typeof a.prCount === 'number' ? a.prCount : 0,
        averagePrSize: typeof a.averagePrSize === 'number' ? a.averagePrSize : 0,
        themes: Array.isArray(a.themes) ? a.themes.filter((t) => typeof t === 'string') : [],
        prReferences: this.resolveRefs(a.prReferences, refs),
      }));
  }

  private resolveRefs(
    raw: { number?: number }[] | undefined,
    refs: Map<number, PrReference>,
  ): PrReference[] {
    if (!Array.isArray(raw)) return [];
    const out: PrReference[] = [];
    for (const ref of raw) {
      if (typeof ref?.number !== 'number') continue;
      const found = refs.get(ref.number);
      if (found) out.push(found);
    }
    return out;
  }

  private normalizeSeverity(value: string | undefined): Severity {
    if (value === 'low' || value === 'medium' || value === 'high') return value;
    return 'medium';
  }

  private emptyChurn(prsAnalyzed: number): ChurnAnalysis {
    return { hotspots: [], totalFilesTouched: 0, totalPrsAnalyzed: prsAnalyzed };
  }

  private mapError(err: unknown): Observable<never> {
    console.error('Anthropic API error', err);
    if (err instanceof AnthropicApiError) {
      return throwError(() => err);
    }
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) {
        return throwError(
          () => new AnthropicApiError('Invalid Anthropic API key — check your settings', 401),
        );
      }
      if (err.status === 429) {
        return throwError(
          () => new AnthropicApiError('Anthropic rate limit hit — wait a moment and retry', 429),
        );
      }
      if (err.status === 400) {
        return throwError(
          () => new AnthropicApiError('Anthropic rejected the request — check the console', 400),
        );
      }
      return throwError(
        () => new AnthropicApiError('Anthropic request failed — check the console', err.status),
      );
    }
    return throwError(() => new AnthropicApiError('Anthropic request failed', 0));
  }
}
