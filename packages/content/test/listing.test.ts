import { describe, expect, it } from 'vitest';
import { buildStream, groupByMonth, isPublic, type StreamItem } from '../src/listing';

function item(overrides: Partial<StreamItem> & { id: string }): StreamItem {
  return {
    type: 'post',
    title: overrides.id,
    date: new Date('2025-01-01T12:00:00Z'),
    tags: ['python'],
    href: `/${overrides.id}/`,
    advanced: false,
    draft: false,
    unlisted: false,
    ...overrides,
  };
}

const ids = (items: StreamItem[]) => items.map((i) => i.id);

describe('isPublic', () => {
  it('is false for unlisted items, even when drafts are shown', () => {
    const unlisted = item({ id: 'u', unlisted: true });
    expect(isPublic(unlisted, { showDrafts: false })).toBe(false);
    expect(isPublic(unlisted, { showDrafts: true })).toBe(false);
  });

  it('is false for drafts unless showDrafts is set', () => {
    const draft = item({ id: 'd', draft: true });
    expect(isPublic(draft, { showDrafts: false })).toBe(false);
    expect(isPublic(draft, { showDrafts: true })).toBe(true);
  });

  it('is true for ordinary items', () => {
    expect(isPublic(item({ id: 'p' }), { showDrafts: false })).toBe(true);
  });

  it('is false for an unlisted draft', () => {
    const both = item({ id: 'x', draft: true, unlisted: true });
    expect(isPublic(both, { showDrafts: true })).toBe(false);
  });
});

describe('buildStream', () => {
  it('excludes unlisted and drafts', () => {
    const items = [
      item({ id: 'public', date: new Date('2025-01-01T12:00:00Z') }),
      item({ id: 'unlisted', unlisted: true, date: new Date('2025-02-01T12:00:00Z') }),
      item({ id: 'draft', draft: true, date: new Date('2025-03-01T12:00:00Z') }),
    ];
    expect(ids(buildStream(items, { showDrafts: false }))).toEqual(['public']);
    expect(ids(buildStream(items, { showDrafts: true }))).toEqual(['draft', 'public']);
  });

  it('sorts newest first', () => {
    const items = [
      item({ id: 'a', date: new Date('2022-01-05T12:00:00Z') }),
      item({ id: 'b', date: new Date('2025-04-23T12:00:00Z') }),
      item({ id: 'c', date: new Date('2014-09-07T12:00:00Z') }),
    ];
    expect(ids(buildStream(items, { showDrafts: false }))).toEqual(['b', 'a', 'c']);
  });

  it('breaks date ties by id, ascending, regardless of input order', () => {
    const date = new Date('2025-04-23T12:00:00Z');
    const items = [item({ id: 'b', date }), item({ id: 'c', date }), item({ id: 'a', date })];
    expect(ids(buildStream(items, { showDrafts: false }))).toEqual(['a', 'b', 'c']);
    expect(ids(buildStream([...items].reverse(), { showDrafts: false }))).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate its input', () => {
    const items = [
      item({ id: 'old', date: new Date('2020-01-01T12:00:00Z') }),
      item({ id: 'new', date: new Date('2025-01-01T12:00:00Z') }),
    ];
    buildStream(items, { showDrafts: false });
    expect(ids(items)).toEqual(['old', 'new']);
  });
});

describe('groupByMonth', () => {
  it('uses LA time', () => {
    const groups = groupByMonth([
      item({ id: 'evening', date: new Date('2025-04-24T02:39:00Z') }),
      item({ id: 'boundary', date: new Date('2025-03-01T07:59:00Z') }),
    ]);
    expect(groups.map((g) => [g.key, g.label, ids(g.items)])).toEqual([
      ['2025-04', 'April 2025', ['evening']],
      ['2025-02', 'February 2025', ['boundary']],
    ]);
  });

  it('puts the first instant of a month in that month (PST/PDT boundaries)', () => {
    // 08:00Z on 1 March 2025 is 00:00 PST; 07:00Z on 1 April 2025 is 00:00 PDT.
    const groups = groupByMonth([
      item({ id: 'april', date: new Date('2025-04-01T07:00:00Z') }),
      item({ id: 'march', date: new Date('2025-03-01T08:00:00Z') }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['2025-04', '2025-03']);
  });

  it('keeps items of one month together, preserving input order', () => {
    const groups = groupByMonth([
      item({ id: 'a', date: new Date('2025-04-20T12:00:00Z') }),
      item({ id: 'b', date: new Date('2025-04-10T12:00:00Z') }),
      item({ id: 'c', date: new Date('2025-02-10T12:00:00Z') }),
    ]);
    expect(groups.map((g) => [g.key, ids(g.items)])).toEqual([
      ['2025-04', ['a', 'b']],
      ['2025-02', ['c']],
    ]);
  });

  it('merges a month that reappears later in the input into its first group', () => {
    const groups = groupByMonth([
      item({ id: 'a', date: new Date('2025-04-20T12:00:00Z') }),
      item({ id: 'b', date: new Date('2025-02-10T12:00:00Z') }),
      item({ id: 'c', date: new Date('2025-04-01T12:00:00Z') }),
    ]);
    expect(groups.map((g) => [g.key, ids(g.items)])).toEqual([
      ['2025-04', ['a', 'c']],
      ['2025-02', ['b']],
    ]);
  });

  it('returns no groups for no items', () => {
    expect(groupByMonth([])).toEqual([]);
  });
});
