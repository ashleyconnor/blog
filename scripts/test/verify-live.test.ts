import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DIRECT_URLS } from '../lib/legacy-urls.ts';
import { type Fetcher, verifyUrls } from '../lib/verify-live.ts';

const PROD_BLOG = 'https://www.ashleyconnor.co.uk';
const PROD_TIL = 'https://til.ashleyconnor.co.uk';
const origins = { blog: 'https://blog.example.workers.dev', til: 'https://til.example.workers.dev' };

type Response = { status: number; location?: string };

/** A fetcher that answers from `routes` (keyed by absolute URL) and 404s anything else. */
function fake(routes: Record<string, Response | Error>): Fetcher & { requested: string[] } {
  const requested: string[] = [];
  const fetcher = async (url: string) => {
    requested.push(url);
    const route = routes[url];
    if (route instanceof Error) throw route;
    return { status: route?.status ?? 404, location: route?.location ?? null };
  };
  return Object.assign(fetcher, { requested });
}

describe('verifyUrls', () => {
  it('passes a 301 → 200 chain, requesting the given origin instead of production', async () => {
    const fetcher = fake({
      [`${origins.blog}/old.html`]: { status: 301, location: '/old/' },
      [`${origins.blog}/old/`]: { status: 200 },
    });
    expect(await verifyUrls([`${PROD_BLOG}/old.html`], origins, fetcher)).toEqual([]);
    expect(fetcher.requested).toEqual([`${origins.blog}/old.html`, `${origins.blog}/old/`]);
  });

  it('passes a URL served directly with a 200', async () => {
    const fetcher = fake({ [`${origins.blog}/`]: { status: 200 } });
    expect(await verifyUrls([`${PROD_BLOG}/`], origins, fetcher)).toEqual([]);
  });

  it('fails a 302 hop, naming the hop', async () => {
    const fetcher = fake({
      [`${origins.blog}/a`]: { status: 302, location: '/b/' },
      [`${origins.blog}/b/`]: { status: 200 },
    });
    const failures = await verifyUrls([`${PROD_BLOG}/a`], origins, fetcher);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.url).toBe(`${PROD_BLOG}/a`);
    expect(failures[0]!.reason).toContain('302');
    expect(failures[0]!.reason).toContain(`${origins.blog}/a`);
  });

  it('fails a 307 hop: legacy URLs must redirect permanently', async () => {
    const fetcher = fake({
      [`${origins.blog}/a`]: { status: 307, location: '/a/' },
      [`${origins.blog}/a/`]: { status: 200 },
    });
    const [failure] = await verifyUrls([`${PROD_BLOG}/a`], origins, fetcher);
    expect(failure!.reason).toContain('307');
  });

  it('fails a chain that ends on a 404', async () => {
    const fetcher = fake({ [`${origins.blog}/a`]: { status: 301, location: '/gone/' } });
    const [failure] = await verifyUrls([`${PROD_BLOG}/a`], origins, fetcher);
    expect(failure).toEqual({
      url: `${PROD_BLOG}/a`,
      chain: [`${origins.blog}/a`, `${origins.blog}/gone/`],
      reason: expect.stringContaining('404'),
    });
  });

  it('fails a redirect without a Location header', async () => {
    const fetcher = fake({ [`${origins.blog}/a`]: { status: 301 } });
    const [failure] = await verifyUrls([`${PROD_BLOG}/a`], origins, fetcher);
    expect(failure!.reason).toMatch(/location/i);
  });

  it('fails a loop longer than 5 hops', async () => {
    const fetcher = fake({
      [`${origins.blog}/x`]: { status: 301, location: '/y' },
      [`${origins.blog}/y`]: { status: 301, location: '/x' },
    });
    const [failure] = await verifyUrls([`${PROD_BLOG}/x`], origins, fetcher);
    expect(failure!.reason).toMatch(/more than 5/);
    expect(fetcher.requested.length).toBeLessThanOrEqual(6);
  });

  it('follows a TIL redirect to the production TIL origin on the overridden TIL origin', async () => {
    const fetcher = fake({
      [`${origins.blog}/til/x`]: { status: 301, location: `${PROD_TIL}/x/` },
      [`${origins.til}/x/`]: { status: 200 },
    });
    expect(await verifyUrls([`${PROD_BLOG}/til/x`], origins, fetcher)).toEqual([]);
    expect(fetcher.requested).toEqual([`${origins.blog}/til/x`, `${origins.til}/x/`]);
  });

  it('fails a /til URL that ends on the blog origin', async () => {
    const fetcher = fake({ [`${origins.blog}/til/x`]: { status: 200 } });
    const [failure] = await verifyUrls([`${PROD_BLOG}/til/x`], origins, fetcher);
    expect(failure!.reason).toContain(origins.til);
  });

  it('fails a blog URL that ends on the TIL origin', async () => {
    const fetcher = fake({
      [`${origins.blog}/a`]: { status: 301, location: `${PROD_TIL}/a/` },
      [`${origins.til}/a/`]: { status: 200 },
    });
    const [failure] = await verifyUrls([`${PROD_BLOG}/a`], origins, fetcher);
    expect(failure!.reason).toContain(origins.blog);
  });

  it('maps the production blog origin in a Location header', async () => {
    const fetcher = fake({
      [`${origins.blog}/a`]: { status: 301, location: `${PROD_BLOG}/b/` },
      [`${origins.blog}/b/`]: { status: 200 },
    });
    expect(await verifyUrls([`${PROD_BLOG}/a`], origins, fetcher)).toEqual([]);
  });

  it('fails a direct-only URL that redirects, even with a 301 to a 200', async () => {
    const fetcher = fake({
      [`${origins.blog}/instaboxd/privacy/`]: { status: 301, location: '/elsewhere/' },
      [`${origins.blog}/elsewhere/`]: { status: 200 },
    });
    const [failure] = await verifyUrls([`${PROD_BLOG}/instaboxd/privacy/`], origins, fetcher);
    expect(failure!.reason).toMatch(/directly/);
  });

  it('passes a direct-only URL served with a 200 and no redirect', async () => {
    const fetcher = fake({ [`${origins.blog}/instaboxd/privacy/`]: { status: 200 } });
    expect(await verifyUrls([`${PROD_BLOG}/instaboxd/privacy/`], origins, fetcher)).toEqual([]);
  });

  it('lists /instaboxd/privacy/ as a direct-only URL', () => {
    expect(DIRECT_URLS.has(`${PROD_BLOG}/instaboxd/privacy/`)).toBe(true);
  });

  it('fails a hop to a third-party host, even when it bounces back', async () => {
    const fetcher = fake({
      [`${origins.blog}/a`]: { status: 301, location: 'https://elsewhere.example/a' },
      ['https://elsewhere.example/a']: { status: 301, location: `${PROD_BLOG}/a/` },
      [`${origins.blog}/a/`]: { status: 200 },
    });
    const [failure] = await verifyUrls([`${PROD_BLOG}/a`], origins, fetcher);
    expect(failure!.reason).toContain('https://elsewhere.example');
    expect(fetcher.requested).not.toContain('https://elsewhere.example/a');
  });

  it('rejects an empty URL list', async () => {
    await expect(verifyUrls([], origins, fake({}))).rejects.toThrow('no URLs to check');
  });

  it('reports a request error as a failure instead of throwing', async () => {
    const fetcher = fake({ [`${origins.blog}/a`]: new Error('timed out') });
    const [failure] = await verifyUrls([`${PROD_BLOG}/a`], origins, fetcher);
    expect(failure!.reason).toContain('timed out');
  });

  it('reports failures in input order and never runs more than 8 requests at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetcher: Fetcher = async (url) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return { status: url.endsWith('ok') ? 200 : 404, location: null };
    };
    const urls = Array.from({ length: 30 }, (_, i) => `${PROD_BLOG}/${i}/${i % 2 ? 'ok' : 'bad'}`);
    const failures = await verifyUrls(urls, origins, fetcher);
    expect(failures.map((failure) => failure.url)).toEqual(urls.filter((url) => url.endsWith('bad')));
    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBeGreaterThan(1);
  });
});

describe('pnpm verify:live', () => {
  const cli = join(import.meta.dirname, '../verify-live.ts');
  const servers: Server[] = [];

  /** A local server answering with `handler`; resolves to its origin. */
  async function serve(handler: (path: string) => Response): Promise<string> {
    const server = createServer((request, response) => {
      const { status, location } = handler(request.url ?? '/');
      response.writeHead(status, location ? { location } : {}).end();
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  afterAll(() => {
    for (const server of servers) server.close();
  });

  const run = (args: string[]) =>
    new Promise<{ code: number | null; stdout: string }>((resolve) => {
      execFile(process.execPath, ['--experimental-strip-types', cli, ...args], (error, stdout) =>
        resolve({ code: error ? (error.code as number) : 0, stdout }),
      );
    });

  /** The blog sends `/til…` to the production TIL origin, as the real `_redirects` does. */
  const blog = (broken?: string) => (path: string) =>
    path === broken ? { status: 404 } : path.startsWith('/til') ? { status: 301, location: `${PROD_TIL}/` } : { status: 200 };

  it('exits 0 when every legacy URL resolves on the given origins', async () => {
    const { code, stdout } = await run(['--blog', await serve(blog()), '--til', await serve(() => ({ status: 200 }))]);
    expect(stdout).not.toContain('FAIL');
    expect(code).toBe(0);
  }, 60_000);

  it('prints one line per failure and exits 1', async () => {
    const blogOrigin = await serve(blog('/sitemap.xml'));
    const { code, stdout } = await run(['--blog', blogOrigin, '--til', await serve(() => ({ status: 200 }))]);
    expect(code).toBe(1);
    const lines = stdout.split('\n').filter((line) => line.startsWith('FAIL'));
    expect(lines).toEqual([expect.stringContaining(`${PROD_BLOG}/sitemap.xml`)]);
    expect(lines[0]).toContain('404');
  }, 60_000);
});
