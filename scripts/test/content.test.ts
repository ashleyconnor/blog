import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { contentRoot, postSchema, tilSchema } from '@ac/content';
import { describe, expect, it } from 'vitest';
import { splitFrontMatter } from '../lib/convert.ts';

interface Entry {
  /** Path relative to the content directory, for readable failures. */
  name: string;
  path: string;
  data: Record<string, unknown>;
  body: string;
}

// Same entry rules as the collection globs: top-level .md/.mdx files (TILs: .md only), or a
// one-level folder holding index.md(x) (posts only).
function entries(collection: 'posts' | 'til'): Entry[] {
  const dir = join(contentRoot(), collection);
  const extensions = collection === 'posts' ? ['.md', '.mdx'] : ['.md'];
  const files = readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    if (item.isFile() && extensions.some((ext) => item.name.endsWith(ext)))
      return [join(dir, item.name)];
    if (collection === 'posts' && item.isDirectory() && !item.name.startsWith('_')) {
      return extensions.map((ext) => join(dir, item.name, `index${ext}`)).filter(existsSync);
    }
    return [];
  });
  return files.sort().map((path) => ({
    name: `${collection}/${path.slice(dir.length + 1)}`,
    path,
    ...(({ data, body }) => ({ data, body }))(splitFrontMatter(readFileSync(path, 'utf8'))),
  }));
}

// `![alt](dest)` markup, and just the destination of each one (angle brackets removed).
const IMAGE_MARKUP = /!\[[^\]]*\]\(\s*(?:<[^>\n]*>|[^)\s]+)[^)]*\)/g;
function imageDestinations(body: string): string[] {
  return [...body.matchAll(/!\[[^\]]*\]\(\s*(<[^>\n]*>|[^)\s]+)/g)].map(([, destination]) =>
    destination!.startsWith('<') ? destination!.slice(1, -1) : destination!,
  );
}

const posts = entries('posts');
const tils = entries('til');

describe('migrated content', () => {
  it('every migrated entry validates', () => {
    expect(posts.length).toBeGreaterThan(0);
    expect(tils.length).toBeGreaterThan(0);

    const failures = [
      ...posts.map((e) => ({ e, result: postSchema.safeParse(e.data) })),
      ...tils.map((e) => ({ e, result: tilSchema.safeParse(e.data) })),
    ]
      .filter(({ result }) => !result.success)
      .map(
        ({ e, result }) =>
          `${e.name}: ${result.error!.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      );
    expect(failures).toEqual([]);
  });

  it('keeps every live URL: each post and TIL in the legacy sitemap is a legacyUrl of exactly one entry', () => {
    const sitemap: string[] = JSON.parse(
      readFileSync(join(import.meta.dirname, '../legacy-sitemap.json'), 'utf8'),
    );
    const live = sitemap
      .map((url) => new URL(url).pathname)
      .filter(
        (p) =>
          /^\/\d{4}\/\d{2}\/\d{2}\/[^/]+\.html$/.test(p) ||
          (p.startsWith('/til/') && p !== '/til/index'),
      );
    expect(live).toHaveLength(15);

    const owners = (url: string) =>
      [...posts, ...tils]
        .filter((e) => (e.data.legacyUrls as string[] | undefined)?.includes(url))
        .map((e) => e.name);
    for (const url of live) expect({ url, owners: owners(url).length }).toEqual({ url, owners: 1 });
  });

  it('resolves every relative image to a file that exists', () => {
    const missing: string[] = [];
    let checked = 0;
    for (const entry of [...posts, ...tils]) {
      for (const destination of imageDestinations(entry.body)) {
        if (!destination.startsWith('./') && !destination.startsWith('../')) continue;
        checked++;
        if (!existsSync(resolve(dirname(entry.path), destination)))
          missing.push(`${entry.name}: ${destination}`);
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('leaves no unrewritten image path, and no link into the images folder', () => {
    // Astro only resolves relative paths for images, so a link whose href was rewritten would 404.
    const problems: string[] = [];
    for (const entry of [...posts, ...tils]) {
      for (const destination of imageDestinations(entry.body)) {
        if (destination.startsWith('/assets/'))
          problems.push(`${entry.name}: image ${destination}`);
      }
      const withoutImages = entry.body.replace(IMAGE_MARKUP, '');
      for (const [, href] of withoutImages.matchAll(/\]\(\s*(<[^>\n]*>|[^)\s]+)/g)) {
        if (/_images\/|^<?\/assets\/images\//.test(href!))
          problems.push(`${entry.name}: link ${href}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('makes every post that uses <Callout> an .mdx file importing it', () => {
    const users = [...posts, ...tils].filter((e) => /^<Callout\b/m.test(e.body));
    expect(users.length).toBeGreaterThan(0);
    for (const entry of users) {
      expect(entry.name).toMatch(/\.mdx$/);
      expect(entry.body).toContain("import Callout from '@ac/ui/components/Callout.astro';");
    }
  });
});
