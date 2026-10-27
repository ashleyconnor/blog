import type { AstroUserConfig } from 'astro';
import { fontProviders } from 'astro/config';

export const fonts = [
  {
    provider: fontProviders.fontsource(),
    name: 'Space Grotesk',
    cssVariable: '--font-space-grotesk',
    weights: [500, 700],
    styles: ['normal'],
    subsets: ['latin'],
    fallbacks: ['system-ui', 'sans-serif'],
  },
  {
    provider: fontProviders.fontsource(),
    name: 'Inter',
    cssVariable: '--font-inter',
    weights: [400, 500, 600],
    styles: ['normal'],
    subsets: ['latin'],
    fallbacks: ['system-ui', 'sans-serif'],
  },
  {
    provider: fontProviders.fontsource(),
    name: 'JetBrains Mono',
    cssVariable: '--font-jetbrains-mono',
    weights: [400, 500],
    styles: ['normal'],
    subsets: ['latin'],
    fallbacks: ['ui-monospace', 'monospace'],
  },
] satisfies NonNullable<AstroUserConfig['fonts']>;
