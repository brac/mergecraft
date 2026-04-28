import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/repo-select/repo-select.component').then((m) => m.RepoSelectComponent),
    title: 'Mergecraft — Repo',
  },
  {
    path: 'analysis',
    loadComponent: () =>
      import('./features/analysis/analysis.component').then((m) => m.AnalysisComponent),
    title: 'Mergecraft — Analysis',
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings.component').then((m) => m.SettingsComponent),
    title: 'Mergecraft — Settings',
  },
  { path: '**', redirectTo: '' },
];
