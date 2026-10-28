import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'astro/zod';
import { parse } from 'yaml';

export interface Tag {
  slug: string;
  name: string;
}

/**
 * The repository root: the nearest directory at or above the cwd holding `pnpm-workspace.yaml`.
 * Found from the cwd rather than `import.meta.url` because Astro bundles page code into
 * `dist/` chunks, where a module-relative path no longer points into the repository.
 */
function findRepoRoot(): string {
  const start = process.cwd();
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    if (dirname(dir) === dir) {
      throw new Error(
        `Could not find pnpm-workspace.yaml in ${start} or any parent directory; run from inside the repository or set CONTENT_ROOT to an absolute path.`,
      );
    }
  }
}

/**
 * Directory holding all content (`tags.yml`, `posts/`, `til/`, `photos/`): `<repo>/content`,
 * or `CONTENT_ROOT` when set (tests point it at `tests/fixtures/content`). A relative
 * `CONTENT_ROOT` is resolved against the repository root, because app builds run from `apps/*`.
 */
export function contentRoot(): string {
  const override = process.env.CONTENT_ROOT;
  if (override && isAbsolute(override)) return override;
  return override ? resolve(findRepoRoot(), override) : join(findRepoRoot(), 'content');
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
