import { defineConfig } from 'vitest/config';

// Test files build the Astro apps, which share `.astro/` caches and `dist/`, so run them one at a time.
export default defineConfig({ test: { include: ['**/*.test.ts'], fileParallelism: false } });
