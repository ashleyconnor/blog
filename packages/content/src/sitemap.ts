import { isPublic, showDrafts, type StreamItem } from './listing';
import { loadItems } from './load-items';
import { loadTags } from './tags';

/**
 * URLs of built pages a sitemap must leave out: unlisted entries (reachable, but never listed),
 * drafts (only built in preview builds, and `noindex` there) and tag pages with nothing public
 * (built so tag links never 404, but `noindex`). Tag emptiness follows the tag pages, which count
 * drafts only when they are shown. TIL hrefs are absolute; the rest are site-relative.
 */
export function unindexedHrefs(
  items: Pick<StreamItem, 'href' | 'tags' | 'draft' | 'unlisted'>[],
  tags: Iterable<string>,
  { showDrafts }: { showDrafts: boolean },
): Set<string> {
  const hidden = new Set(items.filter((item) => !isPublic(item, { showDrafts: false })).map((item) => item.href));
  const listed = items.filter((item) => isPublic(item, { showDrafts }));
  for (const tag of tags) {
    if (!listed.some((item) => item.tags.includes(tag))) hidden.add(`/tags/${tag}/`);
  }
  return hidden;
}

/**
 * An `@astrojs/sitemap` filter for the site at `site`, dropping `unindexedHrefs` of the content
 * under `contentRoot()` (so `CONTENT_ROOT` builds are filtered by their own content). Content is
 * read on the first call, after Astro has validated it. Both apps use it: a URL on the other site,
 * or a tag page on the TIL site, simply never matches. Astro's sitemap already drops 404 pages.
 */
export function sitemapFilter(site: string): (page: string) => boolean {
  let hidden: Set<string> | undefined;
  return (page) => {
    hidden ??= new Set(
      [...unindexedHrefs(loadItems(), loadTags().keys(), { showDrafts: showDrafts() })].map(
        (href) => new URL(href, site).href,
      ),
    );
    return !hidden.has(page);
  };
}
