import { describe, expect, it } from 'vitest';
import { feedItem } from '../src/feed';
import { postItem, tilItem } from '../src/items';

const data = {
  title: 'A title',
  date: new Date('2025-04-24T02:39:00Z'),
  tags: ['python', 'tools'],
  excerpt: 'A **bold** start',
  draft: false,
  unlisted: false,
};

describe('feedItem', () => {
  it('maps a stream item to an RSS item: link, date, plain-text excerpt and tags', () => {
    expect(feedItem(postItem({ id: '2025-04-23-basic-post', data }))).toEqual({
      title: 'A title',
      link: '/2025/04/23/basic-post/',
      pubDate: new Date('2025-04-24T02:39:00Z'),
      description: 'A bold start',
      categories: ['python', 'tools'],
    });
  });

  it('keeps absolute TIL links and leaves out a missing excerpt', () => {
    const item = feedItem(tilItem({ id: '2022-12-01-elixir', data: { ...data, excerpt: undefined } }));
    expect(item.link).toBe('https://til.ashleyconnor.co.uk/2022-12-01-elixir/');
    expect(item.description).toBeUndefined();
  });
});
