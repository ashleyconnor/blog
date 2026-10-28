import type { ImageMetadata } from 'astro';
import type { StreamItem } from './listing';
import { postPath, readingMinutes } from './post';

/** Where TIL entries live; stream rows link out to `<TIL_ORIGIN>/<entry id>/`. */
export const TIL_ORIGIN = 'https://til.ashleyconnor.co.uk';

/** How many thumbnails a photos row shows; the rest are counted as `+N`. */
const THUMBS = 3;

interface FrontMatter {
  title: string;
  date: Date;
  tags: string[];
  excerpt?: string;
  draft: boolean;
  unlisted: boolean;
  legacyUrls?: string[];
}

/** The parts of an Astro collection entry the stream needs. */
interface Entry<Data extends FrontMatter = FrontMatter> {
  id: string;
  data: Data;
  body?: string;
  filePath?: string;
}

function common({ id, data }: Entry) {
  return {
    id,
    title: data.title,
    date: data.date,
    tags: data.tags,
    excerpt: data.excerpt && stripMarkdown(data.excerpt),
    draft: data.draft,
    unlisted: data.unlisted,
    legacyUrls: data.legacyUrls,
  };
}

/** An advanced post is a folder with an `index.mdx` (plus its components and data). */
const ADVANCED = /(?:^|[\\/])index\.mdx$/;

export function postItem(entry: Entry): StreamItem {
  return {
    type: 'post',
    ...common(entry),
    href: postPath(entry),
    advanced: ADVANCED.test(entry.filePath ?? ''),
    minutes: readingMinutes(entry.body ?? ''),
  };
}

export function tilItem(entry: Entry): StreamItem {
  return { type: 'til', ...common(entry), href: `${TIL_ORIGIN}/${entry.id}/`, advanced: false };
}

export function photosItem(entry: Entry<FrontMatter & { images: { src: ImageMetadata; alt: string }[] }>): StreamItem {
  const { images } = entry.data;
  return {
    type: 'photos',
    ...common(entry),
    href: `/photos/${entry.id}/`,
    advanced: false,
    thumbs: images.slice(0, THUMBS).map(({ src, alt }) => ({ src, alt })),
    extraCount: Math.max(0, images.length - THUMBS),
  };
}

// A run of backticks, the code, then the same run again (not followed by another backtick).
const CODE_SPAN = /(`+)([\s\S]+?)\1(?!`)/g;
// A link or image destination in parentheses, allowing one level of nested parentheses.
const DESTINATION = String.raw`\((?:[^()]|\([^()]*\))*\)`;

const INLINE_RULES: [RegExp, string][] = [
  [new RegExp(String.raw`!?\[([^\]]*)\]${DESTINATION}`, 'g'), '$1'], // [text](url), ![alt](src)
  [/!?\[([^\]]*)\]\[[^\]]*\]/g, '$1'], // [text][ref]
  [/<((?:https?|mailto):[^>\s]+)>/g, '$1'], // <https://autolink>
  [/<\/?[A-Za-z][^>]*>/g, ''], // inline HTML tags
  [/~~(?=\S)(.+?)(?<=\S)~~/g, '$1'],
  [/(?<!\\)\*\*(?=\S)(.+?)(?<=[^\s\\])\*\*/g, '$1'],
  [/(?<![\w\\])__(?=\S)(.+?)(?<=[^\s\\])__(?!\w)/g, '$1'],
  [/(?<!\\)\*(?=\S)(.+?)(?<=[^\s\\])\*/g, '$1'],
  // `_` only emphasises at word boundaries, so snake_case survives.
  [/(?<![\w\\])_(?=\S)(.+?)(?<=[^\s\\])_(?!\w)/g, '$1'],
  [/\\([!-/:-@[-`{-~])/g, '$1'], // backslash escapes
];

/**
 * Inline Markdown as plain text, for excerpts shown outside rendered Markdown (stream rows, meta
 * descriptions). Handles what front-matter excerpts use: links, images, emphasis, strikethrough,
 * code spans (contents kept verbatim), inline HTML and backslash escapes.
 */
export function stripMarkdown(markdown: string): string {
  const code: string[] = [];
  let text = markdown.replace(CODE_SPAN, (_, _ticks, content: string) => `\0${code.push(content) - 1}\0`);
  for (const [pattern, replacement] of INLINE_RULES) text = text.replace(pattern, replacement);
  return text
    .replace(/\0(\d+)\0/g, (_, i: string) => code[Number(i)]!)
    .replace(/\s+/g, ' ')
    .trim();
}
