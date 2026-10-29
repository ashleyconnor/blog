import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentRoot, loadTagOverrides, loadTags, parseTags, resolveTag, tagSlug } from '../src/tags';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fixtures = resolve(repoRoot, 'tests/fixtures/content');
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
  });

  it('resolves a relative CONTENT_ROOT against the repo root when the cwd is apps/blog', () => {
    vi.stubEnv('CONTENT_ROOT', 'tests/fixtures/content');
    process.chdir(resolve(repoRoot, 'apps/blog'));
    expect(contentRoot()).toBe(fixtures);
    expect(loadTags().get('python')).toEqual({ slug: 'python', name: 'Python' });
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

describe('tagSlug', () => {
  it('is lowercase kebab case', () => {
    expect(tagSlug('python')).toBe('python');
    expect(tagSlug('Machine Learning')).toBe('machine-learning');
    expect(tagSlug('  macOS ')).toBe('macos');
    expect(tagSlug('Café & Bar')).toBe('cafe-bar');
    expect(tagSlug('++')).toBe('');
  });
});

describe('resolveTag', () => {
  const overrides = parseTags('- slug: cpp\n  name: C++\n- slug: macos\n  name: macOS\n', 'inline');

  it('defaults the slug to kebab case and the name to the value as written', () => {
    expect(resolveTag('Machine Learning', overrides)).toEqual({ slug: 'machine-learning', name: 'Machine Learning' });
  });

  it('uses an override matched by slug or by name, ignoring case', () => {
    expect(resolveTag('macos', overrides)).toEqual({ slug: 'macos', name: 'macOS' });
    expect(resolveTag('MacOS', overrides)).toEqual({ slug: 'macos', name: 'macOS' });
    expect(resolveTag('C++', overrides)).toEqual({ slug: 'cpp', name: 'C++' });
    expect(resolveTag('cpp', overrides)).toEqual({ slug: 'cpp', name: 'C++' });
  });
});

describe('loadTagOverrides', () => {
  it('loads <contentRoot>/tags.yml by default', () => {
    vi.stubEnv('CONTENT_ROOT', resolve(import.meta.dirname, 'fixtures/alt-content'));
    expect([...loadTagOverrides().entries()]).toEqual([['cpp', { slug: 'cpp', name: 'C++' }]]);
  });

  it('treats a missing file as no overrides', () => {
    expect(loadTagOverrides('/nonexistent/tags.yml').size).toBe(0);
  });
});

describe('loadTags', () => {
  it('collects every tag the entries use, named by tags.yml where it overrides', () => {
    const tags = loadTags(fixtures);
    expect([...tags.keys()].sort()).toEqual(['elixir', 'macos', 'python', 'rails', 'tools', 'travel']);
    expect(tags.get('macos')).toEqual({ slug: 'macos', name: 'macOS' });
  });

  it('picks up a new tag without a tags.yml entry, and needs no tags.yml at all', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'ac-tags-')));
    try {
      mkdirSync(join(root, 'til'));
      writeFileSync(join(root, 'til/a.md'), '---\ntitle: A\ntags: [Machine Learning, python]\n---\nBody\n');
      writeFileSync(join(root, 'til/b.md'), '---\ntitle: [unclosed\n---\n');
      expect([...loadTags(root).values()]).toEqual([
        { slug: 'machine-learning', name: 'Machine Learning' },
        { slug: 'python', name: 'python' },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
