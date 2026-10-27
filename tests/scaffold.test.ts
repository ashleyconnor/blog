import { execa } from 'execa';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

describe('scaffold', () => {
  it('blog and til build with design tokens', async () => {
    await execa('pnpm', ['--filter', 'blog', 'build'], { cwd: root });
    await execa('pnpm', ['--filter', 'til', 'build'], { cwd: root });

    const dist = join(root, 'apps/blog/dist');
    const cssDir = join(dist, '_astro');
    const css = readdirSync(cssDir)
      .filter((f) => f.endsWith('.css'))
      .map((f) => readFileSync(join(cssDir, f), 'utf8'))
      .join('\n');
    expect(css).toContain('#0f1629');
    expect(css).toContain('--font-heading');

    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    expect(html).toContain('<meta name="color-scheme" content="dark">');
  }, 120_000);
});
