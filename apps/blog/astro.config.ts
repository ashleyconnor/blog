import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { fonts } from '@ac/ui/fonts';
import { ecConfig } from '@ac/ui/expressive-code';
import expressiveCode from 'astro-expressive-code';

export default defineConfig({
  output: 'static',
  site: 'https://www.ashleyconnor.co.uk',
  trailingSlash: 'always',
  build: { format: 'directory' },
  fonts,
  // Expressive Code must come before MDX so it sees the Markdown pipeline first.
  integrations: [expressiveCode(ecConfig), mdx()],
  vite: { plugins: [tailwindcss()] },
});
