// Starts a new draft post, TIL or photo gallery.
//
//   pnpm new [--type post|til|photos] [--title "…"] [--tags a,b] [--advanced] [--images <dir>] [--no-open]
//
// Prompts for whatever the flags leave out; with every value given it asks nothing. Nothing is
// written until the last prompt is answered, so Ctrl-C at any prompt leaves the content untouched.
// "Advanced post?" is asked only for posts, without --advanced, in a run that is already prompting
// for something else: `--type post --title … --tags …` makes a basic post with no questions.
// Afterwards, unless --no-open, it opens the new file in $EDITOR (GUI editors only; a terminal
// editor would fight the dev server for the terminal) and runs the site's dev server with drafts
// shown.
import './lib/ts-resolve-hook.ts';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as prompts from '@clack/prompts';
import type { EntryType } from './lib/new-entry.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = join(REPO, 'templates');
const ADD_TAG = Symbol('add a new tag');
const TYPE_LABELS: Record<EntryType, string> = { post: 'Blog post', til: 'TIL', photos: 'Photos' };
// The formats Astro's image pipeline accepts for gallery images.
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.tiff']);
const PORTS = { blog: 4321, til: 4322 } as const;

const TERMINAL_EDITORS = new Set([
  'vi', 'vim', 'nvim', 'nano', 'pico', 'micro', 'hx', 'helix', 'kak', 'joe', 'ne', 'ed',
]);
const EMACS_TTY_FLAGS = new Set(['-nw', '-t', '--tty']);

interface Command {
  command: string;
  args: string[];
}

/** Whether an editor runs in the terminal (and so can't share it with the dev server). */
export function isTerminalEditor(command: string, args: string[]): boolean {
  const name = basename(command);
  if (TERMINAL_EDITORS.has(name)) return true;
  return (name === 'emacs' || name === 'emacsclient') && args.some((arg) => EMACS_TTY_FLAGS.has(arg));
}

/** The editor to open `file` in (either variable may carry arguments). */
export function editorCommand(
  env: NodeJS.ProcessEnv,
  file: string,
): (Command & { terminal: boolean }) | undefined {
  // $EDITOR before $VISUAL is deliberate: the authoring brief asks for it.
  const [command, ...args] = (env.EDITOR?.trim() || env.VISUAL?.trim() || '').split(/\s+/);
  if (!command) return undefined;
  return { command, args: [...args, file], terminal: isTerminalEditor(command, args) };
}

/** The dev server for an app, with drafts shown. */
export function devCommand(app: 'blog' | 'til'): Command & { env: Record<string, string>; port: number } {
  const port = PORTS[app];
  return {
    command: 'pnpm',
    args: ['--filter', app, 'dev', '--port', String(port)],
    env: { PUBLIC_SHOW_DRAFTS: 'true' },
    port,
  };
}

/** The image files directly inside `dir`, sorted. Throws if `dir` is not a folder. */
function imageFiles(dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`${dir} is not a folder`);
  return readdirSync(dir, { withFileTypes: true })
    .filter((item) => item.isFile() && IMAGE_EXTENSIONS.has(extname(item.name).toLowerCase()))
    .map((item) => join(dir, item.name))
    .sort();
}

/** The images to copy from `dir`, refusing a folder without any. */
function photoSources(dir: string): string[] {
  const images = imageFiles(resolve(dir));
  if (images.length === 0) {
    throw new Error(`No image files in ${resolve(dir)} (looked for ${[...IMAGE_EXTENSIONS].join(', ')})`);
  }
  return images;
}

/** A prompt's answer, or exit 130 on Ctrl-C/Escape. Nothing has been written at that point. */
async function ask<T>(prompt: Promise<T | symbol>): Promise<T> {
  const value = await prompt;
  if (prompts.isCancel(value)) {
    prompts.cancel('Cancelled; nothing was written.');
    process.exit(130);
  }
  return value as T;
}

/** Turns a thrown error into a validation message for a text prompt. */
function check(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
}

async function main(argv: string[]): Promise<void> {
  // Loaded after the resolve hook is registered (see ts-resolve-hook.ts).
  const lib = await import('./lib/new-entry.ts');
  const { contentRoot, loadTags } = await import('@ac/content');

  const { values } = parseArgs({
    args: argv,
    options: {
      type: { type: 'string' },
      title: { type: 'string' },
      tags: { type: 'string' },
      advanced: { type: 'boolean', default: false },
      images: { type: 'string' },
      'no-open': { type: 'boolean', default: false },
    },
  });

  const root = contentRoot();
  const tagsFile = join(root, 'tags.yml');
  const known = loadTags(tagsFile);
  const templates = lib.listTemplates(TEMPLATES);
  const types = [...new Set(templates.map((template) => template.type))];

  // Check every flag before prompting for anything.
  if (values.type !== undefined && !types.includes(values.type as EntryType)) {
    throw new Error(`Unknown type "${values.type}"; expected one of ${types.join(', ')}`);
  }
  if (values.title !== undefined) lib.slugify(values.title);
  let tags: string[] | undefined;
  if (values.tags !== undefined) {
    tags = values.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    if (tags.length === 0) throw new Error('Give at least one tag');
    const unknown = tags.find((tag) => !known.has(tag));
    if (unknown) {
      throw new Error(`Unknown tag "${unknown}"; known tags: ${[...known.keys()].join(', ')}`);
    }
  }
  let images = values.images === undefined ? undefined : photoSources(values.images);

  const missing = [
    values.type === undefined && '--type',
    values.title === undefined && '--title',
    tags === undefined && '--tags',
    values.type === 'photos' && images === undefined && '--images',
  ].filter(Boolean);
  if (missing.length > 0 && !process.stdin.isTTY) {
    throw new Error(`Missing ${missing.join(', ')}; pass them as flags, or run in a terminal to be asked`);
  }
  const interactive = missing.length > 0;
  if (interactive) prompts.intro('New entry');

  const type: EntryType =
    (values.type as EntryType | undefined) ??
    (await ask(
      prompts.select({
        message: 'What are you writing?',
        options: types.map((value) => ({ value, label: TYPE_LABELS[value] })),
      }),
    ));
  if (values.advanced && type !== 'post') throw new Error('--advanced is only for posts');
  if (images !== undefined && type !== 'photos') throw new Error('--images is only for photos');

  let advanced = values.advanced;
  const hasAdvanced = templates.some((template) => template.type === type && template.advanced);
  if (type === 'post' && !advanced && interactive && hasAdvanced) {
    advanced = await ask(
      prompts.confirm({
        message: 'Advanced post? (MDX, with components/ and data/ folders)',
        initialValue: false,
      }),
    );
  }

  const title =
    values.title ??
    (await ask(
      prompts.text({
        message: 'Title',
        validate: (value) => check(() => lib.slugify(value ?? '')),
      }),
    ));

  // New tags are only collected here; they are appended to tags.yml after the last prompt.
  const newTags: { slug: string; name: string }[] = [];
  if (tags === undefined) {
    const chosen = await ask(
      prompts.multiselect<string | typeof ADD_TAG>({
        message: 'Tags',
        options: [
          ...[...known.values()].map((tag) => ({ value: tag.slug, label: tag.name, hint: tag.slug })),
          { value: ADD_TAG, label: '+ Add a new tag' },
        ],
        required: true,
      }),
    );
    tags = chosen.filter((value): value is string => value !== ADD_TAG);
    for (let more = chosen.includes(ADD_TAG); more; ) {
      const name = (
        await ask(
          prompts.text({
            message: 'New tag name',
            validate: (value) =>
              check(() => {
                const slug = lib.slugify(value ?? '');
                if (known.has(slug) || newTags.some((tag) => tag.slug === slug)) {
                  throw new Error(`Tag "${slug}" already exists`);
                }
              }),
          }),
        )
      ).trim();
      newTags.push({ slug: lib.slugify(name), name });
      more = await ask(prompts.confirm({ message: 'Add another new tag?', initialValue: false }));
    }
    tags.push(...newTags.map((tag) => tag.slug));
  }

  if (type === 'photos' && images === undefined) {
    const dir = await ask(
      prompts.text({
        message: 'Folder of photos to copy in',
        validate: (value) => check(() => photoSources(value ?? '')),
      }),
    );
    images = photoSources(dir);
  }

  // The last prompt has been answered: from here on, plan, check, then write.
  const template = templates.find((item) => item.type === type && item.advanced === advanced);
  if (!template) throw new Error(`No template for ${advanced ? 'an advanced ' : ''}${type}`);
  const plan = lib.planEntry({ type, title, tags, advanced, now: new Date(), root, images });
  lib.createEntry(plan, template, { tagsFile, newTags, images });

  const dev = devCommand(plan.url.app);
  const url = `http://localhost:${dev.port}${plan.url.path}`;
  if (interactive) prompts.outro(`Created ${plan.file}`);
  else console.log(`Created ${plan.file}`);
  for (const tag of newTags) console.log(`Added tag "${tag.slug}" to ${tagsFile}`);
  console.log(`Draft URL: ${url}`);
  if (values['no-open']) return;

  const editor = editorCommand(process.env, plan.file);
  if (editor?.terminal) {
    console.log(`Open ${plan.file} in your editor; starting the dev server…`);
  } else if (editor) {
    spawn(editor.command, editor.args, { detached: true, stdio: 'ignore' })
      .on('error', (error) => console.error(`Could not open ${editor.command}: ${error.message}`))
      .on('exit', (code) => {
        if (code) console.error(`${editor.command} exited with code ${code}; open ${plan.file} yourself.`);
      })
      .unref();
  } else {
    console.log('Set $EDITOR (or $VISUAL) to open new entries automatically.');
  }
  console.log(`Starting the ${plan.url.app} dev server with drafts shown; open ${url}`);
  const server = spawn(dev.command, dev.args, {
    cwd: REPO,
    stdio: 'inherit',
    env: { ...process.env, ...dev.env },
  });
  server.on('exit', (code, signal) => process.exit(signal ? 130 : (code ?? 1)));
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
}
