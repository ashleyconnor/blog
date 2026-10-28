import rss from '@astrojs/rss';
import { feedItem, type StreamItem } from '@ac/content';

/** The blog's own description, as on its pages. */
const DESCRIPTION = 'The idle thoughts of a rambling developer.';

interface Feed {
  title: string;
  /** The page the feed belongs to (`/`, `/posts/`…): the channel link. */
  path: string;
  site: URL | undefined;
  items: StreamItem[];
}

/** An RSS response for `items`. Their site-relative links resolve against the site root. */
export function feed({ title, path, site, items }: Feed) {
  const origin = new URL(site!).origin;
  return rss({
    title,
    description: DESCRIPTION,
    site: new URL(path, site),
    items: items.map((item) => feedItem(item, origin)),
    xmlns: { content: 'http://purl.org/rss/1.0/modules/content/' },
  });
}
