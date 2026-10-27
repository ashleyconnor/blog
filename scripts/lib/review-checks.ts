/**
 * Deterministic checks for a draft entry, run by `pnpm review:check <file>` (and by the
 * `/review-post` command before its AI review). Each rule reports `Finding`s with 1-based line
 * numbers of the whole file. Front matter, fenced code and MDX `import`/`export` lines are not
 * prose, so only the `front-matter` rule (and photos alt text) looks at them.
 */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { buildRedirects, contentRoot, loadTags } from '@ac/content';
import { type Collection, entryFiles, frontMatterSchemas, loadItems, parseFrontmatter } from '@ac/content/load-items';

export type Rule = 'front-matter' | 'heading-order' | 'image-alt' | 'todo' | 'link';

export interface Finding {
  rule: Rule;
  /** 1-based line of the whole file (front matter included). */
  line: number;
  message: string;
}

/** Files served as-is from the blog's root (`/assets/...`, `/favicon.svg`). */
const BLOG_PUBLIC = join(import.meta.dirname, '../../apps/blog/public');

/** Blog pages that exist whatever the content: listings, feeds and the resume. */
const STATIC_ROUTES = [
  '/',
  '/posts/',
  '/photos/',
  '/resume/',
  '/instaboxd/privacy/',
  '/feed.xml',
  '/posts/feed.xml',
  '/photos/feed.xml',
  '/resume.pdf',
];
/** Homepage pagination: page 1 is `/`, so numbering starts at 2. */
const PAGE_ROUTE = /^\/page\/(?:[2-9]|[1-9]\d+)\/$/;

/**
 * Checks one entry file. Throws when the file cannot be read; a `.md`/`.mdx` file that is not an
 * entry of a collection under `contentRoot()` gets a single `front-matter` finding.
 */
export function checkEntry(file: string): Finding[] {
  const path = resolve(file);
  const text = readFileSync(path, 'utf8');
  const collection = collectionOf(path);
  if (!collection) return [{ rule: 'front-matter', line: 1, message: 'not a content entry' }];

  const source = readSource(text, path.endsWith('.mdx'));
  const findings = [
    ...checkFrontMatter(source, collection),
    ...checkHeadings(source),
    ...checkImageAlt(source, collection),
    ...checkTodos(source),
    ...checkLinks(source, path),
  ];
  // Stable, so findings on one line keep the rule order above.
  return findings.sort((a, b) => a.line - b.line);
}

/** The collection `path` is an entry of (same globs as the content loaders), or undefined. */
function collectionOf(path: string): Collection | undefined {
  const root = realpath(contentRoot());
  const rel = relative(root, realpath(path));
  if (rel.startsWith('..') || isAbsolute(rel)) return undefined;
  const [first, ...rest] = rel.split(sep);
  if (!first || !Object.hasOwn(frontMatterSchemas, first)) return undefined;
  const collection = first as Collection;
  return entryFiles(collection, root).includes(rest.join('/')) ? collection : undefined;
}

function realpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

interface Source {
  /** Raw lines; `lines[i]` is line `i + 1`. */
  lines: string[];
  /** Raw front-matter lines with their 1-based line numbers (empty without front matter). */
  front: { line: number; text: string }[];
  /** Parsed front matter, or the YAML error that stopped parsing. */
  data: Record<string, unknown>;
  yamlError?: string;
  /** Prose lines: non-prose lines blanked and inline code spans replaced by spaces. */
  prose: string[];
  /** `prose` joined with newlines, for patterns that can span lines (JSX tags). */
  proseText: string;
  /** Offset in `proseText` where each line starts. */
  lineStarts: number[];
}

function readSource(text: string, mdx: boolean): Source {
  const lines = text.split(/\r?\n/);
  const isProse = lines.map(() => true);

  // Front matter: a `---` fence as the first non-blank line, up to the next `---` line (Astro's rule).
  const front: Source['front'] = [];
  const start = lines.findIndex((line) => line.trim() !== '');
  const end = start >= 0 && lines[start] === '---' ? lines.indexOf('---', start + 1) : -1;
  if (end > start) {
    for (let i = start; i <= end; i++) isProse[i] = false;
    for (let i = start + 1; i < end; i++) front.push({ line: i + 1, text: lines[i]! });
  }

  let data: Record<string, unknown> = {};
  let yamlError: string | undefined;
  try {
    data = parseFrontmatter(text).frontmatter;
  } catch (error) {
    yamlError = (error instanceof Error ? error.message : String(error)).split('\n')[0];
  }

  let fence: { char: string; length: number } | undefined;
  let mdxDepth = 0;
  for (let i = end + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (fence) {
      isProse[i] = false;
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1]![0] === fence.char && close[1]!.length >= fence.length) fence = undefined;
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (open) {
      fence = { char: open[1]![0]!, length: open[1]!.length };
      isProse[i] = false;
      continue;
    }
    // MDX ESM: an `import`/`export` statement, followed through any lines its brackets stay open.
    if (mdx && (mdxDepth > 0 || /^(?:import|export)\s/.test(line))) {
      isProse[i] = false;
      mdxDepth = Math.max(0, mdxDepth + (line.match(/[{([]/g)?.length ?? 0) - (line.match(/[})\]]/g)?.length ?? 0));
    }
  }

  const prose = lines.map((line, i) => (isProse[i] ? blankCodeSpans(line) : ''));
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of prose) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  return { lines, front, data, yamlError, prose, proseText: prose.join('\n'), lineStarts };
}

/** Inline code spans (`` `x` ``, ``` ``x`` ```) replaced by spaces of the same length. */
function blankCodeSpans(line: string): string {
  return line.replace(/(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, (span) => ' '.repeat(span.length));
}

/** 1-based line of an offset in `proseText`. */
function lineAt(source: Source, offset: number): number {
  let lo = 0;
  let hi = source.lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (source.lineStarts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** Line of a top-level front-matter key, or 1 (the opening fence) when it is not there. */
function keyLine(source: Source, key: unknown): number {
  if (typeof key !== 'string') return 1;
  return source.front.find(({ text }) => new RegExp(`^${escapeRegExp(key)}\\s*:`).test(text))?.line ?? 1;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function checkFrontMatter(source: Source, collection: Collection): Finding[] {
  if (source.yamlError) return [{ rule: 'front-matter', line: 1, message: `invalid YAML: ${source.yamlError}` }];
  const result = frontMatterSchemas[collection].safeParse(source.data);
  if (result.success) return [];
  return result.error.issues.map((issue) => {
    const keys = 'keys' in issue && Array.isArray(issue.keys) ? issue.keys : [];
    const key = issue.path[0] ?? keys[0];
    const where = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return { rule: 'front-matter', line: keyLine(source, key), message: `${where}${issue.message}` };
  });
}

function checkHeadings(source: Source): Finding[] {
  const findings: Finding[] = [];
  let previous = 1; // the layout's h1 (the entry title)
  source.prose.forEach((line, i) => {
    const heading = /^ {0,3}(#{1,6})(?:[ \t]|$)/.exec(line);
    if (!heading) return;
    const level = heading[1]!.length;
    if (level === 1) {
      findings.push({
        rule: 'heading-order',
        line: i + 1,
        message: 'h1 (`#`) is the page title, rendered by the layout; start sections at `##`',
      });
    } else if (level > previous + 1) {
      findings.push({
        rule: 'heading-order',
        line: i + 1,
        message: `heading skips a level (h${previous} to h${level}); use ${'#'.repeat(previous + 1)}`,
      });
    }
    previous = level;
  });
  return findings;
}

function checkImageAlt(source: Source, collection: Collection): Finding[] {
  const findings: Finding[] = [];
  for (const match of source.proseText.matchAll(/!\[([^\]]*)\][([]/g)) {
    if (match[1]!.trim() === '') {
      findings.push({ rule: 'image-alt', line: lineAt(source, match.index), message: 'image has empty alt text' });
    }
  }
  for (const match of source.proseText.matchAll(/<(Figure|img)\b/g)) {
    const alt = altValue(tagText(source.proseText, match.index));
    const line = lineAt(source, match.index);
    if (alt === undefined) {
      findings.push({ rule: 'image-alt', line, message: `<${match[1]}> has no alt attribute` });
    } else if (alt !== null && alt.trim() === '') {
      findings.push({ rule: 'image-alt', line, message: `<${match[1]}> has empty alt text` });
    }
  }
  if (collection === 'photos') findings.push(...checkPhotoAlts(source));
  return findings;
}

/**
 * A tag from `<` to its closing `>`, and the same text with the insides of quoted values and
 * `{…}` expressions masked (so `>` or `alt` inside them is never mistaken for markup).
 */
function tagText(text: string, start: number): { raw: string; masked: string } {
  let quote = '';
  let depth = 0;
  let masked = '<';
  for (let i = start + 1; i < text.length; i++) {
    const char = text[i]!;
    if (quote) {
      if (char === quote) quote = '';
      masked += quote || depth > 0 ? '_' : char;
    } else if (depth > 0) {
      if (char === '"' || char === "'" || char === '`') quote = char;
      else if (char === '{') depth++;
      else if (char === '}') depth--;
      masked += depth > 0 ? '_' : char;
    } else {
      if (char === '"' || char === "'") quote = char;
      else if (char === '{') depth = 1;
      masked += char;
      if (char === '>') return { raw: text.slice(start, i + 1), masked };
    }
  }
  return { raw: text.slice(start), masked };
}

/**
 * The `alt` of a tag: its literal text (from `alt="…"`, `alt='…'` or a string literal in
 * `alt={…}`), `''` for a bare `alt`, `null` for any other expression, or undefined when absent.
 */
function altValue({ raw, masked }: { raw: string; masked: string }): string | null | undefined {
  const attr = /\salt(?![\w-])(\s*=\s*)?/.exec(masked);
  if (!attr) return undefined;
  if (!attr[1]) return '';
  const start = attr.index + attr[0].length;
  const open = raw[start];
  const close = open === '{' ? masked.indexOf('}', start) : masked.indexOf(open ?? '', start + 1);
  if ((open !== '"' && open !== "'" && open !== '{') || close < 0) return null;
  const inner = raw.slice(start + 1, close);
  if (open !== '{') return inner;
  const literal = /^\s*(["'`])([\s\S]*)\1\s*$/.exec(inner);
  return literal ? literal[2]! : null;
}

/** Photos `images[].alt` left as a template placeholder (`TODO…`). */
function checkPhotoAlts(source: Source): Finding[] {
  const images = source.data.images;
  if (!Array.isArray(images)) return [];
  const altLines = source.front.filter(({ text }) => /^\s*(?:-\s+)?alt\s*:/.test(text)).map(({ line }) => line);
  return images.flatMap((image, i) => {
    const alt = (image as { alt?: unknown } | null)?.alt;
    if (typeof alt !== 'string' || !/^\s*TODO/.test(alt)) return [];
    return [{ rule: 'image-alt' as const, line: altLines[i] ?? 1, message: `images[${i}].alt is a placeholder: "${alt}"` }];
  });
}

function checkTodos(source: Source): Finding[] {
  return source.prose.flatMap((line, i) =>
    [...line.matchAll(/\b(TODO|FIXME|XXX)\b/g)].map(([marker]) => ({
      rule: 'todo' as const,
      line: i + 1,
      message: `${marker} marker left in the text`,
    })),
  );
}

function checkLinks(source: Source, file: string): Finding[] {
  const destinations: { offset: number; dest: string }[] = [];
  const add = (offset: number, dest: string | undefined) => {
    if (dest !== undefined) destinations.push({ offset, dest: dest.startsWith('<') ? dest.slice(1, -1) : dest });
  };
  // [text](dest), ![alt](dest)
  for (const m of source.proseText.matchAll(/!?\[[^\]]*\]\(\s*(<[^>\n]*>|[^)\s]+)/g)) add(m.index, m[1]);
  // [ref]: dest
  for (const m of source.proseText.matchAll(/^ {0,3}\[[^\]]+\]:\s*(<[^>\n]*>|\S+)/gm)) add(m.index, m[1]);
  // href="dest", src='dest' in HTML/JSX tags
  for (const m of source.proseText.matchAll(/\s(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) add(m.index, m[1] ?? m[2]);
  destinations.sort((a, b) => a.offset - b.offset);

  let isRoute: ((path: string) => boolean) | undefined;
  const findings: Finding[] = [];
  for (const { offset, dest } of destinations) {
    if (dest === '' || dest.startsWith('#') || dest.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(dest)) continue;
    const target = safeDecode(dest.replace(/[?#].*$/, ''));
    const line = lineAt(source, offset);
    if (dest.startsWith('/')) {
      isRoute ??= blogRoutes();
      if (!isRoute(target)) findings.push({ rule: 'link', line, message: `${dest}: no blog page or redirect at ${target}` });
    } else if (target !== '' && !existsSync(resolve(dirname(file), target))) {
      findings.push({ rule: 'link', line, message: `${dest}: no such file` });
    }
  }
  return findings;
}

function safeDecode(text: string): string {
  try {
    return decodeURI(text);
  } catch {
    return text;
  }
}

/**
 * Whether a site-relative path is a page the blog builds (or a `_redirects` source), for the
 * content under `contentRoot()`. A path without its trailing slash counts: Cloudflare redirects it.
 * Entries with invalid front matter (often the draft being checked) are left out.
 */
function blogRoutes(): (path: string) => boolean {
  const items = loadItems({ skipInvalid: true });
  const exact = new Set(STATIC_ROUTES);
  for (const tag of loadTags().keys()) exact.add(`/tags/${tag}/`);
  for (const { href } of items) if (href.startsWith('/')) exact.add(href);
  const prefixes: string[] = [];
  for (const rule of buildRedirects(items).split('\n')) {
    const from = rule.split(' ')[0];
    if (!from) continue;
    if (from.endsWith('*')) prefixes.push(from.slice(0, -1));
    else exact.add(from);
  }
  return (path) =>
    exact.has(path) ||
    (!path.endsWith('/') && exact.has(`${path}/`)) ||
    PAGE_ROUTE.test(path.endsWith('/') ? path : `${path}/`) ||
    prefixes.some((prefix) => path.startsWith(prefix)) ||
    isPublicFile(path);
}

function isPublicFile(path: string): boolean {
  const full = join(BLOG_PUBLIC, path);
  if (!full.startsWith(BLOG_PUBLIC + sep)) return false;
  try {
    return statSync(full).isFile();
  } catch {
    return false;
  }
}
