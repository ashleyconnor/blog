import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildStream, feedItem, showDrafts, tilItem } from '@ac/content';
import { TIL_DESCRIPTION } from '../site';

// Every public TIL, newest first, linking to its page on this site.
export const GET: APIRoute = async ({ site }) => {
  const tils = buildStream((await getCollection('til')).map((t) => tilItem(t)), { showDrafts: showDrafts() });
  return rss({
    title: "Ashley Connor's TIL",
    description: TIL_DESCRIPTION,
    site: site!,
    items: tils.map((til) => feedItem(til, site!.origin)),
    xmlns: { content: 'http://purl.org/rss/1.0/modules/content/' },
  });
};
