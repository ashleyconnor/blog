import type { AstroUserConfig } from 'astro';
import { fontProviders } from 'astro/config';

// Each family's first fallback is a face Astro generates from Arial (or Courier New), resized to the
// web font's metrics so nothing moves when the web font swaps in. Linux has neither font, so each
// stack also names a matching face over Liberation Sans or Liberation Mono, which have the same
// metrics: see styles/fallback-fonts.css.

export const fonts = [
  {
    provider: fontProviders.fontsource(),
    name: 'Space Grotesk',
    cssVariable: '--font-space-grotesk',
    weights: [500, 700],
    styles: ['normal'],
    subsets: ['latin'],
    fallbacks: ['Space Grotesk Liberation fallback', 'system-ui', 'sans-serif'],
  },
  {
    provider: fontProviders.fontsource(),
    name: 'Inter',
    cssVariable: '--font-inter',
    weights: [400, 500, 600],
    styles: ['normal'],
    subsets: ['latin'],
    fallbacks: ['Inter Liberation fallback', 'system-ui', 'sans-serif'],
  },
  {
    provider: fontProviders.fontsource(),
    name: 'JetBrains Mono',
    cssVariable: '--font-jetbrains-mono',
    weights: [400, 500],
    styles: ['normal'],
    subsets: ['latin'],
    fallbacks: ['JetBrains Mono Liberation fallback', 'ui-monospace', 'monospace'],
  },
] satisfies NonNullable<AstroUserConfig['fonts']>;
