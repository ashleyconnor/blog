import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'astro/zod';
import { globSync } from 'tinyglobby';
import { parse } from 'yaml';
import { collectionGlobs } from './globs';

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
 * Directory holding all content (`tags.yml` overrides, `posts/`, `til/`, `photos/`): `<repo>/content`,
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

/** The default slug for a tag as written in front matter: lowercase kebab case (`Machine Learning` → `machine-learning`). */
export function tagSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Optional overrides from `tags.yml`, for a tag whose slug or display name differs from the default
 * (e.g. `{ slug: cpp, name: C++ }`, `{ slug: macos, name: macOS }`). A missing file means none.
 */
export function loadTagOverrides(path: string = join(contentRoot(), 'tags.yml')): Map<string, Tag> {
  return existsSync(path) ? parseTags(readFileSync(path, 'utf8'), path) : new Map();
}

/**
 * The tag a front-matter value stands for. An override applies when the value's default slug is its
 * slug or the value is its name (ignoring case); otherwise the slug is the default and the name is the
 * value as written.
 */
export function resolveTag(value: string, overrides: Map<string, Tag> = loadTagOverrides()): Tag {
  const slug = tagSlug(value);
  const name = value.trim();
  for (const tag of overrides.values()) {
    if (tag.slug === slug || tag.name.toLowerCase() === name.toLowerCase()) return tag;
  }
  return { slug, name };
}

/**
 * Every tag used by a post, TIL or photos entry under `root`, by slug, scanned from the raw front
 * matter on every call so it never goes stale. A slug written several ways keeps the first one found
 * (an override always wins). Invalid front matter is skipped here; the collection schemas report it.
 */
export function loadTags(root: string = contentRoot()): Map<string, Tag> {
  const overrides = loadTagOverrides(join(root, 'tags.yml'));
  const tags = new Map<string, Tag>();
  for (const collection of ['posts', 'til', 'photos'] as const) {
    const dir = join(root, collection);
    const files = globSync(collectionGlobs[collection], { cwd: dir, expandDirectories: false }).sort();
    for (const file of files) {
      for (const value of frontMatterTags(readFileSync(join(dir, file), 'utf8'))) {
        const tag = resolveTag(value, overrides);
        if (tag.slug && !tags.has(tag.slug)) tags.set(tag.slug, tag);
      }
    }
  }
  return tags;
}

function frontMatterTags(text: string): string[] {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (block === undefined) return [];
  let data: unknown;
  try {
    data = parse(block);
  } catch {
    return [];
  }
  const tags = (data as { tags?: unknown } | null)?.tags;
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [];
}
