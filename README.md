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

Remove `draft: true` from the front matter and open a pull request. The PR gets preview deploys
of both sites with drafts shown (see [Deploying](#deploying)). To preview drafts locally, use
`PUBLIC_SHOW_DRAFTS=true`.

### Checks

```sh
pnpm test                       # unit and build tests
pnpm check                      # astro check for both sites
pnpm build && pnpm lighthouse   # production build, then Lighthouse (desktop and mobile)
```

## Deploying

Both sites are static-assets-only Cloudflare Workers (`apps/*/wrangler.jsonc`): `blog` serves
www.ashleyconnor.co.uk and `til` serves til.ashleyconnor.co.uk, both as Worker custom domains. They
are also reachable on `workers.dev`. The cutover from Cloudflare Pages (Jekyll) is recorded in
[`docs/cutover.md`](docs/cutover.md); the Jekyll site lives on in the git history.

### Secrets

GitHub Actions needs two repo secrets. Without them, the Cloudflare jobs skip with a notice.

- `CLOUDFLARE_API_TOKEN`: an **Account API token**. Create it under Manage account → Account API
  tokens → Create Token. Cloudflare recommends it over a user token because it isn't tied to a
  person. Use a custom token ("Start from scratch"), scoped to the account, with **Workers →
  Admin**. Editor is not enough: Editor cannot create or delete Workers, and the first deploy
  creates them. The current token is `github-actions-blog-workers`, with no expiration.
- `CLOUDFLARE_ACCOUNT_ID`: the hex segment in the Cloudflare dashboard URL
  (`dash.cloudflare.com/<account-id>/...`).

```sh
gh secret set CLOUDFLARE_API_TOKEN               # paste the token at the prompt
gh secret set CLOUDFLARE_ACCOUNT_ID --body <id>
```

Never paste the token into a chat or commit it.

The account's `workers.dev` subdomain must exist before the first `main` deploy, or the deploy has
no `workers.dev` URL to publish to. Check it under Workers & Pages: the overview shows the
subdomain. If the dashboard asks you to set one, set it once. This is not verified against a
fresh account.

### What runs when (`.github/workflows/site.yml`)

- **Every PR and push**: checks (`pnpm test`, `pnpm check`, `pnpm build`).
- **PR opened or updated** (PRs from this repo only): builds both sites with drafts shown and
  `PREVIEW=true`, which sends `X-Robots-Tag: noindex`. It then uploads them with
  `wrangler preview --name pr-<n>` and runs Lighthouse against the previews: 100 in every category. The Lighthouse reports are uploaded
  as a workflow artifact.
- **PR closed**: deletes both previews and edits the preview comment to say they were removed.
- **Push to `main`**: deploys both Workers to `workers.dev`.

### Reading the preview comment

Each PR gets one comment, marked `<!-- site-previews -->`. It names the commit it was built from
and links the Blog and TIL preview URLs. Every push updates the same comment, so the links are
always for the latest commit. Previews show drafts and are noindex. For that reason the Lighthouse
`is-crawlable` audit is skipped against them.

The production-build Lighthouse run, which does enforce `is-crawlable`, is manual and not part of
CI. Run it locally with `pnpm build && pnpm lighthouse`.

### Checking a deploy

`pnpm verify:live [--blog <origin>] [--til <origin>]` walks every legacy URL. Each hop must be a
301 that stays on the two origins, and `/instaboxd/privacy/` must be a 200 with no redirect. It
checks status codes and end hosts, not destination paths. The defaults are the production origins.
Pass the `workers.dev` origins to check before the cutover. It exits 0 on a pass, 1 with
failures, and 2 on bad input.

To serve a built site locally under the Workers runtime, run `pnpm build`, then
`pnpm preview:blog` or `pnpm preview:til`.

## License

All posts in this blog are licensed under [CC BY-NC-ND](https://creativecommons.org/licenses/by-nc-nd/4.0/) Attribution-NonCommercial-NoDerivatives 4.0 International.
