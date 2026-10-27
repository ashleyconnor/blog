import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { collectionGlobs } from './globs';
import { pageSchema, photosSchema, postSchema, tilSchema } from './schema';

export { collectionGlobs };

const base = (contentRoot: string, dir: string) => pathToFileURL(resolve(contentRoot, dir));

/**
 * The content collections both apps share. Imports `astro:content`, which only exists
 * inside Astro (and the Vitest alias), so it is deliberately not re-exported from index.ts.
 */
export function defineSharedCollections(contentRoot: string) {
  return {
    posts: defineCollection({
      loader: glob({ pattern: collectionGlobs.posts, base: base(contentRoot, 'posts') }),
      schema: postSchema,
    }),
    til: defineCollection({
      loader: glob({ pattern: collectionGlobs.til, base: base(contentRoot, 'til') }),
      schema: tilSchema,
    }),
    photos: defineCollection({
      loader: glob({ pattern: collectionGlobs.photos, base: base(contentRoot, 'photos') }),
      schema: ({ image }) => photosSchema({ image }),
    }),
  };
}

/** Standalone pages such as `/instaboxd/privacy/`, which only the blog serves. */
export function definePagesCollection(contentRoot: string) {
  return defineCollection({
    loader: glob({ pattern: collectionGlobs.pages, base: base(contentRoot, 'pages') }),
    schema: pageSchema,
  });
}
