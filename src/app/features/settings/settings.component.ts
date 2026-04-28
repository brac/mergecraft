import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ANTHROPIC_MODEL_OPTIONS, AnthropicModel } from '../../core/models/anthropic-model.model';
import { SCAN_DEPTH_OPTIONS, ScanDepth } from '../../core/models/scan-depth.model';
import { SettingsService } from '../../core/services/settings.service';

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-2xl px-6 py-10">
      <h1 class="text-2xl font-semibold mb-2">Settings</h1>
      <p class="text-sm text-gray-600 mb-6">
        Your keys are stored only in this browser's localStorage. Mergecraft has no backend.
      </p>

      <form (ngSubmit)="save()" class="space-y-5" autocomplete="off">
        <div>
          <label for="githubPat" class="block text-sm font-medium mb-1"
            >GitHub Personal Access Token</label
          >
          <input
            id="githubPat"
            name="githubPat"
            type="text"
            [ngModel]="githubPat()"
            (ngModelChange)="githubPat.set($event)"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            data-lpignore="true"
            data-1p-ignore
            data-form-type="other"
            [class.masked]="!reveal()"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="ghp_..."
          />
          <p class="mt-1 text-xs text-gray-500">
            Needs <code>repo</code> scope (or <code>public_repo</code> for public repos only).
          </p>
        </div>

        <div>
          <label for="anthropicApiKey" class="block text-sm font-medium mb-1"
            >Anthropic API Key</label
          >
          <input
            id="anthropicApiKey"
            name="anthropicApiKey"
            type="text"
            [ngModel]="anthropicApiKey()"
            (ngModelChange)="anthropicApiKey.set($event)"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            data-lpignore="true"
            data-1p-ignore
            data-form-type="other"
            [class.masked]="!reveal()"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="sk-ant-..."
          />
        </div>

        <div class="flex items-center gap-3 text-sm">
          <label class="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" [checked]="reveal()" (change)="toggleReveal()" class="h-4 w-4" />
            <span>Show keys</span>
          </label>
        </div>

        <div class="border-t border-gray-100 pt-5 space-y-2">
          <div class="text-sm font-medium">Scan depth</div>
          <p class="text-xs text-gray-500">
            Trade off cost and detail. Deeper scans pull more from GitHub and send more tokens to
            Claude.
          </p>
          @for (option of depthOptions; track option.value) {
            <label class="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="scanDepth"
                [value]="option.value"
                [checked]="scanDepth() === option.value"
                (change)="setDepth(option.value)"
                class="h-4 w-4 mt-0.5"
              />
              <span class="text-sm">
                <span class="font-medium">{{ option.label }}</span>
                <span class="block text-gray-500 mt-0.5">{{ option.summary }}</span>
                @if (option.value === 'deep') {
                  <span
                    class="mt-1 block rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900"
                  >
                    ⚠ Diffs are sent to Anthropic. They may contain accidentally-committed secrets
                    (tokens, env vars). Review the PR set before running Deep scans.
                  </span>
                }
              </span>
            </label>
          }
        </div>

        <div class="border-t border-gray-100 pt-5 space-y-2">
          <div class="text-sm font-medium">Anthropic model</div>
          <p class="text-xs text-gray-500">
            Smarter models cost more per token. Pricing shown per 1M tokens (input / output).
          </p>
          @for (option of modelOptions; track option.value) {
            <label class="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="anthropicModel"
                [value]="option.value"
                [checked]="model() === option.value"
                (change)="setModel(option.value)"
                class="h-4 w-4 mt-0.5"
              />
              <span class="text-sm">
                <span class="font-medium">{{ option.label }}</span>
                <span class="ml-2 text-xs text-gray-600 font-mono">
                  &#36;{{ option.inputUsdPerMillion }} / &#36;{{ option.outputUsdPerMillion }}
                </span>
                <span class="block text-gray-500 mt-0.5">{{ option.summary }}</span>
              </span>
            </label>
          }
        </div>

        <div class="border-t border-gray-100 pt-5">
          <label class="inline-flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              [checked]="costPreview()"
              (change)="toggleCostPreview()"
              class="h-4 w-4 mt-0.5"
            />
            <span class="text-sm">
              <span class="font-medium">Show cost estimate before each analysis</span>
              <span class="block text-gray-500 mt-0.5">
                Calls the free <code>count_tokens</code> endpoint to estimate spend, then waits for
                confirmation. Turn off if you don't want the extra step.
              </span>
            </span>
          </label>
        </div>

        <div class="border-t border-gray-100 pt-5">
          <label class="inline-flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              [checked]="anonymizeAuthors()"
              (change)="toggleAnonymizeAuthors()"
              class="h-4 w-4 mt-0.5"
            />
            <span class="text-sm">
              <span class="font-medium">Anonymize authors by default</span>
              <span class="block text-gray-500 mt-0.5">
                Replace GitHub logins with "Author A / B / C…" in displayed analysis output.
                LLM-generated tendencies are public-data profiling — anonymization reduces the risk
                of these reports being used as informal performance reviews or harassment dossiers.
                You can toggle real names per session on the Analysis page.
              </span>
            </span>
          </label>
        </div>

        <div class="flex items-center gap-3 pt-2">
          <button
            type="submit"
            class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            [disabled]="!canSave()"
          >
            Save
          </button>
          <button
            type="button"
            (click)="clear()"
            class="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Clear
          </button>
          @if (status() === 'saved') {
            <span class="text-sm text-green-700">Saved.</span>
          }
          @if (status() === 'cleared') {
            <span class="text-sm text-gray-600">Cleared.</span>
          }
        </div>
      </form>
    </section>
  `,
})
export class SettingsComponent {
  private readonly settingsService = inject(SettingsService);

  protected readonly githubPat = signal(this.settingsService.getGithubPat() ?? '');
  protected readonly anthropicApiKey = signal(this.settingsService.getAnthropicApiKey() ?? '');
  protected readonly costPreview = signal(this.settingsService.getCostPreviewEnabled());
  protected readonly scanDepth = signal<ScanDepth>(this.settingsService.getScanDepth());
  protected readonly model = signal<AnthropicModel>(this.settingsService.getModel());
  protected readonly anonymizeAuthors = signal(this.settingsService.getAnonymizeAuthors());
  protected readonly reveal = signal(false);
  protected readonly status = signal<'idle' | 'saved' | 'cleared'>('idle');
  protected readonly depthOptions = SCAN_DEPTH_OPTIONS;
  protected readonly modelOptions = ANTHROPIC_MODEL_OPTIONS;
  protected readonly canSave = computed(
    () => this.githubPat().trim().length > 0 && this.anthropicApiKey().trim().length > 0,
  );

  protected toggleReveal(): void {
    this.reveal.update((v) => !v);
  }

  protected toggleCostPreview(): void {
    const next = !this.costPreview();
    this.costPreview.set(next);
    this.settingsService.setCostPreviewEnabled(next);
  }

  protected toggleAnonymizeAuthors(): void {
    const next = !this.anonymizeAuthors();
    this.anonymizeAuthors.set(next);
    this.settingsService.setAnonymizeAuthors(next);
  }

  protected setDepth(depth: ScanDepth): void {
    this.scanDepth.set(depth);
    this.settingsService.setScanDepth(depth);
  }

  protected setModel(model: AnthropicModel): void {
    this.model.set(model);
    this.settingsService.setModel(model);
  }

  protected save(): void {
    if (!this.canSave()) return;
    this.settingsService.saveSettings({
      githubPat: this.githubPat().trim(),
      anthropicApiKey: this.anthropicApiKey().trim(),
      costPreviewEnabled: this.costPreview(),
      scanDepth: this.scanDepth(),
      model: this.model(),
      anonymizeAuthors: this.anonymizeAuthors(),
    });
    this.status.set('saved');
  }

  protected clear(): void {
    this.settingsService.clearSettings();
    this.githubPat.set('');
    this.anthropicApiKey.set('');
    this.costPreview.set(true);
    this.scanDepth.set('shallow');
    this.model.set('claude-haiku-4-5');
    this.anonymizeAuthors.set(true);
    this.status.set('cleared');
  }
}
