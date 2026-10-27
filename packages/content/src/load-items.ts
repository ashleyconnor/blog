import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from 'astro/markdown';
import { z } from 'astro/zod';
import { slug } from 'github-slugger';
import { globSync } from 'tinyglobby';
import { collectionGlobs } from './globs';
import { photosItem, postItem, tilItem } from './items';
import type { StreamItem } from './listing';
import { pageSchema, photosSchema, postSchema, tilSchema } from './schema';
import { contentRoot } from './tags';

// Re-exported for scripts outside the workspace's Astro packages, which cannot import `astro` directly.
export { parseFrontmatter };

// Astro's `image()` helper only exists inside the content layer; image paths stay strings here.
const photosFrontMatter = photosSchema({ image: () => z.string() });

export type Collection = keyof typeof collectionGlobs;

/** The front-matter schema of each collection, as the collections apply it (photo `src`s stay strings). */
export const frontMatterSchemas = {
  posts: postSchema,
  til: tilSchema,
  photos: photosFrontMatter,
  pages: pageSchema,
} satisfies Record<Collection, z.ZodType>;

/** The entry files of `collection` under `root`, relative to the collection's directory (same globs as the loaders). */
export function entryFiles(collection: Collection, root: string = contentRoot()): string[] {
  return globSync(collectionGlobs[collection], { cwd: join(root, collection), expandDirectories: false });
}

/**
 * Every post, TIL and photos entry under `contentRoot()` as a stream item, read from disk the way
 * the collections' glob loaders read it: same globs, front-matter parser, schemas and entry ids.
 * For build code outside Astro's content layer (the sitemap filter in astro.config.ts), where
 * `getCollection` does not exist. Body-derived fields (reading time, thumbnails) are left out.
 */
export function loadItems({ skipInvalid = false }: LoadItemsOptions = {}): StreamItem[] {
  const root = contentRoot();
  return [
    ...entries(root, 'posts', postSchema, skipInvalid).map((entry) => postItem(entry)),
    ...entries(root, 'til', tilSchema, skipInvalid).map((entry) => tilItem(entry)),
    // Thumbnails are not needed here, so the images are dropped rather than resolved.
    ...entries(root, 'photos', photosFrontMatter, skipInvalid).map(({ id, data }) =>
      photosItem({ id, data: { ...data, images: [] } }),
    ),
  ];
}

export interface LoadItemsOptions {
  /**
   * Leave out entries whose front matter is invalid (or unparseable) instead of throwing. For the
   * draft checker, which reads a content tree that may hold the very draft it is reporting on.
   */
  skipInvalid?: boolean;
}

function entries<Schema extends z.ZodType>(
  root: string,
  collection: 'posts' | 'til' | 'photos',
  schema: Schema,
  skipInvalid: boolean,
) {
  const dir = join(root, collection);
  return entryFiles(collection, root).flatMap((file) => {
    const path = join(dir, file);
    let parsed;
    try {
      parsed = schema.safeParse(parseFrontmatter(readFileSync(path, 'utf8')).frontmatter);
    } catch (error) {
      if (skipInvalid) return [];
      throw error;
    }
    if (!parsed.success) {
      if (skipInvalid) return [];
      throw new Error(`Invalid front matter in ${path}:\n${z.prettifyError(parsed.error)}`);
    }
    return [{ id: entryId(file), data: parsed.data }];
  });
}

/** Astro's default glob-loader id: the path without its extension or a final `/index`, each segment slugified. */
function entryId(file: string): string {
  const segments = file.replace(/\.[^./]+$/, '').split('/');
  return segments
    .map((segment) => slug(segment))
    .join('/')
    .replace(/\/index$/, '');
}
