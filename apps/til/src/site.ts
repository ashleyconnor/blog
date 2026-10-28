/** The TIL site's own description: the index's, and any entry's without an excerpt. */
export const TIL_DESCRIPTION = "Short notes on things I've learned.";

/** The blog, which owns the tag pages. */
export const BLOG_ORIGIN = 'https://www.ashleyconnor.co.uk';

/** The site-relative URL of a TIL: its entry id, e.g. `/2022-12-01-about-elixir-pattern-matching-in-anon-functions/`. */
export function tilPath(id: string): string {
  return `/${id}/`;
}
