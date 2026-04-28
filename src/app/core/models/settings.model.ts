import { AnthropicModel } from './anthropic-model.model';
import { ScanDepth } from './scan-depth.model';

export interface MergecraftSettings {
  githubPat: string;
  anthropicApiKey: string;
  costPreviewEnabled: boolean;
  scanDepth: ScanDepth;
  model: AnthropicModel;
}
