---
description: Review a draft post, TIL or photo gallery for structure (never its prose)
argument-hint: [path]
allowed-tools: Read, Grep, Glob, Bash(pnpm review:check:*), Bash(git log:*), Bash(ls:*)
---

Review the structure of one draft entry. The author writes their own prose: you check how it is
put together, not how it is worded. **Never edit the file** and never propose rewritten prose. To
point at a problem, quote at most a short phrase. This command is read-only.

## 1. Pick the entry

- If `$ARGUMENTS` is not empty, it is the path to review.
- Otherwise, find the most recently modified draft:
  1. Grep for `^draft: true` under `content/posts`, `content/til` and `content/photos`, listing
     matching files only (glob `*.{md,mdx}`). A directory that does not exist has no drafts.
  2. Run `ls -t` with the matching paths; the first one is the newest.
  3. If nothing matches, say there is no draft to review and stop.

Say which file you picked and why (argument given, or newest draft).

## 2. Run the deterministic checks

Run `pnpm review:check <path>`. Exit code 0 means clean, 1 means findings, 2 means the file could
not be read (stop and report the error). Include its output lines verbatim; each finding with
rule `front-matter`, `heading-order`, `image-alt`, `todo` or `link` is Blocking.

## 3. Read the entry and review its structure

Read the whole file, front matter included. For an `.mdx` post, also glance at the files beside it
(`components/`, `data/`, images) with Glob if the post uses them. Look only at:

- **Hook and intro**: does the opening say what the entry is about and why to read on?
- **Heading hierarchy and section balance**: levels in order, no section far longer or shorter
  than its siblings, no heading with a single short line under it.
- **Flow between sections**: does each section follow from the one before; is anything out of
  order or repeated?
- **Conclusion**: does the entry end deliberately (a takeaway, a next step), not just stop?
- **Excerpt**: the `excerpt` front matter, if present, is one line of plain text (no Markdown,
  links or HTML) that stands on its own.
- **Alt text quality**: each image's alt text says what the image shows or why it matters, not
  "image" or the file name. (Missing alt text is already a `review:check` finding.)

Do not comment on word choice, tone, grammar or style.

## 4. Report

Give a list of findings in two groups, **Blocking** then **Suggestions**. Each finding is one
line: `line N: <the issue> — <a one-line suggestion of what to change, not new wording>`. Use the
line numbers of the file you read. If a group is empty, write "None".

End with:

- **Preview**: if `pnpm new` started this draft, its dev server is already running and printed the
  draft URL. Otherwise run `PUBLIC_SHOW_DRAFTS=true pnpm dev:blog` (or `pnpm dev:til` for a TIL)
  and open the entry.
- **Publish**: when ready, remove `draft: true` from the front matter and open a pull request.
