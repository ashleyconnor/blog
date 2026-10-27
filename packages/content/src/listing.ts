import type { ImageMetadata } from 'astro';

export type EntryType = 'post' | 'til' | 'photos';

export type ImageRef = { src: ImageMetadata; alt: string };

export interface StreamItem {
  type: EntryType;
  id: string;
  title: string;
  date: Date;
  tags: string[];
  /** Plain text: Markdown in the front-matter excerpt is stripped (see `stripMarkdown`). */
  excerpt?: string;
  /** Computed by the apps (posts and photos are local, TIL points at the TIL origin). */
  href: string;
  advanced: boolean;
  minutes?: number;
  thumbs?: ImageRef[];
  extraCount?: number;
  draft: boolean;
  unlisted: boolean;
  /** Old Jekyll paths that redirect here (see `buildRedirects`). */
  legacyUrls?: string[];
}

export interface MonthGroup {
  /** `YYYY-MM` */
  key: string;
  /** e.g. `April 2025` */
  label: string;
  items: StreamItem[];
}

export const TIME_ZONE = 'America/Los_Angeles';

/**
 * Whether this build shows drafts: only preview builds run with `PUBLIC_SHOW_DRAFTS=true`.
 * Astro inlines `import.meta.env` at build time; `process.env` covers code running outside Vite.
 */
export function showDrafts(): boolean {
  return (import.meta.env?.PUBLIC_SHOW_DRAFTS ?? process.env.PUBLIC_SHOW_DRAFTS) === 'true';
}

/** Unlisted entries are never public; drafts are public only while previewing them. */
export function isPublic(
  item: Pick<StreamItem, 'draft' | 'unlisted'>,
  { showDrafts }: { showDrafts: boolean },
): boolean {
  if (item.unlisted) return false;
  return !item.draft || showDrafts;
}

/** Public items only, newest first; items with equal dates are ordered by `id` ascending. */
export function buildStream(items: StreamItem[], opts: { showDrafts: boolean }): StreamItem[] {
  return items
    .filter((item) => isPublic(item, opts))
    .sort((a, b) => b.date.getTime() - a.date.getTime() || compareIds(a.id, b.id));
}

function compareIds(a: string, b: string): number {
  // Code-unit order rather than localeCompare, so the result never depends on the locale.
  return a < b ? -1 : a > b ? 1 : 0;
}

const monthLabel = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, month: 'long', year: 'numeric' });
const monthParts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, month: '2-digit', year: 'numeric' });

function monthKey(date: Date): string {
  const parts = monthParts.formatToParts(date);
  const part = (type: 'year' | 'month') => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}`;
}

/**
 * Groups items by calendar month in Los Angeles time (the author's time zone), so a late
 * evening post is not pushed into the next month by UTC. Groups and the items inside them
 * keep the order of first appearance, so pass in an already sorted stream.
 */
export function groupByMonth(items: StreamItem[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  for (const item of items) {
    const key = monthKey(item.date);
    let group = groups.get(key);
    if (!group) {
      group = { key, label: monthLabel.format(item.date), items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}
