import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildHeaders } from '../src/headers';
import { isNoindexBuild } from '../src/listing';

const PRODUCTION = `/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: DENY

/404
  X-Robots-Tag: noindex
`;

/** Cloudflare's `_headers` format: an unindented path line, then that path's headers indented two spaces. */
function parse(text: string): Map<string, [string, string][]> {
  const rules = new Map<string, [string, string][]>();
  let current: [string, string][] | undefined;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!line.startsWith(' ')) {
      expect(line, 'a path line').toMatch(/^\/\S*$/);
      current = [];
      rules.set(line, current);
      continue;
    }
    expect(line, 'a header line').toMatch(/^ {2}[A-Za-z-]+: \S.*$/);
    expect(current, `${line} sits under a path`).toBeDefined();
    const [name, value] = line.trim().split(/: (.*)/);
    current!.push([name!, value!]);
  }
  return rules;
}

describe('buildHeaders', () => {
  it('production: caches hashed assets for a year, sets the security headers, noindex only on /404', () => {
    const text = buildHeaders({ preview: false });
    expect(text).toBe(PRODUCTION);
    const rules = parse(text);
    expect(rules.get('/*')!.map(([name]) => name)).not.toContain('X-Robots-Tag');
    expect(rules.get('/404')).toEqual([['X-Robots-Tag', 'noindex']]);
  });

  it('preview: every response is noindex', () => {
    const rules = parse(buildHeaders({ preview: true }));
    expect(rules.get('/*')).toContainEqual(['X-Robots-Tag', 'noindex']);
  });

  it.each([false, true])('parses as Cloudflare _headers (preview: %s)', (preview) => {
    const rules = parse(buildHeaders({ preview }));
    expect([...rules.keys()]).toEqual(preview ? ['/_astro/*', '/*'] : ['/_astro/*', '/*', '/404']);
    expect(rules.get('/_astro/*')).toEqual([['Cache-Control', 'public, max-age=31536000, immutable']]);
    expect(rules.get('/*')).toEqual(
      expect.arrayContaining([
        ['X-Content-Type-Options', 'nosniff'],
        ['Referrer-Policy', 'strict-origin-when-cross-origin'],
        ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
        ['X-Frame-Options', 'DENY'],
      ]),
    );
    expect(buildHeaders({ preview })).not.toContain('Content-Security-Policy');
  });
});

describe('isNoindexBuild', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    [undefined, undefined, false],
    ['false', 'false', false],
    ['true', undefined, true],
    [undefined, 'true', true],
    ['true', 'true', true],
  ])('PREVIEW=%s PUBLIC_SHOW_DRAFTS=%s: %s', (preview, drafts, expected) => {
    vi.stubEnv('PREVIEW', preview);
    vi.stubEnv('PUBLIC_SHOW_DRAFTS', drafts);
    expect(isNoindexBuild()).toBe(expected);
  });

  it('a drafts build without PREVIEW still sends X-Robots-Tag: noindex', () => {
    vi.stubEnv('PREVIEW', undefined);
    vi.stubEnv('PUBLIC_SHOW_DRAFTS', 'true');
    expect(buildHeaders({ preview: isNoindexBuild() })).toContain('X-Robots-Tag: noindex');
  });

  it('a production build (neither flag) never sends it for pages, only for the 404 page', () => {
    vi.stubEnv('PREVIEW', undefined);
    vi.stubEnv('PUBLIC_SHOW_DRAFTS', undefined);
    const rules = parse(buildHeaders({ preview: isNoindexBuild() }));
    expect(rules.get('/*')!.map(([name]) => name)).not.toContain('X-Robots-Tag');
    expect([...rules.keys()].filter((path) => rules.get(path)!.some(([name]) => name === 'X-Robots-Tag'))).toEqual([
      '/404',
    ]);
  });

  it.each(['blog', 'til'])("%s's _headers endpoint uses it", (app) => {
    const source = readFileSync(join(import.meta.dirname, '../../../apps', app, 'src/pages/[headers].ts'), 'utf8');
    expect(source).toContain('buildHeaders({ preview: isNoindexBuild() })');
  });
});
