# Authoring CLI and `/review-post` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One command (`pnpm new`) starts any entry as a schema-valid draft and opens it rendered; one Claude Code command (`/review-post`) reports structure problems in a draft without touching the prose.

**Architecture:** Pure, unit-tested planning logic in `scripts/lib/` (slugs, ids, paths, front matter, template discovery, tag appends, review checks), thin interactive and side-effect shells in `scripts/new.ts` and `scripts/review-checks.ts`. Body skeletons live in `templates/<type>[-advanced]/`; the CLI writes front matter itself so it always matches `@ac/content`'s schemas. `/review-post` runs the deterministic checker first, then asks Claude for a structure-only review.

**Tech Stack:** Node 24 (`--experimental-strip-types`), `@clack/prompts`, `yaml`, `github-slugger`, `@ac/content` (schemas, `loadTags`, `contentRoot`, `postPath`, `TIME_ZONE`), Vitest 5, Astro 7.4 dev servers.

**Spec:** `docs/superpowers/specs/2026-10-26-blog-modernization-design.md` — "Authoring", and Goal 6.

Plan 3 of 4. Builds on plan 2 (branch `claude/astro-site`, PR 42). Out of scope: Cloudflare/CI (plan 4), extracting templates from existing posts (spec: "later, optional"), a lightbox for post images (owner decision pending).

## Global Constraints

- Every entry `pnpm new` writes must pass the real `@ac/content` schemas unchanged (strict objects: only `title`, `date`, `tags`, `excerpt?`, `draft`, `unlisted?`, `updated?`, `legacyUrls?`; photos add `images[]` with non-empty `alt`, at least one image).
- New entries are written with `draft: true`. Dates are ISO with the Los Angeles offset (`TIME_ZONE` from `@ac/content`), e.g. `"2026-10-27T09:15:00-07:00"`; the id's `YYYY-MM-DD` prefix is the LA calendar date.
- Paths: basic post `content/posts/YYYY-MM-DD-<slug>.md`; advanced post `content/posts/YYYY-MM-DD-<slug>/index.mdx` plus `components/` and `data/`; TIL `content/til/YYYY-MM-DD-<slug>.md`; photos `content/photos/<slug>/index.md` (no date prefix — the gallery URL is `/photos/<id>/`). All paths are under `contentRoot()` so `CONTENT_ROOT` redirects them in tests.
- Never overwrite an existing entry: refuse with the conflicting path.
- Tags come only from `content/tags.yml`; "add new" appends `- slug: <slug>\n  name: <Name>` to the end of the file, leaving existing text byte-for-byte unchanged, and refuses a slug that already exists.
- AI checks structure; it never rewrites prose. `/review-post` reports only and must not edit the file.
- Jekyll keeps building the same file list: every new top-level path goes in `_config.yml` `exclude` (`templates` already is).
- Tests that copy content to a temporary `CONTENT_ROOT` and run an Astro build must put the copy inside the repository (e.g. a gitignored `tests/.tmp/` directory), because MDX `@ac/ui/...` imports only resolve from inside the workspace.
- Authoring must not be more ceremony than the old `make post <name>`: a non-interactive form `pnpm new --type til --title "…" --tags tools` works with no prompts.

## Review Focus

1. **Titles that slugify badly** — punctuation-only, emoji, non-Latin or very long titles. Expect a readable slug (github-slugger, max 80 chars, trimmed at a hyphen) and a clear error when nothing usable is left, never an empty filename. Task 1.
2. **Evening entries** — at 20:30 LA time the UTC date is already tomorrow; the id prefix and post URL must use the LA date. Task 1.
3. **Photos with no images** — the schema requires ≥1 image, so `pnpm new` for photos must ask for a source folder and refuse an empty one; alt text starts as a `TODO:` the review flags. Tasks 1 and 2.
4. **Interrupted prompts** — Ctrl-C at any prompt writes nothing (no half-created folder, no tags.yml append). Task 2.
5. **`/review-post` on MDX** — imports, JSX components and `<Figure alt=…>` must not be reported as broken Markdown or missing alt text. Task 3.

---

### Task 1: Entry planning library and templates

**Files:**
- Create: `scripts/lib/new-entry.ts`, `templates/post/index.md`, `templates/post-advanced/index.mdx`, `templates/post-advanced/components/.gitkeep`, `templates/post-advanced/data/.gitkeep`, `templates/til/index.md`, `templates/photos/index.md`
- Test: `scripts/test/new-entry.test.ts`

**Interfaces:**
- Consumes: `contentRoot`, `loadTags`, `parseTags`, `postPath`, `TIME_ZONE` from `@ac/content`.
- Produces:
  - `type EntryType = 'post' | 'til' | 'photos'`
  - `slugify(title: string): string` — throws `Error('Title "<title>" has no characters usable in a URL')` when empty.
  - `entryDate(now: Date): { iso: string; day: string }` — `iso` like `2026-10-27T20:30:00-07:00`, `day` like `2026-10-27`, both LA time.
  - `listTemplates(templatesDir: string): { type: EntryType; advanced: boolean; dir: string }[]` — from folder names `<type>` / `<type>-advanced`; an unknown type folder throws naming the folder.
  - `planEntry(opts: { type: EntryType; title: string; tags: string[]; advanced: boolean; now: Date; root: string; images?: string[] }): EntryPlan` where `EntryPlan = { id: string; file: string; dirs: string[]; frontMatter: string; url: { app: 'blog' | 'til'; path: string } }` — `frontMatter` is the full `---…---` block; `url.path` is `/YYYY/MM/DD/<slug>/`, `/<id>/` or `/photos/<slug>/`.
  - `writeEntry(plan: EntryPlan, template: { dir: string }, imageSources?: string[]): void` — refuses if `plan.file` or its folder exists; copies the template body (replacing `{{title}}`), writes front matter + body, copies images into the photos folder.
  - `appendTag(tagsFile: string, tag: { slug: string; name: string }): void`.

- [ ] **Step 1: Write the failing tests** in `scripts/test/new-entry.test.ts`:
  - `slugify('Python's async gap: why run_sync?')` → `'pythons-async-gap-why-run_sync'`; `slugify('???')` throws `/no characters usable/`; an 200-char title → ≤ 80 chars, no trailing hyphen.
  - `entryDate(new Date('2026-10-28T03:30:00Z'))` → `{ iso: '2026-10-27T20:30:00-07:00', day: '2026-10-27' }`; a January date gets `-08:00`.
  - `planEntry` for each type/advanced combination returns the paths in Global Constraints and the matching `url`; `frontMatter` parsed with `yaml` and validated with the real `postSchema` / `tilSchema` / `photosSchema` (stub `image: () => z.string()`) succeeds with `draft: true` and the given tags; photos `images` are `{ src: './<file>', alt: 'TODO: describe <file>' }`.
  - `planEntry` photos with `images: []` throws `/at least one image/`.
  - `writeEntry` into a temp `CONTENT_ROOT` creates the file (and `components/`, `data/` for advanced); a second call throws naming the existing path and leaves the first file unchanged.
  - `appendTag` leaves the original bytes as a prefix of the new file, the result parses with `parseTags`, and a duplicate slug throws.
  - `listTemplates('templates')` returns post, post-advanced, til, photos; a temp dir with `talk/` throws `/talk/`.
- [ ] **Step 2: Run** `pnpm vitest run scripts/test/new-entry.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `scripts/lib/new-entry.ts` and the templates. Templates hold body only: post — an intro paragraph prompt and two `##` sections; advanced — the same plus an example `Figure`/`Callout` import from `@ac/ui/components/*` commented out; TIL — one short paragraph; photos — one intro line. Template bodies use `TODO:` markers for prompts so `/review-post` catches leftovers.
- [ ] **Step 4: Run** the test — Expected: PASS. Then `pnpm test` — all PASS.
- [ ] **Step 5: Commit** `feat(scripts): entry planning library and templates`.

### Task 2: `pnpm new` command

**Files:**
- Create: `scripts/new.ts`
- Modify: root `package.json` (`"new": "node --experimental-strip-types scripts/new.ts"`), `scripts/package.json` (add `@clack/prompts`, exact pin)
- Test: `scripts/test/new-cli.test.ts`

**Interfaces:**
- Consumes: Task 1's library.
- Produces: `pnpm new [--type post|til|photos] [--title "…"] [--tags a,b] [--advanced] [--images <dir>] [--no-open]`. Any missing value is prompted for; with all values given it runs without prompts. After writing: unless `--no-open`, opens the file in `$EDITOR` (skipped with a note when unset) and starts `PUBLIC_SHOW_DRAFTS=true pnpm --filter <app> dev --port <4321 blog | 4322 til>` and prints `http://localhost:<port><url.path>`. Prints the created path either way.

- [ ] **Step 1: Write failing tests** that run `node --experimental-strip-types scripts/new.ts … --no-open` with `CONTENT_ROOT` pointed at a temp copy of `tests/fixtures/content`:
  - `--type til --title "Zsh glob qualifiers" --tags tools` exits 0, prints the created path, and the file exists with `draft: true`.
  - `--type post --advanced --title "Mapping streetcars" --tags tools` creates `<id>/index.mdx`, `components/`, `data/`.
  - `--type photos --title "Desert" --tags travel --images <tmp dir with 2 jpgs>` copies both images and lists them in front matter.
  - `--tags nope` exits non-zero with `Unknown tag "nope"` and writes nothing.
  - Running the same TIL command twice: second exits non-zero naming the existing file.
  - A fixture Astro build (`pnpm --filter blog exec astro build --force --outDir <tmp>`, `CONTENT_ROOT`=the temp copy, `PUBLIC_SHOW_DRAFTS=true`) after creating a basic post, an advanced post and a photos entry succeeds and contains each draft's page with the Draft banner. (Review Focus 3/schema parity.)
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `scripts/new.ts` with `@clack/prompts` (`text` for title, `select` for type from `listTemplates`, `confirm` for advanced on posts, `multiselect` of `loadTags()` plus "+ Add a new tag", `text` for the photos source folder). Handle `isCancel` on every prompt: exit 130 having written nothing (all writes happen after the last prompt). New tags collected in prompts are appended only after all prompts complete, immediately before `writeEntry`.
- [ ] **Step 4: Run** the tests — PASS; `pnpm test`, `pnpm --filter @ac/scripts check` (ignore only the pre-existing `listing.ts:42` `import.meta.env` error, and say so) — PASS.
- [ ] **Step 5: Commit** `feat(scripts): pnpm new`.

### Task 3: Deterministic draft checks

**Files:**
- Create: `scripts/lib/review-checks.ts`, `scripts/review-checks.ts`
- Modify: root `package.json` (`"review:check": "node --experimental-strip-types scripts/review-checks.ts"`)
- Test: `scripts/test/review-checks.test.ts`

**Interfaces:**
- Produces: `checkEntry(file: string): Finding[]` with `Finding = { rule: 'front-matter' | 'heading-order' | 'image-alt' | 'todo' | 'link'; line: number; message: string }`, and the CLI `pnpm review:check <file>` printing `file:line [rule] message` lines (exit 1 when any finding, 0 when clean, 2 on unreadable input).
- Rules:
  - `front-matter`: validate against the real schema for the file's collection (decided by its path under `contentRoot()`), reporting each zod issue.
  - `heading-order`: no `#` (h1 belongs to the layout); no level skipped going down (`##` → `####`). Ignore lines inside fenced code.
  - `image-alt`: Markdown `![](…)` with empty alt; `<Figure`/`<img` with missing or empty `alt`; photos `alt` starting `TODO`.
  - `todo`: `TODO` / `FIXME` / `XXX` outside fenced code.
  - `link`: site-relative links (`/…`) must match a built route pattern of the blog (post URL from an existing entry, `/tags/<known>/`, `/posts/`, `/photos/…`, `/resume/`, legacy `_redirects` sources from `buildRedirects`), and relative file links/images must exist on disk. External links are not fetched.

- [ ] **Step 1: Write failing tests** on small inline fixtures written to a temp `CONTENT_ROOT` (copy of `tests/fixtures/content`): one finding per rule with the right line number; a clean basic post → `[]`; the fixture `advanced-post/index.mdx` (imports, `<Figure alt=…>`, `<Callout>`) → `[]` (Review Focus 5); `#` inside a fenced code block is not a heading; CLI exit codes 0/1/2.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; `pnpm test` PASS.
- [ ] **Step 5: Commit** `feat(scripts): deterministic draft checks`.

### Task 4: `/review-post` command and README

**Files:**
- Create: `.claude/commands/review-post.md`
- Modify: `README.md` (replace "Development: TODO" with the authoring workflow), keep the licence section
- Test: `tests/authoring-docs.test.ts`

**Interfaces:**
- Consumes: `pnpm new` (Task 2), `pnpm review:check` (Task 3).
- `/review-post [path]`: with no argument, picks the most recently modified entry under `content/` with `draft: true`. Steps the command instructs: run `pnpm review:check <path>` and include its findings verbatim; read the entry and review structure only — hook/intro, heading hierarchy and section balance, flow between sections, conclusion, excerpt quality (one line, plain), alt text quality; report as a list of findings with line numbers and a one-line suggestion each, grouped Blocking / Suggestions; **never edit the file or propose rewritten prose** (quote at most a phrase to locate an issue); end with how to preview (`pnpm new` already started the dev server, or `PUBLIC_SHOW_DRAFTS=true pnpm dev:blog`) and how to publish (remove `draft: true`, open a PR).
- README sections: Quick start (`pnpm install`, `pnpm dev:blog`, `pnpm dev:til`), Writing (`pnpm new` interactive and one-line forms, templates folder, adding a tag), Reviewing (`/review-post`, `pnpm review:check`), Publishing (draft flag, PR previews show drafts — note previews arrive with plan 4), Checks (`pnpm test`, `pnpm check`, `pnpm build && pnpm lighthouse`), Licence.

- [ ] **Step 1: Write failing tests** in `tests/authoring-docs.test.ts`: the command file exists, has a `description` front matter line, mentions `pnpm review:check`, contains "never edit" (case-insensitive) and has no instruction to write files; README mentions `pnpm new`, `/review-post`, `pnpm review:check`, `draft: true`, `templates/`, and no longer contains `TODO` under Development.
- [ ] **Step 2: Run** — FAIL. **Step 3: Write** the command and README. **Step 4: Run** — PASS; then try `/review-post` mentally against the fixture advanced post: every instruction must be executable with the repo's tools.
- [ ] **Step 5: Commit** `docs: /review-post command and authoring workflow`.
