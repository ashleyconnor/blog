import type { StreamItem } from './listing';

/** `src="/…"` and `href="/…"` (not `//host`), which a feed reader would resolve against the wrong site. */
const SITE_RELATIVE = /\b(src|href)="\/(?!\/)/g;

/** Inline scripts (Expressive Code's copy button): feed readers never run them. */
const SCRIPTS = /<script\b[^>]*>[\s\S]*?<\/script>/g;

/**
 * A stream item as an `@astrojs/rss` item. Site-relative links are resolved against the feed's
 * `site`; TIL links are already absolute. The excerpt is already plain text (see `stripMarkdown`).
 * A Markdown entry also carries its rendered body as full content, its site-relative links and
 * images made absolute on `origin` (the site that built that HTML, so its `/_astro/` files exist there).
 */
export function feedItem(item: StreamItem, origin?: string) {
  const content =
    item.html && origin ? item.html.replace(SCRIPTS, '').replace(SITE_RELATIVE, `$1="${origin}/`) : undefined;
  return {
    title: item.title,
    link: item.href,
    pubDate: item.date,
    description: item.excerpt,
    categories: item.tags,
    ...(content && { content }),
  };
}
