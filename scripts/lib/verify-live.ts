/**
 * Checks legacy URLs against live origins (`pnpm verify:live`): each must reach a 200 on the right
 * site through permanent (301) redirects only. Production URLs, and production origins in `Location`
 * headers, are mapped to the origins under test, so the same check runs on the `workers.dev` origins
 * before cutover and on the real domains after.
 */
import { BLOG_ORIGIN } from './legacy-urls.ts';

export const TIL_ORIGIN = 'https://til.ashleyconnor.co.uk';

export interface Origins {
  blog: string;
  til: string;
}

/** One request, without following redirects. */
export type Fetcher = (url: string) => Promise<{ status: number; location: string | null }>;

export interface Failure {
  /** The legacy URL as listed. */
  url: string;
  /** Every URL requested, in order (on the origins under test). */
  chain: string[];
  reason: string;
}

const MAX_HOPS = 5;
const CONCURRENCY = 8;

/** `url` with a production origin swapped for the matching origin under test. */
function toOrigins(url: URL, origins: Origins): URL {
  const target = url.origin === BLOG_ORIGIN ? origins.blog : url.origin === TIL_ORIGIN ? origins.til : undefined;
  return target ? new URL(url.pathname + url.search + url.hash, target) : url;
}

/** The origin a legacy URL must end on: TIL for `/til…` paths, the blog for everything else. */
const expectedOrigin = (url: URL, origins: Origins) =>
  new URL(/^\/til(\/|$)/.test(url.pathname) ? origins.til : origins.blog).origin;

async function verifyUrl(url: string, origins: Origins, fetcher: Fetcher): Promise<Failure | undefined> {
  const expected = expectedOrigin(new URL(url), origins);
  const chain: string[] = [];
  const fail = (reason: string): Failure => ({ url, chain, reason });
  let current = toOrigins(new URL(url), origins);
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    chain.push(current.href);
    let response: Awaited<ReturnType<Fetcher>>;
    try {
      response = await fetcher(current.href);
    } catch (error) {
      return fail(`${current.href} request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const { status, location } = response;
    if (status === 200) {
      return current.origin === expected ? undefined : fail(`ends on ${current.origin}, expected ${expected}`);
    }
    if (status < 300 || status >= 400) return fail(`${current.href} answered ${status}`);
    if (status !== 301) return fail(`${current.href} redirects with ${status}, not 301`);
    if (!location) return fail(`${current.href} redirects with ${status} but no Location header`);
    if (hop === MAX_HOPS) break;
    current = toOrigins(new URL(location, current), origins);
  }
  return fail(`redirects more than ${MAX_HOPS} times`);
}

/**
 * Verifies every URL (at most 8 at a time) and returns the failures in input order. A URL passes when
 * every hop is a 301 and it ends on a 200 on its expected origin, within 5 redirects.
 */
export async function verifyUrls(urls: string[], origins: Origins, fetcher: Fetcher): Promise<Failure[]> {
  const results: (Failure | undefined)[] = new Array(urls.length);
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const index = next++;
      results[index] = await verifyUrl(urls[index]!, origins, fetcher);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  return results.filter((failure): failure is Failure => failure !== undefined);
}
