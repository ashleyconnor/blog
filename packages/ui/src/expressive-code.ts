import { defineEcConfig } from 'astro-expressive-code';

// Same values as the colour tokens in styles/global.css (EC takes literal colours, not CSS variables).
const surface = '#18223b';
const line = '#232e49';
const muted = '#7d8aa6';

/**
 * Shared Expressive Code config for both apps (`expressiveCode(ecConfig)` in astro.config.ts).
 * GitHub's dark theme on the site's surface and hairline colours, a frame with a filename bar and
 * a copy button, and JetBrains Mono from the Fonts API.
 */
export const ecConfig = defineEcConfig({
  themes: ['github-dark-default'],
  useDarkModeMediaQuery: false,
  frames: {
    showCopyToClipboardButton: true,
    extractFileNameFromCode: true,
  },
  styleOverrides: {
    codeBackground: surface,
    borderColor: line,
    borderRadius: '0.5rem',
    codeFontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
    codeFontSize: '0.8125rem',
    uiFontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
    uiFontSize: '0.75rem',
    frames: {
      frameBoxShadowCssValue: 'none',
      // One surface-coloured block: the filename sits in a bar above the code, no tab chrome.
      editorTabBarBackground: surface,
      editorTabBarBorderBottomColor: line,
      editorActiveTabBackground: surface,
      editorActiveTabForeground: muted,
      editorActiveTabIndicatorTopColor: 'transparent',
      editorActiveTabIndicatorBottomColor: 'transparent',
      inlineButtonForeground: muted,
    },
  },
});
