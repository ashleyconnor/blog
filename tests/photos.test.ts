import { execa } from 'execa';
import exifr from 'exifr';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { type Browser, chromium } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const fixtures = join(root, 'tests/fixtures/content');

let dist: string;
let draftDist: string;

/** Builds the blog against the fixture content into `outDir` (see blog-pages.test.ts). */
async function build(outDir: string, showDrafts: boolean) {
  await execa('pnpm', ['--filter', 'blog', 'exec', 'astro', 'build', '--force', '--outDir', outDir], {
    cwd: root,
    env: { CONTENT_ROOT: fixtures, PUBLIC_SHOW_DRAFTS: showDrafts ? 'true' : 'false' },
  });
}

const file = (outDir: string, path: string) => readFileSync(join(outDir, path), 'utf8');
const page = (outDir: string, path: string) => file(outDir, join(path, 'index.html'));

/** Text content of the HTML fragment, whitespace collapsed. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const tags = (html: string, name: string) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(([tag]) => tag);

/** The gallery grid of a gallery page. */
const grid = (html: string) => html.match(/<ul[^>]*\bdata-gallery\b[^>]*>[\s\S]*?<\/ul>/)?.[0] ?? '';

const GALLERY = 'photos/anza-borrego';
const DRAFT_GALLERY = 'photos/draft-gallery';
const SOURCE = join(fixtures, GALLERY, 'a.jpg');
const ALTS = [
  'An orange desert ridge fading into a purple dusk sky',
  'A blue gradient standing in for a night sky',
  'A green gradient standing in for a canyon floor',
  'A sand-coloured gradient standing in for a dune',
];

/**
 * The GPS position in an image's EXIF, or `undefined`. exifr cannot find EXIF in WebP, and misses it
 * in the AVIF files libheif writes (it returns `undefined`, not an error), so sharp pulls the EXIF
 * block out of the container and exifr reads GPS from that.
 */
async function gpsOf(image: string | Buffer): Promise<{ latitude: number; longitude: number } | undefined> {
  const { exif } = await sharp(image).metadata();
  if (!exif) return undefined;
  return exifr.gps(exif.toString('latin1', 0, 6) === 'Exif\0\0' ? exif.subarray(6) : exif);
}

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'ac-photos-dist-'));
  draftDist = mkdtempSync(join(tmpdir(), 'ac-photos-drafts-'));
  await build(dist, false);
  await build(draftDist, true);
}, 300_000);

afterAll(() => {
  for (const dir of [dist, draftDist]) if (dir) rmSync(dir, { recursive: true, force: true });
});

// "Stream shows 3 thumbs and +1" is pinned by blog-pages.test.ts ("photo rows show 3 thumbnails…").

describe('gallery page', () => {
  it('lives at /photos/<id>/ with a pill, title, meta line and intro text', () => {
    const html = page(dist, GALLERY);
    expect(html).toContain('<link rel="canonical" href="https://www.ashleyconnor.co.uk/photos/anza-borrego/">');
    expect(html).toContain('<meta name="description" content="Wildflowers, slot canyons and a very dark sky.">');
    expect(html).not.toContain('noindex');
    expect(html).toMatch(/<h1[^>]*>\s*A weekend in Anza-Borrego\s*<\/h1>/);
    expect(html).toMatch(/>\s*Photos\s*<\/span>/);
    expect(html).toMatch(/<time datetime="2025-02-20T17:00:00\.000Z"[^>]*>\s*20 Feb 2025\s*<\/time>/);
    expect(text(html)).toContain('4 photos');
    expect(html).toMatch(/<a[^>]*href="\/tags\/travel\/"[^>]*>\s*#travel\s*<\/a>/);
    expect(text(html)).toContain('Two days of hiking in the desert.');
  });

  it('gallery page lists all images with alt', () => {
    const main = page(dist, GALLERY).match(/<main[\s\S]*<\/main>/)![0];
    const imgs = tags(main, 'img');
    expect(imgs.map((img) => attr(img, 'alt'))).toEqual(ALTS);
    // Explicit dimensions, so nothing shifts as the thumbnails load.
    for (const img of imgs) {
      expect(Number(attr(img, 'width')), img).toBeGreaterThan(0);
      expect(Number(attr(img, 'height')), img).toBeGreaterThan(0);
    }
    expect(text(grid(main))).toMatch(/Sunset from Font(?:'|&#39;)s Point/);
  });

  it('is a grid wider than the reading column, with AVIF and WebP thumbnails', () => {
    const html = page(dist, GALLERY);
    expect(attr(tags(html, 'ul').find((ul) => /\bdata-gallery\b/.test(ul))!, 'class')?.split(/\s+/)).toEqual(
      expect.arrayContaining(['breakout', 'grid']),
    );
    const sources = tags(grid(html), 'source');
    expect(sources.filter((s) => attr(s, 'type') === 'image/avif')).toHaveLength(4);
    expect(sources.filter((s) => attr(s, 'type') === 'image/webp')).toHaveLength(4);
  });

  it('loads the first row of thumbnails eagerly and lazy-loads the rest', () => {
    expect(tags(grid(page(dist, GALLERY)), 'img').map((img) => attr(img, 'loading'))).toEqual([
      'eager',
      'eager',
      'eager',
      'lazy',
    ]);
  });

  it('links each thumbnail to its full-size WebP, with the dimensions the lightbox needs', async () => {
    const links = tags(grid(page(dist, GALLERY)), 'a');
    expect(links).toHaveLength(4);
    for (const link of links) {
      const href = attr(link, 'href')!;
      expect(href).toMatch(/^\/_astro\/[^/]+\.webp$/);
      const { width, height, format } = await sharp(join(dist, href)).metadata();
      expect(format).toBe('webp');
      expect(attr(link, 'data-pswp-width')).toBe(String(width));
      expect(attr(link, 'data-pswp-height')).toBe(String(height));
    }
  });
});

describe('photo privacy', () => {
  it('published images have no GPS', async () => {
    // The source really is geotagged, so this cannot pass by accident.
    expect(await gpsOf(SOURCE)).toMatchObject({
      latitude: expect.any(Number),
      longitude: expect.any(Number),
    });

    const assets = join(dist, '_astro');
    const images = readdirSync(assets).filter((name) => /\.(avif|webp|jpe?g|png)$/.test(name));
    const fromSource = images.filter((name) => name.startsWith('a.'));
    expect(new Set(fromSource.map((name) => name.split('.').at(-1)))).toEqual(new Set(['avif', 'webp', 'jpg']));
    for (const name of images) expect(await gpsOf(join(assets, name)), name).toBeUndefined();
  });

  it('the GPS check sees GPS in every format the build publishes', async () => {
    for (const format of ['avif', 'webp', 'jpeg', 'png'] as const) {
      const geotagged = await sharp(SOURCE).keepExif().toFormat(format).toBuffer();
      expect(await gpsOf(geotagged), format).toMatchObject({ latitude: expect.any(Number) });
    }
  });
});

/** The module scripts of a built page (inline bodies and `src` files), each with its URL directory. */
const moduleScripts = (html: string) =>
  [...html.matchAll(/<script type="module"(?: src="([^"]+)")?[^>]*>([\s\S]*?)<\/script>/g)].map(([, src, body]) =>
    src ? { code: file(dist, src), base: posix.dirname(src) } : { code: body!, base: '/' },
  );

/** URL paths of the PhotoSwipe chunks a script imports dynamically. */
const photoswipeChunks = ({ code, base }: { code: string; base: string }) =>
  [...code.matchAll(/\bimport\(\s*["'`]([^"'`]+)["'`]\s*\)/g)]
    .map(([, spec]) => posix.resolve(base, spec!))
    .filter((chunk) => /photoswipe/i.test(posix.basename(chunk)));

describe('lightbox', () => {
  it('lightbox JS only on gallery pages', () => {
    for (const path of ['', 'photos']) expect(page(dist, path), `/${path}`).not.toContain('<script type="module"');

    const html = page(dist, GALLERY);
    // Nothing of PhotoSwipe comes with the page itself...
    expect(html).not.toMatch(/photoswipe/i);
    const scripts = moduleScripts(html);
    expect(scripts).toHaveLength(1);
    // ...nor is it imported up front: the page's script imports it dynamically, on first click.
    expect(scripts[0]!.code).not.toMatch(/\b(?:from|import)\s*["'`][^"'`]*photoswipe/i);
    const chunks = photoswipeChunks(scripts[0]!);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) expect(file(dist, chunk)).toContain('pswp');
  });
});

describe('lightbox in a browser', () => {
  const ORIGIN = 'http://blog.test';
  const PALETTE = ['#0f1629', '#18223b', '#232e49', '#f1f5ff', '#c9d3e6', '#7d8aa6', '#8ab4ff', '#7fd1c7', '#f0b86e'];
  /** Every colour PhotoSwipe 5 takes from a custom property. */
  const PSWP_COLOURS = [
    '--pswp-bg',
    '--pswp-placeholder-bg',
    '--pswp-preloader-color',
    '--pswp-preloader-color-secondary',
    '--pswp-icon-color',
    '--pswp-icon-color-secondary',
    '--pswp-icon-stroke-color',
    '--pswp-error-text-color',
  ];

  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
  });

  /** Opens the gallery page in Chromium, served straight from `dist`; a request for `blocked` fails. */
  async function openGallery(blocked?: string) {
    const tab = await browser.newPage();
    await tab.route(`${ORIGIN}/**`, (route) => {
      const { pathname } = new URL(route.request().url());
      const path = join(dist, pathname, pathname.endsWith('/') ? 'index.html' : '');
      if (pathname === blocked) return route.abort();
      return existsSync(path) ? route.fulfill({ path }) : route.fulfill({ status: 404 });
    });
    await tab.goto(`${ORIGIN}/${GALLERY}/`);
    return tab;
  }

  it('opens the clicked photo, in the palette colours', async () => {
    const tab = await openGallery();
    await tab.locator('[data-gallery] a').nth(1).click();
    await tab.locator('.pswp--open').waitFor();
    const counter = tab.locator('.pswp__counter');
    expect(await counter.textContent()).toBe('2 / 4');
    expect(await counter.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(241, 245, 255)');

    const colours = await tab.locator('.pswp').evaluate(
      (el, names) => names.map((name) => [name, getComputedStyle(el).getPropertyValue(name).trim()]),
      PSWP_COLOURS,
    );
    for (const [name, value] of colours) expect(PALETTE, `${name}: ${value}`).toContain(value);
    await tab.close();
  }, 30_000);

  it('follows the link when any PhotoSwipe chunk fails to load', async () => {
    const chunks = photoswipeChunks(moduleScripts(page(dist, GALLERY))[0]!);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      const tab = await openGallery(chunk);
      const thumb = tab.locator('[data-gallery] a').first();
      const href = await thumb.getAttribute('href');
      await thumb.click();
      const followed = await tab.waitForURL(`${ORIGIN}${href}`, { timeout: 5_000 }).then(
        () => true,
        () => false,
      );
      expect(followed, `the link is followed when ${chunk} fails`).toBe(true);
      await tab.close();
    }
  }, 60_000);
});

describe('draft galleries', () => {
  it('are not built unless PUBLIC_SHOW_DRAFTS=true', () => {
    expect(existsSync(join(dist, DRAFT_GALLERY, 'index.html'))).toBe(false);
  });

  it('are built with a banner and noindex when PUBLIC_SHOW_DRAFTS=true', () => {
    const html = page(draftDist, DRAFT_GALLERY);
    expect(html).toMatch(/data-draft-banner[^>]*>[\s\S]*?Draft/);
    expect(html).toContain('<meta name="robots" content="noindex">');
  });
});
