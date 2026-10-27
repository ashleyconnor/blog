import { TIL_ORIGIN } from './items';
import type { EntryType } from './listing';

export interface RedirectEntry {
  type: EntryType;
  /** The entry's new URL: site-relative, or absolute for TILs (they live on the TIL origin). */
  href: string;
  /** Old Jekyll paths on the blog's domain, e.g. `/2025/04/24/<slug>.html` or `/til/<id>`. */
  legacyUrls?: string[];
}

/**
 * Old URLs no entry owns. `/til/index` must come before the `/til/*` wildcard, which would otherwise
 * send it to `<TIL_ORIGIN>/index`. Jekyll's `/page2/` goes to the homepage: its page size differed,
 * so the old page 2 never matched the new one (which may not exist at all).
 */
const STATIC_RULES = [
  `/til/index ${TIL_ORIGIN}/ 301`,
  `/til/* ${TIL_ORIGIN}/:splat 301`,
  '/page2/ / 301',
  '/assets/pdfs/resume.pdf /resume.pdf 301',
];

// Grouped by type so the explicit TIL rules sit just above the TIL wildcard.
const TYPE_ORDER: EntryType[] = ['post', 'photos', 'til'];

/**
 * The blog's Cloudflare `_redirects` file: a `301` from every legacy URL to its entry's new URL, then
 * the static rules. Cloudflare applies the first rule that matches, so entry rules come first (an
 * explicit `/til/<id>` rule must beat the `/til/*` wildcard). A legacy URL that already is the new
 * URL is skipped; two entries claiming the same legacy URL is an error.
 */
export function buildRedirects(entries: RedirectEntry[]): string {
  const owners = new Map<string, RedirectEntry>();
  for (const entry of entries) {
    for (const from of entry.legacyUrls ?? []) {
      const owner = owners.get(from);
      if (owner) throw new Error(`Legacy URL ${from} is claimed by both ${owner.href} and ${entry.href}`);
      owners.set(from, entry);
    }
  }
  const rules = [...owners]
    .filter(([from, { href }]) => from !== href)
    .sort(
      ([fromA, a], [fromB, b]) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || (fromA < fromB ? -1 : 1),
    )
    .map(([from, { href }]) => `${from} ${href} 301`);
  return [...rules, ...STATIC_RULES].join('\n') + '\n';
}
