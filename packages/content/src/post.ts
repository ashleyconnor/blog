import { TIME_ZONE } from './listing';

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/;
const WORDS_PER_MINUTE = 200;

/** The URL slug of a post: its entry id without any leading `YYYY-MM-DD-`. */
export function postSlug(id: string): string {
  return id.replace(DATE_PREFIX, '');
}

const dateParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function partsOf(date: Date) {
  const parts = dateParts.formatToParts(date);
  const part = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)!.value;
  return { year: part('year'), month: part('month'), day: part('day') };
}

/**
 * The route params of a post, `[year]/[month]/[day]/[slug]`. The date is the calendar date in
 * Los Angeles (the author's time zone), so an evening post keeps the date it was written on.
 */
export function postParams(entry: { id: string; data: { date: Date } }) {
  return { ...partsOf(entry.data.date), slug: postSlug(entry.id) };
}

/** The site-relative URL of a post, `/YYYY/MM/DD/<slug>/`. */
export function postPath(entry: { id: string; data: { date: Date } }): string {
  const { year, month, day, slug } = postParams(entry);
  return `/${year}/${month}/${day}/${slug}/`;
}

/** The two-digit day of the month (`01`–`31`) in Los Angeles time. */
export function dayOfMonth(date: Date): string {
  return partsOf(date).day;
}

const shortMonth = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, month: 'short' });

/** `23 Apr 2025`, in Los Angeles time. */
export function formatDate(date: Date): string {
  const { year, day } = partsOf(date);
  return `${Number(day)} ${shortMonth.format(date)} ${year}`;
}

/**
 * Estimated reading time in whole minutes (never below one). Counts the words of the Markdown
 * or MDX source after dropping MDX `import`/`export` lines, code fence markers and tags.
 */
export function readingMinutes(body: string): number {
  const words = body
    .replace(/^\s*(?:import|export)\s.*$/gm, ' ')
    .replace(/^\s*```.*$/gm, ' ')
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
