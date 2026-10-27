import { execa } from 'execa';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

let dist: string;
let draftDist: string;

/** Builds the blog against the fixture content into `outDir`. */
async function build(outDir: string, showDrafts: boolean) {
  await execa('pnpm', ['--filter', 'blog', 'exec', 'astro', 'build', '--force', '--outDir', outDir], {
    cwd: root,
    env: {
      CONTENT_ROOT: 'tests/fixtures/content',
      PUBLIC_SHOW_DRAFTS: showDrafts ? 'true' : 'false',
    },
  });
}

const page = (outDir: string, path: string) => readFileSync(join(outDir, path, 'index.html'), 'utf8');

const BASIC = '2025/04/23/basic-post';
const ADVANCED = '2025/02/10/advanced-post';
const DRAFT = '2025/04/22/draft-post';

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'ac-ui-dist-'));
  draftDist = mkdtempSync(join(tmpdir(), 'ac-ui-drafts-'));
  await build(dist, false);
  await build(draftDist, true);
}, 300_000);

afterAll(() => {
  for (const dir of [dist, draftDist]) if (dir) rmSync(dir, { recursive: true, force: true });
});

/** Every stylesheet the blog ships: `_astro/*.css` plus inline `<style>` blocks of the given page. */
function allCss(html: string): string {
  const dir = join(dist, '_astro');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.css')) : [];
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  return [...files.map((f) => readFileSync(join(dir, f), 'utf8')), ...inline].join('\n');
}

/** Innermost `selector{declarations}` blocks, which is where `color:` ends up even inside `@layer`/`@media`. */
function ruleBlocks(css: string) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(',').map((s) => s.trim()),
    body: m[2],
  }));
}

describe('expressive code', () => {
  it('code blocks render with Expressive Code frame', () => {
    const html = page(dist, BASIC);
    expect(html).toContain('class="expressive-code"');
    expect(html).toMatch(/<figure class="frame[^"]*\bhas-title\b/);
    expect(html).toMatch(/<figcaption class="header">[\s\S]*?example\.py/);
    expect(html).toContain('Copy to clipboard');
  });
});

describe('figure', () => {
  it('figure renders avif and webp', () => {
    const html = page(dist, ADVANCED);
    expect(html).toMatch(/<source[^>]*type="image\/avif"/);
    expect(html).toMatch(/<source[^>]*type="image\/webp"/);
    expect(html).toMatch(/<figcaption[^>]*>\s*Figure 1/);
  });

  it('a wide figure gets the breakout class, and breakout is capped at 1100px', () => {
    const html = page(dist, ADVANCED);
    expect(html).toMatch(/<figure[^>]*class="[^"]*\bbreakout\b[^"]*"[^>]*>[\s\S]*?Figure 2/);
    expect(html.match(/<figure[^>]*>/g)).toHaveLength(2);
    expect(html.match(/<figure[^>]*\bbreakout\b/g)).toHaveLength(1);
    const breakout = ruleBlocks(allCss(html)).filter((r) => r.selectors.includes('.breakout'));
    expect(breakout.some((r) => r.body.includes('1100px'))).toBe(true);
  });
});

describe('callout', () => {
  it('renders its type and content', () => {
    const html = page(dist, ADVANCED);
    expect(html).toMatch(/<aside[^>]*data-callout="warning"/);
    expect(html).toMatch(/<aside[^>]*data-callout="warning"[\s\S]*?Do not call/);
  });
});

describe('table of contents', () => {
  it('long post renders TOC', () => {
    const html = page(dist, BASIC);
    expect(html).toMatch(/<nav[^>]*aria-label="Table of contents"/);
    for (const slug of ['why-it-matters', 'what-i-tried', 'a-smaller-idea', 'what-i-would-change', 'wrapping-up']) {
      expect(html).toContain(`href="#${slug}"`);
    }
  });

  it('only counts depth 2 and 3 headings, so a short post has none', () => {
    // The advanced post has two h2s and one h4: three headings, but only two in range.
    expect(page(dist, ADVANCED)).not.toMatch(/aria-label="Table of contents"/);
  });
});

describe('layout', () => {
  it('declares a dark colour scheme, canonical and social tags', () => {
    const html = page(dist, BASIC);
    expect(html).toContain('<meta name="color-scheme" content="dark">');
    expect(html).toContain('<link rel="canonical" href="https://www.ashleyconnor.co.uk/2025/04/23/basic-post/">');
    expect(html).toContain('<meta property="og:title" content="A basic post">');
    expect(html).toContain('<meta property="og:url" content="https://www.ashleyconnor.co.uk/2025/04/23/basic-post/">');
    expect(html).toMatch(/<meta name="description" content="A plain Markdown post/);
    expect(html).toContain('<meta name="twitter:card" content="summary">');
    expect(html).toContain('<meta name="twitter:title" content="A basic post">');
  });

  it('has site navigation, a centred reading column and the licence footer', () => {
    const html = page(dist, BASIC);
    expect(html).toMatch(/<a[^>]*href="\/posts\/"[^>]*>\s*Posts\s*<\/a>/);
    expect(html).toMatch(/<a[^>]*href="https:\/\/til\.ashleyconnor\.co\.uk\/"[^>]*>\s*TIL ↗\s*<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/photos\/"[^>]*>\s*Photos\s*<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/resume\/"[^>]*>\s*Resume\s*<\/a>/);
    expect(html).toMatch(/<main[^>]*class="[^"]*max-w-\[680px\]/);
    expect(html).toMatch(
      /<a[^>]*href="https:\/\/creativecommons\.org\/licenses\/by-nc-nd\/4\.0\/"[^>]*>\s*Posts licensed CC BY-NC-ND 4\.0\s*<\/a>/,
    );
  });

  it('ordinary posts have neither a draft banner nor noindex', () => {
    const html = page(dist, BASIC);
    expect(html).not.toContain('noindex');
    expect(html).not.toMatch(/data-draft-banner/);
  });
});

describe('post page', () => {
  it('lives at the Los Angeles date, with pill, title and meta line', () => {
    // 2025-04-23 19:39 -07:00 is already the 24th in UTC.
    expect(existsSync(join(dist, '2025/04/24/basic-post/index.html'))).toBe(false);
    const html = page(dist, BASIC);
    expect(html).toMatch(/<h1[^>]*>\s*A basic post\s*<\/h1>/);
    expect(html).toMatch(/>\s*Post\s*<\/span>/);
    expect(html).toMatch(/<time datetime="2025-04-24T02:39:00\.000Z"[^>]*>\s*23 Apr 2025\s*<\/time>/);
    expect(html).toMatch(/\d+ min read/);
    expect(html).toMatch(/<a[^>]*href="\/tags\/python\/"[^>]*>\s*#python\s*<\/a>/);
  });
});

describe('drafts', () => {
  it('are not built unless PUBLIC_SHOW_DRAFTS=true', () => {
    expect(existsSync(join(dist, DRAFT, 'index.html'))).toBe(false);
  });

  it('are built with a banner and noindex when PUBLIC_SHOW_DRAFTS=true', () => {
    const html = page(draftDist, DRAFT);
    expect(html).toMatch(/data-draft-banner[^>]*>[\s\S]*?Draft/);
    expect(html).toContain('<meta name="robots" content="noindex">');
  });
});

describe('colours', () => {
  it('no text inherits UA colour', () => {
    const css = ruleBlocks(allCss(page(dist, BASIC)));
    const setsColor = (tag: string) =>
      css.some((r) => r.selectors.includes(tag) && /(?:^|;)\s*color\s*:/.test(r.body));
    for (const tag of ['body', 'a', 'h1', 'h2', 'h3', 'h4', 'code', 'figcaption', 'nav']) {
      expect(setsColor(tag), `no color: declared for <${tag}>`).toBe(true);
    }
  });
});
