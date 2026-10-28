import { join } from 'node:path';
import { defineConfig } from 'astro/config';
import { contentRoot } from '@ac/content';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { sitemapFilter } from '@ac/content/sitemap';
import { fonts } from '@ac/ui/fonts';
import { ecConfig } from '@ac/ui/expressive-code';
import expressiveCode from 'astro-expressive-code';

const site = 'https://www.ashleyconnor.co.uk';

// A build against other content (CONTENT_ROOT: tests, temporary copies) keeps its content cache
// inside that content folder, so no other build reuses its entries (stale entries point at files
// in a deleted copy) and a temporary copy takes its cache with it.
const cacheDir = process.env.CONTENT_ROOT ? join(contentRoot(), '.astro-cache') : undefined;

export default defineConfig({
  output: 'static',
  ...(cacheDir && { cacheDir }),
  site,
  trailingSlash: 'always',
  // The site stylesheet is a few kB: inlined, it costs no render-blocking request before first paint.
  build: { format: 'directory', inlineStylesheets: 'always' },
  fonts,
  // Expressive Code must come before MDX so it sees the Markdown pipeline first.
  // The sitemap leaves out pages that are built but must not be listed (unlisted, drafts, empty tags).
  integrations: [expressiveCode(ecConfig), mdx(), sitemap({ filter: sitemapFilter(site) })],
  vite: { plugins: [tailwindcss()] },
});
