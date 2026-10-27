# Dependabot / Ruby Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all 7 open Dependabot alerts on the current Jekyll site by moving to a supported Ruby and patched gems, without changing any published URL or page.

**Architecture:** Ruby 2.7.8 → 3.4.5 unlocks patched `faraday` (pulled in by `minimal-mistakes-jekyll` → `jekyll-gist` → `octokit`/`sawyer`), `concurrent-ruby` (via `i18n`) and `addressable` (via `jekyll`). The Jekyll stack itself stays at 3.10.0. A before/after diff of the built `_site` file list proves nothing published changed. Dead CI workflows are deleted in the same PR.

**Tech Stack:** Ruby 3.4.5 (mise, already installed locally), Bundler 2.x, Jekyll 3.10.0, Cloudflare Pages (existing project, builds from `main` root).

**Spec:** `docs/superpowers/specs/2026-10-26-blog-modernization-design.md` — "Delivery order", step 1.

This is plan 1 of 4. Later plans (written after this PR merges): 2 — Astro monorepo + content + design; 3 — authoring CLI + `/review-post`; 4 — Cloudflare Workers pipeline + cutover.

## Global Constraints

- Patched floors (from the open alerts): `faraday >= 2.14.3`, `concurrent-ruby >= 1.3.7`, `addressable >= 2.9.0`.
- Jekyll stays `3.10.0`; theme stays `minimal-mistakes-jekyll ~> 4.27.0`. No design or content changes.
- Every URL in the live sitemap must still be produced by the build (see Review Focus).
- Work on branch `claude/blog-modernization-d54a2c` → a PR into `main`; merge only after the Cloudflare Pages preview build for the PR succeeds.

## Review Focus

1. **Cloudflare Pages build image vs `.ruby-version`** — the Pages build must install Ruby 3.4.5 from `.ruby-version` and succeed; a local-only pass is not enough. Checked in Task 3 against the PR's Pages preview.
2. **Removing the `ffi < 1.17.0` pin** — newer `ffi` previously broke the Pages build; with Ruby 3.4 the pin should be unnecessary, but if the Pages build fails on `ffi`, restore the pin (`ffi` 1.16.x supports Ruby 3.4) rather than downgrading Ruby. Checked in Task 3.
3. **Liquid/Ruby 3 incompatibilities** — Liquid 4.0.4 on Ruby 3.2+ removed `taint`; if the build warns/fails on `tainted?`, the fix is bumping `liquid` within Jekyll 3.10's allowed range. Checked by the build in Task 1.
4. **Published-URL drift** — a gem bump (e.g. `jekyll-redirect-from`, `jekyll-feed`) must not add/remove pages; the `_site` file-list diff in Task 1 must be empty.
5. **Local custom gem `jekyll-til`** (path gem) — must still load under Ruby 3.4; covered by the `_site/til/*` entries in the file-list diff.

---

### Task 1: Upgrade Ruby and gems; prove output is unchanged

**Files:**
- Modify: `.ruby-version` (`2.7.8` → `3.4.5`)
- Modify: `Gemfile` (remove the `ffi < 1.17.0` pin and its "cloudflare pages junk" comment)
- Modify: `Gemfile.lock` (regenerated)
- Scratch (not committed): `$SCRATCH/site-before.txt`, `$SCRATCH/site-after.txt` where `$SCRATCH` is the session scratchpad directory

**Interfaces:**
- Produces: a `Gemfile.lock` with `RUBY VERSION ruby 3.4.5` and patched gems, used by Task 3's Pages build.

- [ ] **Step 1: Capture the baseline file list with the current Ruby**

```bash
mise exec ruby@2.7.8 -- bundle install
JEKYLL_ENV=production mise exec ruby@2.7.8 -- bundle exec jekyll build -d "$SCRATCH/site-before"
(cd "$SCRATCH/site-before" && find . -type f | sort) > "$SCRATCH/site-before.txt"
```
Expected: build succeeds; `site-before.txt` contains `./2025/04/24/pythons-async-gap-why-the-standard-library-needs-a-run-sync.html`, `./instaboxd/privacy/index.html`, `./til/2025-03-01-how-to-automatically-activate-venv-with-direnv.html` (or the directory form), `./feed.xml`, `./sitemap.xml`.
If the old toolchain no longer builds locally, use the live sitemap URL list instead (`curl -s https://www.ashleyconnor.co.uk/sitemap.xml`) as the baseline and compare against the new `_site/sitemap.xml` in Step 5.

- [ ] **Step 2: Bump Ruby and unpin ffi**

Set `.ruby-version` to `3.4.5`; delete the `# cloudflare pages junk` comment and `gem "ffi", "< 1.17.0"` line from `Gemfile`.

- [ ] **Step 3: Regenerate the lockfile**

```bash
mise exec ruby@3.4.5 -- bundle update --all
```
Expected: completes. Then check floors:
```bash
grep -E "^    (faraday|concurrent-ruby|addressable|jekyll) \(" Gemfile.lock
```
Expected: `faraday` ≥ 2.14.3, `concurrent-ruby` ≥ 1.3.7, `addressable` ≥ 2.9.0, `jekyll (3.10.0)`; `RUBY VERSION` block says `ruby 3.4.5`. If `faraday` is held below 2.14.3 by `octokit`/`sawyer` constraints, add `gem "faraday", ">= 2.14.3"` to `Gemfile` and re-run.

- [ ] **Step 4: Build with the new Ruby**

```bash
JEKYLL_ENV=production mise exec ruby@3.4.5 -- bundle exec jekyll build -d "$SCRATCH/site-after"
(cd "$SCRATCH/site-after" && find . -type f | sort) > "$SCRATCH/site-after.txt"
```
Expected: build succeeds with no errors (deprecation warnings acceptable; `tainted?` errors → see Review Focus 3).

- [ ] **Step 5: Diff output**

```bash
diff "$SCRATCH/site-before.txt" "$SCRATCH/site-after.txt"
```
Expected: no output. Any difference must be explained (e.g. a feed timestamp is not a file-list change) or fixed before continuing.

- [ ] **Step 6: Audit**

```bash
mise exec ruby@3.4.5 -- gem exec bundler-audit check --update
```
Expected: `No vulnerabilities found`.

- [ ] **Step 7: Commit**

```bash
git add .ruby-version Gemfile Gemfile.lock
git commit -m "chore(deps): upgrade to Ruby 3.4.5 and patch vulnerable gems"
```

### Task 2: Delete dead CI and Docker setup

**Files:**
- Delete: `.github/workflows/jekyll_aws_deploy.yml` (deploys to S3/CloudFront from nonexistent `master`)
- Delete: `.github/workflows/main.yml` (runs `rspec`; repo has no specs)
- Delete: `Dockerfile` (pins `ruby:2.7`, unused by Pages)

- [ ] **Step 1: Confirm nothing references them**

```bash
grep -rn "Dockerfile\|jekyll_aws_deploy\|rspec" --exclude-dir=.git --exclude-dir=docs --exclude-dir=.superpowers .
```
Expected: no hits outside the files being deleted.

- [ ] **Step 2: Delete and commit**

```bash
git rm .github/workflows/jekyll_aws_deploy.yml .github/workflows/main.yml Dockerfile
git commit -m "chore: remove dead AWS deploy, empty rspec workflow and Dockerfile"
```

### Task 3: Open the PR and verify on Cloudflare Pages

- [ ] **Step 1: Push and open the PR into `main`**

Title: `Upgrade to Ruby 3.4.5 and fix Dependabot alerts`. Body lists the 7 alerts (faraday ×3, concurrent-ruby ×3, addressable ×1), the before/after file-list check result, and the removed workflows.

- [ ] **Step 2: Verify the Pages preview build**

Expected: the Cloudflare Pages check on the PR is green and its preview URL serves `/`, `/2025/04/24/pythons-async-gap-why-the-standard-library-needs-a-run-sync.html`, `/til/2025-03-01-how-to-automatically-activate-venv-with-direnv` and `/instaboxd/privacy/` with HTTP 200.
If the build fails on Ruby install or `ffi`, apply Review Focus 1/2 and push a fix.

- [ ] **Step 3: Hand to Ashley for merge**

Merging is Ashley's call. After merge, confirm with:
```bash
gh api repos/ashleyconnor/blog/dependabot/alerts --jq '[.[] | select(.state=="open")] | length'
```
Expected: `0` (Dependabot may take a few minutes to rescan).
