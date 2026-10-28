# Cutover runbook: Cloudflare Pages to Workers

Today Cloudflare Pages (Jekyll) still serves www.ashleyconnor.co.uk. After the cutover, two
static-assets-only Workers serve the sites:

- `blog` (`apps/blog/wrangler.jsonc`) serves www.ashleyconnor.co.uk
- `til` (`apps/til/wrangler.jsonc`) serves til.ashleyconnor.co.uk

Until the cutover, both Workers deploy to `workers.dev` only and have no routes.

Each step says who does it:

- **Claude (in a PR)**: a change, or a check whose result Claude reports in a pull request.
- **Ashley (dashboard/merge)**: anything in the Cloudflare dashboard, DNS, GitHub settings, or a merge.

## Before you start

The repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` must already be set. The README's
Deploying section says how to create them. The token is an Account API token named
`github-actions-blog-workers`, with the account-scoped permission **Workers → Admin**.

## Checklist

Do the steps in order.

1. **Claude (in a PR)**: Check that the latest `deploy` runs on `main` are green. Then check the
   `workers.dev` deploys against every legacy URL:

   ```sh
   pnpm verify:live --blog https://blog.<sub>.workers.dev --til https://til.<sub>.workers.dev
   ```

   `<sub>` is the account's `workers.dev` subdomain. It must exit 0. Exit 1 means at least one URL
   failed, and each failure is printed as a `FAIL` line. Exit 2 means bad input.

2. **Claude (in a PR)**: Open the cutover PR. It makes these changes:
   - It adds routes to each Worker's `wrangler.jsonc`:

     ```jsonc
     // apps/blog/wrangler.jsonc
     "routes": [{ "pattern": "www.ashleyconnor.co.uk", "custom_domain": true }]
     // apps/til/wrangler.jsonc
     "routes": [{ "pattern": "til.ashleyconnor.co.uk", "custom_domain": true }]
     ```

   - It deletes the Jekyll files: `_posts/`, `_til/`, `_layouts/`, `_includes/`, `_data/`,
     `_pages/`, `_plugins/`, `jekyll-til/`, `Gemfile`, `Gemfile.lock`, `_config.yml`,
     `.ruby-version`, the Jekyll targets in the `Makefile`, the root `index.html`, `instaboxd/`,
     `robots.txt`, and root `assets/`. Before it deletes `assets/`, it checks that nothing served
     still comes from there. The blog serves its own copy from `apps/blog/public/assets/`. It also
     removes the README's "Old Jekyll workflow" section.
   - It fixes the `/404` follow-up (see "Known behaviours" below). It adds `X-Robots-Tag: noindex`
     for `/404` in the header rules (`packages/content/src/headers.ts`), and it points the 404
     page's canonical at `/404/`.

3. **Ashley (dashboard/merge)**: Edit the `github-actions-blog-workers` token. Add
   **Zone → Workers Routes → Edit** for the `ashleyconnor.co.uk` zone, so `wrangler deploy` can
   attach the custom domains. Cloudflare's docs don't confirm that this exact permission is
   enough. If the deploy fails with an authorisation error, read the error code and adjust the
   token.

4. **Ashley (dashboard/merge)**: In Workers & Pages, remove the custom domains from the Pages project:
   `www.ashleyconnor.co.uk`, plus `til.ashleyconnor.co.uk` if it is there.

5. **Ashley (dashboard/merge)**: Do this right before the merge. In DNS for `ashleyconnor.co.uk`,
   delete the `www` CNAME that points at Pages, and any `til` record. Cloudflare refuses a Worker
   Custom Domain on a hostname that already has a CNAME record, and removing the domain from the
   Pages project (step 4) does not delete it. **The outage starts here.** www stops resolving until
   the deploy in step 6 finishes, so do steps 5 and 6 together.

6. **Ashley (dashboard/merge)**: Merge the cutover PR. The `deploy` job runs `wrangler deploy` for
   both Workers, which creates the custom domains and their DNS records. **The outage ends** when
   the job is green. If the job fails, use the rollback below.

7. **Ashley (dashboard/merge)**: Add or keep the zone redirect rule that sends the apex
   `ashleyconnor.co.uk` to `https://www.ashleyconnor.co.uk` with a 301, keeping the path and
   query string.

8. **Claude (in a PR)**: Run `pnpm verify:live` against the real domains. With no flags it uses the
   production origins:

   ```sh
   pnpm verify:live
   ```

   It must exit 0. Also spot-check `https://www.ashleyconnor.co.uk/instaboxd/privacy/`. It must
   return a 200 with no redirect, and `verify:live` checks this too.

9. **Ashley (dashboard/merge)**: When step 8 passes, clean up:
   - Delete the Pages project.
   - Delete the dead repo secrets `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
     (`gh secret delete AWS_ACCESS_KEY_ID` and `gh secret delete AWS_SECRET_ACCESS_KEY`).

## Known behaviours

These are expected. They are not failures:

- For URLs that aren't legacy URLs, Cloudflare adds its own trailing-slash redirects (for example
  `/posts` → `/posts/`). These are 307s, which is acceptable. `verify:live` only requires 301s for
  the legacy URLs.
- `/404.html` redirects (307) to `/404`, which serves the 404 page with status 200. That page is
  noindex, and `/404.html` is not a legacy URL. The cutover PR's follow-up (step 2) adds
  `X-Robots-Tag: noindex` for `/404` and points the 404 canonical at `/404/`.

## Rollback

**Ashley (dashboard/merge)**: If the Workers don't serve correctly after step 6, delete the Workers'
custom domains (Workers & Pages → the Worker → Settings → Domains & Routes), then re-add the custom
domain on the Pages project. Pages recreates its `www` CNAME. This works only until step 9 deletes
the Pages project, so don't do step 9 until step 8 passes. After a rollback, revert the cutover PR
so the next `main` deploy doesn't attach the domains again.
