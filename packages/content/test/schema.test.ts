import { resolve } from 'node:path';
import { z } from 'astro/zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { photosSchema, postSchema, tilSchema } from '../src/schema';

const fixtureRoot = resolve(import.meta.dirname, '../../../tests/fixtures/content');
const altRoot = resolve(import.meta.dirname, 'fixtures/alt-content');

beforeEach(() => {
  vi.stubEnv('CONTENT_ROOT', fixtureRoot);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const valid = { title: 'Hello', date: '2025-04-23T19:39:00-07:00', tags: ['python'] };

function messages(result: z.ZodSafeParseResult<unknown>) {
  return result.success ? [] : result.error.issues.map((i) => i.message);
}
function paths(result: z.ZodSafeParseResult<unknown>) {
  return result.success ? [] : result.error.issues.map((i) => i.path);
}

describe('postSchema', () => {
  it('accepts a valid entry, coerces dates and defaults the flags', () => {
    const parsed = postSchema.parse({ ...valid, updated: '2025-05-01', legacyUrls: ['/2025/04/24/x.html'] });
    expect(parsed.date).toEqual(new Date('2025-04-24T02:39:00Z'));
    expect(parsed.updated).toEqual(new Date('2025-05-01'));
    expect(parsed.draft).toBe(false);
    expect(parsed.unlisted).toBe(false);
    expect(parsed.excerpt).toBeUndefined();
    expect(parsed.legacyUrls).toEqual(['/2025/04/24/x.html']);
  });

  it('rejects unknown tag', () => {
    const result = postSchema.safeParse({ ...valid, tags: ['pyhton'] });
    expect(result.success).toBe(false);
    expect(messages(result).join('\n')).toContain('Unknown tag "pyhton"');
    expect(paths(result)).toEqual([['tags', 0]]);
  });

  it('reports every unknown tag, not just the first', () => {
    const result = postSchema.safeParse({ ...valid, tags: ['python', 'nope', 'nada'] });
    expect(messages(result)).toEqual([
      expect.stringContaining('Unknown tag "nope"'),
      expect.stringContaining('Unknown tag "nada"'),
    ]);
  });

  it('rejects unknown key', () => {
    const result = postSchema.safeParse({ ...valid, unlised: true });
    expect(result.success).toBe(false);
    expect(messages(result).join('\n')).toContain('unlised');
    expect(postSchema.safeParse({ ...valid, draf: true }).success).toBe(false);
  });

  it('rejects blank date', () => {
    expect(postSchema.safeParse({ ...valid, date: null }).success).toBe(false);
    expect(postSchema.safeParse({ ...valid, date: '' }).success).toBe(false);
    expect(postSchema.safeParse({ ...valid, date: 'not a date' }).success).toBe(false);
    expect(postSchema.safeParse({ ...valid, date: 0 }).success).toBe(false);
    expect(postSchema.safeParse({ ...valid, date: undefined }).success).toBe(false);
  });

  it('rejects blank updated', () => {
    expect(postSchema.safeParse({ ...valid, updated: null }).success).toBe(false);
    expect(postSchema.safeParse({ ...valid, updated: '' }).success).toBe(false);
  });

  it('accepts Date objects for date and updated (as parsed from YAML)', () => {
    const parsed = postSchema.parse({ ...valid, date: new Date('2025-04-23'), updated: new Date('2025-05-01') });
    expect(parsed.date).toEqual(new Date('2025-04-23'));
    expect(parsed.updated).toEqual(new Date('2025-05-01'));
  });

  it('rejects empty tags', () => {
    const result = postSchema.safeParse({ ...valid, tags: [] });
    expect(result.success).toBe(false);
    expect(paths(result)).toEqual([['tags']]);
  });

  it('rejects missing tags, title and date', () => {
    expect(postSchema.safeParse({ title: 'x', date: valid.date }).success).toBe(false);
    expect(postSchema.safeParse({ date: valid.date, tags: ['python'] }).success).toBe(false);
    expect(postSchema.safeParse({ title: 'x', tags: ['python'] }).success).toBe(false);
    expect(postSchema.safeParse({ ...valid, title: '' }).success).toBe(false);
  });

  it('reads tags lazily from CONTENT_ROOT at validation time', () => {
    expect(postSchema.safeParse({ ...valid, tags: ['zig'] }).success).toBe(false);
    vi.stubEnv('CONTENT_ROOT', altRoot);
    expect(postSchema.safeParse({ ...valid, tags: ['zig'] }).success).toBe(true);
    expect(postSchema.safeParse({ ...valid, tags: ['python'] }).success).toBe(false);
  });
});

describe('tilSchema', () => {
  it('shares the common front matter rules', () => {
    expect(tilSchema.safeParse(valid).success).toBe(true);
    expect(tilSchema.safeParse({ ...valid, unlised: true }).success).toBe(false);
    expect(tilSchema.safeParse({ ...valid, date: null }).success).toBe(false);
    expect(messages(tilSchema.safeParse({ ...valid, tags: ['pyhton'] })).join()).toContain('Unknown tag "pyhton"');
    expect(tilSchema.safeParse({ ...valid, tags: [] }).success).toBe(false);
  });
});

describe('photosSchema', () => {
  const schema = photosSchema({ image: () => z.string() });
  const photo = { ...valid, images: [{ src: 'a.jpg', alt: 'A desert road', caption: 'Anza-Borrego' }] };

  it('accepts images with alt text and optional captions', () => {
    const parsed = schema.parse({ ...photo, images: [...photo.images, { src: 'b.jpg', alt: 'Cacti' }] });
    expect(parsed.images).toHaveLength(2);
    expect(parsed.images[1]?.caption).toBeUndefined();
  });

  it('rejects empty alt', () => {
    const result = schema.safeParse({ ...valid, images: [{ src: 'a.jpg', alt: '' }] });
    expect(result.success).toBe(false);
    expect(paths(result)).toEqual([['images', 0, 'alt']]);
  });

  it('rejects unknown keys, at the top level and inside an image', () => {
    expect(schema.safeParse({ ...photo, unlised: true }).success).toBe(false);
    const nested = schema.safeParse({ ...valid, images: [{ src: 'a.jpg', alt: 'x', captoin: 'typo' }] });
    expect(nested.success).toBe(false);
    expect(paths(nested)).toEqual([['images', 0]]);
  });

  it('rejects blank date', () => {
    expect(schema.safeParse({ ...photo, date: null }).success).toBe(false);
  });

  it('rejects missing alt', () => {
    const result = schema.safeParse({ ...valid, images: [{ src: 'a.jpg' }] });
    expect(result.success).toBe(false);
    expect(paths(result)).toEqual([['images', 0, 'alt']]);
  });

  it('delegates image sources to the supplied image() helper', () => {
    const numeric = photosSchema({ image: () => z.number() });
    expect(numeric.safeParse({ ...valid, images: [{ src: 'a.jpg', alt: 'x' }] }).success).toBe(false);
    expect(numeric.safeParse({ ...valid, images: [{ src: 1, alt: 'x' }] }).success).toBe(true);
  });

  it('applies the common front matter rules', () => {
    expect(messages(schema.safeParse({ ...photo, tags: ['pyhton'] })).join()).toContain('Unknown tag "pyhton"');
  });

  it('requires at least one image', () => {
    expect(schema.safeParse({ ...valid, images: [] }).success).toBe(false);
    expect(schema.safeParse(valid).success).toBe(false);
  });
});
