import { describe, expect, it } from 'vitest';
import { buildHeaders } from '../src/headers';

const PRODUCTION = `/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: DENY
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
  it('production: caches hashed assets for a year, sets the security headers, never noindex', () => {
    const text = buildHeaders({ preview: false });
    expect(text).toBe(PRODUCTION);
    expect(text).not.toContain('X-Robots-Tag');
  });

  it('preview: every response is noindex', () => {
    const rules = parse(buildHeaders({ preview: true }));
    expect(rules.get('/*')).toContainEqual(['X-Robots-Tag', 'noindex']);
  });

  it.each([false, true])('parses as Cloudflare _headers (preview: %s)', (preview) => {
    const rules = parse(buildHeaders({ preview }));
    expect([...rules.keys()]).toEqual(['/_astro/*', '/*']);
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
