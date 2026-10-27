import { execa } from 'execa';
import { readdirSync, readFileSync } from 'node:fs';
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
});
