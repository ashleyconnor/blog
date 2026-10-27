import { fontProviders } from 'astro/config';

export const fonts = [
  {
    provider: fontProviders.fontsource(),
    name: 'Space Grotesk',
    cssVariable: '--font-heading',
    weights: [500, 700],
    styles: ['normal'],
    subsets: ['latin'],
    fallbacks: ['system-ui', 'sans-serif'],
  },
  {
    provider: fontProviders.fontsource(),
    name: 'Inter',
    cssVariable: '--font-body',
    weights: [400, 500, 600],
    styles: ['normal'],
    subsets: ['latin'],
    fallbacks: ['system-ui', 'sans-serif'],
  },
  {
    provider: fontProviders.fontsource(),
    name: 'JetBrains Mono',
    cssVariable: '--font-mono',
    weights: [400, 500],
    styles: ['normal'],
    subsets: ['latin'],
    fallbacks: ['ui-monospace', 'monospace'],
  },
];
