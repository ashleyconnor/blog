import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { sitemapFilter } from '@ac/content/sitemap';
import { fonts } from '@ac/ui/fonts';
import { ecConfig } from '@ac/ui/expressive-code';
import expressiveCode from 'astro-expressive-code';

const site = 'https://til.ashleyconnor.co.uk';

export default defineConfig({
  output: 'static',
  site,
  trailingSlash: 'always',
  build: { format: 'directory' },
  fonts,
  // Expressive Code must come before MDX so it sees the Markdown pipeline first.
  // The sitemap leaves out TILs that are built but must not be listed (unlisted entries, drafts).
  integrations: [expressiveCode(ecConfig), mdx(), sitemap({ filter: sitemapFilter(site) })],
  vite: { plugins: [tailwindcss()] },
});
