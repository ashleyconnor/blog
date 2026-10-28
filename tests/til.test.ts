import { execa } from 'execa';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadItems } from '../packages/content/src/load-items';

const root = join(import.meta.dirname, '..');
const fixtures = join(root, 'tests/fixtures/content');

let dist: string;
let draftDist: string;
let pagedDist: string;
let pagedContent: string;

/** Builds the TIL site against `contentRoot` (the fixtures by default) into `outDir`. */
async function build(outDir: string, showDrafts: boolean, contentRoot = fixtures) {
  await execa('pnpm', ['--filter', 'til', 'exec', 'astro', 'build', '--force', '--outDir', outDir], {
    cwd: root,
    env: {
      CONTENT_ROOT: contentRoot,
      PUBLIC_SHOW_DRAFTS: showDrafts ? 'true' : 'false',
    },
  });
}

/** The public TIL fixtures: every one but the draft and the unlisted entry. */
const PUBLIC_FIXTURES = 5;

/**
 * The fixtures plus enough TILs to need a second index page (30 per page), as blog-pages.test.ts
 * does for the blog. The MDX post is left out: its `@ac/ui` imports only resolve from inside the
 * repository, and this copy lives in tmpdir.
 */
function pagedFixtures(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ac-til-paged-content-'));
  cpSync(fixtures, dir, { recursive: true, filter: (src) => !src.endsWith(join('advanced-post', 'index.mdx')) });
  for (let day = 1; day <= 30; day++) {
    const dd = String(day).padStart(2, '0');
    writeFileSync(
      join(dir, 'til', `2024-01-${dd}-extra-til-${dd}.md`),
      `---\ntitle: Extra TIL ${dd}\ndate: "2024-01-${dd}T12:00:00-08:00"\ntags: [tools]\n---\n\nFiller.\n`,
    );
  }
  return dir;
}

/** `index.html` of a directory-format route; `''` is the site root. */
const page = (outDir: string, path: string) => readFileSync(join(outDir, path, 'index.html'), 'utf8');

/** Text of every `sitemap-*.xml`, the index included. */
const sitemapText = (outDir: string) =>
  readdirSync(outDir)
    .filter((name) => /^sitemap-.*\.xml$/.test(name))
    .map((name) => readFileSync(join(outDir, name), 'utf8'))
    .join('\n');

/** The stream rows (`<li data-type="til">`, the shared `@ac/ui` row) of an index page. */
const rows = (html: string) => [...html.matchAll(/<li[^>]*data-type="til"[^>]*>[\s\S]*?<\/li>/g)].map(([row]) => row);

/** Text content of the HTML fragment, whitespace collapsed. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ORIGIN = 'https://til.ashleyconnor.co.uk';
const BLOG = 'https://www.ashleyconnor.co.uk';
/** The TIL tagline; Astro escapes `'` in text but not in attributes, so accept both. */
const TAGLINE = String.raw`Short notes on things I(?:'|&#39;)ve learned\.`;

// Fixture ids (file names without `.md`).
const READ_FILE = '2025-04-12-til-read-a-file-in-elixir';
const GLOBS = '2025-04-03-til-zsh-glob-qualifiers';
const LATE = '2025-02-28-til-late-evening-entry';
const DRAFT = '2025-04-20-til-draft-entry';
const UNLISTED = '2025-02-05-til-unlisted-entry';

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'ac-til-dist-'));
  draftDist = mkdtempSync(join(tmpdir(), 'ac-til-drafts-'));
  pagedDist = mkdtempSync(join(tmpdir(), 'ac-til-paged-'));
  pagedContent = pagedFixtures();
  await build(dist, false);
  await build(draftDist, true);
  await build(pagedDist, false, pagedContent);
}, 300_000);

afterAll(() => {
  for (const dir of [dist, draftDist, pagedDist, pagedContent]) if (dir) rmSync(dir, { recursive: true, force: true });
});

/** Every stylesheet the TIL site ships: `_astro/*.css` plus inline `<style>` blocks of the given page. */
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

const stripTags = (html: string) => html.replace(/<[^>]*>/g, '').trim();

/** The index's month sections in page order: heading text and the entry links under it. */
function monthSections(html: string) {
  const headings = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)];
  return headings.map((h, i) => {
    const body = html.slice(h.index + h[0].length, headings[i + 1]?.index ?? html.length);
    return {
      month: stripTags(h[1]),
      body,
      hrefs: [...body.matchAll(/<a[^>]*href="(\/[^"]+\/)"/g)].map((m) => m[1]),
    };
  });
}

/** The list row (`<li>`) in `body` that links to entry `id`. */
const rowFor = (body: string, id: string) =>
  body.match(new RegExp(`<li[^>]*>(?:(?!</li>)[\\s\\S])*href="/${id}/"[\\s\\S]*?</li>`))?.[0];

/** Text of an element rendered by Astro, where `'` comes out as `&#39;`. */
const NAV_TITLE = /<a[^>]*href="\/"[^>]*>\s*Ashley Connor(?:'|&#39;)s TIL\s*<\/a>/;

describe('TIL entry pages', () => {
  it('TIL entry URL is /<id>/', () => {
    for (const id of [READ_FILE, GLOBS, LATE]) {
      expect(existsSync(join(dist, id, 'index.html')), id).toBe(true);
    }
    // No date-based path like the blog's posts.
    expect(existsSync(join(dist, '2025'))).toBe(false);
    expect(page(dist, READ_FILE)).toMatch(/<h1[^>]*>\s*Reading a file in Elixir\s*<\/h1>/);
  });

  it('TIL canonical uses til origin', () => {
    const entry = page(dist, READ_FILE);
    expect(entry).toContain(`<link rel="canonical" href="${ORIGIN}/${READ_FILE}/">`);
    expect(entry).toContain(`<meta property="og:url" content="${ORIGIN}/${READ_FILE}/">`);
    expect(page(dist, '')).toContain(`<link rel="canonical" href="${ORIGIN}/">`);
  });

  it('TIL accent is teal', () => {
    const html = page(dist, READ_FILE);
    expect(html).toMatch(/<span[^>]*class="[^"]*\btext-til\b[^"]*"[^>]*>\s*TIL\s*<\/span>/);
    const rules = ruleBlocks(allCss(html));
    expect(rules.some((r) => r.selectors.includes('.text-til') && r.body.includes('color:var(--color-til)'))).toBe(
      true,
    );
    expect(allCss(html)).toMatch(/--color-til:\s*#7fd1c7/);
  });

  it('has a meta line with the Los Angeles date and tags linking to the blog', () => {
    const html = page(dist, READ_FILE);
    expect(html).toMatch(/<time datetime="2025-04-12T16:00:00\.000Z"[^>]*>\s*12 Apr 2025\s*<\/time>/);
    expect(html).toMatch(new RegExp(`<a[^>]*href="${BLOG}/tags/elixir/"[^>]*>\\s*#elixir\\s*</a>`));
    expect(html).toMatch(new RegExp(`<a[^>]*href="${BLOG}/tags/tools/"[^>]*>\\s*#tools\\s*</a>`));
    // Tag pages only exist on the blog.
    expect(html).not.toContain('href="/tags/');
  });

  it('describes itself with its excerpt, or the TIL tagline without one', () => {
    const excerpt = 'Use File.read!/1 when a missing file is a bug, File.read/1 when it is expected.';
    const withExcerpt = page(dist, READ_FILE);
    expect(withExcerpt).toContain(`<meta name="description" content="${excerpt}">`);
    expect(withExcerpt).toContain(`<meta property="og:description" content="${excerpt}">`);

    for (const html of [page(dist, GLOBS), page(dist, '')]) {
      expect(html).toMatch(new RegExp(`<meta name="description" content="${TAGLINE}">`));
      expect(html).not.toContain('The idle thoughts of a rambling developer.');
    }
  });

  it('renders code with Expressive Code', () => {
    const html = page(dist, READ_FILE);
    expect(html).toContain('class="expressive-code"');
    expect(html).toMatch(/<figcaption class="header">[\s\S]*?read\.exs/);
    expect(html).toContain('Copy to clipboard');
  });

  it('resolves images that live outside the TIL folder', () => {
    const html = page(dist, READ_FILE);
    const src = html.match(/<img[^>]*alt="A small diagram"[^>]*>/)?.[0].match(/src="([^"]+)"/)?.[1];
    expect(src).toMatch(/^\/_astro\/diagram\.[\w-]+\.webp$/);
    expect(existsSync(join(dist, src!))).toBe(true);
  });
});

describe('TIL navigation', () => {
  it('has its own nav: the TIL title home and a link back to the blog', () => {
    for (const html of [page(dist, ''), page(dist, READ_FILE), readFileSync(join(dist, '404.html'), 'utf8')]) {
      const nav = html.match(/<nav[^>]*aria-label="Main"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';
      expect(nav).toMatch(NAV_TITLE);
      expect(nav).toMatch(new RegExp(`<a[^>]*href="${BLOG}/"[^>]*>\\s*Blog ↗\\s*</a>`));
      // Not the blog's nav, whose relative links would 404 here.
      expect(html).not.toContain('href="/posts/"');
      expect(html).not.toContain('TIL ↗');
    }
  });
});

describe('TIL index', () => {
  it('TIL index groups by month', () => {
    const sections = monthSections(page(dist, ''));
    const months = sections.map((s) => s.month);
    expect(months).toContain('April 2025');
    expect(months).toContain('February 2025');
    // Each month once, newest first.
    expect(new Set(months).size).toBe(months.length);
    const times = months.map((m) => new Date(`1 ${m}`).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));

    const april = sections.find((s) => s.month === 'April 2025')!;
    expect(april.hrefs.filter((h) => [`/${READ_FILE}/`, `/${GLOBS}/`].includes(h))).toEqual([
      `/${READ_FILE}/`,
      `/${GLOBS}/`,
    ]);
  });

  it('groups by the Los Angeles date, not UTC', () => {
    // 2025-02-28 20:30 -08:00 is already 1 March in UTC.
    // Other fixtures may add months, so look the entry up rather than assert the month list.
    const section = monthSections(page(dist, '')).find((s) => s.hrefs.includes(`/${LATE}/`));
    expect(section?.month).toBe('February 2025');
    const row = rowFor(section!.body, LATE);
    expect(row, 'no row for the late entry').toBeDefined();
    expect(row).toMatch(/<time[^>]*>\s*<span aria-hidden="true">28<\/span><span class="sr-only">28 Feb 2025<\/span>\s*<\/time>/);
  });

  it('rows show a teal TIL icon, the title and the day', () => {
    const april = monthSections(page(dist, '')).find((s) => s.month === 'April 2025')!;
    const row = rowFor(april.body, READ_FILE);
    expect(row, 'no row for the entry').toBeDefined();
    expect(row).toMatch(/<svg[^>]*class="[^"]*\btext-til\b/);
    expect(row).toMatch(/>\s*Reading a file in Elixir\s*</);
    expect(row).toMatch(
      /<time datetime="2025-04-12T16:00:00\.000Z"[^>]*>\s*<span aria-hidden="true">12<\/span><span class="sr-only">12 Apr 2025<\/span>\s*<\/time>/,
    );
  });

  it('uses the shared stream rows, linking to entries on this site with no outbound arrow', () => {
    const list = rows(page(dist, ''));
    expect(list).toHaveLength(PUBLIC_FIXTURES);
    for (const row of list) {
      expect(row).toMatch(/<a[^>]*href="\/[^"/]+\/"/);
      // The arrow marks rows that leave the site, like TIL rows on the blog; these stay here.
      expect(row).not.toContain('↗');
    }
  });

  it('has a heading and the TIL tagline, in the centred column', () => {
    const html = page(dist, '');
    expect(html).toMatch(/<h1[^>]*>\s*Today I Learned\s*<\/h1>/);
    expect(html).toMatch(new RegExp(`<p[^>]*class="[^"]*\\btext-muted\\b[^"]*"[^>]*>\\s*${TAGLINE}\\s*</p>`));
    expect(html).toMatch(/<main[^>]*class="[^"]*max-w-\[680px\]/);
  });

  it('lists neither drafts nor unlisted entries', () => {
    const html = page(dist, '');
    for (const [id, title] of [
      [DRAFT, 'A draft TIL'],
      [UNLISTED, 'An unlisted TIL'],
    ]) {
      expect(html).not.toContain(`/${id}/`);
      expect(html).not.toContain(title);
    }
  });
});

describe('TIL index pagination', () => {
  it('serves page 1 at / and page 2 at /page/2/, linked both ways', () => {
    const first = page(pagedDist, '');
    const second = page(pagedDist, 'page/2');
    expect(rows(first)).toHaveLength(30);
    // The public TIL fixtures and 30 extra TILs: 30 on page 1, the rest here.
    expect(rows(second)).toHaveLength(PUBLIC_FIXTURES);
    expect(existsSync(join(pagedDist, '2/index.html'))).toBe(false);
    expect(first).toMatch(/<a[^>]*href="\/page\/2\/"[^>]*rel="next"|<a[^>]*rel="next"[^>]*href="\/page\/2\/"/);
    expect(second).toMatch(/<a[^>]*href="\/"[^>]*rel="prev"|<a[^>]*rel="prev"[^>]*href="\/"/);
    expect(text(second)).toContain('Page 2 of 2');
    expect(second).toContain(`<link rel="canonical" href="${ORIGIN}/page/2/">`);
  });

  it('lists page 2 in the sitemap at /page/2/', () => {
    expect(sitemapText(pagedDist)).toContain(`<loc>${ORIGIN}/page/2/</loc>`);
    expect(sitemapText(pagedDist)).not.toContain(`<loc>${ORIGIN}/2/</loc>`);
  });

  it('has no pager when everything fits on one page', () => {
    expect(page(dist, '')).not.toMatch(/aria-label="Pagination"/);
  });
});

describe('unlisted and drafts', () => {
  it('unlisted entries are built, indexable, but not listed', () => {
    const html = page(dist, UNLISTED);
    expect(html).toMatch(/<h1[^>]*>\s*An unlisted TIL\s*<\/h1>/);
    expect(html).not.toContain('noindex');
  });

  it('drafts are not built unless PUBLIC_SHOW_DRAFTS=true', () => {
    expect(existsSync(join(dist, DRAFT))).toBe(false);
  });

  it('drafts are built and listed with a banner and noindex when PUBLIC_SHOW_DRAFTS=true', () => {
    const html = page(draftDist, DRAFT);
    expect(html).toMatch(/data-draft-banner[^>]*>[\s\S]*?Draft/);
    expect(html).toContain('<meta name="robots" content="noindex">');
    const april = monthSections(page(draftDist, '')).find((s) => s.month === 'April 2025')!;
    expect(april.hrefs).toContain(`/${DRAFT}/`);
    // Unlisted stays out of listings even in preview builds.
    expect(page(draftDist, '')).not.toContain(`/${UNLISTED}/`);
  });
});

describe('404', () => {
  it('is a noindex page with a way back to the TIL index', () => {
    const html = readFileSync(join(dist, '404.html'), 'utf8');
    expect(html).toMatch(/<h1[^>]*>\s*Page not found\s*<\/h1>/);
    expect(html).toContain('<meta name="robots" content="noindex">');
    // Workers serves `404.html` at `/404` (`/404.html` and `/404/` redirect there).
    expect(html).toContain('<link rel="canonical" href="https://til.ashleyconnor.co.uk/404">');
    expect(html).toMatch(/<main[\s\S]*<a[^>]*href="\/"[^>]*>[\s\S]*?<\/main>/);
  });
});

describe('favicon', () => {
  it('links an SVG favicon that the TIL build ships too', () => {
    expect(page(dist, '')).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
    expect(readFileSync(join(dist, 'favicon.svg'), 'utf8')).toMatch(/^<svg\b/);
  });
});

describe('fonts', () => {
  it('never fakes a bold: mono text only uses weights that are loaded', () => {
    // JetBrains Mono only loads 400 and 500, so `font-mono` with semibold/bold would be synthesised.
    const pages = [page(dist, ''), page(dist, READ_FILE), readFileSync(join(dist, '404.html'), 'utf8')];
    for (const html of pages) {
      for (const [, classes] of html.matchAll(/class="([^"]*)"/g)) {
        const list = classes.split(/\s+/);
        const fakeBold = list.includes('font-mono') && (list.includes('font-semibold') || list.includes('font-bold'));
        expect(fakeBold, classes).toBe(false);
      }
    }
  });
});

describe('feed, sitemap and robots', () => {
  const file = (outDir: string, name: string) => readFileSync(join(outDir, name), 'utf8');

  it('has its own feed of public TILs, linking to the TIL origin', () => {
    const xml = file(dist, 'feed.xml');
    expect(xml).toMatch(/<channel><title>Ashley Connor(?:'|&apos;)s TIL<\/title>/);
    expect(xml).toContain(`<link>${ORIGIN}/</link>`);
    expect(xml).toContain(`<link>${ORIGIN}/${READ_FILE}/</link>`);
    expect(xml).toContain(
      '<description>Use File.read!/1 when a missing file is a bug, File.read/1 when it is expected.</description>',
    );
    for (const hidden of [DRAFT, UNLISTED, 'A draft TIL', 'An unlisted TIL']) expect(xml).not.toContain(hidden);
    // Only TILs: blog posts and photos have their own feeds on the blog.
    expect(xml).not.toContain('A basic post');
  });

  it('has its own sitemap, without unlisted entries or drafts', () => {
    const text = sitemapText(dist);
    expect(text).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(text).toContain(`<loc>${ORIGIN}/${READ_FILE}/</loc>`);
    expect(text).not.toContain(UNLISTED);
    expect(existsSync(join(dist, UNLISTED, 'index.html'))).toBe(true);
    expect(text).not.toContain(BLOG);
    expect(text).not.toContain(`${ORIGIN}/404`);

    expect(existsSync(join(draftDist, DRAFT, 'index.html'))).toBe(true);
    expect(sitemapText(draftDist)).not.toContain(DRAFT);
    expect(sitemapText(draftDist)).toContain(`<loc>${ORIGIN}/${READ_FILE}/</loc>`);
  });

  // The sitemap filter reads content outside Astro (loadItems): its TIL URLs must be the pages built here.
  it("the sitemap filter's TIL URLs are the pages the build generates", () => {
    vi.stubEnv('CONTENT_ROOT', join(root, 'tests/fixtures/content'));
    const tils = loadItems().filter((item) => item.type === 'til');
    vi.unstubAllEnvs();
    const hrefs = tils.map((item) => item.href);
    expect(hrefs).toEqual(expect.arrayContaining([`${ORIGIN}/${UNLISTED}/`, `${ORIGIN}/${DRAFT}/`]));
    for (const { href, draft } of tils) {
      expect(href.startsWith(`${ORIGIN}/`), href).toBe(true);
      const path = new URL(href).pathname;
      if (!draft) expect(existsSync(join(dist, path, 'index.html')), href).toBe(true);
      expect(existsSync(join(draftDist, path, 'index.html')), href).toBe(true);
    }
  });

  it('robots.txt points at the TIL sitemap', () => {
    const robots = file(dist, 'robots.txt');
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap-index.xml`);
  });
});
