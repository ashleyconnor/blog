import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentRoot, loadTags, parseTags } from '../src/tags';

const repoRoot = resolve(import.meta.dirname, '../../..');
const originalCwd = process.cwd();

afterEach(() => {
  vi.unstubAllEnvs();
  process.chdir(originalCwd);
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

// App builds run with cwd = apps/<app>, and Astro bundles page code into dist/ chunks, so the
// repo root must come from the cwd (walking up to pnpm-workspace.yaml), never from import.meta.
describe('contentRoot and loadTags from an app directory', () => {
  it('finds <repo>/content when the cwd is apps/blog', () => {
    vi.stubEnv('CONTENT_ROOT', undefined);
    process.chdir(resolve(repoRoot, 'apps/blog'));
    expect(contentRoot()).toBe(resolve(repoRoot, 'content'));
    expect(loadTags().get('python')).toEqual({ slug: 'python', name: 'Python' });
  });

  it('resolves a relative CONTENT_ROOT against the repo root when the cwd is apps/blog', () => {
    vi.stubEnv('CONTENT_ROOT', 'tests/fixtures/content');
    process.chdir(resolve(repoRoot, 'apps/blog'));
    expect(contentRoot()).toBe(resolve(repoRoot, 'tests/fixtures/content'));
    expect(loadTags().size).toBe(12);
  });

  it('finds the root from a nested directory of a package', () => {
    vi.stubEnv('CONTENT_ROOT', undefined);
    process.chdir(resolve(repoRoot, 'packages/content/test'));
    expect(contentRoot()).toBe(resolve(repoRoot, 'content'));
  });

  it('derives the root from the cwd, not from where this module lives', () => {
    const other = realpathSync(mkdtempSync(join(tmpdir(), 'ac-content-root-')));
    try {
      writeFileSync(join(other, 'pnpm-workspace.yaml'), 'packages: []\n');
      mkdirSync(join(other, 'apps/site'), { recursive: true });
      vi.stubEnv('CONTENT_ROOT', undefined);
      process.chdir(join(other, 'apps/site'));
      expect(contentRoot()).toBe(join(other, 'content'));
    } finally {
      process.chdir(originalCwd);
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('still accepts an absolute CONTENT_ROOT from outside any workspace', () => {
    vi.stubEnv('CONTENT_ROOT', resolve(repoRoot, 'tests/fixtures/content'));
    process.chdir('/');
    expect(contentRoot()).toBe(resolve(repoRoot, 'tests/fixtures/content'));
  });

  it('fails clearly when no pnpm-workspace.yaml exists above the cwd', () => {
    vi.stubEnv('CONTENT_ROOT', undefined);
    process.chdir('/');
    expect(() => contentRoot()).toThrow(/pnpm-workspace\.yaml/);
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
