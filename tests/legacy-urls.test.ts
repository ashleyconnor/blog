import { execa } from 'execa';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

/** Every URL the Jekyll site's sitemap listed (all on the blog's domain). */
const LEGACY_URLS: string[] = JSON.parse(readFileSync(join(root, 'scripts/legacy-sitemap.json'), 'utf8'));

type App = 'blog' | 'til';
const ORIGINS: Record<App, string> = {
  blog: 'https://www.ashleyconnor.co.uk',
  til: 'https://til.ashleyconnor.co.uk',
};

const dist: Record<App, string> = { blog: '', til: '' };

/**
 * Builds `app` from the real content into `outDir`. CONTENT_ROOT is unset so a value exported in the
 * parent shell (which execa passes through) cannot point the build at the fixtures.
 */
async function build(app: App, outDir: string) {
  await execa('pnpm', ['--filter', app, 'exec', 'astro', 'build', '--force', '--outDir', outDir], {
    cwd: root,
    env: { CONTENT_ROOT: undefined, PUBLIC_SHOW_DRAFTS: 'false' },
  });
}

beforeAll(async () => {
  dist.blog = mkdtempSync(join(tmpdir(), 'ac-legacy-blog-'));
  dist.til = mkdtempSync(join(tmpdir(), 'ac-legacy-til-'));
  await build('blog', dist.blog);
  // The blog's `build` script prints the resume to `resume.pdf` after `astro build`; do the same here.
  await execa(process.execPath, ['--experimental-strip-types', 'scripts/resume-pdf.ts', '--outDir', dist.blog], {
    cwd: root,
  });
  await build('til', dist.til);
}, 300_000);

afterAll(() => {
  for (const dir of Object.values(dist)) if (dir) rmSync(dir, { recursive: true, force: true });
});

interface Rule {
  from: string;
  to: string;
  status: number;
}

/** An app's Cloudflare `_redirects` rules, in file order; an app without the file has none. */
function redirects(app: App): Rule[] {
  const path = join(dist[app], '_redirects');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [from, to, status = '302'] = line.split(/\s+/);
      return { from: from!, to: to!, status: Number(status) };
    });
}

/** Cloudflare's matching: the first rule that matches wins, and a trailing `*` captures the rest as `:splat`. */
function match(rules: Rule[], path: string): Rule | undefined {
  for (const rule of rules) {
    if (rule.from.endsWith('*')) {
      const prefix = rule.from.slice(0, -1);
      if (path.startsWith(prefix)) return { ...rule, to: rule.to.replace(':splat', path.slice(prefix.length)) };
    } else if (path === rule.from) {
      return rule;
    }
  }
  return undefined;
}

/** The app a URL belongs to; a site-relative URL stays on `from`. */
function appOf(url: URL): App {
  const app = (Object.keys(ORIGINS) as App[]).find((key) => ORIGINS[key] === url.origin);
  if (!app) throw new Error(`${url.href} is on neither site`);
  return app;
}

/** The built file Cloudflare serves for `path`: `index.html` for a directory URL, else the file itself. */
const fileFor = (app: App, path: string) => join(dist[app], decodeURIComponent(path), path.endsWith('/') ? 'index.html' : '');

/**
 * Where a request for `url` ends up on Cloudflare: redirects apply before files, so each hop follows
 * the first matching `_redirects` rule of the app it lands on, until no rule matches. The result is the
 * file that must exist there, plus every hop taken.
 */
function land(url: string): { app: App; path: string; file: string; hops: Rule[] } {
  let current = new URL(url);
  const hops: Rule[] = [];
  for (let i = 0; i < 5; i++) {
    const app = appOf(current);
    const rule = match(redirects(app), current.pathname);
    if (!rule) return { app, path: current.pathname, file: fileFor(app, current.pathname), hops };
    hops.push(rule);
    current = new URL(rule.to, current);
  }
  throw new Error(`${url} redirects more than 5 times: ${hops.map((hop) => hop.to).join(' → ')}`);
}

const isFile = (path: string) => existsSync(path) && statSync(path).isFile();

describe('legacy URLs', () => {
  it('every legacy URL resolves', () => {
    expect(LEGACY_URLS.length).toBeGreaterThan(0);
    for (const url of LEGACY_URLS) {
      const { app, path, file, hops } = land(url);
      expect(isFile(file), `${url} lands on ${app} ${path}, which was not built`).toBe(true);
      for (const hop of hops) expect(hop.status, `${url}: ${hop.from} → ${hop.to}`).toBe(301);
    }
  });

  it('lands each kind of legacy URL on the right page', () => {
    const landing = (url: string) => {
      const { app, path } = land(`${ORIGINS.blog}${url}`);
      return `${app} ${path}`;
    };
    expect(landing('/2014/09/07/the-digital-nomad-and-immigration-law.html')).toBe(
      'blog /2014/09/07/the-digital-nomad-and-immigration-law/',
    );
    // Its older aliases (the post's `legacyUrls`), which the Jekyll sitemap never listed.
    expect(landing('/blog/2014/09/07/the-digital-nomad-and-immigration-law/')).toBe(
      'blog /2014/09/07/the-digital-nomad-and-immigration-law/',
    );
    expect(landing('/blog/2014/09/07/working-in-thailand-as-a-digital-nomad/')).toBe(
      'blog /2014/09/07/the-digital-nomad-and-immigration-law/',
    );
    expect(landing('/2025/04/24/pythons-async-gap-why-the-standard-library-needs-a-run-sync.html')).toBe(
      'blog /2025/04/23/pythons-async-gap-why-the-standard-library-needs-a-run-sync/',
    );
    expect(landing('/til/2022-11-26-how-to-remove-self-control')).toBe('til /2022-11-26-how-to-remove-self-control/');
    expect(landing('/til/index')).toBe('til /');
    expect(landing('/page2/')).toBe('blog /');
    expect(landing('/assets/pdfs/resume.pdf')).toBe('blog /resume.pdf');
  });

  it('/instaboxd/privacy/ is a built page, not a redirect', () => {
    const { app, file, hops } = land(`${ORIGINS.blog}/instaboxd/privacy/`);
    expect(hops).toEqual([]);
    expect(app).toBe('blog');
    expect(isFile(file)).toBe(true);
  });

  it('every _redirects target resolves, including legacy URLs the old sitemap never listed', () => {
    for (const rule of redirects('blog')) {
      // A wildcard's target depends on the request; the legacy URLs it catches are checked above.
      if (rule.from.includes('*')) continue;
      const { app, path, file } = land(new URL(rule.to, ORIGINS.blog).href);
      expect(isFile(file), `${rule.from} → ${rule.to} lands on ${app} ${path}, which was not built`).toBe(true);
    }
  });
});
