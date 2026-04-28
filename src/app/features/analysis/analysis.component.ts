import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  AntiPatternFinding,
  AuthorTendency,
  MergecraftAnalysis,
  PrReference,
  ReviewFrictionFinding,
  Severity,
} from '../../core/models/analysis.model';
import { AnthropicModel, modelLabel } from '../../core/models/anthropic-model.model';
import { scanDepthLabel } from '../../core/models/scan-depth.model';
import { AnalysisHistoryService } from '../../core/services/analysis-history.service';
import { AnalysisService } from '../../core/services/analysis.service';
import { SettingsService } from '../../core/services/settings.service';

@Component({
  selector: 'app-analysis',
  imports: [DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-5xl px-6 py-10">
      <input
        #fileInput
        type="file"
        accept="application/json,.json"
        class="hidden"
        (change)="onFileSelected($event)"
      />
      <div class="flex items-baseline justify-between mb-6">
        <h1 class="text-2xl font-semibold">Analysis</h1>
        <span class="text-xs text-gray-500">{{ depthLabel() }} scan · {{ modelDisplayLabel() }}</span>
      </div>

      @if (loadError(); as err) {
        <div class="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 flex items-center justify-between">
          <span>{{ err }}</span>
          <button
            type="button"
            (click)="dismissLoadError()"
            class="text-red-800 hover:text-red-900 text-xs"
          >
            Dismiss
          </button>
        </div>
      }

      @switch (status()) {
        @case ('idle') {
          <div class="rounded border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-700">
            <p class="mb-3">
              No analysis run yet.
              <a routerLink="/" class="text-blue-600 hover:underline">Pick a repo and select PRs</a>
              to start one.
            </p>
            <p>
              <button
                type="button"
                (click)="triggerFilePick()"
                class="text-blue-600 hover:underline"
              >
                Or load a previous report (.json)
              </button>
            </p>
          </div>
        }
        @case ('fetching') {
          <div class="rounded border border-blue-200 bg-blue-50 px-4 py-4 text-sm">
            <div class="font-medium text-blue-900 mb-2">Fetching PR details from GitHub…</div>
            <div class="h-2 w-full rounded bg-blue-100 overflow-hidden">
              <div class="h-full bg-blue-500 transition-all" [style.width.%]="percent()"></div>
            </div>
            <div class="mt-1 text-xs text-blue-900">
              {{ progress().current }} / {{ progress().total }} PRs
            </div>
          </div>
        }
        @case ('estimating') {
          <div class="rounded border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-900">
            Counting tokens to estimate cost…
          </div>
        }
        @case ('awaiting_confirmation') {
          @if (estimate(); as est) {
            <div class="rounded border border-amber-200 bg-amber-50 px-4 py-4 text-sm">
              <div class="font-medium text-amber-900 mb-2">Ready to analyze</div>
              <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-amber-900">
                <dt>Model</dt>
                <dd>{{ modelLabelFor(est.model) }} <span class="font-mono text-xs text-amber-700">({{ est.model }})</span></dd>
                <dt>Input tokens</dt>
                <dd>{{ est.inputTokens.toLocaleString() }}</dd>
                <dt>Output cap</dt>
                <dd>{{ est.maxOutputTokens.toLocaleString() }} tokens</dd>
                <dt>Estimated spend</dt>
                <dd class="font-medium">
                  {{ formatRange(est.minTotalUsd, est.maxTotalUsd) }}
                  <span class="text-amber-700 text-xs ml-1">
                    (input ~ {{ formatUsd(est.inputCostUsd) }}, output up to
                    {{ formatUsd(est.maxOutputCostUsd) }})
                  </span>
                </dd>
              </dl>
              @if (request()?.depth === 'deep') {
                <div class="mt-3 rounded border border-amber-300 bg-white px-3 py-2 text-xs text-amber-900">
                  ⚠ Deep scan: PR diffs will be sent to Anthropic. Diffs occasionally include
                  accidentally-committed secrets. Cancel if unsure.
                </div>
              }
              <div class="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  (click)="confirm()"
                  class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Run analysis
                </button>
                <button
                  type="button"
                  (click)="cancel()"
                  class="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <span class="text-xs text-amber-700 ml-auto">
                  Disable this prompt in Settings.
                </span>
              </div>
            </div>
          }
        }
        @case ('analyzing') {
          <div class="rounded border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            Sending to {{ modelDisplayLabel() }}… typically a few seconds.
          </div>
        }
        @case ('error') {
          <div class="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {{ error() }}
            <div class="mt-2">
              <a routerLink="/" class="text-red-900 underline">Back to repo selection</a>
            </div>
          </div>
        }
        @case ('done') {
          @if (displayedResult(); as r) {
            <div class="mb-4 rounded border border-purple-200 bg-purple-50 px-3 py-2 text-xs text-purple-900">
              <span class="font-medium">AI-generated.</span> Findings may be inaccurate, fabricated,
              or shaped by prompt injection in PR text. Verify against the linked PRs before acting
              on anything here, and don't republish as fact.
            </div>
            @if (lastSavedAt()) {
              <div class="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 flex items-center justify-between">
                <span>Report saved to history — download started.</span>
                <button
                  type="button"
                  (click)="dismissSaveBanner()"
                  class="text-emerald-800 hover:text-emerald-900 text-xs"
                >
                  Dismiss
                </button>
              </div>
            }
            @if (resultSource() === 'loaded') {
              <div class="mb-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                Loaded from a previously downloaded report.
              </div>
            }
            <div class="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>{{ r.prsAnalyzed }} PRs analyzed</span>
              <span>· {{ r.generatedAt | date: 'medium' }}</span>
              @if (request(); as req) {
                <span>· {{ req.owner }}/{{ req.repo }}</span>
              }
              @if (hasAnonymizableAuthors()) {
                <button
                  type="button"
                  (click)="toggleRevealAuthors()"
                  class="text-blue-600 hover:underline"
                >
                  {{ revealAuthors() ? 'Hide author names' : 'Show author names' }}
                </button>
              }
              <span class="ml-auto">
                <button
                  type="button"
                  (click)="triggerFilePick()"
                  class="text-blue-600 hover:underline"
                >
                  Load previous report
                </button>
              </span>
            </div>
            @if (r.summary) {
              <p class="mb-6 text-sm text-gray-800 italic border-l-2 border-gray-300 pl-3">
                {{ r.summary }}
              </p>
            }

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section>
                <h2 class="text-lg font-semibold mb-3">Anti-patterns</h2>
                @if (r.antiPatterns.length === 0) {
                  <p class="text-sm text-gray-500">No recurring anti-patterns surfaced.</p>
                } @else {
                  <ul class="space-y-3">
                    @for (f of r.antiPatterns; track f.id) {
                      <li class="rounded border border-gray-200 p-3">
                        <div class="flex items-center justify-between gap-2">
                          <h3 class="font-medium text-sm">{{ f.title }}</h3>
                          <span [class]="severityClass(f.severity)">{{ f.severity }}</span>
                        </div>
                        <p class="mt-1 text-sm text-gray-700">{{ f.description }}</p>
                        @if (f.prReferences.length > 0) {
                          <div class="mt-2 flex flex-wrap gap-1">
                            @for (ref of f.prReferences; track ref.number) {
                              <a
                                [href]="ref.url"
                                target="_blank"
                                rel="noopener"
                                class="text-xs font-mono text-blue-700 hover:underline"
                                >#{{ ref.number }}</a
                              >
                            }
                          </div>
                        }
                      </li>
                    }
                  </ul>
                }
              </section>

              <section>
                <h2 class="text-lg font-semibold mb-3">Review friction</h2>
                @if (r.reviewFriction.length === 0) {
                  <p class="text-sm text-gray-500">No review-friction patterns surfaced.</p>
                } @else {
                  <ul class="space-y-3">
                    @for (f of r.reviewFriction; track f.id) {
                      <li class="rounded border border-gray-200 p-3">
                        <div class="flex items-center justify-between gap-2">
                          <h3 class="font-medium text-sm">{{ f.title }}</h3>
                          <span [class]="severityClass(f.severity)">{{ f.severity }}</span>
                        </div>
                        <p class="mt-1 text-sm text-gray-700">{{ f.description }}</p>
                        @if (f.prReferences.length > 0) {
                          <div class="mt-2 flex flex-wrap gap-1">
                            @for (ref of f.prReferences; track ref.number) {
                              <a
                                [href]="ref.url"
                                target="_blank"
                                rel="noopener"
                                class="text-xs font-mono text-blue-700 hover:underline"
                                >#{{ ref.number }}</a
                              >
                            }
                          </div>
                        }
                      </li>
                    }
                  </ul>
                }
              </section>
            </div>

            @if (r.churn.hotspots.length > 0) {
              <section class="mt-8">
                <h2 class="text-lg font-semibold mb-3">Churn hotspots</h2>
                <p class="text-xs text-gray-500 mb-3">
                  Files touched by multiple PRs in this batch. Computed from GitHub file lists, not
                  by the model.
                </p>
                <div class="overflow-x-auto rounded border border-gray-200">
                  <table class="w-full text-sm">
                    <thead class="bg-gray-50 text-gray-700">
                      <tr>
                        <th class="px-3 py-2 text-left">File</th>
                        <th class="px-3 py-2 text-right">PRs</th>
                        <th class="px-3 py-2 text-left">PRs touching it</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                      @for (h of r.churn.hotspots; track h.path) {
                        <tr>
                          <td class="px-3 py-2 font-mono text-xs">{{ h.path }}</td>
                          <td class="px-3 py-2 text-right">{{ h.prCount }}</td>
                          <td class="px-3 py-2">
                            <div class="flex flex-wrap gap-1">
                              @for (ref of h.prReferences; track ref.number) {
                                <a
                                  [href]="ref.url"
                                  target="_blank"
                                  rel="noopener"
                                  class="text-xs font-mono text-blue-700 hover:underline"
                                  >#{{ ref.number }}</a
                                >
                              }
                            </div>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <div class="mt-2 text-xs text-gray-500">
                  {{ r.churn.totalFilesTouched }} files touched across {{ r.churn.totalPrsAnalyzed }}
                  PRs.
                </div>
              </section>
            }

            <section class="mt-8">
              <div class="mb-3 flex items-center gap-2">
                <h2 class="text-lg font-semibold">Author tendencies</h2>
                @if (hasAnonymizableAuthors() && !revealAuthors()) {
                  <span class="text-xs text-gray-500 italic">
                    · Anonymized. Reviewer/commenter names referenced in free text may not be
                    masked.
                  </span>
                }
              </div>
              @if (r.authorTendencies.length === 0) {
                <p class="text-sm text-gray-500">No per-author patterns surfaced.</p>
              } @else {
                <div class="overflow-x-auto rounded border border-gray-200">
                  <table class="w-full text-sm">
                    <thead class="bg-gray-50 text-gray-700">
                      <tr>
                        <th class="px-3 py-2 text-left">Author</th>
                        <th class="px-3 py-2 text-right">PRs</th>
                        <th class="px-3 py-2 text-right">Avg size (lines)</th>
                        <th class="px-3 py-2 text-left">Themes</th>
                        <th class="px-3 py-2 text-left">Evidence</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                      @for (a of r.authorTendencies; track a.author) {
                        <tr>
                          <td class="px-3 py-2 font-mono text-xs">{{ a.author }}</td>
                          <td class="px-3 py-2 text-right">{{ a.prCount }}</td>
                          <td class="px-3 py-2 text-right">{{ a.averagePrSize }}</td>
                          <td class="px-3 py-2 text-gray-700">{{ a.themes.join(', ') }}</td>
                          <td class="px-3 py-2">
                            <div class="flex flex-wrap gap-1">
                              @for (ref of a.prReferences; track ref.number) {
                                <a
                                  [href]="ref.url"
                                  target="_blank"
                                  rel="noopener"
                                  class="text-xs font-mono text-blue-700 hover:underline"
                                  >#{{ ref.number }}</a
                                >
                              }
                            </div>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </section>

            @if (request()?.depth === 'shallow') {
              <div class="mt-8 text-xs text-gray-500">
                Churn hotspots are skipped in shallow mode. Switch to Survey in Settings to enable
                them.
              </div>
            }
          }
        }
      }
    </section>
  `,
})
export class AnalysisComponent {
  private readonly analysis = inject(AnalysisService);
  private readonly settings = inject(SettingsService);
  private readonly history = inject(AnalysisHistoryService);

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly status = this.analysis.status;
  protected readonly progress = this.analysis.progress;
  protected readonly result = this.analysis.result;
  protected readonly error = this.analysis.error;
  protected readonly request = this.analysis.request;
  protected readonly estimate = this.analysis.estimate;
  protected readonly lastSavedAt = this.analysis.lastSavedAt;
  protected readonly resultSource = this.analysis.resultSource;
  protected readonly loadError = signal<string | null>(null);
  protected readonly revealAuthors = signal(!this.settings.getAnonymizeAuthors());

  protected readonly percent = computed(() => {
    const p = this.progress();
    if (p.total === 0) return 0;
    return Math.round((p.current / p.total) * 100);
  });

  protected readonly depthLabel = computed(() => {
    const req = this.request();
    return scanDepthLabel(req?.depth ?? 'shallow');
  });

  protected readonly modelDisplayLabel = computed(() => {
    this.settings.changes()();
    const req = this.request();
    return modelLabel(req?.model ?? this.settings.getModel());
  });

  private readonly aliasMap = computed<Map<string, string>>(() => {
    const r = this.result();
    if (!r) return new Map();
    const map = new Map<string, string>();
    r.authorTendencies.forEach((a, idx) => {
      if (a.author) map.set(a.author, `Author ${letterFor(idx)}`);
    });
    return map;
  });

  protected readonly displayedResult = computed<MergecraftAnalysis | null>(() => {
    const r = this.result();
    if (!r) return null;
    if (this.revealAuthors()) return r;
    return this.anonymize(r, this.aliasMap());
  });

  protected readonly hasAnonymizableAuthors = computed(() => this.aliasMap().size > 0);

  protected toggleRevealAuthors(): void {
    this.revealAuthors.update(v => !v);
  }

  private anonymize(r: MergecraftAnalysis, map: Map<string, string>): MergecraftAnalysis {
    if (map.size === 0) return r;
    const replace = (text: string) => this.replaceLogins(text, map);
    return {
      ...r,
      summary: replace(r.summary),
      antiPatterns: r.antiPatterns.map(p => ({
        ...p,
        title: replace(p.title),
        description: replace(p.description),
      })),
      reviewFriction: r.reviewFriction.map(p => ({
        ...p,
        title: replace(p.title),
        description: replace(p.description),
      })),
      authorTendencies: r.authorTendencies.map(a => ({
        ...a,
        author: map.get(a.author) ?? a.author,
        themes: a.themes.map(replace),
      })),
    };
  }

  private replaceLogins(text: string, map: Map<string, string>): string {
    if (!text) return text;
    let out = text;
    for (const [login, alias] of map) {
      const escaped = login.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?<![a-zA-Z0-9_-])@?${escaped}(?![a-zA-Z0-9_-])`, 'g');
      out = out.replace(re, alias);
    }
    return out;
  }

  protected confirm(): void {
    this.analysis.confirmAndAnalyze();
  }

  protected cancel(): void {
    this.analysis.cancelPending();
  }

  protected dismissSaveBanner(): void {
    this.analysis.lastSavedAt.set(null);
  }

  protected dismissLoadError(): void {
    this.loadError.set(null);
  }

  protected triggerFilePick(): void {
    this.loadError.set(null);
    this.fileInput()?.nativeElement.click();
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.history.loadReportFromFile(file).subscribe({
      next: ({ analysis, churn }) => {
        this.analysis.loadResult(analysis, churn);
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : 'Could not load report.';
        this.loadError.set(message);
      },
    });
    input.value = '';
  }

  protected formatUsd(value: number): string {
    if (value < 0.01) return `<$0.01`;
    if (value < 1) return `$${value.toFixed(3)}`;
    return `$${value.toFixed(2)}`;
  }

  protected formatRange(min: number, max: number): string {
    if (max - min < 0.005) return this.formatUsd(min);
    return `${this.formatUsd(min)} – ${this.formatUsd(max)}`;
  }

  protected modelLabelFor(model: AnthropicModel): string {
    return modelLabel(model);
  }

  protected severityClass(severity: Severity): string {
    const base = 'text-xs px-2 py-0.5 rounded font-medium';
    if (severity === 'high') return `${base} bg-red-100 text-red-800`;
    if (severity === 'medium') return `${base} bg-amber-100 text-amber-800`;
    return `${base} bg-gray-100 text-gray-700`;
  }

  protected trackFinding(_: number, item: AntiPatternFinding | ReviewFrictionFinding): string {
    return item.id;
  }

  protected trackAuthor(_: number, item: AuthorTendency): string {
    return item.author;
  }

  protected trackRef(_: number, item: PrReference): number {
    return item.number;
  }
}

function letterFor(idx: number): string {
  if (idx < 26) return String.fromCharCode(65 + idx);
  return `${letterFor(Math.floor(idx / 26) - 1)}${letterFor(idx % 26)}`;
}
