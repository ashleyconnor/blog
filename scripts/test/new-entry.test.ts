import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentRoot, parseTags, photosSchema, postSchema, tilSchema } from '@ac/content';
import { parse } from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendTag,
  entryDate,
  listTemplates,
  planEntry,
  slugify,
  writeEntry,
} from '../lib/new-entry.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATES = join(REPO, 'templates');
const ROOT = '/content';
// 2026-10-27 09:15 in Los Angeles (PDT).
const NOW = new Date('2026-10-27T16:15:00Z');

function frontMatterData(frontMatter: string): Record<string, unknown> {
  expect(frontMatter.startsWith('---\n')).toBe(true);
  expect(frontMatter.endsWith('\n---\n')).toBe(true);
  return parse(frontMatter.slice(4, -4)) as Record<string, unknown>;
}

// Stands in for Astro's `image()` helper: a string schema (scripts don't depend on astro/zod).
const photos = photosSchema({ image: () => postSchema.shape.title });

describe('slugify', () => {
  it('keeps letters, digits, hyphens and underscores', () => {
    expect(slugify('Python’s async gap: why run_sync?')).toBe('pythons-async-gap-why-run_sync');
    expect(slugify("Python's async gap: why run_sync?")).toBe('pythons-async-gap-why-run_sync');
  });

  it('collapses runs of hyphens and trims them from the ends', () => {
    expect(slugify('  Hello -- world!  ')).toBe('hello-world');
  });

  it('refuses a title with nothing usable', () => {
    expect(() => slugify('???')).toThrow(/no characters usable/);
    expect(() => slugify('???')).toThrow('Title "???" has no characters usable in a URL');
  });

  it('caps long titles at 80 characters without a trailing hyphen', () => {
    const slug = slugify('word '.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.startsWith('word-word')).toBe(true);
  });

  it('cuts a long slug back to the last hyphen rather than splitting a word', () => {
    // Position 80 falls inside "memoization".
    const title = `${'cache '.repeat(12)}memoization strategies`;
    const full = title.trim().replace(/ /g, '-');
    expect(full.slice(0, 80).endsWith('-')).toBe(false);
    const slug = slugify(title);
    expect(slug).toBe('cache-'.repeat(12).slice(0, -1));
    expect(full.startsWith(`${slug}-`)).toBe(true);
  });

  it('hard-cuts a long slug with no hyphen', () => {
    expect(slugify('a'.repeat(100))).toBe('a'.repeat(80));
  });
});

describe('entryDate', () => {
  it('uses Los Angeles daylight time', () => {
    expect(entryDate(new Date('2026-10-28T03:30:00Z'))).toEqual({
      iso: '2026-10-27T20:30:00-07:00',
      day: '2026-10-27',
    });
  });

  it('uses Los Angeles standard time in winter', () => {
    expect(entryDate(new Date('2026-01-15T08:05:09Z'))).toEqual({
      iso: '2026-01-15T00:05:09-08:00',
      day: '2026-01-15',
    });
  });
});

describe('planEntry', () => {
  const base = { title: 'Hello: World', tags: ['python', 'tools'], now: NOW, root: ROOT };

  it('plans a basic post', () => {
    const plan = planEntry({ ...base, type: 'post', advanced: false });
    expect(plan.id).toBe('2026-10-27-hello-world');
    expect(plan.file).toBe('/content/posts/2026-10-27-hello-world.md');
    expect(plan.dirs).toEqual([]);
    expect(plan.url).toEqual({ app: 'blog', path: '/2026/10/27/hello-world/' });
    const data = postSchema.parse(frontMatterData(plan.frontMatter));
    expect(data).toMatchObject({ title: 'Hello: World', tags: ['python', 'tools'], draft: true });
    expect(data.date.toISOString()).toBe(NOW.toISOString());
    expect(plan.frontMatter).toContain('date: "2026-10-27T09:15:00-07:00"');
  });

  it('plans an advanced post as a folder with components and data', () => {
    const plan = planEntry({ ...base, type: 'post', advanced: true });
    expect(plan.id).toBe('2026-10-27-hello-world');
    expect(plan.file).toBe('/content/posts/2026-10-27-hello-world/index.mdx');
    expect(plan.dirs).toEqual([
      '/content/posts/2026-10-27-hello-world',
      '/content/posts/2026-10-27-hello-world/components',
      '/content/posts/2026-10-27-hello-world/data',
    ]);
    expect(plan.url).toEqual({ app: 'blog', path: '/2026/10/27/hello-world/' });
    expect(postSchema.parse(frontMatterData(plan.frontMatter)).draft).toBe(true);
  });

  it('plans a TIL', () => {
    const plan = planEntry({ ...base, type: 'til', advanced: false });
    expect(plan.id).toBe('2026-10-27-hello-world');
    expect(plan.file).toBe('/content/til/2026-10-27-hello-world.md');
    expect(plan.dirs).toEqual([]);
    expect(plan.url).toEqual({ app: 'til', path: '/2026-10-27-hello-world/' });
    const data = tilSchema.parse(frontMatterData(plan.frontMatter));
    expect(data).toMatchObject({ tags: ['python', 'tools'], draft: true });
  });

  it('plans photos as an undated folder with TODO alt text', () => {
    const plan = planEntry({
      ...base,
      type: 'photos',
      advanced: false,
      images: ['/tmp/a/IMG_1.jpg', 'beach.png'],
    });
    expect(plan.id).toBe('hello-world');
    expect(plan.file).toBe('/content/photos/hello-world/index.md');
    expect(plan.dirs).toEqual(['/content/photos/hello-world']);
    expect(plan.url).toEqual({ app: 'blog', path: '/photos/hello-world/' });
    const data = photos.parse(frontMatterData(plan.frontMatter));
    expect(data).toMatchObject({ tags: ['python', 'tools'], draft: true });
    expect(data.images).toEqual([
      { src: './IMG_1.jpg', alt: 'TODO: describe IMG_1.jpg' },
      { src: './beach.png', alt: 'TODO: describe beach.png' },
    ]);
  });

  it('refuses two images with the same file name', () => {
    expect(() =>
      planEntry({
        ...base,
        type: 'photos',
        advanced: false,
        images: ['/a/IMG_1.jpg', '/b/IMG_1.jpg'],
      }),
    ).toThrow(/IMG_1\.jpg/);
  });

  it('refuses photos without images', () => {
    expect(() => planEntry({ ...base, type: 'photos', advanced: false, images: [] })).toThrow(
      /at least one image/,
    );
    expect(() => planEntry({ ...base, type: 'photos', advanced: false })).toThrow(
      /at least one image/,
    );
  });

  it('dates the id by the Los Angeles calendar day', () => {
    const plan = planEntry({
      ...base,
      type: 'til',
      advanced: false,
      now: new Date('2026-10-28T03:30:00Z'),
    });
    expect(plan.id).toBe('2026-10-27-hello-world');
  });
});

describe('writeEntry', () => {
  let root: string;
  let previous: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'new-entry-'));
    previous = process.env.CONTENT_ROOT;
    process.env.CONTENT_ROOT = root;
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.CONTENT_ROOT;
    else process.env.CONTENT_ROOT = previous;
  });

  const opts = (type: 'post' | 'til' | 'photos', advanced = false) => ({
    type,
    title: 'Fresh Entry',
    tags: ['python'],
    advanced,
    now: NOW,
    root: contentRoot(),
  });

  it('writes a basic post from the template, refusing a second time', () => {
    const plan = planEntry(opts('post'));
    writeEntry(plan, { dir: join(TEMPLATES, 'post') });
    const text = readFileSync(plan.file, 'utf8');
    expect(text.startsWith(plan.frontMatter)).toBe(true);
    expect(text).toContain('TODO:');
    expect(text).not.toContain('{{title}}');

    writeFileSync(plan.file, `${text}edited\n`);
    expect(() => writeEntry(plan, { dir: join(TEMPLATES, 'post') })).toThrow(plan.file);
    expect(readFileSync(plan.file, 'utf8')).toBe(`${text}edited\n`);
  });

  it('writes an advanced post with components and data folders', () => {
    const plan = planEntry(opts('post', true));
    writeEntry(plan, { dir: join(TEMPLATES, 'post-advanced') });
    expect(existsSync(plan.file)).toBe(true);
    expect(existsSync(join(dirname(plan.file), 'components'))).toBe(true);
    expect(existsSync(join(dirname(plan.file), 'data'))).toBe(true);
    const text = readFileSync(plan.file, 'utf8');
    expect(text).not.toContain('<!--');
    expect(() => writeEntry(plan, { dir: join(TEMPLATES, 'post-advanced') })).toThrow(
      dirname(plan.file),
    );
  });

  it('refuses a basic post when an advanced post has the same id', () => {
    writeEntry(planEntry(opts('post', true)), { dir: join(TEMPLATES, 'post-advanced') });
    const plan = planEntry(opts('post'));
    expect(() => writeEntry(plan, { dir: join(TEMPLATES, 'post') })).toThrow(/already exists/);
    expect(existsSync(plan.file)).toBe(false);
  });

  it('writes a TIL', () => {
    const plan = planEntry(opts('til'));
    writeEntry(plan, { dir: join(TEMPLATES, 'til') });
    expect(readFileSync(plan.file, 'utf8').startsWith(plan.frontMatter)).toBe(true);
  });

  it('writes photos and copies the images next to them', () => {
    const source = join(root, 'source.jpg');
    writeFileSync(source, 'jpeg bytes');
    const plan = planEntry({ ...opts('photos'), images: [source] });
    writeEntry(plan, { dir: join(TEMPLATES, 'photos') }, [source]);
    expect(readFileSync(join(dirname(plan.file), 'source.jpg'), 'utf8')).toBe('jpeg bytes');
    expect(existsSync(plan.file)).toBe(true);
    expect(() => writeEntry(plan, { dir: join(TEMPLATES, 'photos') }, [source])).toThrow(
      dirname(plan.file),
    );
  });
});

describe('appendTag', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tags-'));
  });

  it('appends without touching the existing bytes', () => {
    const file = join(dir, 'tags.yml');
    const original = '# my tags\n- slug: python\n  name: Python\n';
    writeFileSync(file, original);
    appendTag(file, { slug: 'cpp', name: 'C++: the language' });
    const text = readFileSync(file, 'utf8');
    expect(text.startsWith(original)).toBe(true);
    expect(parseTags(text, file).get('cpp')).toEqual({ slug: 'cpp', name: 'C++: the language' });
  });

  it('starts a new line when the file lacks a trailing newline', () => {
    const file = join(dir, 'tags.yml');
    writeFileSync(file, '- slug: python\n  name: Python');
    appendTag(file, { slug: 'rust', name: 'Rust' });
    const text = readFileSync(file, 'utf8');
    expect(text).toBe('- slug: python\n  name: Python\n- slug: rust\n  name: Rust\n');
  });

  it('refuses a duplicate slug', () => {
    const file = join(dir, 'tags.yml');
    const original = '- slug: python\n  name: Python\n';
    writeFileSync(file, original);
    expect(() => appendTag(file, { slug: 'python', name: 'Py' })).toThrow(/python/);
    expect(readFileSync(file, 'utf8')).toBe(original);
  });
});

describe('listTemplates', () => {
  it('finds the repository templates', () => {
    const found = listTemplates(TEMPLATES).map(({ type, advanced, dir }) => ({
      type,
      advanced,
      dir,
    }));
    expect(found).toEqual([
      { type: 'post', advanced: false, dir: join(TEMPLATES, 'post') },
      { type: 'post', advanced: true, dir: join(TEMPLATES, 'post-advanced') },
      { type: 'til', advanced: false, dir: join(TEMPLATES, 'til') },
      { type: 'photos', advanced: false, dir: join(TEMPLATES, 'photos') },
    ]);
  });

  it('refuses an unknown template folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'templates-'));
    mkdirSync(join(dir, 'post'));
    mkdirSync(join(dir, 'talk'));
    expect(() => listTemplates(dir)).toThrow(/talk/);
  });
});
