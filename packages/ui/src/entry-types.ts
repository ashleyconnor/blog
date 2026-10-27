import type { EntryType } from '@ac/content';

/**
 * Label and accent colour per content type. The Tailwind class names are spelled out in full
 * so the `@source` scan of this package picks them up.
 */
export const entryTypes = {
  post: { label: 'Post', text: 'text-post' },
  til: { label: 'TIL', text: 'text-til' },
  photos: { label: 'Photos', text: 'text-photo' },
} as const satisfies Record<EntryType, { label: string; text: string }>;
