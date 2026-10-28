import { execa } from 'execa';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const root = join(import.meta.dirname, '..');

/**
 * What a developer's shell might export: execa passes the parent's environment through, so the
 * real-content builds below must override both, or they would build the fixtures with drafts.
 */
const SHELL = { CONTENT_ROOT: 'tests/fixtures/content', PUBLIC_SHOW_DRAFTS: 'true' };

/** The real content (CONTENT_ROOT removed), drafts hidden; as blog-pages.test.ts pins its builds. */
const env = { CONTENT_ROOT: undefined, PUBLIC_SHOW_DRAFTS: 'false' };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('scaffold', () => {
  it('blog and til build with design tokens', async () => {
    for (const [name, value] of Object.entries(SHELL)) vi.stubEnv(name, value);
    await execa('pnpm', ['--filter', 'blog', 'build'], { cwd: root, env });
    await execa('pnpm', ['--filter', 'til', 'build'], { cwd: root, env });

    const dist = join(root, 'apps/blog/dist');
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    // The site stylesheet is inlined into each page; `_astro/` only holds stylesheets some pages link.
    const cssDir = join(dist, '_astro');
    const css = [
      ...readdirSync(cssDir)
        .filter((f) => f.endsWith('.css'))
        .map((f) => readFileSync(join(cssDir, f), 'utf8')),
      ...[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]),
    ].join('\n');
    expect(css).toContain('#0f1629');
    expect(css).toContain('--font-heading');
    expect(css).toContain('.font-heading');

    expect(html).toContain('<meta name="color-scheme" content="dark">');

    // Built from the real content, without drafts, whatever the shell exports.
    const til = readFileSync(join(root, 'apps/til/dist/index.html'), 'utf8');
    expect(html).toContain('Pay transparency');
    expect(til).toContain('Automatically Activating a Virtual Environment with direnv');
    for (const fixture of ['A basic post', 'A draft post', 'Reading a file in Elixir', 'A draft TIL']) {
      expect(html + til, fixture).not.toContain(fixture);
    }
  }, 120_000);

  // A build of other content (tests, `pnpm new` checks) must not leave its entries in the cache a
  // later real build reuses: stale entries make the glob loader report duplicates, or point at
  // images in a deleted copy and fail the build.
  it('a real build ignores the content cache of a build against another CONTENT_ROOT', async () => {
    const out = mkdtempSync(join(tmpdir(), 'ac-cache-'));
    try {
      await execa('pnpm', ['--filter', 'blog', 'exec', 'astro', 'build', '--outDir', join(out, 'fixtures')], {
        cwd: root,
        env: { CONTENT_ROOT: join(root, 'tests/fixtures/content'), PUBLIC_SHOW_DRAFTS: 'false' },
      });
      const real = await execa('pnpm', ['--filter', 'blog', 'exec', 'astro', 'build', '--outDir', join(out, 'real')], {
        cwd: root,
        env,
        all: true,
      });
      expect(real.all).not.toMatch(/multiple entries with the same slug/);
      expect(readFileSync(join(out, 'real', 'index.html'), 'utf8')).toContain('Pay transparency');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);
});
