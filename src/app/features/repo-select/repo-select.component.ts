import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GitHubApiError, GitHubService } from '../../core/services/github.service';
import { AnalysisHistoryService } from '../../core/services/analysis-history.service';
import { AnalysisService } from '../../core/services/analysis.service';
import { SettingsService } from '../../core/services/settings.service';
import { PrData } from '../../core/models/pr-data.model';

const MAX_SELECTION = 30;

@Component({
  selector: 'app-repo-select',
  imports: [FormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-5xl px-6 py-10">
      <h1 class="text-2xl font-semibold mb-2">Select PRs to analyze</h1>
      <p class="text-sm text-gray-600 mb-6">
        Enter a public or private repo you can access, load merged PRs, and pick up to
        {{ maxSelection }} for cross-PR analysis.
      </p>

      <form (ngSubmit)="loadPrs()" class="flex flex-wrap items-start gap-3 mb-6">
        <div class="flex-1 min-w-[260px]">
          <label for="repo" class="block text-sm font-medium mb-1">Repository</label>
          <input
            id="repo"
            name="repo"
            type="text"
            [ngModel]="repoInput()"
            (ngModelChange)="repoInput.set($event)"
            autocomplete="off"
            spellcheck="false"
            placeholder="owner/repo  (e.g. angular/angular)"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div class="pt-6">
          <button
            type="submit"
            class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            [disabled]="!canLoad()"
          >
            {{ loading() ? 'Loading…' : 'Load PRs' }}
          </button>
        </div>
      </form>

      @if (!hasPat()) {
        <div
          class="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          GitHub PAT not set — go to Settings to add one before loading PRs.
        </div>
      }

      @if (error(); as err) {
        <div class="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {{ err }}
        </div>
      }

      @if (historyEntries().length > 0) {
        <div class="mb-6 rounded border border-gray-200">
          <div
            class="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50"
          >
            <h2 class="text-sm font-medium text-gray-700">Recent analyses</h2>
            <button
              type="button"
              (click)="clearHistory()"
              class="text-xs text-gray-600 hover:text-red-700"
            >
              Clear history
            </button>
          </div>
          <ul class="divide-y divide-gray-100">
            @for (entry of historyEntries(); track entry.id) {
              <li class="flex items-start gap-3 px-3 py-2 text-sm">
                <div class="flex-1 min-w-0">
                  <div class="flex items-baseline gap-2">
                    <span class="font-mono text-xs">{{ entry.repoFullName }}</span>
                    <span class="text-xs text-gray-500">
                      · {{ entry.analyzedAt | date: 'medium' }} · {{ entry.prCount }} PRs
                    </span>
                  </div>
                  @if (entry.summaryPreview) {
                    <p class="mt-0.5 text-xs text-gray-600 truncate">{{ entry.summaryPreview }}</p>
                  }
                </div>
                <button
                  type="button"
                  (click)="rerunFromHistory(entry.repoFullName)"
                  class="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Re-run
                </button>
              </li>
            }
          </ul>
        </div>
      }

      @if (prs().length > 0) {
        <div class="flex flex-wrap items-center justify-between gap-3 mb-3 text-sm">
          <div class="flex items-center gap-3">
            <button
              type="button"
              (click)="selectAll()"
              class="rounded border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50"
            >
              Select all (up to {{ maxSelection }})
            </button>
            <button
              type="button"
              (click)="deselectAll()"
              class="rounded border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50"
            >
              Deselect all
            </button>
            <span class="text-gray-600">
              {{ selectedCount() }} of {{ prs().length }} selected
              <span class="text-gray-400">· cap {{ maxSelection }}</span>
            </span>
          </div>
          <button
            type="button"
            (click)="analyzeSelected()"
            class="rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            [disabled]="selectedCount() === 0"
          >
            Analyze selected ({{ selectedCount() }})
          </button>
        </div>

        @if (capWarning()) {
          <div
            class="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            Mergecraft caps selection at {{ maxSelection }} PRs. Deselect some to choose others.
          </div>
        }

        <div class="rounded border border-gray-200 overflow-hidden">
          <div class="max-h-[28rem] overflow-y-auto divide-y divide-gray-100">
            @for (pr of prs(); track pr.number) {
              <label
                class="flex items-start gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                [class.bg-blue-50]="isSelected(pr.number)"
              >
                <input
                  type="checkbox"
                  class="mt-1 h-4 w-4"
                  [checked]="isSelected(pr.number)"
                  (change)="toggle(pr.number)"
                />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-xs text-gray-500">#{{ pr.number }}</span>
                    <span class="font-medium truncate">{{ pr.title }}</span>
                  </div>
                  <div class="mt-0.5 text-xs text-gray-600 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>by {{ pr.author.login }}</span>
                    <span>merged {{ pr.mergedAt | date: 'mediumDate' }}</span>
                    <span class="text-gray-400">{{ formatLines(pr) }}</span>
                  </div>
                </div>
              </label>
            }
          </div>
        </div>
      } @else if (loaded() && !loading()) {
        <div
          class="rounded border border-gray-200 bg-gray-50 px-3 py-6 text-center text-sm text-gray-600"
        >
          No merged PRs found in the most recent page. Try another repo.
        </div>
      }
    </section>
  `,
})
export class RepoSelectComponent {
  private readonly github = inject(GitHubService);
  private readonly analysis = inject(AnalysisService);
  private readonly settings = inject(SettingsService);
  private readonly history = inject(AnalysisHistoryService);
  private readonly router = inject(Router);

  protected readonly maxSelection = MAX_SELECTION;

  protected readonly repoInput = signal('');
  protected readonly prs = signal<PrData[]>([]);
  protected readonly selected = signal<ReadonlySet<number>>(new Set());
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly capWarning = signal(false);

  protected readonly selectedCount = computed(() => this.selected().size);

  protected readonly canLoad = computed(() => {
    if (this.loading()) return false;
    return this.parseRepo(this.repoInput()) !== null;
  });

  protected readonly hasPat = computed(() => {
    this.settings.changes()();
    return !!this.settings.getGithubPat();
  });

  protected readonly historyEntries = computed(() => this.history.entries());

  protected rerunFromHistory(repoFullName: string): void {
    this.repoInput.set(repoFullName);
    this.error.set(null);
  }

  protected clearHistory(): void {
    this.history.clearHistory();
  }

  protected isSelected(prNumber: number): boolean {
    return this.selected().has(prNumber);
  }

  protected toggle(prNumber: number): void {
    const next = new Set(this.selected());
    if (next.has(prNumber)) {
      next.delete(prNumber);
      this.capWarning.set(false);
    } else {
      if (next.size >= MAX_SELECTION) {
        this.capWarning.set(true);
        return;
      }
      next.add(prNumber);
    }
    this.selected.set(next);
  }

  protected selectAll(): void {
    const all = this.prs()
      .slice(0, MAX_SELECTION)
      .map((p) => p.number);
    this.capWarning.set(this.prs().length > MAX_SELECTION);
    this.selected.set(new Set(all));
  }

  protected deselectAll(): void {
    this.selected.set(new Set());
    this.capWarning.set(false);
  }

  protected loadPrs(): void {
    const parsed = this.parseRepo(this.repoInput());
    if (!parsed) {
      this.error.set('Use the format owner/repo (e.g. angular/angular).');
      return;
    }
    this.error.set(null);
    this.loading.set(true);
    this.loaded.set(false);
    this.selected.set(new Set());
    this.capWarning.set(false);

    this.github.listMergedPrs(parsed.owner, parsed.repo).subscribe({
      next: (prs) => {
        this.prs.set(prs);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loaded.set(true);
        this.prs.set([]);
        this.error.set(
          err instanceof GitHubApiError ? err.message : 'Something went wrong — check the console',
        );
      },
    });
  }

  protected analyzeSelected(): void {
    const parsed = this.parseRepo(this.repoInput());
    if (!parsed || this.selectedCount() === 0) return;
    const prNumbers = Array.from(this.selected().values()).sort((a, b) => a - b);
    this.analysis.runAnalysis(parsed.owner, parsed.repo, prNumbers);
    this.router.navigate(['/analysis']);
  }

  protected formatLines(pr: PrData): string {
    if (pr.additions === 0 && pr.deletions === 0) return '— lines';
    return `+${pr.additions} / -${pr.deletions}`;
  }

  private parseRepo(value: string): { owner: string; repo: string } | null {
    const trimmed = value.trim().replace(/^\/+|\/+$/g, '');
    const match = /^([^/\s]+)\/([^/\s]+)$/.exec(trimmed);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  }
}
