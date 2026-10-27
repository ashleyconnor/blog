import type { StreamItem } from './listing';

/**
 * A stream item as an `@astrojs/rss` item. Site-relative links are resolved against the feed's
 * `site`; TIL links are already absolute. The excerpt is already plain text (see `stripMarkdown`).
 */
export function feedItem(item: StreamItem) {
  return {
    title: item.title,
    link: item.href,
    pubDate: item.date,
    description: item.excerpt,
    categories: item.tags,
  };
}
