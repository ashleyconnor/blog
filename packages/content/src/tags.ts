import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'astro/zod';
import { parse } from 'yaml';

export interface Tag {
  slug: string;
  name: string;
}

// packages/content/src -> repository root
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

/**
 * Directory holding all content (`tags.yml`, `posts/`, `til/`, `photos/`).
 * `CONTENT_ROOT` overrides it (tests point it at `tests/fixtures/content`); a relative
 * value is resolved against the repository root because app builds run from `apps/*`.
 */
export function contentRoot(): string {
  const override = process.env.CONTENT_ROOT;
  return override ? resolve(repoRoot, override) : join(repoRoot, 'content');
}

const tagListSchema = z.array(z.object({ slug: z.string().min(1), name: z.string().min(1) }));

/** Parses the text of a `tags.yml`. `source` only labels error messages. */
export function parseTags(text: string, source: string): Map<string, Tag> {
  const parsed = tagListSchema.safeParse(parse(text));
  if (!parsed.success) {
    throw new Error(`Invalid tag list in ${source}:\n${z.prettifyError(parsed.error)}`);
  }
  const tags = new Map<string, Tag>();
  for (const { slug, name } of parsed.data) {
    if (tags.has(slug)) throw new Error(`Duplicate tag "${slug}" in ${source}`);
    tags.set(slug, { slug, name });
  }
  return tags;
}

/** Loads the fixed tag vocabulary. Reads the file on every call so it never goes stale. */
export function loadTags(path: string = join(contentRoot(), 'tags.yml')): Map<string, Tag> {
  return parseTags(readFileSync(path, 'utf8'), path);
}
