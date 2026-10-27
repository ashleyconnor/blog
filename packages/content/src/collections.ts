import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { photosSchema, postSchema, tilSchema } from './schema';

/**
 * The content collections both apps share. Imports `astro:content`, which only exists
 * inside Astro (and the Vitest alias), so it is deliberately not re-exported from index.ts.
 */
export function defineSharedCollections(contentRoot: string) {
  const base = (dir: string) => pathToFileURL(resolve(contentRoot, dir));

  return {
    posts: defineCollection({
      loader: glob({ pattern: '**/{*.md,*/index.mdx,*/index.md}', base: base('posts') }),
      schema: postSchema,
    }),
    til: defineCollection({
      loader: glob({ pattern: '*.md', base: base('til') }),
      schema: tilSchema,
    }),
    photos: defineCollection({
      loader: glob({ pattern: '*/index.md', base: base('photos') }),
      schema: ({ image }) => photosSchema({ image }),
    }),
  };
}
