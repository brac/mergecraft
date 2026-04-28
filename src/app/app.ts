import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SettingsService } from './core/services/settings.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="border-b border-gray-200 bg-white">
      <nav class="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
        <a routerLink="/" class="text-lg font-semibold tracking-tight">Mergecraft</a>
        <div class="flex items-center gap-4 text-sm">
          <a
            routerLink="/"
            routerLinkActive="text-blue-600 font-medium"
            [routerLinkActiveOptions]="{ exact: true }"
            class="text-gray-700 hover:text-gray-900"
            >Repo</a
          >
          <a
            routerLink="/analysis"
            routerLinkActive="text-blue-600 font-medium"
            class="text-gray-700 hover:text-gray-900"
            >Analysis</a
          >
          <a
            routerLink="/settings"
            routerLinkActive="text-blue-600 font-medium"
            class="text-gray-700 hover:text-gray-900"
            >Settings</a
          >
        </div>
      </nav>
    </header>

    @if (showSettingsBanner()) {
      <div class="border-b border-amber-200 bg-amber-50">
        <div
          class="mx-auto flex max-w-5xl items-center justify-between px-6 py-2 text-sm text-amber-900"
        >
          <span
            >API keys aren't configured yet. Mergecraft can't fetch PRs or run analysis without
            them.</span
          >
          <a
            routerLink="/settings"
            class="ml-4 rounded border border-amber-300 bg-white px-3 py-1 text-amber-900 hover:bg-amber-100"
            >Open settings</a
          >
        </div>
      </div>
    }

    <main>
      <router-outlet />
    </main>

    <footer class="mt-12 border-t border-gray-200 bg-gray-50">
      <div
        class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4 text-xs text-gray-600"
      >
        <span>
          Static SPA · No backend · No telemetry · Keys live only in this browser's localStorage.
        </span>
        <span class="flex items-center gap-3">
          <a
            href="https://github.com/brac/mergecraft"
            target="_blank"
            rel="noopener"
            class="hover:text-gray-900 hover:underline"
            >Source</a
          >
          <span class="text-gray-300">·</span>
          <span class="text-gray-500">
            Use your own API keys at your own risk. Browser extensions, malware, or compromised
            devices can read localStorage — this site cannot protect against that.
          </span>
        </span>
      </div>
    </footer>
  `,
})
export class App {
  private readonly settings = inject(SettingsService);
  protected readonly showSettingsBanner = computed(() => {
    this.settings.changes()();
    return !this.settings.hasRequiredSettings();
  });
}
