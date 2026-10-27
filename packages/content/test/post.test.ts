import { describe, expect, it } from 'vitest';
import { formatDate, postParams, postPath, postSlug, readingMinutes } from '../src/post';

describe('postSlug', () => {
  it('strips a leading YYYY-MM-DD- from the entry id', () => {
    expect(postSlug('2025-04-23-pythons-async-gap')).toBe('pythons-async-gap');
  });

  it('leaves ids without a date prefix alone', () => {
    expect(postSlug('basic-post')).toBe('basic-post');
  });

  it('only strips a prefix at the start', () => {
    expect(postSlug('year-2025-04-23-recap')).toBe('year-2025-04-23-recap');
  });
});

describe('postPath', () => {
  it('uses the Los Angeles calendar date, not the UTC one', () => {
    // 19:39 Pacific is 02:39 UTC the next day.
    const entry = { id: '2025-04-23-a-post', data: { date: new Date('2025-04-23T19:39:00-07:00') } };
    expect(postPath(entry)).toBe('/2025/04/23/a-post/');
  });

  it('zero-pads month and day', () => {
    const entry = { id: 'short', data: { date: new Date('2022-01-05T12:00:00-08:00') } };
    expect(postPath(entry)).toBe('/2022/01/05/short/');
  });

  it('rolls back across a month boundary in LA time', () => {
    // 2025-03-01 07:59 UTC is still 23:59 on 28 Feb in Los Angeles.
    const entry = { id: 'edge', data: { date: new Date('2025-03-01T07:59:00Z') } };
    expect(postPath(entry)).toBe('/2025/02/28/edge/');
  });
});

describe('postParams', () => {
  it('splits the Los Angeles date and slug into route params', () => {
    const entry = { id: '2025-04-23-a-post', data: { date: new Date('2025-04-24T02:39:00Z') } };
    expect(postParams(entry)).toEqual({ year: '2025', month: '04', day: '23', slug: 'a-post' });
  });
});

describe('formatDate', () => {
  it('formats as "D Mon YYYY" in Los Angeles time', () => {
    expect(formatDate(new Date('2025-04-24T02:39:00Z'))).toBe('23 Apr 2025');
  });

  it('uses the three-letter month for September', () => {
    expect(formatDate(new Date('2014-09-07T12:00:00-07:00'))).toBe('7 Sep 2014');
  });
});

describe('readingMinutes', () => {
  const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');

  it('rounds words / 200 to the nearest minute', () => {
    expect(readingMinutes(words(1000))).toBe(5);
    expect(readingMinutes(words(1500))).toBe(8);
  });

  it('is never less than one minute', () => {
    expect(readingMinutes('')).toBe(1);
    expect(readingMinutes(words(20))).toBe(1);
  });

  it('ignores MDX imports and JSX tags', () => {
    const body = `import Callout from '@ac/ui/components/Callout.astro';\n\n<Callout type="warning">\n${words(400)}\n</Callout>`;
    expect(readingMinutes(body)).toBe(2);
  });

  it('counts the words inside code blocks', () => {
    const body = `${words(200)}\n\n\`\`\`py\n${words(200)}\n\`\`\`\n`;
    expect(readingMinutes(body)).toBe(2);
  });
});
