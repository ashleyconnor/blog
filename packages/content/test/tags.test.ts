import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentRoot, loadTags, parseTags } from '../src/tags';

const repoRoot = resolve(import.meta.dirname, '../../..');

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('contentRoot', () => {
  it('defaults to <repo>/content', () => {
    vi.stubEnv('CONTENT_ROOT', undefined);
    expect(contentRoot()).toBe(resolve(repoRoot, 'content'));
  });

  it('treats an empty CONTENT_ROOT as unset', () => {
    vi.stubEnv('CONTENT_ROOT', '');
    expect(contentRoot()).toBe(resolve(repoRoot, 'content'));
  });

  it('uses an absolute CONTENT_ROOT as is', () => {
    vi.stubEnv('CONTENT_ROOT', '/somewhere/else');
    expect(contentRoot()).toBe('/somewhere/else');
  });

  it('resolves a relative CONTENT_ROOT against the repo root, not the cwd', () => {
    vi.stubEnv('CONTENT_ROOT', 'tests/fixtures/content');
    expect(contentRoot()).toBe(resolve(repoRoot, 'tests/fixtures/content'));
  });
});

describe('loadTags', () => {
  it('loads <contentRoot>/tags.yml by default', () => {
    vi.stubEnv('CONTENT_ROOT', resolve(import.meta.dirname, 'fixtures/alt-content'));
    expect([...loadTags().entries()]).toEqual([['zig', { slug: 'zig', name: 'Zig' }]]);
  });

  it('loads the real tag list when CONTENT_ROOT is unset', () => {
    vi.stubEnv('CONTENT_ROOT', undefined);
    const tags = loadTags();
    expect(tags.size).toBe(12);
    expect(tags.get('macos')).toEqual({ slug: 'macos', name: 'macOS' });
  });

  it('loads an explicit path', () => {
    const tags = loadTags(resolve(repoRoot, 'tests/fixtures/content/tags.yml'));
    expect(tags.get('python')).toEqual({ slug: 'python', name: 'Python' });
  });

  it('throws when the file does not exist', () => {
    expect(() => loadTags('/nonexistent/tags.yml')).toThrow(/tags\.yml/);
  });
});

describe('parseTags', () => {
  it('keeps only slug and name, ignoring extra keys such as description', () => {
    const tags = parseTags('- slug: a\n  name: A\n  description: Hello\n', 'inline');
    expect(tags.get('a')).toEqual({ slug: 'a', name: 'A' });
  });

  it('rejects an entry without a name, naming the source', () => {
    expect(() => parseTags('- slug: a\n', 'my/tags.yml')).toThrow(/my\/tags\.yml/);
  });

  it('rejects a document that is not a list', () => {
    expect(() => parseTags('slug: a\nname: A\n', 'inline')).toThrow(/inline/);
  });

  it('rejects duplicate slugs', () => {
    expect(() => parseTags('- slug: a\n  name: A\n- slug: a\n  name: Again\n', 'inline')).toThrow(
      /Duplicate tag "a"/,
    );
  });
});
