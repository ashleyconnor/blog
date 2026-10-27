# AshleyConnor.co.uk

Two Astro sites built from one content folder:

- `apps/blog`: www.ashleyconnor.co.uk (posts and photo galleries)
- `apps/til`: til.ashleyconnor.co.uk (Today I Learned)

Content lives in `content/` (`posts/`, `til/`, `photos/`, `pages/`, `tags.yml`).

## Development

### Quick start

```sh
pnpm install
pnpm dev:blog   # http://localhost:4321
pnpm dev:til    # http://localhost:4322
```

Drafts are hidden unless `PUBLIC_SHOW_DRAFTS=true` is set, for example
`PUBLIC_SHOW_DRAFTS=true pnpm dev:blog`.

### Writing

`pnpm new` starts a draft. Run it with no flags and it asks for the type, title and tags:

```sh
pnpm new
```

Or give everything on one line:

```sh
pnpm new --type post --title "My new post" --tags python,rails
pnpm new --type post --title "An interactive post" --tags python --advanced
pnpm new --type til --title "Zsh glob qualifiers" --tags tools
pnpm new --type photos --title "Anza-Borrego" --tags travel --images ~/Pictures/anza
```

It writes the entry with `draft: true` in its front matter, opens it in `$EDITOR` (GUI editors
only; with a terminal editor it prints the path instead), and starts the site's dev server with
drafts shown, printing the draft URL. Pass `--no-open` to skip the editor and dev server. The
header of `scripts/new.ts` lists every flag.

- **Templates**: each entry starts from a folder in `templates/` (`post/`, `post-advanced/`,
  `til/`, `photos/`). Edit those files to change what new entries start with. An advanced post is
  an MDX folder with `components/` and `data/` beside `index.mdx`.
- **Tags**: `--tags` takes only tags already in `content/tags.yml`. To add a new tag, run
  `pnpm new` without `--tags` and pick "+ Add a new tag"; it is appended to `content/tags.yml`.

### Reviewing

- `pnpm review:check <file>` runs deterministic checks (front matter, heading order, image alt
  text, leftover to-do markers, links) and prints `file:line [rule] message`. It exits 0 when
  clean, 1 with findings, 2 when the file cannot be read.
- `/review-post [path]` in Claude Code runs those checks, then reviews the entry's structure
  (intro, headings, flow, conclusion, excerpt, alt text). It is read-only: it never edits the file
  or rewrites prose. With no path it reviews the most recently modified draft.

### Publishing

Remove `draft: true` from the front matter and open a pull request. Pull request previews that
render drafts are planned for the next stage (Cloudflare); until then, preview drafts locally
with `PUBLIC_SHOW_DRAFTS=true`.

### Checks

```sh
pnpm test                       # unit and build tests
pnpm check                      # astro check for both sites
pnpm build && pnpm lighthouse   # production build, then Lighthouse (desktop and mobile)
```

### Old Jekyll workflow

The Jekyll site (`_posts/`, `_til/`, `Makefile`) still exists until the cutover to Astro, and is
being replaced by the workflow above. Until then, `make help` lists its commands (`make serve`,
`make post <name>`, `make draft <name>`, `make til <name>`, `make publish <name>` and friends).

## License

All posts in this blog are licensed under [CC BY-NC-ND](https://creativecommons.org/licenses/by-nc-nd/4.0/) Attribution-NonCommercial-NoDerivatives 4.0 International.
