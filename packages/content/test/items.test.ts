import type { ImageMetadata } from 'astro';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { photosItem, postItem, stripMarkdown, tilItem, TIL_ORIGIN } from '../src/items';
import { showDrafts } from '../src/listing';
import { dayOfMonth } from '../src/post';

const data = (overrides: Record<string, unknown> = {}) => ({
  title: 'A title',
  date: new Date('2025-04-24T02:39:00Z'),
  tags: ['python'],
  draft: false,
  unlisted: false,
  ...overrides,
});

const image = (name: string) => ({
  src: { src: `/${name}.jpg`, width: 640, height: 480, format: 'jpg' } as ImageMetadata,
  alt: `Alt ${name}`,
  caption: `Caption ${name}`,
});

describe('stripMarkdown', () => {
  it('drops emphasis, keeps link and image text', () => {
    expect(stripMarkdown('Becoming a **digital nomad** is _easy_ but *not* __free__...')).toBe(
      'Becoming a digital nomad is easy but not free...',
    );
    expect(
      stripMarkdown('Deploy [Phoenix](http://www.phoenixframework.org/) on [Dokku](http://dokku.viewdocs.io/dokku/)...'),
    ).toBe('Deploy Phoenix on Dokku...');
    expect(stripMarkdown('See ![a diagram](./d.png) and [this][ref].')).toBe('See a diagram and this.');
    expect(stripMarkdown('A [link](https://en.wikipedia.org/wiki/Foo_(bar)) here')).toBe('A link here');
  });

  it('keeps code span contents verbatim, and underscores inside words', () => {
    expect(stripMarkdown('Call `run_sync(**kwargs)` from sync code')).toBe('Call run_sync(**kwargs) from sync code');
    expect(stripMarkdown('the snake_case_name stays')).toBe('the snake_case_name stays');
  });

  it('drops HTML tags, unescapes and collapses whitespace', () => {
    expect(stripMarkdown('Some <em>HTML</em>\nand \\*escaped\\* stars  ')).toBe('Some HTML and *escaped* stars');
    expect(stripMarkdown('~~old~~ new')).toBe('old new');
  });

  it('leaves plain text alone', () => {
    const plain = 'Python’s async gap: why the stdlib needs run_sync. 1 < 2 & 3 > 2';
    expect(stripMarkdown(plain)).toBe(plain);
  });
});

describe('postItem', () => {
  it('maps a post to a stream item with its URL, plain excerpt and reading time', () => {
    const item = postItem({
      id: '2025-04-23-basic-post',
      filePath: 'content/posts/2025-04-23-basic-post.md',
      body: 'word '.repeat(400),
      data: data({ excerpt: 'A **bold** start' }),
    });
    expect(item).toEqual({
      type: 'post',
      id: '2025-04-23-basic-post',
      title: 'A title',
      date: new Date('2025-04-24T02:39:00Z'),
      tags: ['python'],
      excerpt: 'A bold start',
      href: '/2025/04/23/basic-post/',
      advanced: false,
      minutes: 2,
      draft: false,
      unlisted: false,
    });
  });

  it('is advanced only for a post folder with an index.mdx', () => {
    const at = (filePath: string) => postItem({ id: 'x', filePath, body: '', data: data() }).advanced;
    expect(at('../../tests/fixtures/content/posts/advanced-post/index.mdx')).toBe(true);
    expect(at('content/posts/2022-01-05-london.mdx')).toBe(false);
    expect(at('content/posts/folder-post/index.md')).toBe(false);
    expect(postItem({ id: 'x', data: data() }).advanced).toBe(false);
  });

  it('keeps draft and unlisted flags', () => {
    const item = postItem({ id: 'x', data: data({ draft: true, unlisted: true }) });
    expect(item).toMatchObject({ draft: true, unlisted: true });
  });
});

describe('tilItem', () => {
  it('links out to the TIL origin by entry id', () => {
    const item = tilItem({ id: '2022-12-01-elixir', data: data() });
    expect(TIL_ORIGIN).toBe('https://til.ashleyconnor.co.uk');
    expect(item).toMatchObject({ type: 'til', href: 'https://til.ashleyconnor.co.uk/2022-12-01-elixir/', advanced: false });
    expect(item.minutes).toBeUndefined();
  });
});

describe('photosItem', () => {
  it('shows the first three images and counts the rest', () => {
    const item = photosItem({ id: 'anza-borrego', data: { ...data(), images: ['a', 'b', 'c', 'd', 'e'].map(image) } });
    expect(item).toMatchObject({ type: 'photos', href: '/photos/anza-borrego/', extraCount: 2, advanced: false });
    expect(item.thumbs).toEqual([
      { src: image('a').src, alt: 'Alt a' },
      { src: image('b').src, alt: 'Alt b' },
      { src: image('c').src, alt: 'Alt c' },
    ]);
  });

  it('has no extra count with three images or fewer', () => {
    const item = photosItem({ id: 'p', data: { ...data(), images: ['a', 'b'].map(image) } });
    expect(item.thumbs).toHaveLength(2);
    expect(item.extraCount).toBe(0);
  });
});

describe('dayOfMonth', () => {
  it('is the two-digit day in Los Angeles time', () => {
    expect(dayOfMonth(new Date('2025-04-24T02:39:00Z'))).toBe('23');
    expect(dayOfMonth(new Date('2025-03-01T08:00:00Z'))).toBe('01');
  });
});

describe('showDrafts', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is true only when PUBLIC_SHOW_DRAFTS is exactly "true"', () => {
    vi.stubEnv('PUBLIC_SHOW_DRAFTS', 'true');
    expect(showDrafts()).toBe(true);
    vi.stubEnv('PUBLIC_SHOW_DRAFTS', 'false');
    expect(showDrafts()).toBe(false);
    vi.stubEnv('PUBLIC_SHOW_DRAFTS', '1');
    expect(showDrafts()).toBe(false);
    vi.stubEnv('PUBLIC_SHOW_DRAFTS', undefined);
    expect(showDrafts()).toBe(false);
  });
});
