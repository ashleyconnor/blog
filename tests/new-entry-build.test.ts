// Schema parity for `pnpm new`: entries it creates build as drafts. Lives with the other build
// tests so it never builds the blog at the same time as them. The content copy sits in the
// gitignored `tests/.tmp/` because MDX `@ac/ui/...` imports only resolve inside the workspace.
import { execa } from 'execa';
import { cpSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { postPath } from '../packages/content/src/post';

const root = join(import.meta.dirname, '..');
const fixtures = join(root, 'tests/fixtures/content');

let tmp: string;
let content: string;
let dist: string;
const created: Record<string, string> = {};

async function create(name: string, ...args: string[]) {
  const { stdout } = await execa(
    'node',
    ['--experimental-strip-types', 'scripts/new.ts', ...args, '--no-open'],
    { cwd: root, env: { CONTENT_ROOT: content } },
  );
  created[name] = /^Created (.+)$/m.exec(stdout)![1]!;
}

const page = (path: string) => readFileSync(join(dist, path, 'index.html'), 'utf8');

/** The URL of a post from its file: the id is the file (or folder) name. */
const postUrl = (file: string) => {
  const id = /posts\/([^/]+?)(?:\.md|\/index\.mdx)$/.exec(file)![1]!;
  const date = /^date: "(.+)"$/m.exec(readFileSync(file, 'utf8'))![1]!;
  return postPath({ id, data: { date: new Date(date) } });
};

beforeAll(async () => {
  mkdirSync(join(root, 'tests/.tmp'), { recursive: true });
  tmp = mkdtempSync(join(root, 'tests/.tmp/new-entry-'));
  content = join(tmp, 'content');
  dist = join(tmp, 'dist');
  cpSync(fixtures, content, { recursive: true });
  const images = join(tmp, 'images');
  mkdirSync(images);
  for (const name of ['a.jpg', 'b.jpg']) {
    copyFileSync(join(fixtures, 'photos/anza-borrego', name), join(images, name));
  }

  await create('post', '--type', 'post', '--title', 'A new basic draft', '--tags', 'tools');
  await create('advanced', '--type', 'post', '--advanced', '--title', 'A new advanced draft', '--tags', 'python');
  await create('photos', '--type', 'photos', '--title', 'A new gallery', '--tags', 'travel', '--images', images);

  await execa('pnpm', ['--filter', 'blog', 'exec', 'astro', 'build', '--force', '--outDir', dist], {
    cwd: root,
    env: { CONTENT_ROOT: content, PUBLIC_SHOW_DRAFTS: 'true' },
  });
}, 300_000);

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe('entries from pnpm new', () => {
  it.each([
    ['post', 'A new basic draft'],
    ['advanced', 'A new advanced draft'],
  ])('builds the %s post as a draft with the banner', (name, title) => {
    const html = page(postUrl(created[name]!));
    expect(html).toContain(title);
    expect(html).toMatch(/data-draft-banner[^>]*>[\s\S]*?Draft/);
  });

  it('builds the gallery as a draft with the banner and both images', () => {
    const html = page('photos/a-new-gallery');
    expect(html).toContain('A new gallery');
    expect(html).toMatch(/data-draft-banner[^>]*>[\s\S]*?Draft/);
    expect(html).toContain('TODO: describe a.jpg');
    expect(html).toContain('TODO: describe b.jpg');
  });
});
