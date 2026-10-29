// Runs `scripts/new.ts` as `pnpm new` does, always with `--no-open`, against a temporary copy of
// the fixture content. The copy lives in the gitignored `scripts/.tmp/`.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { photosSchema, postSchema, tilSchema } from '@ac/content';
import { parse } from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { devCommand, editorCommand, isTerminalEditor } from '../new.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES = join(REPO, 'tests', 'fixtures', 'content');
const TMP = join(REPO, 'scripts', '.tmp');

let root: string;
let sources: string;

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  root = mkdtempSync(join(TMP, 'new-cli-'));
  cpSync(FIXTURES, root, { recursive: true });
  sources = mkdtempSync(join(TMP, 'new-cli-images-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(sources, { recursive: true, force: true });
});

function run(...args: string[]) {
  return runWith({}, ...args);
}

function runWith(env: Record<string, string>, ...args: string[]) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', 'scripts/new.ts', ...args, '--no-open'],
    { cwd: REPO, env: { ...process.env, CONTENT_ROOT: root, ...env }, encoding: 'utf8', stdio: 'pipe' },
  );
  return { code: result.status, out: result.stdout, err: result.stderr };
}

/** Every file under the content copy, for checking a failed run wrote nothing. */
function snapshot(dir = root): Record<string, string> {
  const files: Record<string, string> = {};
  for (const item of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (item.isFile()) {
      const path = join(item.parentPath, item.name);
      files[path] = readFileSync(path, 'base64');
    }
  }
  return files;
}

function frontMatter(file: string): Record<string, unknown> {
  const text = readFileSync(file, 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  expect(match).not.toBeNull();
  return parse(match![1]!) as Record<string, unknown>;
}

/** The single path printed after "Created". */
function created(out: string): string {
  const match = /^Created (.+)$/m.exec(out);
  expect(match, out).not.toBeNull();
  return match![1]!.trim();
}

const photos = photosSchema({ image: () => postSchema.shape.title });

describe('pnpm new', () => {
  it('creates a TIL with no prompts', () => {
    const { code, out, err } = run('--type', 'til', '--title', 'Zsh glob qualifiers', '--tags', 'tools');
    expect(err).toBe('');
    expect(code).toBe(0);
    const file = created(out);
    expect(file).toMatch(/til\/\d{4}-\d{2}-\d{2}-zsh-glob-qualifiers\.md$/);
    expect(file.startsWith(root)).toBe(true);
    const data = frontMatter(file);
    expect(data.draft).toBe(true);
    expect(data.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-0[78]:00$/);
    expect(tilSchema.parse(data)).toMatchObject({ title: 'Zsh glob qualifiers', tags: ['tools'] });
    expect(out).toMatch(/http:\/\/localhost:4322\/\d{4}-\d{2}-\d{2}-zsh-glob-qualifiers\//);
  });

  it('creates an advanced post as a folder with components and data', () => {
    const { code, out } = run('--type', 'post', '--advanced', '--title', 'Mapping streetcars', '--tags', 'tools');
    expect(code).toBe(0);
    const file = created(out);
    expect(file).toMatch(/posts\/\d{4}-\d{2}-\d{2}-mapping-streetcars\/index\.mdx$/);
    expect(existsSync(join(dirname(file), 'components'))).toBe(true);
    expect(existsSync(join(dirname(file), 'data'))).toBe(true);
    expect(postSchema.parse(frontMatter(file)).draft).toBe(true);
    expect(out).toMatch(/http:\/\/localhost:4321\/\d{4}\/\d{2}\/\d{2}\/mapping-streetcars\//);
  });

  it('creates a basic post as a single file', () => {
    const { code, out } = run('--type', 'post', '--title', 'Plain post', '--tags', 'tools,python');
    expect(code).toBe(0);
    const file = created(out);
    expect(file).toMatch(/posts\/\d{4}-\d{2}-\d{2}-plain-post\.md$/);
    expect(postSchema.parse(frontMatter(file)).tags).toEqual(['tools', 'python']);
  });

  it('creates photos, copying the images and listing them', () => {
    writeFileSync(join(sources, 'one.jpg'), 'one');
    writeFileSync(join(sources, 'two.JPG'), 'two');
    writeFileSync(join(sources, 'notes.txt'), 'not an image');
    const { code, out } = run('--type', 'photos', '--title', 'Desert', '--tags', 'travel', '--images', sources);
    expect(code).toBe(0);
    const file = created(out);
    expect(file).toBe(join(root, 'photos', 'desert', 'index.md'));
    expect(readFileSync(join(root, 'photos', 'desert', 'one.jpg'), 'utf8')).toBe('one');
    expect(readFileSync(join(root, 'photos', 'desert', 'two.JPG'), 'utf8')).toBe('two');
    expect(existsSync(join(root, 'photos', 'desert', 'notes.txt'))).toBe(false);
    const data = photos.parse(frontMatter(file));
    expect(data.draft).toBe(true);
    expect(data.images.map((image) => image.src)).toEqual(['./one.jpg', './two.JPG']);
    expect(out).toContain('http://localhost:4321/photos/desert/');
  });

  it('resolves a relative --images folder from where pnpm was run, not the repository root', () => {
    writeFileSync(join(sources, 'one.jpg'), 'one');
    // pnpm runs scripts from the repository root and records the caller's directory in INIT_CWD.
    const { code, out, err } = runWith(
      { npm_lifecycle_event: 'new', INIT_CWD: dirname(sources) },
      '--type', 'photos', '--title', 'Relative', '--tags', 'travel', '--images', basename(sources),
    );
    expect(err).toBe('');
    expect(code).toBe(0);
    expect(created(out)).toBe(join(root, 'photos', 'relative', 'index.md'));
    expect(readFileSync(join(root, 'photos', 'relative', 'one.jpg'), 'utf8')).toBe('one');
  });

  it('takes a tag no entry uses yet, writing it as typed and touching no tags.yml', () => {
    const tagsYml = readFileSync(join(root, 'tags.yml'), 'utf8');
    const { code, out } = run('--type', 'til', '--title', 'Anything', '--tags', 'tools,Machine Learning');
    expect(code).toBe(0);
    const data = frontMatter(created(out));
    expect(data.tags).toEqual(['tools', 'Machine Learning']);
    expect(tilSchema.parse(data).tags).toEqual(['tools', 'machine-learning']);
    expect(readFileSync(join(root, 'tags.yml'), 'utf8')).toBe(tagsYml);
  });

  it('refuses a tag without a letter or digit and writes nothing', () => {
    const before = snapshot();
    const { code, err } = run('--type', 'til', '--title', 'Anything', '--tags', 'tools,++');
    expect(code).not.toBe(0);
    expect(err).toContain('Tag "++"');
    expect(snapshot()).toEqual(before);
  });

  it('refuses an empty tag list and writes nothing', () => {
    const before = snapshot();
    const { code, err } = run('--type', 'til', '--title', 'Anything', '--tags', ' , ');
    expect(code).not.toBe(0);
    expect(err).toContain('at least one tag');
    expect(snapshot()).toEqual(before);
  });

  it('refuses an unknown type', () => {
    const { code, err } = run('--type', 'essay', '--title', 'Anything', '--tags', 'tools');
    expect(code).not.toBe(0);
    expect(err).toContain('Unknown type "essay"');
  });

  it('refuses photos from a folder with no images and writes nothing', () => {
    writeFileSync(join(sources, 'notes.txt'), 'not an image');
    const before = snapshot();
    const { code, err } = run('--type', 'photos', '--title', 'Empty', '--tags', 'travel', '--images', sources);
    expect(code).not.toBe(0);
    expect(err).toContain(`No image files in ${sources}`);
    expect(snapshot()).toEqual(before);
  });

  it('refuses a missing images folder', () => {
    const { code, err } = run('--type', 'photos', '--title', 'Gone', '--tags', 'travel', '--images', join(sources, 'missing'));
    expect(code).not.toBe(0);
    expect(err).toContain('is not a folder');
  });

  it('refuses to overwrite an existing entry, naming it', () => {
    const args = ['--type', 'til', '--title', 'Zsh glob qualifiers', '--tags', 'tools'];
    const first = run(...args);
    expect(first.code).toBe(0);
    const file = created(first.out);
    writeFileSync(file, 'edited');
    const second = run(...args);
    expect(second.code).not.toBe(0);
    expect(second.err).toContain(`${file} already exists`);
    expect(readFileSync(file, 'utf8')).toBe('edited');
  });

  it('names the missing values instead of prompting without a terminal', () => {
    const before = snapshot();
    const { code, err } = run('--type', 'til');
    expect(code).not.toBe(0);
    expect(err).toContain('--title');
    expect(err).toContain('--tags');
    expect(snapshot()).toEqual(before);
  });
});

describe('editorCommand', () => {
  it('uses $EDITOR, else $VISUAL, splitting arguments', () => {
    expect(editorCommand({ EDITOR: 'code -n', VISUAL: 'vim' }, '/c/a.md')).toEqual({
      command: 'code',
      args: ['-n', '/c/a.md'],
      terminal: false,
    });
    expect(editorCommand({ VISUAL: 'subl' }, '/c/a.md')).toEqual({
      command: 'subl',
      args: ['/c/a.md'],
      terminal: false,
    });
  });

  it('marks terminal editors, which are not spawned', () => {
    expect(editorCommand({ EDITOR: 'vim' }, '/c/a.md')?.terminal).toBe(true);
    expect(editorCommand({ EDITOR: 'emacs -nw' }, '/c/a.md')?.terminal).toBe(true);
    expect(editorCommand({ EDITOR: '/usr/local/bin/nvim' }, '/c/a.md')?.terminal).toBe(true);
    expect(editorCommand({ EDITOR: 'code -n' }, '/c/a.md')?.terminal).toBe(false);
  });

  it('is undefined when neither is set', () => {
    expect(editorCommand({ EDITOR: ' ' }, '/c/a.md')).toBeUndefined();
    expect(editorCommand({}, '/c/a.md')).toBeUndefined();
  });
});

describe('isTerminalEditor', () => {
  it.each(['vi', 'vim', 'nvim', 'nano', 'pico', 'micro', 'hx', 'helix', 'kak', 'joe', 'ne', 'ed'])(
    'treats %s as a terminal editor',
    (command) => {
      expect(isTerminalEditor(command, [])).toBe(true);
      expect(isTerminalEditor(`/opt/homebrew/bin/${command}`, ['+10'])).toBe(true);
    },
  );

  it('treats emacs and emacsclient as terminal editors only with -nw, -t or --tty', () => {
    for (const flag of ['-nw', '-t', '--tty']) {
      expect(isTerminalEditor('emacs', [flag])).toBe(true);
      expect(isTerminalEditor('/usr/bin/emacsclient', [flag])).toBe(true);
    }
    expect(isTerminalEditor('emacs', [])).toBe(false);
    expect(isTerminalEditor('emacsclient', ['-c'])).toBe(false);
  });

  it('treats GUI editors as GUI editors', () => {
    expect(isTerminalEditor('code', ['-n'])).toBe(false);
    expect(isTerminalEditor('subl', [])).toBe(false);
    expect(isTerminalEditor('/Applications/Zed.app/Contents/MacOS/zed', [])).toBe(false);
  });
});

describe('devCommand', () => {
  it('starts the blog on 4321 and the TIL site on 4322 with drafts shown', () => {
    expect(devCommand('blog')).toEqual({
      command: 'pnpm',
      args: ['--filter', 'blog', 'dev', '--port', '4321'],
      env: { PUBLIC_SHOW_DRAFTS: 'true' },
      port: 4321,
    });
    expect(devCommand('til')).toMatchObject({ args: ['--filter', 'til', 'dev', '--port', '4322'], port: 4322 });
  });
});
