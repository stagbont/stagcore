# Lessons Learned & Recurring Patterns

This document tracks bugs, failed approaches, regressions, user corrections, and architectural gotchas encountered during the development of Stagcore.

Before implementing new features, API routes, database migrations, or frontend components, review relevant sections below to avoid repeating past mistakes.

---

## Template for Entries

```markdown
### [YYYY-MM-DD] Short Descriptive Title of the Issue

- **Context / Area:** (e.g. Backend / Alembic / Better Auth / POS UI / Inventory Ledger)
- **What Went Wrong:** (Clear description of error, regression, or failure)
- **Root Cause:** (Why did it happen?)
- **The Fix:** (How was it resolved?)
- **Prevention Strategy:** (Rules, tests, or conventions to prevent recurrence)
```

---

## Logged Lessons

### [2026-09-02] Tailwind v4 `--spacing-*` collides with static design tokens

- **Context / Area:** Frontend / Tailwind v4 theme tokens (`globals.css`)
- **What Went Wrong:** DESIGNnotion.md ships `--spacing-4: 4px … --spacing-80: 80px` tokens. Naively copying them into `@theme` would silently redefine Tailwind's dynamic spacing scale (where `p-4` = `calc(var(--spacing) * 4)` = 1rem), shrinking every `p-4`/`gap-4` in the app to 4px.
- **Root Cause:** In v4, `--spacing-*` is a reserved namespace that generates utilities; static px values from a design spec must not use it.
- **The Fix:** Skipped the `--spacing-*` block; layout rhythm uses `--page-max-width` / `--section-gap` / `--card-padding` / `--element-gap` instead (see `globals.css` comment).
- **Prevention Strategy:** Before importing any token file into `@theme`, check each namespace against Tailwind v4 reserved ones (`--spacing-*`, `--color-*`, `--text-*`, `--radius-*`, `--shadow-*`, `--font-*`, `--transition-*`); rename or omit colliding static tokens.

### [2026-09-02] Higgsfield CLI setup in sandboxed sessions: npm -g blocked, OAuth loopback unregistered

- **Context / Area:** Tooling / Higgsfield CLI (`higgsfield`), agent sandbox installs.
- **What Went Wrong:** (1) `npm i -g @higgsfield/cli` failed with EROFS — first on `~/.npm/_cacache`, then on the global `node_modules` dir itself (read-only in sandbox). (2) `npx -y skills add higgsfield-ai/skills` failed the same way until the npm cache was redirected. (3) `higgsfield auth login` (v1.1.23 and v1.1.24) produces a Clerk URL with `redirect_uri=http://localhost:8765/callback` that the OAuth client rejects (`redirect_uri does not match any pre-registered redirect urls`), so browser sign-in can never succeed. The CLI README documents no token/API-key auth alternative.
- **Root Cause:** Sandbox allows writes only under the workspace and /tmp; home-dir tool paths are read-only. The OAuth failure is Higgsfield-side (unregistered loopback callback in their Clerk client), not user error.
- **The Fix:** Redirect the npm cache (`NPM_CONFIG_CACHE=/tmp/npm-cache`) and install to a writable prefix (`npm install --prefix /tmp/hf-cli @higgsfield/cli`), giving `/tmp/hf-cli/node_modules/.bin/higgsfield`. Auth stayed blocked — reported to user with the Higgsfield-support path. Companion skills were already present (`~/.agents/skills/higgsfield-*`, 8 skills).
- **Prevention Strategy:** For global npm installs in sandbox, default to `--prefix /tmp/<tool>` + `NPM_CONFIG_CACHE=/tmp/npm-cache`; never re-run a failing `npm i -g` without the cache redirect. Before handing a CLI OAuth URL to the user, sanity-check that its `redirect_uri` is plausibly registered (a `redirect_uri mismatch` error means no retry with the same binary can work — check for a newer CLI version first, then escalate to the vendor).

### [2026-09-02] Stale Next.js dev server 404s on routes that exist on disk

- **Context / Area:** Frontend / Next.js dev server (`npm run dev`), local ops.
- **What Went Wrong:** A `next dev` process left running for a day served Next.js 404 pages for `/` and `/login` even though `src/app/page.tsx` and `src/app/(auth)/login` existed, config was default, and no middleware was present. A fresh restart fixed it (`/` and `/login` returned 200).
- **Root Cause:** The long-lived dev server's route manifest went stale (file-watcher/restart drift); it also holds `frontend/.next/dev/lock`, so a second `next dev` refuses to start ("Another next dev server is already running") while the old one keeps 404ing.
- **The Fix:** Killed the stale PIDs, deleted `frontend/.next/dev/lock`, and started a fresh `npm run dev -- --port 3000` detached (`setsid -f ... </dev/null >>/tmp/stagcore-frontend.log 2>&1`). The pre-existing backend (`uvicorn`, port 8000) was healthy and left untouched.
- **Prevention Strategy:** When any existing route 404s in dev, check server age (`ps -o lstart -p <pid>`) and restart it before debugging routing/code; always clear a stale `.next/dev/lock` after killing the holder. Note sandboxed shell probes can't reach host-localhost ports reliably — verify from the host network instead.
