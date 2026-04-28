# CLAUDE.md — Mergecraft

## What is Mergecraft?

Mergecraft is an open source Angular SPA that analyzes GitHub PR patterns using LLM-powered analysis. Users provide a GitHub repo, select a batch of merged PRs, and the tool performs cross-PR retrospective analysis — surfacing anti-patterns, review friction, churn hotspots, and author tendencies.

The differentiator is **cross-PR pattern analysis**. This is not a single-PR review tool. The value comes from analyzing patterns across a corpus of PRs.

## Architecture — Non-Negotiable Constraints

- **Zero backend.** This is a static site. No server, no serverless functions, no proxy. All API calls (GitHub REST API, Anthropic API) happen client-side in the browser.
- **Zero server storage.** PR data never touches any infrastructure we control. User API keys are stored in localStorage only. This is a security and trust constraint, not a convenience choice.
- **User-supplied keys.** GitHub PAT and Anthropic API key are provided by the user and stored in localStorage with the prefix `mergecraft_`. No environment files, no hardcoded keys, no key management service.

## Tech Stack

- **Angular** — latest stable version, standalone components only (no NgModules beyond what Angular requires)
- **TypeScript** — strict mode
- **Angular Signals** — use signals for component and service state where possible
- **RxJS** — use for HTTP calls and async streams, but prefer signals for state
- **Tailwind CSS v4** — utility-first styling, keep it clean and functional
- **No state management libraries** — no NgRx, no Akita, no NGXS. Simple services with signals.
- **No backend dependencies** — no Express, no Firebase, no Supabase, nothing

## Folder Structure

```
src/app/
  core/
    services/           # All injectable services
    models/             # TypeScript interfaces only, no classes
  features/
    settings/           # API key configuration
    repo-select/        # Repo input, PR listing, batch selection
    analysis/           # Analysis trigger and results display
  shared/
    components/         # Reusable UI components
```

## Key Interfaces

The analysis pipeline follows this data flow:

1. **PrData** — raw PR data fetched from GitHub (title, body, author, reviews, comments, file names, line counts)
2. **MergecraftAnalysis** — structured LLM output containing findings across categories
3. **ChurnAnalysis** — computed client-side from file frequency data, not LLM-generated

Analysis output categories:
- **AntiPatternFinding** — repeated issues across PRs (oversized PRs, missing descriptions, etc.)
- **ReviewFrictionFinding** — excessive review rounds, long time-to-merge, contentious threads
- **ChurnHotspot** — files/directories appearing in many PRs (computed client-side)
- **AuthorTendency** — per-author patterns in PR size, review style, feedback themes

All finding types include `prReferences: PrReference[]` to link back to specific PRs as evidence.

Full interface definitions are in `src/app/core/models/`.

## Context Window Strategy (MVP)

MVP uses **Option B — metadata + review comments**. This means:
- We send PR metadata (title, body, author, file names, line counts, timestamps) plus full review comment text
- We do **not** send diffs in MVP
- This keeps token usage at roughly 500–2,000 tokens per PR
- 30 PRs fits comfortably within context limits
- Churn hotspots are computed client-side from file name frequency — no LLM tokens spent

A depth slider (shallow ↔ deep scan with diffs) is planned for post-MVP.

## LLM Integration

- **Anthropic only for MVP.** No provider abstraction layer yet.
- API calls go directly to Anthropic's REST API from the browser using the user's API key
- The analysis prompt instructs Claude to return JSON conforming to the `MergecraftAnalysis` interface
- Multi-provider support (OpenAI, GitHub Copilot) is planned for later — do not build abstractions for it now

## Coding Standards

- Standalone components with inline templates for small components, separate template files when templates exceed ~30 lines
- Use `inject()` for dependency injection, not constructor injection
- Use Angular signals (`signal()`, `computed()`, `effect()`) for component state
- Use `Observable` for HTTP calls and async operations in services
- Lazy-load all feature routes
- Prefix localStorage keys with `mergecraft_`
- No unit tests yet — they will be added in a dedicated pass later
- Error handling: basic `console.error` in services for now, proper error handling will be layered in later
- No HTTP interceptors yet

## What NOT to Do

- Do not add a backend or proxy server for any reason
- Do not install state management libraries
- Do not build provider abstractions for LLM backends — Anthropic only
- Do not add environment files for API keys
- Do not over-engineer error handling or retry logic yet
- Do not add dark mode yet
- Do not create NgModules
- Do not hardcode any API keys or tokens anywhere

## PR Batch Limits

- MVP caps batch selection at 30 PRs
- This is a context window and cost constraint, not a UX choice
- The cap may increase in future versions as we add chunked analysis

## Development Notes

- Run with `ng serve`
- App should compile with zero errors and zero warnings
- All routes should be navigable
- Settings page should be fully functional (save, clear, mask/reveal keys)
- When settings are missing, a banner should direct users to the settings page
