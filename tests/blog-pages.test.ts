import { execa } from 'execa';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const fixtures = join(root, 'tests/fixtures/content');

let dist: string;
let draftDist: string;
let pagedDist: string;
let pagedContent: string;

/**
 * Builds the blog against `contentRoot` into `outDir`. PUBLIC_SHOW_DRAFTS is always set, so a value
 * exported in the parent shell (which execa passes through) can never leak into the default build.
 */
async function build(outDir: string, { contentRoot = fixtures, showDrafts = false } = {}) {
  await execa('pnpm', ['--filter', 'blog', 'exec', 'astro', 'build', '--force', '--outDir', outDir], {
    cwd: root,
    env: { CONTENT_ROOT: contentRoot, PUBLIC_SHOW_DRAFTS: showDrafts ? 'true' : 'false' },
  });
}

/**
 * The fixtures plus enough TILs to need a second homepage page (15 per page). The MDX post is left
 * out: its `@ac/ui` imports only resolve from inside the repository, and this copy lives in tmpdir.
 * Its image stays, because a TIL fixture embeds it.
 */
function pagedFixtures(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ac-blog-paged-content-'));
  cpSync(fixtures, dir, { recursive: true, filter: (src) => !src.endsWith(join('advanced-post', 'index.mdx')) });
  for (let day = 1; day <= 15; day++) {
    const dd = String(day).padStart(2, '0');
    writeFileSync(
      join(dir, 'til', `2024-01-${dd}-extra-til-${dd}.md`),
      `---\ntitle: Extra TIL ${dd}\ndate: "2024-01-${dd}T12:00:00-08:00"\ntags: [tools]\n---\n\nFiller.\n`,
    );
  }
  return dir;
}

const file = (outDir: string, path: string) => readFileSync(join(outDir, path), 'utf8');
const page = (outDir: string, path: string) => file(outDir, join(path, 'index.html'));

/** Text content of the HTML fragment, whitespace collapsed. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The `<li data-type=…>` rows of a stream page, with their type and inner HTML. */
const rows = (html: string) =>
  [...html.matchAll(/<li[^>]*data-type="(\w+)"[^>]*>([\s\S]*?)<\/li>/g)].map(([, type, body]) => ({
    type: type!,
    body: body!,
  }));

const rowFor = (html: string, title: string) => rows(html).find((r) => r.body.includes(title));

/** Title and link of each `<item>` of an RSS feed, in feed order. */
const feedItems = (xml: string) =>
  [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => ({
    title: item!.match(/<title>([^<]*)<\/title>/)?.[1],
    link: item!.match(/<link>([^<]*)<\/link>/)?.[1],
  }));

/** Text of every `sitemap-*.xml`, the index included. */
const sitemapText = (outDir: string) =>
  readdirSync(outDir)
    .filter((name) => /^sitemap-.*\.xml$/.test(name))
    .map((name) => file(outDir, name))
    .join('\n');

/** Page URLs the sitemaps list (the index only points at the other sitemap files). */
const sitemapUrls = (outDir: string) =>
  readdirSync(outDir)
    .filter((name) => /^sitemap-\d+\.xml$/.test(name))
    .flatMap((name) => [...file(outDir, name).matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, loc]) => loc!));

const tagPages = (outDir: string) =>
  readdirSync(join(outDir, 'tags'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join('tags', d.name));

const BASIC = { title: 'A basic post', path: '2025/04/23/basic-post' };
const ADVANCED = { title: 'An advanced post', path: '2025/02/10/advanced-post' };
const UNLISTED = { title: 'An unlisted post', path: '2014/09/07/unlisted-post' };
const DRAFT = { title: 'A draft post', path: '2025/04/22/draft-post' };
const PHOTOS = 'A weekend in Anza-Borrego';
const TILS = [
  'How to auto-activate a venv with direnv',
  'Elixir pattern matching in anonymous functions',
  'A late evening TIL',
  'Zsh glob qualifiers',
  'Reading a file in Elixir',
];
const HIDDEN_TILS = ['An unlisted TIL', 'A draft TIL'];
const ORIGIN = 'https://www.ashleyconnor.co.uk';
const TIL_ORIGIN = 'https://til.ashleyconnor.co.uk';

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'ac-blog-dist-'));
  draftDist = mkdtempSync(join(tmpdir(), 'ac-blog-drafts-'));
  pagedDist = mkdtempSync(join(tmpdir(), 'ac-blog-paged-'));
  pagedContent = pagedFixtures();
  await build(dist);
  await build(draftDist, { showDrafts: true });
  await build(pagedDist, { contentRoot: pagedContent });
}, 300_000);

afterAll(() => {
  for (const dir of [dist, draftDist, pagedDist, pagedContent]) if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('homepage stream', () => {
  it('homepage groups by month', () => {
    const headings = [...page(dist, '').matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(([, h]) => text(h!));
    expect(headings).toEqual(['April 2025', 'March 2025', 'February 2025', 'December 2022']);
  });

  it('lists every public entry of every type, newest first', () => {
    expect(rows(page(dist, '')).map((r) => r.type)).toEqual([
      'post', 'til', 'til', 'til', 'til', 'photos', 'post', 'til',
    ]);
    const html = page(dist, '');
    for (const title of [BASIC.title, ADVANCED.title, PHOTOS, ...TILS]) expect(html).toContain(title);
  });

  it('homepage excludes unlisted and draft', () => {
    for (const path of ['', 'posts', ...tagPages(dist)]) {
      const html = page(dist, path);
      expect(html, path).not.toContain(UNLISTED.title);
      expect(html, path).not.toContain(DRAFT.title);
      for (const title of HIDDEN_TILS) expect(html, path).not.toContain(title);
    }
  });

  it('homepage is centred column', () => {
    const html = page(dist, '');
    expect(html).toMatch(/<main[^>]*class="[^"]*\bmax-w-\[680px\][^"]*"[^>]*>[\s\S]*?data-stream[\s\S]*?<\/main>/);
  });

  it('month headings are mono, uppercase and muted with a hairline under; rows are icon · content · day', () => {
    const html = page(dist, '');
    const h2 = html.match(/<h2[^>]*class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
    expect(h2).toEqual(expect.arrayContaining(['font-mono', 'uppercase', 'text-muted', 'border-b', 'border-line']));
    const li = html.match(/<li[^>]*data-type="post"[^>]*class="([^"]*)"|<li[^>]*class="([^"]*)"[^>]*data-type="post"/);
    expect((li?.[1] ?? li?.[2])?.split(/\s+/)).toContain('grid-cols-[22px_1fr_auto]');
  });

  it('shows the day of the month in Los Angeles time, two digits', () => {
    const html = page(dist, '');
    // 2025-04-23 19:39 -07:00 is the 24th in UTC.
    expect(text(rowFor(html, BASIC.title)!.body)).toMatch(/\b23\b/);
    expect(text(rowFor(html, TILS[0]!)!.body)).toMatch(/\b01\b/);
  });

  it('has no client-side JavaScript', () => {
    expect(page(dist, '')).not.toMatch(/<script\b/);
  });
});

describe('stream rows', () => {
  it('TIL rows link to subdomain', () => {
    const tils = rows(page(dist, '')).filter((r) => r.type === 'til');
    expect(tils).toHaveLength(5);
    for (const { body } of tils) {
      const hrefs = [...body.matchAll(/href="([^"]*)"/g)].map(([, href]) => href);
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) expect(href).toMatch(/^https:\/\/til\.ashleyconnor\.co\.uk\//);
    }
    expect(page(dist, '')).toContain('href="https://til.ashleyconnor.co.uk/2025-03-01-auto-activate-a-venv-with-direnv/"');
  });

  it('post rows show a plain-text excerpt and reading time', () => {
    const row = text(rowFor(page(dist, ''), ADVANCED.title)!.body);
    expect(row).toMatch(/An MDX post with a figure and a callout\. · \d+ min/);
    const body = rowFor(page(dist, ''), ADVANCED.title)!.body;
    expect(body).not.toContain('**');
    expect(body).not.toContain('example.com/callout');
  });

  it('post excerpts truncate to one line, and the reading time never shrinks away', () => {
    const { body } = rowFor(page(dist, ''), ADVANCED.title)!;
    const meta = body.match(/<p[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/p>/);
    expect(meta?.[1].split(/\s+/)).toEqual(expect.arrayContaining(['flex', 'min-w-0']));
    // The excerpt is cut by CSS only, so its full text stays in the DOM for assistive tech.
    const excerpt = meta?.[2].match(/<span[^>]*class="([^"]*)"[^>]*>([^<]*)<\/span>\s*<span[^>]*class="([^"]*)"[^>]*>([^<]*)<\/span>\s*$/);
    expect(excerpt?.[2].trim()).toBe('An MDX post with a figure and a callout.');
    expect(excerpt?.[1].split(/\s+/)).toEqual(expect.arrayContaining(['min-w-0', 'truncate']));
    expect(text(excerpt?.[4] ?? '')).toMatch(/^· \d+ min$/);
    expect(excerpt?.[3].split(/\s+/)).toContain('shrink-0');
    // Flex gaps space the parts visually; real whitespace keeps them apart for screen readers.
    expect(meta?.[2].replace(/<[^>]+>/g, '')).toMatch(/Interactive\s+An MDX post with a figure and a callout\.\s+· \d+ min/);
  });

  it('only advanced posts get the Interactive label', () => {
    const html = page(dist, '');
    expect(text(rowFor(html, ADVANCED.title)!.body)).toContain('Interactive');
    expect(text(rowFor(html, BASIC.title)!.body)).not.toContain('Interactive');
  });

  it('photo rows show 3 thumbnails and the count of the rest', () => {
    const { body } = rowFor(page(dist, ''), PHOTOS)!;
    const imgs = [...body.matchAll(/<img\b[^>]*>/g)].map(([img]) => img);
    expect(imgs).toHaveLength(3);
    for (const img of imgs) expect(img).toMatch(/alt="[^"]+"/);
    expect(text(body)).toContain('+1');
    expect(body).toContain('href="/photos/anza-borrego/"');
  });

  it('post rows link to the post URL', () => {
    expect(rowFor(page(dist, ''), BASIC.title)!.body).toContain(`href="/${BASIC.path}/"`);
  });
});

describe('post pages', () => {
  it('post URL uses LA date', () => {
    expect(existsSync(join(dist, BASIC.path, 'index.html'))).toBe(true);
    expect(existsSync(join(dist, '2025/04/24/basic-post/index.html'))).toBe(false);
  });

  it('unlisted post page exists', () => {
    const html = page(dist, UNLISTED.path);
    expect(html).toContain(UNLISTED.title);
    expect(html).not.toContain('noindex');
  });

  it('describes a post with its excerpt as plain text', () => {
    expect(page(dist, ADVANCED.path)).toContain(
      '<meta name="description" content="An MDX post with a figure and a callout.">',
    );
  });
});

describe('drafts', () => {
  it('are neither listed nor built by default', () => {
    expect(page(dist, '')).not.toContain(DRAFT.title);
    expect(existsSync(join(dist, DRAFT.path, 'index.html'))).toBe(false);
  });

  it('drafts appear with banner when PUBLIC_SHOW_DRAFTS=true', () => {
    expect(page(draftDist, '')).toContain(DRAFT.title);
    expect(page(draftDist, 'posts')).toContain(DRAFT.title);
    const html = page(draftDist, DRAFT.path);
    expect(html).toMatch(/data-draft-banner[^>]*>[\s\S]*?Draft/);
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  it('still never lists unlisted posts', () => {
    expect(page(draftDist, '')).not.toContain(UNLISTED.title);
    expect(page(draftDist, '')).not.toContain('An unlisted TIL');
  });
});

describe('pagination', () => {
  it('serves page 1 at / and page 2 at /page/2/, linked both ways', () => {
    const first = page(pagedDist, '');
    const second = page(pagedDist, 'page/2');
    expect(rows(first)).toHaveLength(15);
    // Public: the basic post, the gallery, 5 TIL fixtures and 15 extra TILs.
    expect(rows(second)).toHaveLength(22 - 15);
    expect(existsSync(join(pagedDist, '2/index.html'))).toBe(false);
    expect(first).toMatch(/<a[^>]*href="\/page\/2\/"[^>]*rel="next"|<a[^>]*rel="next"[^>]*href="\/page\/2\/"/);
    expect(second).toMatch(/<a[^>]*href="\/"[^>]*rel="prev"|<a[^>]*rel="prev"[^>]*href="\/"/);
    expect(text(second)).toContain('Page 2 of 2');
    expect(page(pagedDist, 'page/2')).toContain('<link rel="canonical" href="https://www.ashleyconnor.co.uk/page/2/">');
  });

  it('has no pager when everything fits on one page', () => {
    expect(page(dist, '')).not.toMatch(/aria-label="Pagination"/);
  });
});

describe('type indexes', () => {
  it('/posts/ lists posts only', () => {
    const html = page(dist, 'posts');
    expect(html).toMatch(/<h1[^>]*>\s*Posts\s*<\/h1>/);
    expect(rows(html).map((r) => r.type)).toEqual(['post', 'post']);
  });

  it('/photos/ lists photos only', () => {
    const html = page(dist, 'photos');
    expect(html).toMatch(/<h1[^>]*>\s*Photos\s*<\/h1>/);
    expect(rows(html).map((r) => r.type)).toEqual(['photos']);
  });
});

describe('tags', () => {
  it('a tag page lists every public entry with that tag', () => {
    const html = page(dist, 'tags/python');
    expect(html).toMatch(/<h1[^>]*>[\s\S]*?Python[\s\S]*?<\/h1>/);
    expect(rows(html).map((r) => r.type)).toEqual(['post', 'til']);
  });

  it('every tag in tags.yml has a page, so tag links on unlisted posts never 404', () => {
    const tags = [...file(fixtures, 'tags.yml').matchAll(/slug: (\S+)/g)].map(([, slug]) => slug);
    for (const tag of tags) expect(existsSync(join(dist, 'tags', tag!, 'index.html')), tag).toBe(true);
    // `travel` only has the unlisted post and the photos: the page exists but lists only photos.
    expect(rows(page(dist, 'tags/travel')).map((r) => r.type)).toEqual(['photos']);
  });

  it('a tag with nothing public says so and is noindex', () => {
    const html = page(dist, 'tags/rails');
    expect(rows(html)).toHaveLength(0);
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  it('/tags/ links each tag that has public entries, with its count', () => {
    const html = page(dist, 'tags');
    expect(html).toMatch(/<a[^>]*href="\/tags\/python\/"[^>]*>[\s\S]*?Python[\s\S]*?2[\s\S]*?<\/a>/);
    expect(html).not.toContain('href="/tags/rails/"');
  });
});

describe('other pages', () => {
  it('404 page', () => {
    const html = file(dist, '404.html');
    expect(html).toMatch(/<h1[^>]*>[\s\S]*?not found[\s\S]*?<\/h1>/i);
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toMatch(/<a[^>]*href="\/"/);
    // Words and links stay separated (Astro drops some whitespace at line breaks next to tags).
    expect(html.replace(/<[^>]+>/g, '')).toMatch(/all posts or\s+tags\./);
  });

  it('InstaBoxd privacy policy lives at exactly /instaboxd/privacy/', () => {
    const html = page(dist, 'instaboxd/privacy');
    expect(html).toMatch(/<h1[^>]*>\s*InstaBoxd Privacy Policy\s*<\/h1>/);
    expect(html).toContain('<link rel="canonical" href="https://www.ashleyconnor.co.uk/instaboxd/privacy/">');
    expect(html).toMatch(/<h2[^>]*>\s*Contact\s*<\/h2>/);
  });
});

describe('feeds', () => {
  it('feed keeps /feed.xml path', () => {
    const xml = file(dist, 'feed.xml');
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?><rss version="2.0">/);
    expect(xml).toContain(`<channel><title>Ashley Connor</title>`);
    expect(xml).toContain(`<link>${ORIGIN}/</link>`);
  });

  it('feed excludes unlisted', () => {
    const xml = file(dist, 'feed.xml');
    expect(xml).not.toContain(UNLISTED.path);
    for (const title of [UNLISTED.title, DRAFT.title, ...HIDDEN_TILS]) expect(xml).not.toContain(title);
  });

  it('lists every public entry newest first; TIL items link to the subdomain', () => {
    const items = feedItems(file(dist, 'feed.xml'));
    expect(items.map((i) => i.title)).toEqual([
      BASIC.title,
      'Reading a file in Elixir',
      'Zsh glob qualifiers',
      'How to auto-activate a venv with direnv',
      'A late evening TIL',
      PHOTOS,
      ADVANCED.title,
      'Elixir pattern matching in anonymous functions',
    ]);
    const link = (title: string) => items.find((i) => i.title === title)?.link;
    expect(link(BASIC.title)).toBe(`${ORIGIN}/${BASIC.path}/`);
    expect(link(PHOTOS)).toBe(`${ORIGIN}/photos/anza-borrego/`);
    expect(link('Zsh glob qualifiers')).toBe(`${TIL_ORIGIN}/2025-04-03-til-zsh-glob-qualifiers/`);
  });

  it('describes items with their plain-text excerpt', () => {
    expect(file(dist, 'feed.xml')).toContain('<description>An MDX post with a figure and a callout.</description>');
  });

  it('has a feed per local type: /posts/feed.xml and /photos/feed.xml', () => {
    const posts = file(dist, 'posts/feed.xml');
    expect(feedItems(posts).map((i) => i.title)).toEqual([BASIC.title, ADVANCED.title]);
    expect(posts).toContain(`<link>${ORIGIN}/posts/</link>`);
    const photos = file(dist, 'photos/feed.xml');
    expect(feedItems(photos).map((i) => i.title)).toEqual([PHOTOS]);
    expect(photos).toContain(`<link>${ORIGIN}/photos/</link>`);
  });
});

describe('sitemap', () => {
  it('sitemap excludes unlisted', () => {
    expect(sitemapText(dist)).not.toContain(UNLISTED.path);
    expect(existsSync(join(dist, UNLISTED.path, 'index.html'))).toBe(true);
    const urls = sitemapUrls(dist);
    for (const path of ['', `${BASIC.path}/`, `${ADVANCED.path}/`, 'posts/', 'tags/python/', 'instaboxd/privacy/']) {
      expect(urls, path).toContain(`${ORIGIN}/${path}`);
    }
  });

  it('lists only built pages that may be indexed: no drafts, empty tag pages or 404', () => {
    for (const outDir of [dist, draftDist]) {
      const urls = sitemapUrls(outDir);
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) {
        expect(url.startsWith(`${ORIGIN}/`), url).toBe(true);
        const path = new URL(url).pathname;
        expect(existsSync(join(outDir, path, 'index.html')), url).toBe(true);
        expect(page(outDir, path), url).not.toContain('noindex');
      }
    }
    expect(sitemapText(dist)).not.toContain('/tags/rails/');
    expect(sitemapText(draftDist)).not.toContain(DRAFT.path);
    expect(sitemapText(dist)).not.toContain(`${ORIGIN}/404`);
  });

  it('robots.txt allows crawling and points at the sitemap index', () => {
    const robots = file(dist, 'robots.txt');
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap-index.xml`);
    expect(existsSync(join(dist, 'sitemap-index.xml'))).toBe(true);
  });
});

describe('_redirects', () => {
  const lines = (outDir: string) => file(outDir, '_redirects').split('\n');

  it('301s each legacy URL to its new page, unlisted posts included', () => {
    expect(lines(dist)).toEqual(
      expect.arrayContaining([
        '/2025/04/24/basic-post.html /2025/04/23/basic-post/ 301',
        '/2014/09/07/unlisted-post.html /2014/09/07/unlisted-post/ 301',
        '/blog/2014/09/07/unlisted-post/ /2014/09/07/unlisted-post/ 301',
        '/page2/ /page/2/ 301',
        '/assets/pdfs/resume.pdf /resume.pdf 301',
      ]),
    );
  });

  it('sends TIL legacy URLs to the subdomain, explicit rules before the /til/* wildcard', () => {
    const out = lines(dist);
    const wildcard = out.indexOf(`/til/* ${TIL_ORIGIN}/:splat 301`);
    for (const rule of [
      `/til/2022-12-01-elixir-pattern-matching-in-anon-functions ${TIL_ORIGIN}/2022-12-01-elixir-pattern-matching-in-anon-functions/ 301`,
      `/til/index ${TIL_ORIGIN}/ 301`,
    ]) {
      expect(out.indexOf(rule), rule).toBeGreaterThanOrEqual(0);
      expect(out.indexOf(rule), rule).toBeLessThan(wildcard);
    }
  });

  it('only redirects to drafts in builds that show them', () => {
    expect(file(dist, '_redirects')).not.toContain('draft-post');
    expect(lines(draftDist)).toContain('/2025/04/22/draft-post.html /2025/04/22/draft-post/ 301');
  });

  it('is a plain file at the site root, not a page', () => {
    expect(existsSync(join(dist, '_redirects', 'index.html'))).toBe(false);
    expect(sitemapText(dist)).not.toContain('_redirects');
  });
});
