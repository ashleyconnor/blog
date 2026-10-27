import { getCollection } from 'astro:content';
import { buildStream, photosItem, postItem, showDrafts, tilItem, type StreamItem } from '@ac/content';

/** Every entry of every type as a stream item, drafts and unlisted entries included. */
async function allItems(): Promise<StreamItem[]> {
  const [posts, tils, photos] = await Promise.all([
    getCollection('posts'),
    getCollection('til'),
    getCollection('photos'),
  ]);
  return [...posts.map((p) => postItem(p)), ...tils.map((t) => tilItem(t)), ...photos.map((p) => photosItem(p))];
}

/**
 * What the stream, type indexes and tag pages list: public entries newest first. Unlisted
 * entries never appear; drafts only in preview builds (`PUBLIC_SHOW_DRAFTS=true`).
 */
export async function publicStream(): Promise<StreamItem[]> {
  return buildStream(await allItems(), { showDrafts: showDrafts() });
}
