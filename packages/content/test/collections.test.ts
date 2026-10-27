import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { glob } from 'tinyglobby';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectionGlobs, defineSharedCollections } from '../src/collections';

describe('defineSharedCollections', () => {
  it('defines posts, til and photos collections with glob loaders and schemas', () => {
    const collections = defineSharedCollections('/some/content');
    expect(Object.keys(collections).sort()).toEqual(['photos', 'posts', 'til']);
    for (const collection of Object.values(collections)) {
      expect(collection).toMatchObject({ loader: { name: 'glob-loader' } });
      expect(collection.schema).toBeDefined();
    }
  });

  it('gives photos a schema factory so Astro can supply image()', () => {
    const { photos, posts } = defineSharedCollections('/some/content');
    expect(typeof photos.schema).toBe('function');
    expect(typeof posts.schema).not.toBe('function');
  });
});

// Runs the real glob engine (tinyglobby, which Astro's glob() loader uses) over a scratch tree.
describe('collection glob patterns', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'ac-content-globs-'));
    for (const file of [
      'posts/a.md',
      'posts/b.mdx',
      'posts/c/index.mdx',
      'posts/d/index.md',
      'posts/c/components/README.md',
      'posts/c/data/notes.md',
      'posts/e/other.md',
      'posts/_images/pic.png',
      'til/one.md',
      'til/nested/two.md',
      'til/three.mdx',
      'photos/p/index.md',
      'photos/p/readme.md',
      'photos/top.md',
      'photos/p/deeper/index.md',
    ]) {
      mkdirSync(join(root, dirname(file)), { recursive: true });
      writeFileSync(join(root, file), '');
    }
  });
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const match = async (dir: 'posts' | 'til' | 'photos') =>
    (await glob(collectionGlobs[dir], { cwd: join(root, dir) })).sort();

  it('posts: top-level .md/.mdx and one-level folder index files only', async () => {
    expect(await match('posts')).toEqual(['a.md', 'b.mdx', 'c/index.mdx', 'd/index.md']);
  });

  it('til: top-level .md files only', async () => {
    expect(await match('til')).toEqual(['one.md']);
  });

  it('photos: one-level folder index.md only', async () => {
    expect(await match('photos')).toEqual(['p/index.md']);
  });
});
