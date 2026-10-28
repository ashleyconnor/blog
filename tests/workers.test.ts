/**
 * Both sites on Cloudflare's real static-assets engine: `wrangler dev --local` (workerd, no login and
 * no network) serves real-content builds with each app's `wrangler.jsonc`, so `_redirects`,
 * `_headers`, `html_handling` and `not_found_handling` behave as they will once deployed.
 */
import { execa } from 'execa';
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BLOG_ORIGIN, legacyUrls } from '../scripts/lib/legacy-urls.ts';
import { freePort, host } from '../scripts/lib/preview.ts';

const root = join(import.meta.dirname, '..');

type App = 'blog' | 'til';
type Mode = 'production' | 'preview';
const APPS: App[] = ['blog', 'til'];
const ORIGINS: Record<App, string> = { blog: BLOG_ORIGIN, til: 'https://til.ashleyconnor.co.uk' };

const POST = '/2014/09/07/the-digital-nomad-and-immigration-law/';

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'x-frame-options': 'DENY',
};

let tmp = '';
const dist = (mode: Mode, app: App) => join(tmp, mode, app);
/** The local `wrangler dev` origin serving each build. */
const local: Record<Mode, Record<App, string>> = { production: { blog: '', til: '' }, preview: { blog: '', til: '' } };
const servers: ChildProcess[] = [];

/**
 * Builds `app` from the real content. CONTENT_ROOT is unset so a value exported in the parent shell
 * (which execa passes through) cannot point the build at the fixtures. A preview build shows drafts and
 * marks every response noindex, as the PR preview deploys do.
 */
async function build(app: App, mode: Mode) {
  const preview = mode === 'preview';
  await execa('pnpm', ['--filter', app, 'exec', 'astro', 'build', '--force', '--outDir', dist(mode, app)], {
    cwd: root,
    env: { CONTENT_ROOT: undefined, PUBLIC_SHOW_DRAFTS: String(preview), PREVIEW: String(preview) },
  });
}

/** Serves `dir` with `app`'s Worker config on a free local port; resolves once it answers. */
async function serve(app: App, dir: string): Promise<string> {
  const port = await freePort();
  const child = spawn(
    join(root, 'node_modules/.bin/wrangler'),
    [
      'dev',
      '--local',
      '--config',
      join(root, 'apps', app, 'wrangler.jsonc'),
      '--assets',
      dir,
      '--ip',
      host,
      '--port',
      String(port),
      '--persist-to',
      join(dir, '..', `.wrangler-${app}`),
      '--show-interactive-dev-session=false',
      '--log-level',
      'warn',
    ],
    {
      cwd: root,
      // Its own process group, so afterAll can stop workerd along with wrangler.
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_ACCOUNT_ID: '0'.repeat(32) },
    },
  );
  servers.push(child);
  let output = '';
  child.stdout!.on('data', (chunk) => (output += chunk));
  child.stderr!.on('data', (chunk) => (output += chunk));
  const origin = `http://${host}:${port}`;
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null) throw new Error(`wrangler dev (${app}) exited:\n${output}`);
    try {
      await fetch(origin, { redirect: 'manual' });
      return origin;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`wrangler dev (${app}) never answered on ${origin}:\n${output}`);
}

beforeAll(async () => {
  mkdirSync(join(root, 'tests/.tmp'), { recursive: true });
  tmp = mkdtempSync(join(root, 'tests/.tmp/workers-'));
  for (const app of APPS) await build(app, 'production');
  // The blog's `build` script prints the resume to `resume.pdf` after `astro build`; do the same here.
  await execa(
    process.execPath,
    ['--experimental-strip-types', 'scripts/resume-pdf.ts', '--outDir', dist('production', 'blog')],
    { cwd: root },
  );
  for (const app of APPS) await build(app, 'preview');
  for (const mode of ['production', 'preview'] as Mode[]) {
    for (const app of APPS) local[mode][app] = await serve(app, dist(mode, app));
  }
}, 600_000);

afterAll(() => {
  for (const child of servers) {
    try {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

/** A production URL of either site, served by the local Worker for that site. */
function toLocal(url: URL, mode: Mode): URL {
  const app = APPS.find((key) => ORIGINS[key] === url.origin || local[mode][key] === url.origin);
  if (!app) throw new Error(`${url.href} is on neither site`);
  return new URL(url.pathname + url.search, local[mode][app]);
}

interface Hop {
  url: string;
  status: number;
  location: string;
}

/** Requests `url` and follows its redirects (mapping both sites' origins to the local Workers). */
async function follow(url: string, mode: Mode = 'production'): Promise<{ hops: Hop[]; response: Response }> {
  let current = toLocal(new URL(url), mode);
  const hops: Hop[] = [];
  for (let i = 0; i < 5; i++) {
    const response = await fetch(current, { redirect: 'manual' });
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) return { hops, response };
    await response.body?.cancel();
    hops.push({ url: current.href, status: response.status, location });
    current = toLocal(new URL(location, current), mode);
  }
  throw new Error(`${url} redirects more than 5 times: ${JSON.stringify(hops)}`);
}

describe('Workers (production build)', () => {
  it('every legacy URL ends at a 200 within 2 hops, each a 301', async () => {
    const urls = legacyUrls();
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      const { hops, response } = await follow(url);
      await response.body?.cancel();
      const trail = JSON.stringify(hops);
      expect(response.status, `${url}: ${trail}`).toBe(200);
      expect(hops.length, `${url}: ${trail}`).toBeLessThanOrEqual(2);
      for (const hop of hops) expect(hop.status, `${url}: ${trail}`).toBe(301);
    }
  });

  it('serves /instaboxd/privacy/ directly', async () => {
    const { hops, response } = await follow(`${BLOG_ORIGIN}/instaboxd/privacy/`);
    await response.body?.cancel();
    expect(hops).toEqual([]);
    expect(response.status).toBe(200);
  });

  it.each(APPS)('%s: an unknown path is a 404 with the 404 page', async (app) => {
    const response = await fetch(`${local.production[app]}/no-such-page/`, { redirect: 'manual' });
    expect(response.status).toBe(404);
    expect(await response.text()).toMatch(/<h1[^>]*>Page not found<\/h1>/);
  });

  it.each(APPS)('%s: hashed /_astro/ files are cached for a year', async (app) => {
    const file = readdirSync(join(dist('production', app), '_astro'))[0];
    expect(file).toBeDefined();
    const response = await fetch(`${local.production[app]}/_astro/${file}`);
    await response.body?.cancel();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it.each(APPS)('%s: / has the security headers and is indexable', async (app) => {
    const response = await fetch(`${local.production[app]}/`);
    await response.body?.cancel();
    expect(response.status).toBe(200);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(response.headers.get(name), name).toBe(value);
    expect(response.headers.get('x-robots-tag')).toBeNull();
    expect(response.headers.get('content-security-policy')).toBeNull();
  });
});

describe('Workers (preview build)', () => {
  it.each([
    ['blog', '/'],
    ['blog', POST],
    ['til', '/'],
  ] as [App, string][])('%s %s is noindex', async (app, path) => {
    const response = await fetch(`${local.preview[app]}${path}`);
    await response.body?.cancel();
    expect(response.status).toBe(200);
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(response.headers.get(name), name).toBe(value);
  });
});
