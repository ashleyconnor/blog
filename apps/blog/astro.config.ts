import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { fonts } from '@ac/ui/fonts';

export default defineConfig({
  output: 'static',
  site: 'https://www.ashleyconnor.co.uk',
  trailingSlash: 'always',
  build: { format: 'directory' },
  fonts,
  vite: { plugins: [tailwindcss()] },
});
