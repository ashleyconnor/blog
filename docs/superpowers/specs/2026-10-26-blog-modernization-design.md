# Blog modernization — design

Date: 2026-10-26
Status: draft, awaiting Ashley's approval

## Why

The blog (ashleyconnor.co.uk) is a Jekyll 3.10 / Ruby 2.7.8 site on the Minimal Mistakes theme, hosted on Cloudflare Pages. It has 7 open Dependabot alerts, an end-of-life Ruby, dead CI (an S3/CloudFront deploy targeting a `master` branch, an `rspec` job with no specs) and a Cloudflare build workaround (`ffi < 1.17`). Writing felt like enough of a chore that Ashley started a separate TIL collection to lower the bar.

Ashley wants a blog that:

- is pleasant to write for — one command to start a post, with structure checks done by AI while the writing stays Ashley's own;
- supports several kinds of content (long posts, TILs, photo galleries, and occasionally rich interactive "NYT-style" pieces), all in one stream;
- looks distinctive and modern (Tailwind, deep navy, good free fonts);
- scores 100 on Lighthouse;
- deploys cleanly on Cloudflare with PR previews that get cleaned up after merge.

## Goals

1. Close all open Dependabot alerts on the current site **first**, as its own PR, so `main` is safe while the rebuild happens.
2. Rebuild the site in **Astro + Tailwind CSS**, fully static.
3. **Several content types** in one paginated homepage stream: `post`, `til`, `photos`. New types can be added later.
4. **TIL on its own subdomain**: til.ashleyconnor.co.uk.
5. **Resume as a web page**, with the PDF as an optional download.
6. **Authoring CLI** (`pnpm new`) plus an AI structure review command.
7. **Lighthouse 100** (Performance, Accessibility, Best Practices, SEO) on normal pages, enforced in CI.
8. **Cloudflare Workers static assets** deployment for both sites, with per-PR previews and cleanup after merge/close.
9. **Every currently-live URL keeps working** (same URL or a 301).

## Non-goals

- Server-side rendering or any per-request code. The sites are static files; no Worker script unless a future feature needs one.
- A CMS / web editor. Authoring is files in git.
- AI-written content. AI checks structure; it never rewrites prose.
- Comments, analytics, newsletter, search (can come later).
- Light mode at launch (see Theming).

## Anti-goals (would be a failure even if it works)

- Breaking existing inbound links or losing SEO for existing posts.
- A design that only looks right on the author's machine (e.g. text colour depending on OS dark mode).
- Heavy JS shipped to every page because one interactive post needed it.
- A busy homepage where it's hard to tell where one item ends and the next begins.
- An authoring flow that's more ceremony than the current `make post`.

## Constraints

- DNS is already on Cloudflare.
- The current production site must keep serving until the new one is approved and cut over.
- All fonts must be open source / free (OFL etc.) and self-hosted.
- Licence for posts stays CC BY-NC-ND 4.0 (shown in footer, as in README).

## Current state worth knowing

Live URLs (from the production sitemap, served at `www.ashleyconnor.co.uk`; apex 301s to www):

- Posts: `/YYYY/MM/DD/<slug>.html` (10 posts). Note the async-python post's URL date is `2025/04/24` while its front matter says `2025-04-23 19:39 -0700` — Jekyll used UTC. Redirects must be generated from the **live URLs**, not recomputed.
- TILs: `/til/<YYYY-MM-DD-slug>` (5 TILs) and `/til/index`.
- `/instaboxd/privacy/` — privacy policy for an app; **must stay at exactly this URL** on the main domain.
- `/page2/` pagination, `/assets/pdfs/resume.pdf`, `/feed.xml` (jekyll-feed).
- Some posts use `redirect_from` / `alias` front matter and Liquid tags (twitter embeds) — migrate these to equivalents (redirects file, static embeds/blockquotes).
- Images live under `/assets/images/...` (some filenames have spaces).

## Decisions made with Ashley

### Stack

- **Astro** (latest stable) + **Tailwind CSS** (v4) + **MDX**. TypeScript.
- **pnpm workspace monorepo**:
  - `apps/blog` → ashleyconnor.co.uk
  - `apps/til` → til.ashleyconnor.co.uk
  - `packages/ui` → shared Tailwind theme/tokens, layout, components (code block, figure, callout, gallery, etc.)
  - `content/` → all content, shared by both apps (the blog needs TIL entries for its stream; the TIL app renders them).
- Interactive components are Astro islands (`client:visible`) so their JS only loads when scrolled to. Framework per-island is the builder's choice; prefer plain Astro/vanilla, Svelte or Preact for size.

### Content types

| Type | Lives on | Source | Homepage stream shows |
|---|---|---|---|
| `post` | blog | `content/posts/` — `.md` (basic) or folder with `index.mdx` + `components/` + data (advanced) | title, one-line excerpt, reading time; "Interactive" label if advanced |
| `til` | til subdomain | `content/til/*.md` | single line, links **out** to til subdomain |
| `photos` | blog | `content/photos/<slug>/` folder of images + `index.md` | title + 3 thumbnails + "+N" count; click → full gallery page with lightbox |

Common front matter: `title`, `date`, `tags[]`, `excerpt?`, `draft?`, `unlisted?`, `updated?`.

- **Tags** come from a fixed list in `content/tags.yml` (slug + display name + optional description). Every entry needs at least one tag; an unknown tag fails the build. The `pnpm new` "add new tag" option appends to `tags.yml`. Initial list and assignments for existing content are in the **Tag proposal** appendix (Ashley to review).
- **`unlisted: true`** — page is built and reachable at its URL, but excluded from the stream, type indexes, tag pages, feeds and sitemap. Replaces Jekyll's `hide: true`; the 2014 digital-nomad post migrates as unlisted (Ashley's decision). Photos: optional per-image captions/alt in front matter; **all images require alt text** (build fails otherwise). EXIF/GPS metadata is stripped from published images.

Content collections validate front matter with schemas; unknown tags or missing fields fail the build.

### Pages (blog)

- `/` — the stream (all types, newest first, paginated).
- Per-type indexes: `/posts/`, `/photos/` (TIL index lives on the subdomain).
- `/tags/<tag>/` — my call, cheap with collections.
- `/resume/` — experience timeline page; "Download PDF" button.
- `/instaboxd/privacy/` — migrated as-is.
- 404 page.
- RSS: one combined feed at `/feed.xml` (keeps the existing feed URL) plus per-type feeds. TIL site has its own feed.

### Visual design (approved via mockups)

- **Direction A**: deep navy background `#0f1629`, surface `#18223b`, hairlines `#232e49`, headings `#f1f5ff`, body text `#c9d3e6`, muted `#7d8aa6`.
- Accents by type: posts periwinkle `#8ab4ff`, TIL teal `#7fd1c7`, photos amber `#f0b86e`.
- Fonts: **Space Grotesk** (headings), **Inter** (body), **JetBrains Mono** (code, dates, labels). Self-hosted (e.g. Fontsource), subset, `font-display: swap`, preload the critical weights.
- All text colours are set explicitly — never inherited from browser/OS defaults (a mockup bug showed black-on-navy in dark mode; must not happen).
- **Homepage layout: "grouped by month"** — month headings (mono, uppercase, hairline under), each item a row: small type icon on the left, title (+ excerpt for posts, thumbnails for photos) in the middle, day number on the right. No mixed cards; consistent rhythm and generous spacing so items are clearly separate.
- **Reading column ~680px centred on desktop**, full-width on mobile. Wide elements (maps, galleries, scrolly sections) may break out of the column.
- Post page: type pill, big Space Grotesk title, meta line (date · reading time · tags), table of contents for long posts (sticky sidebar on wide screens), code blocks with filename + copy button + line highlighting (Shiki/Expressive Code), figures with captions, responsive AVIF/WebP via Astro `<Image>`, lightbox for images.
- Resume page styled after the "experience timeline" reference (vertical line, role/company/dates, bullet points, tech chips).
- Visual mockups that were approved are in `.superpowers/brainstorm/` (gitignored, local only): `visual-style-a-v2.html` (post page), `homepage-v3.html` option 2 (homepage).

### Theming

- **Dark only at launch** (my call; Ashley didn't object). Colours are defined as tokens so a system-following light mode can be added later without touching components.

### Authoring

`pnpm new` — interactive prompt (e.g. @clack/prompts):

1. Title → slug, date, file path.
2. Type: post / til / photos (one per entry), list built from available templates.
3. Tags: multi-select from all existing tags + "add new".
4. Basic or advanced (posts): basic = single `.md`; advanced = folder with `index.mdx`, `components/`, `data/`.
5. Writes front matter with `draft: true`, opens the file in `$EDITOR`, starts the dev server for the right app at that page.

Templates live in `templates/<type>[-advanced]/`; adding a folder adds an option. Extracting reusable templates from posts is a later, optional step.

`/review-post` — a Claude Code slash command (in `.claude/commands/`) that reviews a draft for structure (intro/hook, heading hierarchy, flow, conclusion), missing alt text, broken links, leftover TODOs and front-matter issues, and **reports** findings. It does not edit prose.

Publishing = remove `draft` (or set false) and merge.

`README.md` documents the workflow (it currently says "TODO").

### Cloudflare

- **Workers with static assets** (no Worker script), two Workers: `blog` and `til`. Config in `apps/*/wrangler.jsonc`, committed.
- Custom domains: `www.ashleyconnor.co.uk` (+ apex), `til.ashleyconnor.co.uk`.
- `_redirects` / `_headers` per app: legacy URL 301s (generated from the live sitemap + `redirect_from`/`alias` front matter), `/til/*` on the main domain → til subdomain, long-cache headers for hashed assets, security headers.
- **CI on GitHub Actions** running `wrangler` (my call, over dashboard-connected builds — keeps build, Lighthouse, preview and cleanup in readable YAML):
  - On PR: build both apps, upload preview versions with alias `pr-<number>`, post/update a single PR comment with both preview URLs, run Lighthouse CI against the previews and fail if a key page drops below 100 in any category. Previews send `X-Robots-Tag: noindex`.
  - On PR merge/close: delete that PR's preview aliases (or, if Cloudflare offers no delete API, a scheduled prune job), mark the comment expired.
  - On push to `main`: deploy both to production.
- Needs a Cloudflare API token (Workers edit scope) + account ID as repo secrets — Ashley creates these.
- Remove: `jekyll_aws_deploy.yml`, the rspec workflow, `Dockerfile`, `Makefile` Jekyll targets, Ruby files, `jekyll-til/`, the old Pages project (after cutover).

### Delivery order

1. **PR 1 — Dependabot (current Jekyll site):** upgrade Ruby to a supported 3.x the Pages build image supports, bump gems so all open alerts (faraday, concurrent-ruby, addressable) are on patched versions, drop the `ffi` pin if no longer needed, delete the dead AWS + rspec workflows. Verify with a Pages preview build before merge.
2. **PR 2+ — new site, merged to `main` in small PRs** (my call). Jekyll stays at the repo root and keeps deploying via Pages until cutover; the new site lives in `apps/`, `packages/`, `content/` alongside it. Until cutover the production job deploys the Workers to their `workers.dev` URLs only (no custom domains), so nothing public changes. Content is migrated into `content/` as a copy; Jekyll's copies are deleted at cutover.
3. **Cutover PR:** attach custom domains to the Workers, verify redirects against every live URL (scripted check from the live sitemap), delete the Jekyll files, then retire the Pages project.

### Canonical host (my call)

Keep **`www.ashleyconnor.co.uk`** canonical — it's what's indexed today. The apex → www 301 stays as a Cloudflare redirect rule (zone level; `_redirects` can't match hosts). Astro `site`, canonical tags, sitemap and feeds all use `https://www.ashleyconnor.co.uk`. TIL canonical is `https://til.ashleyconnor.co.uk`.

### Drafts (my call)

Drafts are **built on PR previews** (with a visible "Draft" banner and noindex) and **excluded from production builds**, controlled by a build-time env flag. This lets Ashley and `/review-post` see a draft rendered before publishing.

## Lighthouse 100 — what's in scope

- 100 in all four categories on: homepage, a basic post, a TIL, a photo gallery, resume, a tag page — mobile and desktop profiles.
- Interactive (advanced) posts: designed for 100 (static first screen, islands below the fold with `client:visible`), checked in CI but not a hard gate.

## Left to the builder

- Exact Astro/Tailwind/Node versions, Shiki vs Expressive Code, lightbox library, prompt library, island framework.
- Directory layout details inside the monorepo, package scripts, test approach.
- Resume data format (e.g. YAML/JSON in `content/resume`) and how the PDF is produced (e.g. Playwright print-to-PDF at build time from the resume page with a print stylesheet). Initial content transcribed from the current `assets/pdfs/resume.pdf`.
- New URL scheme for posts/photos, as long as every old URL 301s to its new home.
- Icon set (open source).
- How the tag list for the CLI is gathered.

## Appendix — Tag proposal (for Ashley's review)

Initial vocabulary (12): `python`, `elixir`, `rails`, `sveltekit`, `docker`, `devops`, `cloudflare`, `security`, `macos`, `tools`, `career`, `travel`.

| Entry | Type | Proposed tags |
|---|---|---|
| The digital nomad and immigration law (2014, unlisted) | post | travel, career |
| Deploying a Phoenix application to Dokku (2016) | post | elixir, devops |
| Shipping Dokku logs with Logspout to Papertrail (2016) | post | devops |
| Local Rails development with Docker and Docker Compose (2017) | post | rails, docker |
| Configuring SSL certificates for local development (2021) | post | security, tools |
| Deploying SvelteKit using Cloudflare Workers (2021) | post | sveltekit, cloudflare |
| Authenticated server-rendered pages with SvelteKit and Supabase (2021) | post | sveltekit, security |
| To London and back: my worst tech interview (2022) | post | career |
| Pay transparency (2022) | post | career |
| Python's async gap: why the stdlib needs run_sync (2025) | post | python |
| Run a shell script over images with Automator (2022) | til | macos, tools |
| How to remove Self Control (2022) | til | macos |
| Elixir pattern matching in anon functions (2022) | til | elixir |
| Strip DRM from Audible audiobooks (2022) | til | tools, python |
| Auto-activate a venv with direnv (2025) | til | python, tools |
