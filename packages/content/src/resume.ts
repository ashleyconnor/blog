import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'astro/zod';
import { parse } from 'yaml';
import { contentRoot } from './tags';

const text = z.string().min(1);

// Dates are display strings exactly as written on the resume ("July 2021", "Aug 2012"), not
// parsed dates: the page shows them verbatim. A role without `end` is current ("Present").
const role = z.strictObject({
  company: text,
  role: text,
  location: text,
  start: text,
  end: text.optional(),
  bullets: z.array(text).default([]),
  /** Technologies shown as chips under the role. */
  tech: z.array(text).default([]),
});

const school = z.strictObject({
  institution: text,
  degree: text,
  location: text,
  start: text,
  end: text.optional(),
});

/** `content/resume.yml`. Strict, like the front-matter schemas, so a misspelt key fails the build. */
export const resumeSchema = z.strictObject({
  name: text,
  headline: text.optional(),
  location: text,
  links: z.array(z.strictObject({ label: text, href: z.url() })).default([]),
  summary: text.optional(),
  experience: z.array(role).min(1, 'At least one role is required'),
  education: z.array(school).default([]),
  skills: z.array(text).default([]),
});

export type Resume = z.output<typeof resumeSchema>;

/** Parses and validates the text of a `resume.yml`. `source` only labels error messages. */
export function parseResume(yaml: string, source: string): Resume {
  const parsed = resumeSchema.safeParse(parse(yaml));
  if (!parsed.success) {
    throw new Error(`Invalid resume in ${source}:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** Loads `<contentRoot>/resume.yml`, or an explicit path. */
export function loadResume(path: string = join(contentRoot(), 'resume.yml')): Resume {
  return parseResume(readFileSync(path, 'utf8'), path);
}
