/**
 * Glob patterns, relative to each collection's directory. Posts are top-level `.md`/`.mdx` files or
 * a one-level folder with an `index.md(x)`; files deeper inside a post folder (components, data,
 * READMEs) are never entries. Kept apart from collections.ts so code outside Astro can use them.
 */
export const collectionGlobs = {
  posts: '{*.md,*.mdx,*/index.md,*/index.mdx}',
  til: '*.md',
  photos: '*/index.md',
  pages: '*.md',
} as const;
