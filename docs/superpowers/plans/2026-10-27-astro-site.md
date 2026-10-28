# Astro Site (blog + TIL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the new blog (www) and TIL (til.) sites in Astro 7 + Tailwind 4 from shared, migrated content, matching the approved design, and scoring Lighthouse 100 locally — while the Jekyll site keeps deploying untouched.

**Architecture:** pnpm workspace. `content/` holds all entries (migrated from Jekyll by a one-off script). `packages/content` owns schemas, tag list loading and pure listing logic (stream, grouping, filtering) — unit-tested with Vitest. `packages/ui` owns design tokens, fonts, layouts and components. `apps/blog` and `apps/til` are thin Astro apps that wire collections to pages. Page-level behaviour is tested by building against `tests/fixtures/content` and asserting on `dist/` HTML.

**Tech Stack:** Node 24 (engines ≥ 22.23.4), pnpm 10+ workspaces, Astro 7.4, @astrojs/mdx 8, @astrojs/sitemap, @astrojs/rss, Tailwind 4.3 via `@tailwindcss/vite` + `@tailwindcss/typography`, Astro Fonts API (`fontProviders.fontsource()`), astro-expressive-code 0.44, PhotoSwipe 5, Vitest 5, Playwright 1.64 (resume PDF), @lhci/cli 0.15 (local Lighthouse).

**Spec:** `docs/superpowers/specs/2026-10-26-blog-modernization-design.md`

Plan 2 of 4. Out of scope here: `pnpm new` + `/review-post` (plan 3); Cloudflare Workers config, CI, previews, cutover and `_redirects` deployment checks (plan 4). This plan *generates* `_redirects` but does not deploy anything.

## Global Constraints

- Jekyll must keep building byte-for-byte the same file list on Cloudflare Pages until cutover. Every new top-level path is added to `_config.yml` `exclude`.
- Canonical origins: blog `https://www.ashleyconnor.co.uk`, TIL `https://til.ashleyconnor.co.uk` (Astro `site`).
- Colours (exact): bg `#0f1629`, surface `#18223b`, line `#232e49`, head `#f1f5ff`, text `#c9d3e6`, muted `#7d8aa6`, post `#8ab4ff`, til `#7fd1c7`, photo `#f0b86e`. Every text element gets an explicit colour from these tokens; nothing inherits UA/OS defaults.
- Fonts: Space Grotesk (headings), Inter (body), JetBrains Mono (code, dates, labels) — self-hosted via Astro Fonts API, `preload` only Inter + Space Grotesk.
- Reading column `max-w-[680px]` centred; full-width below `md`. Elements with class `breakout` may span wider (max 1100px).
- Dark only. `<meta name="color-scheme" content="dark">`.
- Content types: `post`, `til`, `photos`. Front matter: `title`, `date`, `tags` (≥1, all in `content/tags.yml`), `excerpt?`, `draft?`, `unlisted?`, `updated?`, `legacyUrls?` (string[]). Photos: `images: { src, alt (required, non-empty), caption? }[]`.
- Drafts: shown only when `PUBLIC_SHOW_DRAFTS=true` (with a "Draft" banner and `noindex`); excluded otherwise. Unlisted: built, but excluded from stream, type indexes, tag pages, feeds and sitemap.
- Licence footer: "Posts licensed CC BY-NC-ND 4.0" linking to https://creativecommons.org/licenses/by-nc-nd/4.0/.
- No client JS on any page except: code-block copy button (Expressive Code), PhotoSwipe on gallery pages, and islands inside advanced posts.

## Review Focus

1. **Jekyll still deploys** — a root `package.json` makes Cloudflare Pages also run a Node install; a Node version below Astro's engine floor or a failed install would break production deploys. Pin `.nvmrc` to `24` (Task 1) and confirm the Pages check on this plan's PR stays green.
2. **Legacy URL coverage** — every URL in the live sitemap snapshot (including `/2025/04/24/…` with the UTC date, `/til/<date-slug>`, `/til/index`, `/page2/`, `/blog/2014/…` aliases) must resolve to a built page or a `_redirects` rule. Test in Task 10.
3. **Expressive Code under Sätteri** — EC is a rehype integration; Astro 7 renders Markdown with Sätteri. If code blocks render without EC frames, switch the apps to the `unified()` processor from `@astrojs/markdown-remark` (Task 4). Test asserts the EC frame markup.
4. **Unlisted/draft leakage** — the 2014 post must not appear in stream, `/posts/`, tag pages, `feed.xml` or `sitemap-*.xml`, but `/2014/09/07/the-digital-nomad-and-immigration-law/` must exist. Tests in Tasks 2, 5 and 6.
5. **Photo privacy** — published images must carry no EXIF GPS data even if the source does. Test in Task 7 using a fixture JPEG with GPS tags.

---

### Task 1: Workspace scaffold, tokens, fonts, Jekyll isolation

**Files:**
- Create: `package.json` (private, `"packageManager": "pnpm@10.x"`, `"engines": {"node": ">=22.23.4"}`, scripts `build`, `test`, `check`, `dev:blog`, `dev:til`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `.nvmrc` (`24`), `vitest.config.ts` (projects: `packages/*`, `tests`)
- Create: `packages/ui/package.json` (`@ac/ui`), `packages/ui/src/styles/global.css` (Tailwind import, `@theme` tokens above as `--color-bg` … `--color-photo`, `--font-heading/body/mono` mapped to Fonts API variables, base element colours), `packages/ui/src/fonts.ts` exporting `fonts` array for `astro.config`
- Create: `apps/blog/{package.json,astro.config.ts,tsconfig.json,src/pages/index.astro}`, same for `apps/til`
- Modify: `_config.yml` `exclude` — add `apps`, `packages`, `content`, `templates`, `scripts`, `tests`, `node_modules`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `vitest.config.ts`, `.nvmrc`
- Modify: `.gitignore` — `node_modules/`, `dist/`, `.astro/`
- Test: `tests/scaffold.test.ts`

**Interfaces:**
- Produces: `@ac/ui/styles/global.css`; `import { fonts } from '@ac/ui/fonts'` → `AstroFontConfig[]` with cssVariables `--font-heading`, `--font-body`, `--font-mono`.

- [ ] **Step 1: Write failing test** `tests/scaffold.test.ts` → `it('blog and til build with design tokens')`: runs `pnpm --filter blog build` and `pnpm --filter til build` (execa, 120s timeout), then asserts some `apps/blog/dist/_astro/*.css` contains `#0f1629` and `--font-heading`, and `apps/blog/dist/index.html` contains `<meta name="color-scheme" content="dark">`.
- [ ] **Step 2: Run** `pnpm vitest run tests/scaffold.test.ts` — Expected: FAIL (no workspace).
- [ ] **Step 3: Implement** the files above. Both `astro.config.ts`: `output: 'static'`, `site` per Global Constraints, `fonts`, `vite.plugins: [tailwindcss()]`, `trailingSlash: 'always'`, `build.format: 'directory'`.
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Jekyll unaffected**: `JEKYLL_ENV=production bundle exec jekyll build -d $SCRATCH/j && (cd $SCRATCH/j && find . -type f | sort) | grep -cE '^\./(apps|packages|content|node_modules|package\.json)'` — Expected: `0`.
- [ ] **Step 6: Commit** `feat: scaffold pnpm workspace with blog and til Astro apps`.

### Task 2: Content package — schemas, tags, listing logic

**Files:**
- Create: `packages/content/package.json` (`@ac/content`), `src/schema.ts`, `src/tags.ts`, `src/listing.ts`, `src/collections.ts`
- Create: `content/tags.yml` — the 12 tags from the spec appendix (`slug`, `name`)
- Test: `packages/content/test/listing.test.ts`, `packages/content/test/schema.test.ts`

**Interfaces:**
- Produces:
  - `type EntryType = 'post' | 'til' | 'photos'`
  - `interface StreamItem { type: EntryType; id: string; title: string; date: Date; tags: string[]; excerpt?: string; href: string; advanced: boolean; minutes?: number; thumbs?: ImageRef[]; extraCount?: number; draft: boolean; unlisted: boolean }`
  - `isPublic(item, { showDrafts }: { showDrafts: boolean }): boolean` — false if `unlisted`, or `draft && !showDrafts`
  - `buildStream(items: StreamItem[], opts: { showDrafts: boolean }): StreamItem[]` — public only, newest first, ties broken by `id`
  - `groupByMonth(items: StreamItem[]): { key: string /* 'YYYY-MM' */; label: string /* 'April 2025' */; items: StreamItem[] }[]` — month in `America/Los_Angeles` time zone
  - `loadTags(path?: string): Map<string, { slug: string; name: string }>`
  - `postSchema`, `tilSchema`, `photosSchema` (zod, from `astro/zod`) — `tags` refined against `loadTags()`
  - `defineSharedCollections(contentRoot: string)` → `{ posts, til, photos }` using `glob()` loaders: posts `**/{*.md,*/index.mdx,*/index.md}` under `posts/`, til `*.md`, photos `*/index.md`
  - `contentRoot()` → `process.env.CONTENT_ROOT ?? <repo>/content`

- [ ] **Step 1: Write failing tests**:
  - `buildStream excludes unlisted and drafts` — 3 items (public, unlisted, draft) → `['public']`; with `showDrafts: true` → `['draft','public']` sorted by date.
  - `buildStream sorts newest first` — dates 2022-01-05, 2025-04-23, 2014-09-07 → that order reversed.
  - `groupByMonth uses LA time` — item dated `2025-04-24T02:39:00Z` lands in key `2025-04` label `April 2025`; item `2025-03-01T07:59:00Z` lands in `2025-02`.
  - `postSchema rejects unknown tag` — `tags: ['pyhton']` fails with message containing `Unknown tag "pyhton"`.
  - `postSchema rejects empty tags` — `tags: []` fails.
  - `photosSchema rejects empty alt` — `images: [{ src: 'a.jpg', alt: '' }]` fails.
- [ ] **Step 2: Run** `pnpm vitest run packages/content` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the interfaces above.
- [ ] **Step 4: Run** — Expected: all PASS.
- [ ] **Step 5: Commit** `feat(content): schemas, tag list and stream logic`.

### Task 3: Migrate Jekyll content

**Files:**
- Create: `scripts/migrate-jekyll.ts` (run with `node --experimental-strip-types`), `scripts/lib/convert.ts`, `scripts/legacy-sitemap.json` (snapshot of the live sitemap `<loc>` list, rewritten to `https://www.ashleyconnor.co.uk`)
- Create (output, committed): `content/posts/<YYYY-MM-DD-slug>.md` ×10, `content/til/<YYYY-MM-DD-slug>.md` ×5, `content/pages/instaboxd-privacy.md`, images under `content/posts/_images/…`
- Test: `scripts/test/convert.test.ts`

**Interfaces:**
- Produces: `convertBody(md: string): { body: string; warnings: string[] }`, `convertFrontMatter(fm: Record<string, unknown>, ctx: { file: string; liveUrl: string; tags: string[] }): Record<string, unknown>`.
- Consumes: schemas from Task 2 (output must validate).

Rules (exact):
- `{% highlight <lang> %}` … `{% endhighlight %}` → fenced ```` ```<lang> ````; `yml` → `yaml`.
- Kramdown IAL `{: .notice--warning}` after a paragraph → wrap that paragraph in `<Callout type="warning">` — the post becomes `.mdx`; `{: .small}` → `<small>` around the preceding line.
- `/assets/images/<path>` → relative path to the copied file under `content/posts/_images/<path>`; filenames with spaces renamed to kebab-case.
- Dropbox image URLs: fetch with `?dl=1`; if 200, store under `_images/dropbox/` and rewrite; otherwise keep the URL and emit warning `dropbox image unavailable: <url>`.
- Front matter: keep `title`, `date`, `excerpt` (drop if `""`); `hide: true` → `unlisted: true`; `tags` from the spec appendix table; `legacyUrls` = live sitemap URL for this file (matched by slug) + `redirect_from`/`alias` entries, as absolute paths.
- TIL `_til/index.html` is not migrated (replaced by the TIL app index).
- `instaboxd/privacy.md` copied as a page with `title` only.

- [ ] **Step 1: Write failing tests** for: highlight conversion; `yml`→`yaml`; notice IAL → `<Callout type="warning">`; image path rewrite incl. `Screenshot 2021-06-07 155944.png` → `screenshot-2021-06-07-155944.png`; `hide: true` → `unlisted: true`; async post gets `legacyUrls: ['/2025/04/24/pythons-async-gap-why-the-standard-library-needs-a-run-sync.html']`; 2014 post gets its two `/blog/2014/09/07/…/` aliases plus the `.html` URL.
- [ ] **Step 2: Run** `pnpm vitest run scripts` — Expected: FAIL.
- [ ] **Step 3: Implement** `convert.ts`, then `migrate-jekyll.ts` (reads `_posts`, `_til`, `instaboxd/`, writes `content/`, prints warnings).
- [ ] **Step 4: Run tests** — Expected: PASS. **Run migration** `node --experimental-strip-types scripts/migrate-jekyll.ts` — Expected: 10 posts, 5 TILs, 1 page written; warnings printed and recorded in the ledger.
- [ ] **Step 5: Validate**: `pnpm --filter blog exec astro sync` — Expected: no schema errors.
- [ ] **Step 6: Commit** `feat(content): migrate posts, TILs and pages from Jekyll`.

### Task 4: UI kit — layout and content components

**Files:**
- Create in `packages/ui/src/components/`: `BaseLayout.astro` (props `{ title; description?; canonical: URL; ogImage?; noindex?: boolean; draft?: boolean }`; renders `<Font>`s, meta, OG/Twitter tags, `SiteNav`, `<main>`, `Footer`, Draft banner), `SiteNav.astro` (Posts · TIL ↗ · Photos · Resume), `Footer.astro`, `Prose.astro` (typography wrapper, token colours), `Figure.astro` (`{ src: ImageMetadata; alt: string; caption?: string; wide?: boolean }`, uses `<Picture formats={['avif','webp']}>`), `Callout.astro` (`{ type: 'note' | 'warning' | 'tip' }`), `TypeIcon.astro` (`{ type: EntryType }`), `TypePill.astro`, `Toc.astro` (`{ headings: { depth; slug; text }[] }`, depth 2–3 only, rendered when ≥3 headings)
- Create: `packages/ui/src/expressive-code.ts` — shared EC config: theme `github-dark-default` with background overridden to surface `#18223b`, border `#232e49`, frames on, copy button on, JetBrains Mono
- Modify: both `astro.config.ts` — add `expressiveCode(ecConfig)` before `mdx()`
- Test: `tests/ui.test.ts`, fixtures `tests/fixtures/content/posts/{basic-post.md,advanced-post/index.mdx}`

- [ ] **Step 1: Write failing test** `tests/ui.test.ts`: builds blog with `CONTENT_ROOT=tests/fixtures/content` once (`beforeAll`), then:
  - `code blocks render with Expressive Code frame` — fixture post's HTML contains `class="expressive-code"` and a `title` frame for ```` ```py title="example.py" ````.
  - `figure renders avif and webp` — `<source type="image/avif"` and `<figcaption>` present.
  - `long post renders TOC` — basic-post (4 h2s) has `nav[aria-label="Table of contents"]`.
  - `no text inherits UA colour` — built CSS sets `color:` on `body`, `a`, `h1`–`h4`, `code`, `figcaption`, `nav`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** components, plus the post route at its final path `apps/blog/src/pages/[year]/[month]/[day]/[slug]/index.astro` (Task 5 adds the listing pages around it).
- [ ] **Step 4: Run** — Expected: PASS. If the EC assertion fails because Sätteri skips rehype integrations: install `@astrojs/markdown-remark`, set `markdown: { processor: unified() }` in both configs, ledger a Ruling, re-run.
- [ ] **Step 5: Commit** `feat(ui): layout, typography, code, figure, callout and TOC components`.

### Task 5: Blog pages — stream, indexes, tags, posts

**Files:**
- Create in `apps/blog/src/pages/`: `[...page].astro` (homepage stream, `paginate(stream, { pageSize: 15 })`, page 1 at `/`, then `/page/2/`), `posts/index.astro`, `photos/index.astro`, `tags/[tag]/index.astro`, `tags/index.astro`, `404.astro`, `instaboxd/privacy/index.astro`
- Modify: `[year]/[month]/[day]/[slug]/index.astro` from Task 4 — URL date from entry date in LA time
- Create: `packages/ui/src/components/{StreamList.astro,StreamItem.astro,Pager.astro}` — month header (mono, uppercase, hairline), row grid `22px 1fr auto` (icon · content · day), TIL rows single line linking to `https://til.ashleyconnor.co.uk/<id>/`
- Modify: `apps/blog/src/content.config.ts` → `export const collections = defineSharedCollections(contentRoot())`
- Test: `tests/blog-pages.test.ts` + fixtures (2 posts, 1 unlisted post, 1 draft, 2 TILs, 1 photos)

- [ ] **Step 1: Write failing tests** (build with fixtures, `PUBLIC_SHOW_DRAFTS` unset):
  - `homepage groups by month` — `h2` texts in order equal fixture months, newest first.
  - `homepage excludes unlisted and draft` — titles absent from `/index.html`, `/posts/index.html`, `/tags/*/index.html`.
  - `unlisted post page exists` — its URL's `index.html` exists and has no `noindex`.
  - `TIL rows link to subdomain` — every TIL `href` starts with `https://til.ashleyconnor.co.uk/`.
  - `post URL uses LA date` — fixture dated `2025-04-23 19:39 -0700` builds at `/2025/04/23/<slug>/`.
  - `drafts appear with banner when PUBLIC_SHOW_DRAFTS=true` — second build; draft listed, page has `Draft` banner and `<meta name="robots" content="noindex">`.
  - `homepage is centred column` — homepage list container has class `max-w-[680px]`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** pages and stream components (StreamItem shows excerpt + `· N min` for posts; "Interactive" label when `advanced`; 3 thumbs + `+N` for photos).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Visual check**: `pnpm dev:blog`, open `/` and one post at 1280px and 375px in the browser pane; compare with `.superpowers/brainstorm/*/content/homepage-v3.html` option 2 and `visual-style-a-v2.html`. Screenshot both widths into the ledger notes.
- [ ] **Step 6: Commit** `feat(blog): homepage stream, indexes, tag and post pages`.

### Task 6: Feeds, sitemap, redirects, robots

**Files:**
- Create: `apps/blog/src/pages/feed.xml.ts` (all public types; TIL items link to subdomain), `apps/blog/src/pages/{posts,photos}/feed.xml.ts`, `apps/til/src/pages/feed.xml.ts`, `apps/*/public/robots.txt`
- Create: `packages/content/src/redirects.ts` → `buildRedirects(entries: { legacyUrls?: string[]; href: string; type: EntryType }[]): string` (Cloudflare `_redirects` text, `301`), plus static lines: `/til/index /` → TIL origin, `/til/* https://til.ashleyconnor.co.uk/:splat 301`, `/page2/ /page/2/ 301`, `/assets/pdfs/resume.pdf /resume.pdf 301`
- Create: `apps/blog/src/pages/_redirects.ts` (static endpoint emitting `buildRedirects`)
- Modify: both `astro.config.ts` — `sitemap({ filter })` excluding unlisted/draft URLs
- Test: `packages/content/test/redirects.test.ts`, extend `tests/blog-pages.test.ts`

- [ ] **Step 1: Write failing tests**:
  - `buildRedirects maps legacy .html to new URL` — `/2025/04/24/pythons-async-gap-…html /2025/04/23/pythons-async-gap-…/ 301`.
  - `TIL legacy URLs go to subdomain` — `/til/2022-12-01-about-elixir-pattern-matching-in-anon-functions https://til.ashleyconnor.co.uk/2022-12-01-about-elixir-pattern-matching-in-anon-functions/ 301` (explicit line before the `/til/*` wildcard).
  - `feed excludes unlisted` and `sitemap excludes unlisted` (fixture build).
  - `feed keeps /feed.xml path` — `dist/feed.xml` exists.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: feeds, sitemaps and legacy redirects`.

### Task 7: Photos — gallery, thumbnails, metadata stripping

**Files:**
- Create: `apps/blog/src/pages/photos/[slug]/index.astro` (intro text + grid of `<Picture>` thumbs linking to full-size AVIF/WebP; `data-pswp-width/height`), `packages/ui/src/components/Gallery.astro`, `packages/ui/src/scripts/lightbox.ts` (PhotoSwipe, imported only by `Gallery.astro`, initialised on first click)
- Create: `tests/fixtures/content/photos/anza-borrego/{index.md,a.jpg,b.jpg,c.jpg,d.jpg}` — `a.jpg` contains EXIF GPS (create with `exiftool` or `sharp().withMetadata({ exif: { IFD3: { GPSLatitude: … } } })` in a fixture script `tests/fixtures/make-gps-jpeg.ts`)
- Test: `tests/photos.test.ts`

- [ ] **Step 1: Write failing tests**:
  - `stream shows 3 thumbs and +1` for the 4-image fixture.
  - `gallery page lists all images with alt` — 4 `<img alt="…">`, none empty.
  - `published images have no GPS` — every `dist/_astro/*.{avif,webp,jpg}` derived from `a.jpg` has no `GPS` tag (`exifr.gps(file)` returns `undefined`).
  - `lightbox JS only on gallery pages` — `/index.html` contains no `<script type="module"`; the gallery page references a chunk containing `photoswipe`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(blog): photo galleries with lightbox`.

### Task 8: TIL site

**Files:**
- Create in `apps/til/src/pages/`: `[...page].astro` (TILs only, grouped by month via `groupByMonth`, `pageSize: 30`), `[slug]/index.astro` (slug = entry id, e.g. `2022-12-01-about-elixir-pattern-matching-in-anon-functions`), `404.astro`
- Modify: `apps/til/src/content.config.ts` (same shared collections)
- Nav on TIL: "Ashley Connor's TIL" + link back to `https://www.ashleyconnor.co.uk/`; tags link to `https://www.ashleyconnor.co.uk/tags/<tag>/`
- Test: `tests/til.test.ts`

- [ ] **Step 1: Write failing tests**: `TIL entry URL is /<id>/`; `TIL index groups by month`; `TIL canonical uses til origin` (`<link rel="canonical" href="https://til.ashleyconnor.co.uk/…">`); `TIL accent is teal` (type pill uses `--color-til`).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(til): TIL site`.

### Task 9: Resume page and PDF

**Files:**
- Create: `content/resume.yml` — transcribed from `assets/pdfs/resume.pdf` (read it with the PDF reader; keep wording verbatim): `name`, `headline`, `location`, `links[]`, `summary`, `experience[] { company, role, start, end?, bullets[], tech[] }`, `education[]`, `skills[]`
- Create: `packages/content/src/resume.ts` (`resumeSchema`), `apps/blog/src/pages/resume/index.astro` (timeline: vertical hairline, dot per role, role/company/dates, bullets, tech chips; "Download PDF" link to `/resume.pdf`), `packages/ui/src/styles/print.css` (A4, light background, black text, no nav/footer)
- Create: `scripts/resume-pdf.ts` — starts `astro preview` for blog, Playwright `page.pdf({ path: 'apps/blog/dist/resume.pdf', format: 'A4', printBackground: true })` on `/resume/`; blog `build` script runs it after `astro build`
- Test: `tests/resume.test.ts`

- [ ] **Step 1: Write failing tests**: `resume.yml validates`; `resume page lists every role in resume.yml`; `dist/resume.pdf exists, starts with %PDF, ≤ 3 pages` (count `/Type /Page` objects).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(blog): resume page with generated PDF`.

### Task 10: Lighthouse 100 locally + legacy URL coverage

**Files:**
- Create: `lighthouserc.cjs` — collects on `astro preview` of real content for `/`, one basic post (`/2022/04/03/pay-transparency/`), `/posts/`, `/tags/python/`, `/resume/`, TIL index and one TIL; presets desktop and mobile; asserts `categories:performance|accessibility|best-practices|seo` `minScore: 1`
- Create: `tests/legacy-urls.test.ts`
- Modify: root `package.json` script `lighthouse`

- [ ] **Step 1: Write failing test** `every legacy URL resolves` — for each URL in `scripts/legacy-sitemap.json`: its path maps to an existing `dist` file in the right app, or matches a `_redirects` rule whose target exists. (`/instaboxd/privacy/` must be a file, not a redirect.)
- [ ] **Step 2: Run** — FAIL or PASS depending on Task 6; fix gaps until PASS.
- [ ] **Step 3: Run** `pnpm build && pnpm lighthouse` — Expected: all assertions pass. For each failing audit, fix the cause (e.g. contrast, missing `alt`, unused CSS, font preload) rather than lowering thresholds; ledger each fix.
- [ ] **Step 4: Run full suite** `pnpm test` — Expected: all PASS. `pnpm check` (astro check) — Expected: 0 errors.
- [ ] **Step 5: Commit** `test: Lighthouse 100 budget and legacy URL coverage`.
- [ ] **Step 6: Open PR** into `main` titled `New Astro blog and TIL sites (not yet deployed)`; confirm the Cloudflare Pages (Jekyll) check is still green (Review Focus 1).
