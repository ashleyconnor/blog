/**
 * Checks every legacy URL against live origins: `pnpm verify:live [--blog <origin>] [--til <origin>]`.
 * The defaults are the production origins; pass the `workers.dev` origins to check before cutover.
 * Prints one `FAIL` line per failing URL and exits 1 when there are any, 0 when all pass, and 2 on
 * bad arguments or an empty URL list. It checks status codes and end hosts, not destination paths;
 * see `lib/verify-live.ts`.
 */
import { parseArgs } from 'node:util';
import { BLOG_ORIGIN, legacyUrls } from './lib/legacy-urls.ts';
import { type Fetcher, TIL_ORIGIN, verifyUrls } from './lib/verify-live.ts';

const TIMEOUT_MS = 10_000;

let origins: { blog: string; til: string };
try {
  const { values } = parseArgs({
    // pnpm passes a `--` separator through when one is given.
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: { blog: { type: 'string', default: BLOG_ORIGIN }, til: { type: 'string', default: TIL_ORIGIN } },
  });
  origins = { blog: new URL(values.blog).origin, til: new URL(values.til).origin };
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error('Usage: pnpm verify:live [--blog <origin>] [--til <origin>]');
  process.exit(2);
}

const fetcher: Fetcher = async (url) => {
  const response = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
  // Only the status and Location matter; drop the body so the connection is freed.
  await response.body?.cancel();
  return { status: response.status, location: response.headers.get('location') };
};

const urls = legacyUrls();
if (urls.length === 0) {
  console.error('no URLs to check');
  process.exit(2);
}
console.log(`Checking ${urls.length} legacy URLs against ${origins.blog} and ${origins.til}`);
const failures = await verifyUrls(urls, origins, fetcher);
for (const { url, chain, reason } of failures) console.log(`FAIL ${url}: ${reason} (${chain.join(' → ')})`);
console.log(failures.length ? `${failures.length} of ${urls.length} failed` : `All ${urls.length} passed`);
process.exit(failures.length ? 1 : 0);
