import { describe, expect, it } from 'vitest';
import { defineSharedCollections } from '../src/collections';

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
