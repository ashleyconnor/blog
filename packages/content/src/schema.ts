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

// `z.coerce.date()` alone turns a blank `date:` (YAML null) into 1970-01-01, so only strings
// and Dates may reach it. Invalid strings still fail: coerce.date rejects an Invalid Date.
const dateInput = z.union([z.string(), z.date()]).pipe(z.coerce.date());

// Objects are strict so a typo such as `unlised: true` fails the build instead of being
// silently dropped (which would publish an entry meant to stay unlisted).
const frontMatter = {
  title: z.string().min(1),
  date: dateInput,
  tags: z.array(tag).min(1, 'At least one tag is required'),
  excerpt: z.string().optional(),
  draft: z.boolean().default(false),
  unlisted: z.boolean().default(false),
  updated: dateInput.optional(),
  legacyUrls: z.array(z.string()).optional(),
};

export const postSchema = z.strictObject(frontMatter);

export const tilSchema = z.strictObject(frontMatter);

/**
 * Photos need Astro's `image()` helper to turn `src` into image metadata, so this is a
 * factory taking the schema context: `schema: ({ image }) => photosSchema({ image })`.
 */
export function photosSchema<Src extends z.ZodType>({ image }: { image: () => Src }) {
  return z.strictObject({
    ...frontMatter,
    images: z
      .array(
        z.strictObject({
          src: image(),
          alt: z.string().min(1, 'Alt text is required for every image'),
          caption: z.string().optional(),
        }),
      )
      .min(1, 'At least one image is required'),
  });
}

/** Standalone pages (`pages/*.md`, e.g. the InstaBoxd privacy policy): a title and a body. */
export const pageSchema = z.strictObject({ title: z.string().min(1) });
