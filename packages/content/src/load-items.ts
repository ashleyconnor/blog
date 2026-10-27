import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from 'astro/markdown';
import { z } from 'astro/zod';
import { slug } from 'github-slugger';
import { globSync } from 'tinyglobby';
import { collectionGlobs } from './globs';
import { photosItem, postItem, tilItem } from './items';
import type { StreamItem } from './listing';
import { photosSchema, postSchema, tilSchema } from './schema';
import { contentRoot } from './tags';

// Astro's `image()` helper only exists inside the content layer; image paths stay strings here.
const photosFrontMatter = photosSchema({ image: () => z.string() });

/**
 * Every post, TIL and photos entry under `contentRoot()` as a stream item, read from disk the way
 * the collections' glob loaders read it: same globs, front-matter parser, schemas and entry ids.
 * For build code outside Astro's content layer (the sitemap filter in astro.config.ts), where
 * `getCollection` does not exist. Body-derived fields (reading time, thumbnails) are left out.
 */
export function loadItems(): StreamItem[] {
  const root = contentRoot();
  return [
    ...entries(root, 'posts', postSchema).map((entry) => postItem(entry)),
    ...entries(root, 'til', tilSchema).map((entry) => tilItem(entry)),
    // Thumbnails are not needed here, so the images are dropped rather than resolved.
    ...entries(root, 'photos', photosFrontMatter).map(({ id, data }) =>
      photosItem({ id, data: { ...data, images: [] } }),
    ),
  ];
}

function entries<Schema extends z.ZodType>(root: string, collection: 'posts' | 'til' | 'photos', schema: Schema) {
  const dir = join(root, collection);
  return globSync(collectionGlobs[collection], { cwd: dir, expandDirectories: false }).map((file) => {
    const path = join(dir, file);
    const parsed = schema.safeParse(parseFrontmatter(readFileSync(path, 'utf8')).frontmatter);
    if (!parsed.success) throw new Error(`Invalid front matter in ${path}:\n${z.prettifyError(parsed.error)}`);
    return { id: entryId(file), data: parsed.data };
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
