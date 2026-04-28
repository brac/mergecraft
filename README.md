# Mergecraft

[![CI](https://github.com/brac/mergecraft/actions/workflows/ci.yml/badge.svg)](https://github.com/brac/mergecraft/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

LLM-powered cross-PR retrospective analysis. No backend, no telemetry, no key custody — runs entirely in your browser using API keys you bring.

## What it does

Pick a GitHub repo, select a batch of merged PRs (up to 30), and Mergecraft fetches the metadata locally then asks Claude to surface patterns *across* the batch — not single-PR observations:

- **Anti-patterns** — recurring problems like oversized PRs, thin descriptions, weak commit hygiene
- **Review friction** — long time-to-merge, many review rounds, contentious threads
- **Author tendencies** — per-author patterns in PR size, response style, recurring themes
- **Churn hotspots** (Survey/Deep modes) — files touched by many PRs in the batch, computed locally without LLM tokens

Each finding cites specific PRs as evidence with clickable links back to GitHub.

## Architecture

Mergecraft is a static SPA. There is **no backend** — no proxy, no serverless function, no telemetry. Every API call (GitHub REST, Anthropic Messages) happens directly from your browser using API keys *you* provide and *you* store.

- Your GitHub PAT and Anthropic API key live in `localStorage` and never leave your browser.
- Analysis results auto-download as JSON. A short history (up to 20 entries with summary previews) is kept in `localStorage`.
- The full analysis JSON is **not** stored in `localStorage` — only the downloaded file. Lose the file, lose the data.

This trade-off is deliberate. The cost: any browser extension or hostile script with page access could read your keys. The benefit: zero infrastructure, zero key custody, transparent code path, free to self-host on GitHub Pages / Netlify / Vercel.

## Quick start

Requires Node.js 20+ and an Angular CLI–compatible environment.

```bash
git clone https://github.com/<your-fork>/mergecraft.git
cd mergecraft
npm install
npm start          # or: ng serve
```

Open http://localhost:4200, then:

1. Go to **Settings** and paste a GitHub PAT and an Anthropic API key (see below)
2. Pick a scan depth and model (defaults: Shallow + Haiku 4.5 = cheapest)
3. Go back to the home page, enter `owner/repo`, click **Load PRs**
4. Pick up to 30 PRs, click **Analyze selected**

### API keys

**GitHub Personal Access Token** — create at https://github.com/settings/tokens
- For public repos only: `public_repo` scope is enough
- For private repos: `repo` scope
- Set an expiration (90 days is reasonable). Revoke when done.

**Anthropic API key** — create at https://console.anthropic.com/settings/keys
- Anthropic API access is **separate** from Claude.ai / Pro / Max — you need pay-as-you-go credits on the developer console
- A few dollars covers many runs (rough estimates: ~$0.06 per Shallow 30-PR run on Haiku, ~$0.50 for Deep on Opus)

## Scan modes

Configurable in **Settings → Scan depth**.

| Mode | Data sent to Claude | What it unlocks |
|------|---------------------|------------------|
| **Shallow** | Metadata + reviews + inline comments | Cheap baseline. No file or diff data. |
| **Survey** | + per-PR file lists | Churn hotspots; model can cite churn-prone files. |
| **Deep** | + truncated diffs (≤6KB per PR; skipped if >30 changed files) | Code-pattern analysis — copy-paste, naming inconsistencies, missing error handling. |

## Models

Three Anthropic models supported with a live cost preview before each run.

| Model | Input / Output ($/MTok) | Notes |
|---|---|---|
| Claude Haiku 4.5 | $1 / $5 | Fastest, cheapest. Good default. |
| Claude Sonnet 4.6 | $3 / $15 | Balanced. |
| Claude Opus 4.7 | $5 / $25 | Best at nuance. Pair with Deep mode. |

The cost preview uses Anthropic's free `count_tokens` endpoint to give a `min – max` USD range before you commit. Disable in Settings if you don't want the extra step.

## Privacy

- **Your keys never leave your browser.** They're in `localStorage` only.
- **Your PR data never touches our infrastructure.** It goes from GitHub straight to Anthropic.
- **No analytics, no telemetry, no tracking.** This is a static site with no observers.

The flip side: anything with browser access (extensions, devtools running malicious code, a compromised host) can read your `localStorage`. Treat your keys accordingly. Use scoped tokens, set expirations, revoke when done.

## Self-hosting

The build output is a static bundle:

```bash
npm run build      # outputs to dist/mergecraft/browser
```

Deploy that directory to any static host. For GitHub Pages, set the base href to your repo path:

```bash
ng build --base-href "/<repo-name>/"
```

Recommended Content-Security-Policy for self-hosters:

```
default-src 'self';
connect-src 'self' https://api.github.com https://api.anthropic.com;
style-src 'self' 'unsafe-inline';
```

## Limits & known constraints

- Batch size capped at 30 PRs (context-window guardrail; cost guardrail)
- `listMergedPrs` paginates up to 5 pages of `state=closed` PRs (≤500 scanned) and returns the 100 most-recent merged ones
- Reviews / inline comments / files are fetched as a single `per_page=100` page per PR — very long threads or huge PRs will be truncated
- Deep diffs are skipped for PRs with >30 changed files
- Anthropic browser-direct calls require the `anthropic-dangerous-direct-browser-access` header (already wired)

## Roadmap

- More signal sources (timeline events, commit messages)
- Prompt caching across repeated runs of the same batch
- Multi-provider support (OpenAI, Gemini)
- Optional GitHub OAuth flow for users who'd rather not manage a PAT
- Unit tests

## Contributing

PRs welcome. Two non-negotiable constraints to keep in mind:

1. **No backend.** Anything that needs a server, a proxy, or a serverless function is out of scope.
2. **No external state management libraries.** Services + signals only.

`CLAUDE.md` has more detail on architecture and folder layout.

## License

MIT — see [LICENSE](./LICENSE).
