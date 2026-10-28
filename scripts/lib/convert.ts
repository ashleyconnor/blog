// Pure conversion helpers for the one-off Jekyll -> Astro content migration. Nothing in here touches
// the filesystem or the network; `migrate-jekyll.ts` does the I/O and feeds the results back in.
import { Document, isScalar, parse } from 'yaml';

export type FrontMatter = Record<string, unknown>;

/* ----------------------------------------------------------------------------------------------
 * Markdown body
 * ------------------------------------------------------------------------------------------- */

export interface ConvertBodyOptions {
  /** Path from the converted file to the shared images folder. Posts use the default. */
  imageBase?: string;
  /** Dropbox URL (as written in the markdown) -> path under the images folder of the downloaded copy. */
  dropboxImages?: ReadonlyMap<string, string>;
}

interface Line {
  text: string;
  /** Inside (or delimiting) a fenced code block, where nothing may be rewritten. */
  code: boolean;
}

const DEFAULT_IMAGE_BASE = './_images/';
const LOCAL_IMAGE_PREFIX = '/assets/images/';

const HIGHLIGHT_OPEN = /^(\s*)\{%-?\s*highlight\s+([\w+#-]+)([^%]*?)-?%\}\s*$/;
const HIGHLIGHT_CLOSE = /^\s*\{%-?\s*endhighlight\s*-?%\}\s*$/;
const FENCE_OPEN = /^\s*(`{3,}|~{3,})(.*)$/;
const IAL = /^\{:\s*([^}]*?)\s*\}\s*$/;
const LIQUID = /\{%.*?%\}|\{\{.*?\}\}/g;
const LEADING_BLANK_LINES = /^(?:[ \t]*\n)+/;

// Matches the destination of a markdown image: `![alt](dest` or `![alt](<dest with spaces>`. Only
// images are ever rewritten: Astro resolves relative paths for images but not for link hrefs.
const IMAGE_DESTINATION = /(!\[[^\]]*\]\(\s*)(<[^>\n]*>|[^)\s]+)/g;
// An image wrapped in a link: `[![alt](src "title")](href "title")`. Captures the image, src and href.
const LINKED_IMAGE =
  /\[(!\[[^\]]*\]\(\s*(<[^>\n]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\))\]\(\s*(<[^>\n]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const DROPBOX_URL = /^https?:\/\/(?:[\w-]+\.)*dropbox(?:usercontent)?\.com\//;

const LANGUAGE_ALIASES: Record<string, string> = { yml: 'yaml' };

// Minimal Mistakes `.notice--*` classes -> the Callout component's `type` prop.
const NOTICE_TYPES: Record<string, string> = {
  '': 'note',
  primary: 'note',
  info: 'note',
  success: 'tip',
  warning: 'warning',
  danger: 'warning',
};

/** Splits markdown into lines flagged as code or prose, turning `{% highlight %}` blocks into fences. */
function scanLines(md: string, warnings: string[]): Line[] {
  const lines: Line[] = [];
  let fence: { marker: string; length: number } | null = null;
  let highlight: { indent: string; lang: string; content: string[] } | null = null;

  const closeHighlight = () => {
    if (!highlight) return;
    const { indent, lang, content } = highlight;
    while (content.length && content[0]!.trim() === '') content.shift();
    while (content.length && content.at(-1)!.trim() === '') content.pop();
    const longestRun = Math.max(0, ...content.map((l) => /^\s*(`+)/.exec(l)?.[1]!.length ?? 0));
    const ticks = '`'.repeat(Math.max(3, longestRun + 1));
    lines.push({ text: `${indent}${ticks}${lang}`, code: true });
    for (const text of content) lines.push({ text, code: true });
    lines.push({ text: `${indent}${ticks}`, code: true });
    highlight = null;
  };

  for (const text of md.split('\n')) {
    if (highlight) {
      if (HIGHLIGHT_CLOSE.test(text)) closeHighlight();
      else highlight.content.push(text);
      continue;
    }
    if (fence) {
      lines.push({ text, code: true });
      const trimmed = text.trim();
      if (trimmed.length >= fence.length && trimmed === fence.marker.repeat(trimmed.length))
        fence = null;
      continue;
    }
    const open = HIGHLIGHT_OPEN.exec(text);
    if (open) {
      const [, indent, rawLang, options] = open;
      if (options!.trim()) warnings.push(`highlight options dropped: ${text.trim()}`);
      highlight = { indent: indent!, lang: LANGUAGE_ALIASES[rawLang!] ?? rawLang!, content: [] };
      continue;
    }
    const fenceOpen = FENCE_OPEN.exec(text);
    if (fenceOpen && !(fenceOpen[1]![0] === '`' && fenceOpen[2]!.includes('`'))) {
      fence = { marker: fenceOpen[1]![0]!, length: fenceOpen[1]!.length };
      lines.push({ text, code: true });
      continue;
    }
    lines.push({ text, code: false });
  }

  if (highlight) {
    warnings.push(
      `unterminated highlight block (language: ${(highlight as { lang: string }).lang})`,
    );
    closeHighlight();
  }
  return lines;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function unwrapDestination(destination: string): string {
  return destination.startsWith('<') && destination.endsWith('>')
    ? destination.slice(1, -1)
    : destination;
}

/** Kebab-cases any path segment that contains whitespace; other segments keep their names. */
function kebabSpaces(path: string): string {
  return path
    .split('/')
    .map((segment) => (/\s/.test(segment) ? segment.toLowerCase().replace(/\s+/g, '-') : segment))
    .join('/');
}

/** `/assets/images/<path>` -> `<path>` under the shared images folder (spaces removed from names). */
export function localImagePath(assetPath: string): string {
  const decoded = decode(assetPath);
  if (!decoded.startsWith(LOCAL_IMAGE_PREFIX))
    throw new Error(`Not a local image path: ${assetPath}`);
  return kebabSpaces(decoded.slice(LOCAL_IMAGE_PREFIX.length));
}

/** A Dropbox URL -> `dropbox/<kebab-cased file name>` under the shared images folder. */
export function dropboxImagePath(url: string): string {
  const name = decode(new URL(url).pathname.split('/').at(-1) ?? '');
  if (!name) throw new Error(`Dropbox URL has no file name: ${url}`);
  return `dropbox/${kebabSpaces(name)}`;
}

function formatDestination(path: string): string {
  return /[\s()<>]/.test(path) ? `<${path}>` : path;
}

interface Converted {
  body: string;
  warnings: string[];
  localImages: string[];
  dropboxImages: string[];
}

function convert(md: string, options: ConvertBodyOptions): Converted {
  const imageBase = options.imageBase ?? DEFAULT_IMAGE_BASE;
  const warnings: string[] = [];
  const localImages = new Set<string>();
  const dropboxImages = new Set<string>();
  const unavailable = new Set<string>();

  const input = scanLines(md.replace(/\r\n?/g, '\n'), warnings);
  const out: Line[] = [];

  const rewriteLine = (text: string): string => {
    // Jekyll themes link a thumbnail to its full-size file. The new site's image component already
    // links to the optimised original, so a link to the very same file is redundant: unwrap it.
    const unwrapped = text.replace(
      LINKED_IMAGE,
      (match, image: string, src: string, href: string) => {
        const target = decode(unwrapDestination(href));
        return target.startsWith(LOCAL_IMAGE_PREFIX) && decode(unwrapDestination(src)) === target
          ? image
          : match;
      },
    );
    return unwrapped.replace(IMAGE_DESTINATION, (match, open: string, destination: string) => {
      const url = unwrapDestination(destination);
      const target = decode(url);
      if (target.startsWith(LOCAL_IMAGE_PREFIX)) {
        localImages.add(target);
        return `${open}${formatDestination(imageBase + localImagePath(target))}`;
      }
      if (!DROPBOX_URL.test(url)) return match;
      dropboxImages.add(url);
      const copy = options.dropboxImages?.get(url);
      if (copy) return `${open}${formatDestination(imageBase + copy)}`;
      if (!unavailable.has(url)) {
        unavailable.add(url);
        warnings.push(`dropbox image unavailable: ${url}`);
      }
      return match;
    });
  };

  input.forEach((line, index) => {
    if (line.code) {
      out.push(line);
      return;
    }
    const ial = IAL.exec(line.text);
    if (!ial) {
      out.push({ text: rewriteLine(line.text), code: false });
      return;
    }

    // Kramdown applies a block IAL to the paragraph directly above it.
    let start = out.length;
    while (start > 0 && !out[start - 1]!.code && out[start - 1]!.text.trim() !== '') start--;
    if (start === out.length) {
      warnings.push(`kramdown attribute list without a preceding paragraph: ${line.text.trim()}`);
      return;
    }
    const classes = [...ial[1]!.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!);
    const notice = classes.map((c) => /^notice(?:--([\w]+))?$/.exec(c)).find(Boolean);
    const type = notice ? NOTICE_TYPES[notice[1] ?? ''] : undefined;
    const paragraph = out.splice(start).map((l) => l.text);

    if (type) {
      out.push({ text: `<Callout type="${type}">`, code: false }, { text: '', code: false });
      paragraph.forEach((text) => out.push({ text, code: false }));
      out.push({ text: '', code: false }, { text: '</Callout>', code: false });
      if (input[index + 1]?.text.trim()) out.push({ text: '', code: false });
    } else if (classes.includes('small')) {
      paragraph[0] = `<small>${paragraph[0]}`;
      paragraph[paragraph.length - 1] += '</small>';
      paragraph.forEach((text) => out.push({ text, code: false }));
    } else {
      warnings.push(`unsupported kramdown attribute list: ${line.text.trim()}`);
      paragraph.forEach((text) => out.push({ text, code: false }));
    }
  });

  for (const { text, code } of out) {
    if (code) continue;
    for (const tag of text.matchAll(LIQUID)) warnings.push(`unhandled Liquid tag: ${tag[0]}`);
    if (text.includes(LOCAL_IMAGE_PREFIX))
      warnings.push(`unconverted image reference: ${text.trim()}`);
  }

  return {
    body: out.map((l) => l.text).join('\n'),
    warnings,
    localImages: [...localImages],
    dropboxImages: [...dropboxImages],
  };
}

/**
 * Converts a Jekyll/Kramdown body to Astro-ready markdown: highlight tags become fences, notice
 * attribute lists become `<Callout>`, `{: .small}` becomes `<small>`, and image paths are rewritten
 * to the shared images folder. Anything it cannot convert is left in place and reported as a warning.
 */
export function convertBody(
  md: string,
  options: ConvertBodyOptions = {},
): { body: string; warnings: string[] } {
  const { body, warnings } = convert(md, options);
  return { body, warnings };
}

/** The `/assets/images/...` files (decoded) and Dropbox URLs a body references, outside code fences. */
export function findImages(md: string): { localImages: string[]; dropboxImages: string[] } {
  const { localImages, dropboxImages } = convert(md, {});
  return { localImages, dropboxImages };
}

/**
 * A body that uses `<Callout>` outside code must be MDX and import the component; everything else
 * stays plain markdown.
 */
export function finalizeBody(body: string): { body: string; extension: '.md' | '.mdx' } {
  const usesCallout = scanLines(body, []).some((l) => !l.code && /^\s*<Callout\b/.test(l.text));
  if (!usesCallout) return { body, extension: '.md' };
  const content = body.replace(LEADING_BLANK_LINES, '');
  return {
    body: `import Callout from '@ac/ui/components/Callout.astro';\n\n${content}`,
    extension: '.mdx',
  };
}

/* ----------------------------------------------------------------------------------------------
 * Front matter
 * ------------------------------------------------------------------------------------------- */

export interface FrontMatterContext {
  /** The Jekyll file name, e.g. `2025-04-23-pythons-async-gap-....md`; supplies the date Jekyll infers. */
  file: string;
  /** The entry's URL on the live site (absolute path, or a full URL whose path is used). */
  liveUrl: string;
  tags: string[];
  /** Receives a message for each dropped front matter key that carried a value. */
  warn?: (message: string) => void;
}

// Keys the converter consumes or that only mattered to the Jekyll theme; dropping them is not news.
const CONSUMED_KEYS = new Set(['title', 'date', 'excerpt', 'hide', 'redirect_from', 'alias']);
const THEME_KEYS = new Set([
  'layout',
  'author_profile',
  'share',
  'read_time',
  'show_date',
  'sitemap',
  'permalink',
  'comments',
  'related',
  'toc',
]);

const DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\s*(Z|[+-]\d{2}:?\d{2}))?)?$/;
const LOS_ANGELES = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  timeZoneName: 'longOffset',
});

/**
 * The America/Los_Angeles UTC offset at local midnight on the given date. Midnight there is 07:00 or
 * 08:00 UTC, and the zone only changes offset at 02:00 local, so sampling 08:00 UTC always lands on
 * the offset that was in force at midnight (including on the two changeover days).
 */
function losAngelesOffsetAtMidnight(year: number, month: number, day: number): string {
  const instant = new Date(Date.UTC(year, month - 1, day, 8));
  const zone =
    LOS_ANGELES.formatToParts(instant).find((p) => p.type === 'timeZoneName')?.value ?? '';
  const offset = /^GMT([+-]\d{2}:\d{2})$/.exec(zone)?.[1];
  if (!offset)
    throw new Error(
      `Cannot determine the Los Angeles offset for ${year}-${month}-${day} (got "${zone}")`,
    );
  return offset;
}

function normalizeDate(raw: unknown, file: string): string {
  if (raw instanceof Date) return raw.toISOString();
  const text = typeof raw === 'string' ? raw.trim() : '';
  const match = DATE_PATTERN.exec(text);
  if (!match) throw new Error(`${file}: unreadable date ${JSON.stringify(raw)}`);

  const [, y, mo, d, h, mi, s, zone] = match;
  const [year, month, day] = [Number(y), Number(mo), Number(d)];
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    throw new Error(`${file}: invalid calendar date ${JSON.stringify(raw)}`);
  }
  if (h === undefined)
    return `${y}-${mo}-${d}T00:00:00${losAngelesOffsetAtMidnight(year, month, day)}`;
  if (!zone) throw new Error(`${file}: date ${JSON.stringify(raw)} has a time but no UTC offset`);
  const offset =
    zone === 'Z' ? 'Z' : zone.length === 5 ? `${zone.slice(0, 3)}:${zone.slice(3)}` : zone;
  return `${y}-${mo}-${d}T${h}:${mi}:${s ?? '00'}${offset}`;
}

function asList(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

function toAbsolutePath(url: string): string {
  if (/^https?:\/\//.test(url)) return new URL(url).pathname;
  return url.startsWith('/') ? url : `/${url}`;
}

function hasValue(value: unknown): boolean {
  return !(value === undefined || value === null || value === '' || value === false);
}

/**
 * Jekyll front matter -> the keys the content schemas accept (they are strict, so nothing else may
 * be emitted): `title`, `date`, `tags`, `excerpt?`, `unlisted?` and `legacyUrls`.
 */
export function convertFrontMatter(fm: FrontMatter, ctx: FrontMatterContext): FrontMatter {
  const title = typeof fm.title === 'string' ? fm.title.trim() : '';
  if (!title) throw new Error(`${ctx.file}: front matter has no title`);
  if (ctx.tags.length === 0) throw new Error(`${ctx.file}: at least one tag is required`);

  // Jekyll takes the date from the file name when the front matter has none.
  const rawDate = fm.date ?? /^\d{4}-\d{2}-\d{2}(?=-)/.exec(ctx.file)?.[0];
  if (rawDate === undefined) throw new Error(`${ctx.file}: no date in front matter or file name`);

  for (const [key, value] of Object.entries(fm)) {
    if (!CONSUMED_KEYS.has(key) && !THEME_KEYS.has(key) && hasValue(value)) {
      ctx.warn?.(`dropped front matter key "${key}"`);
    }
  }

  const out: FrontMatter = { title, date: normalizeDate(rawDate, ctx.file), tags: [...ctx.tags] };
  if (typeof fm.excerpt === 'string' && fm.excerpt.trim()) out.excerpt = fm.excerpt.trim();
  if (fm.hide === true) out.unlisted = true;
  out.legacyUrls = [
    ...new Set([ctx.liveUrl, ...asList(fm.redirect_from), ...asList(fm.alias)].map(toAbsolutePath)),
  ];
  return out;
}

/** Pages carry a title and nothing else. */
export function convertPageFrontMatter(fm: FrontMatter): FrontMatter {
  const title = typeof fm.title === 'string' ? fm.title.trim() : '';
  if (!title) throw new Error('Page front matter has no title');
  return { title };
}

/* ----------------------------------------------------------------------------------------------
 * Reading and writing whole files
 * ------------------------------------------------------------------------------------------- */

/** Splits `---` delimited YAML front matter from the markdown that follows it. */
export function splitFrontMatter(text: string): { data: FrontMatter; body: string } {
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) throw new Error('File has no YAML front matter');
  const data: unknown = parse(match[1]!);
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Front matter is not a YAML mapping');
  }
  return { data: data as FrontMatter, body: text.slice(match[0].length) };
}

/** Front matter + body as file text. Dates are quoted so every YAML parser reads them as strings. */
export function renderEntry(frontMatter: FrontMatter, body: string): string {
  const doc = new Document(frontMatter);
  for (const key of ['date', 'updated']) {
    const node = doc.get(key, true);
    if (isScalar(node)) node.type = 'QUOTE_DOUBLE';
  }
  const yaml = doc.toString({ lineWidth: 0 });
  return `---\n${yaml}---\n\n${body.replace(LEADING_BLANK_LINES, '').trimEnd()}\n`;
}
