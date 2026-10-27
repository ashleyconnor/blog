import { spawnSync } from 'node:child_process';
import { cpSync, globSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkEntry } from '../lib/review-checks.ts';

const fixtures = join(import.meta.dirname, '../../tests/fixtures/content');
const cli = join(import.meta.dirname, '../review-checks.ts');
// Inside the repository (gitignored) rather than the OS temp dir, so `contentRoot()` and the
// workspace packages resolve exactly as they do for real content.
const tmpBase = join(import.meta.dirname, '../.tmp');

let root: string;

beforeAll(() => {
  mkdirSync(tmpBase, { recursive: true });
  root = mkdtempSync(join(tmpBase, 'review-'));
  cpSync(fixtures, root, { recursive: true });
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
beforeEach(() => vi.stubEnv('CONTENT_ROOT', root));
afterEach(() => vi.unstubAllEnvs());

/** Writes `text` to `rel` under the temporary content root and returns its absolute path. */
function write(rel: string, text: string): string {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
}

// Three front-matter lines, so the file's lines are: 1 `---`, 2-4 front matter, 5 `---`, 6 blank,
// and the body starts on line 7.
const FRONT = 'title: A draft\ndate: "2026-10-27T09:00:00-07:00"\ntags: [python]';
const entry = (body: string, front = FRONT) => `---\n${front}\n---\n\n${body}\n`;

let n = 0;
/** A fresh post file (top-level `.md`, or a folder `index.mdx`) holding `body`. */
function post(body: string, { mdx = false, front = FRONT } = {}): string {
  n += 1;
  return write(mdx ? `posts/draft-${n}/index.mdx` : `posts/draft-${n}.md`, entry(body, front));
}

describe('checkEntry: clean entries', () => {
  it('passes the basic fixture post', () => {
    expect(checkEntry(join(root, 'posts/basic-post.md'))).toEqual([]);
  });

  it('passes the advanced MDX fixture (imports, <Figure alt=…>, <Callout>)', () => {
    expect(checkEntry(join(root, 'posts/advanced-post/index.mdx'))).toEqual([]);
  });

  it('passes a fixture TIL and a fixture photos entry', () => {
    expect(checkEntry(join(root, 'til/2025-04-03-til-zsh-glob-qualifiers.md'))).toEqual([]);
    expect(checkEntry(join(root, 'photos/anza-borrego/index.md'))).toEqual([]);
  });
});

describe('checkEntry: front-matter', () => {
  it('reports each schema issue on the line of its key', () => {
    const file = post('Body.', { front: 'title: A draft\ndate: "2026-10-27T09:00:00-07:00"\ntags: [nope]' });
    expect(checkEntry(file)).toEqual([
      { rule: 'front-matter', line: 4, message: expect.stringContaining('Unknown tag "nope"') },
    ]);
  });

  it('reports an unknown key on its own line', () => {
    const file = post('Body.', { front: `${FRONT}\nunlised: true` });
    expect(checkEntry(file)).toEqual([
      { rule: 'front-matter', line: 5, message: expect.stringContaining('unlised') },
    ]);
  });

  it('reports a missing key on line 1', () => {
    const file = post('Body.', { front: 'date: "2026-10-27T09:00:00-07:00"\ntags: [python]' });
    expect(checkEntry(file)).toEqual([{ rule: 'front-matter', line: 1, message: expect.stringContaining('title') }]);
  });

  it('validates photos entries against the photos schema', () => {
    const file = write('photos/draft-trip/index.md', entry('Body.'));
    expect(checkEntry(file)).toEqual([
      { rule: 'front-matter', line: 1, message: expect.stringContaining('images') },
    ]);
  });

  it('reports a file outside the content collections as not a content entry', () => {
    const notes = write('posts/advanced-post/notes.md', entry('TODO everything'));
    const loose = write('drafts/idea.md', entry('Body.'));
    const tilMdx = write('til/2026-10-27-an-mdx-til.mdx', entry('Body.'));
    for (const file of [notes, loose, tilMdx]) {
      expect(checkEntry(file)).toEqual([{ rule: 'front-matter', line: 1, message: 'not a content entry' }]);
    }
  });
});

describe('checkEntry: heading-order', () => {
  it('reports an h1', () => {
    expect(checkEntry(post('# A title'))).toEqual([
      { rule: 'heading-order', line: 7, message: expect.stringContaining('h1') },
    ]);
  });

  it('reports a skipped level going down, not going back up', () => {
    const file = post('## One\n\n#### Too deep\n\n## Two\n\n### Fine');
    expect(checkEntry(file)).toEqual([
      { rule: 'heading-order', line: 9, message: expect.stringContaining('h2 to h4') },
    ]);
  });

  it('ignores # lines inside ``` and ~~~ fenced code', () => {
    const file = post('```sh\n# a comment\n```\n\n~~~py\n# another\n#### deep\n~~~\n\n## Real heading');
    expect(checkEntry(file)).toEqual([]);
  });
});

describe('checkEntry: image-alt', () => {
  it('reports a Markdown image with empty alt', () => {
    const file = post('Text.\n\n![](./diagram.png)', { mdx: true });
    writeFileSync(join(dirname(file), 'diagram.png'), '');
    expect(checkEntry(file)).toEqual([{ rule: 'image-alt', line: 9, message: expect.any(String) }]);
  });

  it('reports <Figure> and <img> with missing or empty alt, including multi-line tags', () => {
    const body = [
      "import diagram from '../advanced-post/diagram.png';", // 7
      '',
      '<Figure src={diagram} alt="" />', // 9
      '',
      '<Figure', // 11
      '  src={diagram}',
      '  caption="No alt at all"',
      '/>',
      '',
      '<img src="../advanced-post/diagram.png" alt="Fine" />',
      '',
      '<img src="../advanced-post/diagram.png">', // 18
    ].join('\n');
    expect(checkEntry(post(body, { mdx: true }))).toEqual([
      { rule: 'image-alt', line: 9, message: expect.stringContaining('empty alt') },
      { rule: 'image-alt', line: 11, message: expect.stringContaining('no alt') },
      { rule: 'image-alt', line: 18, message: expect.stringContaining('no alt') },
    ]);
  });

  it('reports photos alt text starting with TODO', () => {
    const front = [
      'title: A trip',
      'date: "2026-10-27T09:00:00-07:00"',
      'tags: [travel]',
      'images:',
      '  - src: ./a.jpg',
      '    alt: A real description',
      '  - src: ./b.jpg',
      '    alt: "TODO: describe this"', // line 9
    ].join('\n');
    const file = write('photos/todo-trip/index.md', entry('Body.', front));
    expect(checkEntry(file)).toEqual([{ rule: 'image-alt', line: 9, message: expect.stringContaining('TODO') }]);
  });
});

describe('checkEntry: todo', () => {
  it('reports TODO, FIXME and XXX in prose', () => {
    const file = post('TODO: write the intro.\n\nSome text. FIXME later.\n\nXXX');
    expect(checkEntry(file).map(({ rule, line }) => ({ rule, line }))).toEqual([
      { rule: 'todo', line: 7 },
      { rule: 'todo', line: 9 },
      { rule: 'todo', line: 11 },
    ]);
  });

  it('ignores markers in front matter, fenced code and MDX import/export lines', () => {
    const body = "export const note = 'TODO';\n\n```js\n// TODO: not prose\n```\n\nDone.";
    const file = post(body, { mdx: true, front: `${FRONT}\nexcerpt: TODO later` });
    expect(checkEntry(file)).toEqual([]);
  });
});

describe('checkEntry: link', () => {
  it('accepts links to built blog routes, redirect sources, files on disk and external URLs', () => {
    const body = [
      '[a](/) [b](/posts/) [c](/photos/) [d](/photos/anza-borrego/) [e](/resume/) [f](/instaboxd/privacy/)',
      '[g](/page/2/) [h](/feed.xml) [i](/posts/feed.xml) [j](/photos/feed.xml) [k](/resume.pdf)',
      '[l](/tags/python/) [m](/2025/04/23/basic-post/#why-it-matters) [n](/2014/09/07/unlisted-post/)',
      '[o](/2025/04/24/basic-post.html) [p](/til/anything) [q](/sitemap.xml)',
      '[r](https://example.com/missing) [s](#a-heading) [t](mailto:me@example.com)',
      '![Diagram](../advanced-post/diagram.png "A title")',
    ].join('\n');
    // A folder post (posts/draft-N/index.mdx), so `..` is posts/.
    const file = post(body, { mdx: true });
    expect(checkEntry(file)).toEqual([]);
  });

  it('reports unknown site-relative routes and missing relative files', () => {
    const body = [
      'See [this](/tags/nope/) and [that](/2025/04/23/no-such-post/).', // 7
      '',
      '![A picture](./missing.png)', // 9
      '',
      '<a href="/nowhere/">there</a>', // 11
    ].join('\n');
    const findings = checkEntry(post(body));
    expect(findings.map(({ rule, line }) => ({ rule, line }))).toEqual([
      { rule: 'link', line: 7 },
      { rule: 'link', line: 7 },
      { rule: 'link', line: 9 },
      { rule: 'link', line: 11 },
    ]);
    expect(findings[0]!.message).toContain('/tags/nope/');
    expect(findings[2]!.message).toContain('./missing.png');
  });

  it('accepts every non-dynamic page the blog app builds', () => {
    const pages = join(import.meta.dirname, '../../apps/blog/src/pages');
    const routes = globSync(['**/index.astro', '**/*.xml.ts'], { cwd: pages })
      .filter((file) => !file.includes('['))
      .map((file) => `/${file.replace(/(?:^|\/)index\.astro$/, '/').replace(/\.ts$/, '')}`.replace(/\/+/g, '/'));
    expect(routes).toContain('/tags/');
    expect(routes).toContain('/posts/feed.xml');
    const file = post(routes.map((route, i) => `[page ${i}](${route})`).join('\n'));
    expect(checkEntry(file)).toEqual([]);
  });

  it('does not read GFM footnote definitions as reference links', () => {
    const file = post('A claim.[^1]\n\n[^1]: The source, from a book.\n\n[ref]: ./missing.png');
    expect(checkEntry(file)).toEqual([{ rule: 'link', line: 11, message: expect.stringContaining('./missing.png') }]);
  });

  it('checks site-relative links in TILs against blog routes', () => {
    const file = write('til/2026-10-27-a-til.md', entry('[Python](/tags/python/) and [nope](/tags/nope/)'));
    expect(checkEntry(file)).toEqual([{ rule: 'link', line: 7, message: expect.stringContaining('/tags/nope/') }]);
  });
});

describe('checkEntry: input', () => {
  it('throws on a file that cannot be read', () => {
    expect(() => checkEntry(join(root, 'posts/does-not-exist.md'))).toThrow();
  });
});

describe('review-checks CLI', () => {
  const run = (...files: string[]) =>
    spawnSync(process.execPath, ['--experimental-strip-types', cli, ...files], {
      encoding: 'utf8',
      env: { ...process.env, CONTENT_ROOT: root },
    });

  it('exits 0 and prints nothing for a clean entry', () => {
    const result = run(join(root, 'posts/basic-post.md'));
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('');
    expect(result.status).toBe(0);
  });

  it('exits 1 and prints file:line [rule] message for each finding', () => {
    const file = post('TODO: intro\n\n# Big');
    const result = run(file);
    expect(result.stdout.trim().split('\n')).toEqual([
      expect.stringMatching(new RegExp(`^${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:7 \\[todo\\] `)),
      expect.stringMatching(/:9 \[heading-order\] /),
    ]);
    expect(result.status).toBe(1);
  });

  it('exits 2 on unreadable input', () => {
    const result = run(join(root, 'posts/does-not-exist.md'));
    expect(result.stderr).toContain('does-not-exist.md');
    expect(result.status).toBe(2);
  });

  it('exits 2 without a file argument', () => {
    expect(run().status).toBe(2);
  });
});
