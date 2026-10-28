// Plans and writes new content entries for `pnpm new`. Planning (`planEntry`) is pure; only
// `writeEntry`, `appendTag` and `listTemplates` touch the filesystem.
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { loadTags, parseTags, postPath, TIME_ZONE } from '@ac/content';
import { slug } from 'github-slugger';
import { Document, isScalar, parse, stringify } from 'yaml';

export type EntryType = 'post' | 'til' | 'photos';

export interface Template {
  type: EntryType;
  advanced: boolean;
  dir: string;
}

export interface EntryPlan {
  /** The collection entry id: `YYYY-MM-DD-<slug>`, or just `<slug>` for photos. */
  id: string;
  /** The Markdown/MDX file to write. */
  file: string;
  /** Folders to create, the entry's own folder first (empty for single-file entries). */
  dirs: string[];
  /** The complete `---` … `---` block, ending in a newline. */
  frontMatter: string;
  url: { app: 'blog' | 'til'; path: string };
}

export interface PlanOptions {
  type: EntryType;
  title: string;
  tags: string[];
  advanced: boolean;
  now: Date;
  /** The content directory, usually `contentRoot()`. */
  root: string;
  /** Photos only: the image files to copy in. Only their file names are used here. */
  images?: string[];
}

const MAX_SLUG = 80;
const TYPES: readonly EntryType[] = ['post', 'til', 'photos'];

/** A URL slug for a title (GitHub's heading rules), at most 80 characters, cut at a hyphen. */
export function slugify(title: string): string {
  let result = slug(title).replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  if (result.length > MAX_SLUG) {
    // Cut back to the last hyphen at or before the limit so no word is split.
    const cut = result.lastIndexOf('-', MAX_SLUG);
    result = result.slice(0, cut > 0 ? cut : MAX_SLUG).replace(/-+$/, '');
  }
  if (!result) throw new Error(`Title "${title}" has no characters usable in a URL`);
  return result;
}

const laParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'longOffset',
});

/** `now` as Los Angeles wall-clock time with its offset, plus the LA calendar day. */
export function entryDate(now: Date): { iso: string; day: string } {
  const parts = laParts.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  // `longOffset` gives `GMT-07:00` (or bare `GMT` at UTC, which Los Angeles never is).
  const offset = part('timeZoneName').replace(/^GMT/, '') || '+00:00';
  const day = `${part('year')}-${part('month')}-${part('day')}`;
  return { iso: `${day}T${part('hour')}:${part('minute')}:${part('second')}${offset}`, day };
}

/** The templates under `templatesDir`: one folder per `<type>` or `<type>-advanced`. */
export function listTemplates(templatesDir: string): Template[] {
  const templates = readdirSync(templatesDir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map(({ name }): Template => {
      const match = /^(.+?)(-advanced)?$/.exec(name)!;
      const type = match[1] as EntryType;
      if (!TYPES.includes(type)) {
        throw new Error(
          `Unknown template folder "${name}" in ${templatesDir}; expected one of ${TYPES.join(', ')} (optionally with -advanced)`,
        );
      }
      return { type, advanced: Boolean(match[2]), dir: join(templatesDir, name) };
    });
  return templates.sort(
    (a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || Number(a.advanced) - Number(b.advanced),
  );
}

function renderFrontMatter(data: Record<string, unknown>): string {
  const doc = new Document(data);
  const date = doc.get('date', true);
  if (isScalar(date)) date.type = 'QUOTE_DOUBLE';
  return `---\n${doc.toString({ lineWidth: 0 })}---\n`;
}

/** Where a new entry goes and what its front matter says. Touches nothing on disk. */
export function planEntry(opts: PlanOptions): EntryPlan {
  const { type, title, tags, advanced, now, root } = opts;
  const name = slugify(title);
  const { iso, day } = entryDate(now);
  const data: Record<string, unknown> = { title, date: iso, tags: [...tags], draft: true };

  if (type === 'photos') {
    const images = opts.images ?? [];
    if (images.length === 0) throw new Error('Photos need at least one image');
    const seen = new Set<string>();
    data.images = images.map((path) => {
      const file = basename(path);
      if (seen.has(file)) throw new Error(`Two images are named ${file}; rename one`);
      seen.add(file);
      return { src: `./${file}`, alt: `TODO: describe ${file}` };
    });
    const folder = join(root, 'photos', name);
    return {
      id: name,
      file: join(folder, 'index.md'),
      dirs: [folder],
      frontMatter: renderFrontMatter(data),
      url: { app: 'blog', path: `/photos/${name}/` },
    };
  }

  const id = `${day}-${name}`;
  const frontMatter = renderFrontMatter(data);
  if (type === 'til') {
    return {
      id,
      file: join(root, 'til', `${id}.md`),
      dirs: [],
      frontMatter,
      url: { app: 'til', path: `/${id}/` },
    };
  }

  const url = { app: 'blog' as const, path: postPath({ id, data: { date: now } }) };
  if (!advanced) {
    return { id, file: join(root, 'posts', `${id}.md`), dirs: [], frontMatter, url };
  }
  const folder = join(root, 'posts', id);
  return {
    id,
    file: join(folder, 'index.mdx'),
    dirs: [folder, join(folder, 'components'), join(folder, 'data')],
    frontMatter,
    url,
  };
}

/** Paths whose existence means the entry (or another entry with the same id) already exists. */
function conflicts(plan: EntryPlan): string[] {
  const paths = [plan.file, ...plan.dirs.slice(0, 1)];
  // A post id is taken by either a `<id>.md(x)` file or an `<id>/` folder.
  const parent = dirname(plan.dirs[0] ?? plan.file);
  if (basename(parent) === 'posts') {
    paths.push(join(parent, `${plan.id}.md`), join(parent, `${plan.id}.mdx`), join(parent, plan.id));
  }
  return paths;
}

function templateBody(dir: string): string {
  const index = readdirSync(dir).find((name) => /^index\.mdx?$/.test(name));
  if (!index) throw new Error(`Template ${dir} has no index.md or index.mdx`);
  return readFileSync(join(dir, index), 'utf8');
}

/**
 * Writes a planned entry: front matter plus the template body (`{{title}}` filled in), its
 * folders, and any images copied next to it. Never overwrites: refuses if anything is in the way.
 */
export function writeEntry(
  plan: EntryPlan,
  template: { dir: string },
  imageSources: string[] = [],
): void {
  const taken = conflicts(plan).find((path) => existsSync(path));
  if (taken) throw new Error(`${taken} already exists; not overwriting it`);
  for (const source of imageSources) {
    if (!existsSync(source)) throw new Error(`Image ${source} does not exist`);
  }

  const { title } = parse(plan.frontMatter.slice(4, -4)) as { title: string };
  const body = templateBody(template.dir).replaceAll('{{title}}', title).replace(/^\n+/, '');
  for (const dir of plan.dirs) mkdirSync(dir, { recursive: true });
  mkdirSync(dirname(plan.file), { recursive: true });
  for (const source of imageSources) {
    copyFileSync(source, join(dirname(plan.file), basename(source)));
  }
  writeFileSync(plan.file, `${plan.frontMatter}\n${body}`, { flag: 'wx' });
}

/** Appends a tag to `tags.yml`, leaving the existing text untouched. Refuses a duplicate slug. */
export function appendTag(tagsFile: string, tag: { slug: string; name: string }): void {
  const existing = loadTags(tagsFile);
  if (existing.has(tag.slug)) throw new Error(`Tag "${tag.slug}" already exists in ${tagsFile}`);
  const text = readFileSync(tagsFile, 'utf8');
  const scalar = (value: string) => stringify(value, { lineWidth: 0 }).trimEnd();
  const entry = `- slug: ${scalar(tag.slug)}\n  name: ${scalar(tag.name)}\n`;
  const addition = text === '' || text.endsWith('\n') ? entry : `\n${entry}`;
  // Check the result parses (and keeps the tag as given) before touching the file.
  const parsed = parseTags(text + addition, tagsFile).get(tag.slug);
  if (parsed?.name !== tag.name) throw new Error(`Tag "${tag.slug}" did not round-trip through YAML`);
  appendFileSync(tagsFile, addition);
}

/**
 * The write step of `pnpm new`, run only after the last prompt. Checks that the entry is free
 * before touching anything, so a refused entry leaves `tags.yml` byte-identical; then appends any
 * new tags and writes the entry.
 */
export function createEntry(
  plan: EntryPlan,
  template: { dir: string },
  opts: { tagsFile: string; newTags?: { slug: string; name: string }[]; images?: string[] },
): void {
  const taken = conflicts(plan).find((path) => existsSync(path));
  if (taken) throw new Error(`${taken} already exists; not overwriting it`);
  for (const tag of opts.newTags ?? []) appendTag(opts.tagsFile, tag);
  writeEntry(plan, template, opts.images ?? []);
}
