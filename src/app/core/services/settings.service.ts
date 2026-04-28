import { Injectable, signal } from '@angular/core';
import {
  ANTHROPIC_MODEL_OPTIONS,
  AnthropicModel,
  DEFAULT_ANTHROPIC_MODEL,
} from '../models/anthropic-model.model';
import { DEFAULT_SCAN_DEPTH, ScanDepth, SCAN_DEPTH_OPTIONS } from '../models/scan-depth.model';
import { MergecraftSettings } from '../models/settings.model';

const GITHUB_PAT_KEY = 'mergecraft_github_pat';
const ANTHROPIC_API_KEY_KEY = 'mergecraft_anthropic_api_key';
const COST_PREVIEW_KEY = 'mergecraft_cost_preview_enabled';
const SCAN_DEPTH_KEY = 'mergecraft_scan_depth';
const MODEL_KEY = 'mergecraft_model';
const ANONYMIZE_AUTHORS_KEY = 'mergecraft_anonymize_authors';

const VALID_DEPTHS = new Set<ScanDepth>(SCAN_DEPTH_OPTIONS.map(o => o.value));
const VALID_MODELS = new Set<AnthropicModel>(ANTHROPIC_MODEL_OPTIONS.map(o => o.value));

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly settingsVersion = signal(0);

  readonly hasRequiredSettings = (): boolean => {
    this.settingsVersion();
    return !!this.getGithubPat() && !!this.getAnthropicApiKey();
  };

  getGithubPat(): string | null {
    return this.read(GITHUB_PAT_KEY);
  }

  getAnthropicApiKey(): string | null {
    return this.read(ANTHROPIC_API_KEY_KEY);
  }

  getCostPreviewEnabled(): boolean {
    const stored = this.read(COST_PREVIEW_KEY);
    if (stored === null) return true;
    return stored !== 'false';
  }

  getScanDepth(): ScanDepth {
    const stored = this.read(SCAN_DEPTH_KEY);
    if (stored && VALID_DEPTHS.has(stored as ScanDepth)) return stored as ScanDepth;
    return DEFAULT_SCAN_DEPTH;
  }

  getModel(): AnthropicModel {
    const stored = this.read(MODEL_KEY);
    if (stored && VALID_MODELS.has(stored as AnthropicModel)) return stored as AnthropicModel;
    return DEFAULT_ANTHROPIC_MODEL;
  }

  getAnonymizeAuthors(): boolean {
    const stored = this.read(ANONYMIZE_AUTHORS_KEY);
    if (stored === null) return true;
    return stored !== 'false';
  }

  saveSettings(settings: MergecraftSettings): void {
    this.write(GITHUB_PAT_KEY, settings.githubPat);
    this.write(ANTHROPIC_API_KEY_KEY, settings.anthropicApiKey);
    this.write(COST_PREVIEW_KEY, settings.costPreviewEnabled ? 'true' : 'false');
    this.write(SCAN_DEPTH_KEY, settings.scanDepth);
    this.write(MODEL_KEY, settings.model);
    this.write(ANONYMIZE_AUTHORS_KEY, settings.anonymizeAuthors ? 'true' : 'false');
    this.settingsVersion.update(v => v + 1);
  }

  setCostPreviewEnabled(enabled: boolean): void {
    this.write(COST_PREVIEW_KEY, enabled ? 'true' : 'false');
    this.settingsVersion.update(v => v + 1);
  }

  setScanDepth(depth: ScanDepth): void {
    this.write(SCAN_DEPTH_KEY, depth);
    this.settingsVersion.update(v => v + 1);
  }

  setModel(model: AnthropicModel): void {
    this.write(MODEL_KEY, model);
    this.settingsVersion.update(v => v + 1);
  }

  setAnonymizeAuthors(enabled: boolean): void {
    this.write(ANONYMIZE_AUTHORS_KEY, enabled ? 'true' : 'false');
    this.settingsVersion.update(v => v + 1);
  }

  clearSettings(): void {
    this.remove(GITHUB_PAT_KEY);
    this.remove(ANTHROPIC_API_KEY_KEY);
    this.remove(COST_PREVIEW_KEY);
    this.remove(SCAN_DEPTH_KEY);
    this.remove(MODEL_KEY);
    this.remove(ANONYMIZE_AUTHORS_KEY);
    this.settingsVersion.update(v => v + 1);
  }

  /** Signal that increments on any settings change. Read it in computed/effect to react to writes. */
  changes() {
    return this.settingsVersion.asReadonly();
  }

  private read(key: string): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  }

  private write(key: string, value: string): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  }

  private remove(key: string): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  }
}
