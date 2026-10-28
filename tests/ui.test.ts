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
    expect(html).toMatch(/<div[^>]*data-callout="warning"/);
    expect(html).toMatch(/<div[^>]*data-callout="warning"[\s\S]*?Do not call/);
  });

  it('is a labelled note, not a complementary landmark nested in <main>', () => {
    const html = page(dist, ADVANCED);
    const callout = html.match(/<div[^>]*data-callout="warning"[^>]*>/)?.[0] ?? '';
    expect(callout).toContain('role="note"');
    expect(callout).toContain('aria-label="Warning"');
    expect(html).not.toContain('<aside');
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

  it('is a sidebar only where it clears the widest breakout, inline below that', () => {
    const html = page(dist, BASIC);
    const toc = html.match(/<nav[^>]*aria-label="Table of contents"[^>]*>/)?.[0] ?? '';
    const classes = toc.match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
    // Every sidebar variant is `3xl:`; an `xl:` or `2xl:` one would sit under a 1100px breakout.
    expect(classes.filter((c) => /^(xl|2xl):/.test(c))).toEqual([]);
    expect(classes).toContain('3xl:absolute');

    // From the built CSS: the viewport must fit column centre + 550px (half a breakout) + the
    // sidebar's offset beyond that + the sidebar itself on each side of the centre line.
    const css = allCss(html);
    const minWidth = css.match(/@media\s*\(width\s*>=\s*([\d.]+)rem\)\s*\{\.\\33 xl\\:absolute\b/)?.[1];
    expect(minWidth, 'no 3xl media query').toBeDefined();
    const offset = css.match(/left:calc\(50% \+ (\d+)px \+ ([\d.]+)rem\)/);
    expect(offset, 'no sidebar left offset').not.toBeNull();
    const clearOfBreakout = Number(offset![1]);
    const gap = Number(offset![2]) * 16;
    const sidebarWidth = Number(classes.find((c) => c.startsWith('3xl:w-'))?.slice('3xl:w-'.length)) * 4;
    expect(clearOfBreakout).toBeGreaterThanOrEqual(1100 / 2);
    expect(gap).toBeGreaterThan(0);
    expect((Number(minWidth) * 16) / 2).toBeGreaterThanOrEqual(clearOfBreakout + gap + sidebarWidth);
  });

  it('only counts depth 2 and 3 headings, so a short post has none', () => {
    // The advanced post has an h2, an h3 and an h4: three headings, but only two in range.
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

  it('inlines the site stylesheet, so first paint waits on no stylesheet request', () => {
    // The homepage has no code blocks, whose Expressive Code stylesheet is the only one left to link.
    const home = readFileSync(join(dist, 'index.html'), 'utf8');
    expect(home).not.toMatch(/<link[^>]*rel="stylesheet"/);
    expect(home).toMatch(/<style>[^<]*--color-bg:\s*#0f1629/);
  });

  it('links an SVG favicon that the build ships', () => {
    // Without one, browsers request /favicon.ico and log its 404 as a console error.
    expect(page(dist, BASIC)).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
    expect(readFileSync(join(dist, 'favicon.svg'), 'utf8')).toMatch(/^<svg\b/);
  });

  /** "<family> <weight>" of each font file a page preloads. */
  function preloadedFaces(html: string) {
    // Each family's @font-face rules are inlined in <head>: map their files to "<family> <weight>".
    const faces = new Map(
      [...html.matchAll(/@font-face\{font-family:"?([A-Za-z ]+?)-[0-9a-f]+"?;src:url\("([^"]+)"\)[^}]*?font-weight:(\d+)/g)].map(
        ([, family, url, weight]) => [url, `${family} ${weight}`],
      ),
    );
    expect(faces.size).toBe(7);
    return [...html.matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)].map(([, url]) => faces.get(url!)).sort();
  }

  it('preloads only the two faces an article opens with: Inter 400 and Space Grotesk 700', () => {
    expect(preloadedFaces(page(dist, BASIC))).toEqual(['Inter 400', 'Space Grotesk 700']);
  });

  it('preloads the stream row title weight on stream pages: Inter 400 and Space Grotesk 500', () => {
    for (const path of ['', 'posts', 'tags/python']) {
      expect(preloadedFaces(page(dist, path)), path || '/').toEqual(['Inter 400', 'Space Grotesk 500']);
    }
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

  it('colours the footer copyright muted on the paragraph itself', () => {
    // The base layer sets `p { color: text }`, so `text-muted` on <footer> never reaches the <p>.
    const html = page(dist, BASIC);
    expect(html).toMatch(/<p[^>]*class="[^"]*\btext-muted\b[^"]*"[^>]*>\s*©/);
  });

  it('falls back to the site description when a page passes none', () => {
    const description = 'The idle thoughts of a rambling developer.';
    const home = readFileSync(join(dist, 'index.html'), 'utf8');
    expect(home).toContain(`<meta name="description" content="${description}">`);
    expect(home).toContain(`<meta property="og:description" content="${description}">`);
    expect(home).toContain(`<meta name="twitter:description" content="${description}">`);
    // A post without an excerpt gets it too; one with an excerpt keeps its own.
    expect(page(draftDist, DRAFT)).toContain(`<meta name="description" content="${description}">`);
    expect(page(dist, BASIC)).not.toContain(description);
  });

  it('never fakes a bold: mono text only uses weights that are loaded', () => {
    // JetBrains Mono only loads 400 and 500, so `font-mono` with semibold/bold would be synthesised.
    for (const html of [page(draftDist, DRAFT), page(dist, BASIC), page(dist, ADVANCED)]) {
      for (const [, classes] of html.matchAll(/class="([^"]*)"/g)) {
        const list = classes.split(/\s+/);
        const fakeBold = list.includes('font-mono') && (list.includes('font-semibold') || list.includes('font-bold'));
        expect(fakeBold, classes).toBe(false);
      }
    }
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

describe('package manifest', () => {
  it('declares every package its source imports at runtime as a dependency', () => {
    const dir = join(root, 'packages/ui');
    const { dependencies = {} } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const specifiers = new Set<string>();
    for (const entry of readdirSync(join(dir, 'src'), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const code = readFileSync(join(entry.parentPath, entry.name), 'utf8');
      // `import type` is erased at build time; stylesheets pull packages in with @import and @plugin.
      const imports = /^\s*(?:import(?!\s+type\b)[^'"]*?from\s*|import\s*|@import\s+|@plugin\s+)['"]([^'"]+)['"]/gm;
      for (const [, specifier] of code.matchAll(imports)) specifiers.add(specifier!);
    }
    const packages = new Set(
      [...specifiers]
        .filter((specifier) => !/^(?:\.|astro:|node:)/.test(specifier))
        .map((specifier) => specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/')),
    );
    // StreamList and StreamItem call @ac/content helpers when they render.
    expect(packages).toContain('@ac/content');
    for (const name of packages) expect(Object.keys(dependencies), name).toContain(name);
  });
});
