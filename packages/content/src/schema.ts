import { z } from 'astro/zod';
import { loadTags } from './tags';

// Tags are checked against tags.yml at validation time (not import time), so
// CONTENT_ROOT can point at a different tag list and edits are picked up.
const tag = z.string().superRefine((slug, ctx) => {
  const tags = loadTags();
  if (!tags.has(slug)) {
    ctx.addIssue({
      code: 'custom',
      message: `Unknown tag "${slug}". Known tags: ${[...tags.keys()].join(', ')}`,
    });
  }
});

const frontMatter = {
  title: z.string().min(1),
  date: z.coerce.date(),
  tags: z.array(tag).min(1, 'At least one tag is required'),
  excerpt: z.string().optional(),
  draft: z.boolean().default(false),
  unlisted: z.boolean().default(false),
  updated: z.coerce.date().optional(),
  legacyUrls: z.array(z.string()).optional(),
};

export const postSchema = z.object(frontMatter);

export const tilSchema = z.object(frontMatter);

/**
 * Photos need Astro's `image()` helper to turn `src` into image metadata, so this is a
 * factory taking the schema context: `schema: ({ image }) => photosSchema({ image })`.
 */
export function photosSchema<Src extends z.ZodType>({ image }: { image: () => Src }) {
  return z.object({
    ...frontMatter,
    images: z
      .array(
        z.object({
          src: image(),
          alt: z.string().min(1, 'Alt text is required for every image'),
          caption: z.string().optional(),
        }),
      )
      .min(1, 'At least one image is required'),
  });
}
