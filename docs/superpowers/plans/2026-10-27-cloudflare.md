# Cloudflare Workers, PR Previews and Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the blog and TIL sites as two static-assets-only Cloudflare Workers from GitHub Actions. Every PR gets previews of both sites, drafts shown and noindex, with a Lighthouse 100 gate. Previews are deleted when the PR closes. Every push to `main` deploys to `workers.dev`. A scripted, owner-gated cutover moves the real domains off Cloudflare Pages.

**Architecture:**
- Each app has a committed `apps/*/wrangler.jsonc`. There is no `main` script: assets only, with `_redirects` and `_headers` emitted at build time.
- Header rules are a pure function in `@ac/content`, emitted the same way `_redirects` is.
- Cloudflare's redirect, header and trailing-slash semantics are tested locally against `wrangler dev`. This replaces the hand-written simulator's assumptions.
- One workflow, `.github/workflows/site.yml`:
  - checks on every PR and push;
  - `wrangler preview --name pr-<n>` per app, one PR comment updated in place, and Lighthouse CI against the previews;
  - `wrangler preview delete` on close;
  - `wrangler deploy` on `main`.
- `scripts/verify-live.ts` checks every legacy URL against any pair of origins (`workers.dev` before cutover, the real domains after).

**Tech Stack:** Wrangler 4.149.0 (Workers static assets, `wrangler preview` ≥ 4.135), GitHub Actions, `@lhci/cli` 0.15.1 (already pinned), Vitest 5, Node 24, pnpm 12.15.0.

**Spec:** `docs/superpowers/specs/2026-10-26-blog-modernization-design.md`, the sections "Cloudflare", "Delivery order" (step 3: cutover), "Canonical host" and "Drafts"; and Goals 7–9.

Plan 4 of 4. It is stacked on plan 3 (branch `claude/authoring`, PR #43).

**Owner-only steps.** I cannot do these; Ashley must:
- create the repo secrets `CLOUDFLARE_API_TOKEN` (permission: Workers Scripts Edit) and `CLOUDFLARE_ACCOUNT_ID`;
- approve the cutover;
- remove the custom domains from the Pages project;
- add the zone-level apex → www redirect rule;
- delete the Pages project and the dead AWS secrets.

## Global Constraints

- **Static only.** Workers carry no `main` script and no bindings.
  - Worker names: `blog` and `til`.
  - `assets.directory` is `./dist`.
  - `assets.html_handling` is `"auto-trailing-slash"`.
  - `assets.not_found_handling` is `"404-page"`.
  - `workers_dev: true` and `preview_urls: true`.
  - `compatibility_date` is `"2026-10-01"`.
- **No custom domains or routes before the cutover task.** Until cutover, production is `https://blog.<subdomain>.workers.dev` and `https://til.<subdomain>.workers.dev`, and nothing public changes. Jekyll on Pages keeps serving `www`.
- **Drafts on previews only.** Preview builds set `PUBLIC_SHOW_DRAFTS=true` and `PREVIEW=true`. Production builds set neither.
  - Every response from a preview carries `X-Robots-Tag: noindex`.
  - Production responses never do.
- **Header rules.** These apply on both sites:
  - `/_astro/*` → `Cache-Control: public, max-age=31536000, immutable`.
  - `/*` →
    - `X-Content-Type-Options: nosniff`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
    - `X-Frame-Options: DENY`
  - No CSP in this plan: Expressive Code and the inlined styles would need nonces or hashes. That is logged as a follow-up.
- **Lighthouse.** The CI gate is 100 in all four categories, desktop and mobile, best of 3 runs, on the plan-2 URL list run against the preview URLs. Advanced and interactive posts are measured but are not a gate (spec). A CI-only performance shortfall is fixed at the cause. Thresholds are never lowered.
- **Credentials.** Secrets reach only jobs on PRs from this repository: `github.event.pull_request.head.repo.full_name == github.repository`. Never echo a token. Pin third-party actions to a full commit SHA, with the tag in a comment.
- **Jekyll keeps deploying until cutover.** New top-level paths go in `_config.yml` `exclude`.

## Review Focus

1. **Trailing slashes and `.html` on Workers.** `html_handling: auto-trailing-slash` may itself redirect `/2022/04/03/pay-transparency.html` or `/til/<id>.html` before `_redirects` runs, or redirect with a 307.
   - Expected: every legacy URL ends in one or two 301 hops at a 200 page. Task 1 tests this against real `wrangler dev`.
2. **`_redirects` to another host.** `/til/* https://til…/:splat 301` must work on Workers static assets exactly as the plan-2 simulator assumed. Task 1.
3. **Preview noindex.** A preview build must never omit `X-Robots-Tag`, and a production build must never include it. Task 1 builds both ways.
4. **Fork PRs.** A PR from a fork gets checks but no preview, comment or secrets, and the workflow still passes. Task 3.
5. **Closed-PR cleanup when the preview never existed.** For example, a fork PR or a PR whose build failed. `wrangler preview delete` on a missing preview must not fail the job. Task 3.

---

### Task 1: Worker config, header rules and local Cloudflare semantics

**Files:**
- Create:
  - `apps/blog/wrangler.jsonc`, `apps/til/wrangler.jsonc`
  - `packages/content/src/headers.ts` → `buildHeaders(opts: { preview: boolean }): string` (Cloudflare `_headers` text)
  - `apps/blog/src/pages/[headers].ts` and `apps/til/src/pages/[headers].ts` (emit `dist/_headers`, as `[redirects].ts` emits `_redirects`; reuse its pattern)
- Modify:
  - root `package.json`: devDependency `wrangler: 4.149.0`; scripts `preview:blog`/`preview:til` (`wrangler dev` on the built dist)
  - `.gitignore` (`.wrangler/`)
  - `_config.yml` exclude, if needed
- Test: `packages/content/test/headers.test.ts`, `tests/workers.test.ts`

**Interfaces:**
- `buildHeaders({ preview })` returns the rules in Global Constraints. With `preview: true`, it adds `/*` → `X-Robots-Tag: noindex`.
- `PREVIEW` is read through a `isPreviewBuild()` helper next to `showDrafts()` in `listing.ts`, with the same `import.meta.env` / `process.env` handling.

- [ ] **Step 1: Write failing tests**
  - Unit (`headers.test.ts`):
    - the exact production text, with no `X-Robots-Tag`;
    - the preview text has `X-Robots-Tag: noindex` under `/*`;
    - every header line is `Name: value` and the file parses as Cloudflare `_headers` (path lines unindented, headers indented two spaces).
  - Integration (`tests/workers.test.ts`):
    - Build both apps with real content into in-repo temp dirs, once as production and once with `PREVIEW=true PUBLIC_SHOW_DRAFTS=true`.
    - Start `wrangler dev --local --port <free>` for each against those dists, with the right `--config`. Override `assets.directory` with `--assets <dist>`.
    - Assert on the production build:
      - every URL in `scripts/legacy-sitemap.json` plus the plan-2 extra URLs ends at a 200 within 2 hops, every hop is a 301, and TIL hops are rewritten to the local TIL port for following (Review Focus 1, 2);
      - `/instaboxd/privacy/` is 200 with 0 hops;
      - an unknown path is 404 and has the 404 page's `<h1>`;
      - `/_astro/<a real file>` has the immutable cache header;
      - `/` has the four security headers and no `X-Robots-Tag`.
    - Assert on the preview build: `/` and a post have `X-Robots-Tag: noindex` (Review Focus 3).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - If `auto-trailing-slash` breaks a legacy URL (Review Focus 1), fix it in `_redirects` generation (an explicit rule) or by choosing another `html_handling`. Record the choice and the evidence in the report. Never weaken the hop or 301 assertions.
- [ ] **Step 4: Run.** Expected: PASS. Then run `pnpm test`, `pnpm check` and `pnpm build`.
- [ ] **Step 5: Commit** `feat: Cloudflare Workers config, header rules and local Workers tests`.

### Task 2: Live URL verification script

**Files:**
- Create: `scripts/lib/verify-live.ts`, `scripts/verify-live.ts`
- Modify: root `package.json` (`"verify:live": "node --experimental-strip-types scripts/verify-live.ts"`)
- Test: `scripts/test/verify-live.test.ts`

**Interfaces:**
- `verifyUrls(urls: string[], origins: { blog: string; til: string }, fetcher: (url: string) => Promise<{ status: number; location: string | null }>): Promise<Failure[]>`
  - Follows redirects manually, at most 5 hops. Production TIL origin URLs are mapped to `origins.til`.
  - A URL passes when every hop is a 301 and it ends at a 200 on the expected host.
  - `Failure = { url: string; chain: string[]; reason: string }`.
- CLI: `pnpm verify:live [--blog <origin>] [--til <origin>]`. The defaults are the production origins. It walks `scripts/legacy-sitemap.json` plus the extra URLs (reuse the list from `tests/legacy-urls.test.ts`, moved into `scripts/lib/legacy-urls.ts` and imported by both). It prints one line per failure and exits 0 or 1. It uses `fetch` with `redirect: 'manual'`.

- [ ] **Step 1: Write failing tests** with a fake fetcher:
  - a 301 → 200 chain passes;
  - a 302 hop fails, naming the hop;
  - a 404 end fails;
  - a loop longer than 5 hops fails;
  - a TIL redirect to `https://til.ashleyconnor.co.uk/x/` is followed on the overridden TIL origin;
  - `tests/legacy-urls.test.ts` still passes after the list moves.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement. Step 4: Run.** Expected: PASS; then `pnpm test`.
- [ ] **Step 5: Commit** `feat(scripts): verify every legacy URL against live origins`.

### Task 3: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/site.yml`
- Modify: `lighthouserc.cjs` (a remote mode: when `LHCI_BLOG_URL` and `LHCI_TIL_URL` are set, audit those origins instead of starting `astro preview`, with the same paths, presets and assertions)
- Test: `tests/workflow.test.ts`

**Workflow:**
- Triggers: `pull_request` (`opened`, `synchronize`, `reopened`, `closed`), `push` to `main`, and `workflow_dispatch`.
- Workflow-level settings: `permissions: contents: read`, and `concurrency` per PR or ref with `cancel-in-progress` for PRs.
- `checks` job (all events except `closed`): pnpm setup from `packageManager`, Node from `.nvmrc`, and `pnpm install --frozen-lockfile`. Then:
  - `pnpm exec playwright install --with-deps chromium-headless-shell` (for the resume PDF);
  - `pnpm test`, `pnpm check`, `pnpm build`.
- `preview` job (PR, not closed, same-repo only; `needs: checks`; `permissions: pull-requests: write`):
  1. Build with `PUBLIC_SHOW_DRAFTS=true PREVIEW=true`.
  2. In each of `apps/blog` and `apps/til`, run `pnpm exec wrangler preview --name pr-<n> --json` and read `.preview.urls[0]`.
  3. Upsert one comment marked `<!-- site-previews -->`, listing both URLs and the commit SHA (`gh pr comment --edit-last --create-if-none`, or a marker search through `gh api`).
  4. Run `pnpm lighthouse` with `LHCI_BLOG_URL` and `LHCI_TIL_URL` set to the preview URLs. This fails the job below 100.
- `cleanup` job (PR `closed`, same-repo only):
  1. Run `wrangler preview delete --name pr-<n> --skip-confirmation` for each app. A "not found" result counts as success (Review Focus 5).
  2. Edit the marked comment to say the previews were removed.
- `deploy` job (push to `main`; `needs: checks`): production build, then `pnpm exec wrangler deploy` in each app.
- Every job that uses secrets checks that they exist first. If `CLOUDFLARE_API_TOKEN` is unset, it skips with a notice instead of failing, so the workflow is green before Ashley adds the secrets.

- [ ] **Step 1: Write failing tests** in `tests/workflow.test.ts`. Parse the YAML with `yaml` and assert:
  - the triggers;
  - each job's `if:` covers the same-repo guard (Review Focus 4) and the closed and not-closed split;
  - `cleanup` treats not-found as success (Review Focus 5);
  - `deploy` runs only on push to `main`;
  - every `uses:` is pinned to a 40-char SHA;
  - no step `run:` echoes `secrets.`;
  - preview builds set both env flags, and the deploy build sets neither;
  - `lighthouserc.cjs` in remote mode yields the 7 URLs on the given origins.
  - Also run `actionlint` through `npx --yes @action-validator/cli` or the `rhysd/actionlint` Docker image, if one is available offline. If neither is, say so and rely on the structural test.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement. Step 4: Run.** Expected: PASS; then `pnpm test`.
- [ ] **Step 5: Commit** `ci: checks, PR previews with Lighthouse, cleanup and workers.dev deploys`.

### Task 4: Owner handoff docs

**Files:**
- Modify: `README.md` (a Deploying section)
- Create: `docs/cutover.md`
- Test: extend `tests/authoring-docs.test.ts`

The docs cover:
- **The secrets to create:** the exact token permission (Account › Workers Scripts › Edit), where to find the account ID, and `gh secret set` commands.
- **What each workflow event does.**
- **How to read the preview comment.**
- **`pnpm verify:live` usage.**
- **The cutover runbook in `docs/cutover.md`:** an ordered checklist, marking which steps Claude does in a PR and which Ashley does in the dashboard. It covers:
  1. confirm `main` deploys are green and `pnpm verify:live --blog https://blog.<sub>.workers.dev --til https://til.<sub>.workers.dev` passes;
  2. the cutover PR adds `routes` with `custom_domain: true` for `www.ashleyconnor.co.uk` (blog) and `til.ashleyconnor.co.uk` (til), and deletes the Jekyll files (`_posts/`, `_til/`, `_layouts/`, `_includes/`, `_data/`, `_pages/`, `_plugins/`, `jekyll-til/`, `assets/` except anything still served, `Gemfile*`, `_config.yml`, `.ruby-version`, the Jekyll `Makefile` targets, root `index.html`, `instaboxd/`, `robots.txt`);
  3. Ashley removes the custom domains from the Pages project, then merges;
  4. Ashley adds or keeps the zone rule apex → `https://www.…` 301;
  5. `pnpm verify:live` against the real domains;
  6. Ashley deletes the Pages project and the dead `AWS_*` secrets;
  7. a rollback note: re-add the Pages custom domain.
- [ ] **Step 1: Failing doc test.** It checks that the README mentions `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `verify:live` and `docs/cutover.md`, and that the runbook lists the steps above in order. **Step 2: FAIL. Step 3: Write. Step 4: PASS.**
- [ ] **Step 5: Commit** `docs: deploying and the cutover runbook`.

### Task 5: Cutover PR (owner-gated; do not start without Ashley's explicit go)

Prepare the cutover branch from the merged state of PRs #42–#44:
- `routes` in both `wrangler.jsonc`;
- the Jekyll deletions listed in the runbook;
- README cleanup (remove "Old Jekyll workflow");
- `_config.yml` removal.

Then run:
- `pnpm test`, `pnpm check`, `pnpm build`;
- `pnpm verify:live` against the `workers.dev` origins.

Open the PR and stop. Merging, the Pages and DNS changes, and deleting the Pages project are Ashley's steps from the runbook.
