import { defineConfig } from 'vitest/config';

export default defineConfig({
  // `astro:content` is a virtual module that only exists inside Astro; point it at
  // the real implementation so collections.ts can be imported from plain Vitest.
  resolve: { alias: { 'astro:content': 'astro/content/config' } },
  test: { name: 'content', include: ['test/**/*.test.ts'] },
});
