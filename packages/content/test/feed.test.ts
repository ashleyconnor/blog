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
    expect(item).not.toHaveProperty('content');
  });

  it('drops scripts from the full content (code-block copy buttons do nothing in a feed reader)', () => {
    const html = '<pre>x</pre><script type="module">copy()</script><p>after</p>';
    const item = feedItem({ ...postItem({ id: '2025-04-23-basic-post', data }), html }, 'https://www.ashleyconnor.co.uk');
    expect(item.content).toBe('<pre>x</pre><p>after</p>');
  });

  it('carries the rendered post as full content, with site-relative links and images made absolute', () => {
    const html =
      '<p><a href="/2022/04/03/pay-transparency/">a post</a>, <a href="#why">a heading</a>, ' +
      '<a href="https://example.com/x">elsewhere</a></p><img src="/_astro/shot.webp" alt="A shot">';
    const item = feedItem({ ...postItem({ id: '2025-04-23-basic-post', data }), html }, 'https://www.ashleyconnor.co.uk');
    expect(item.content).toBe(
      '<p><a href="https://www.ashleyconnor.co.uk/2022/04/03/pay-transparency/">a post</a>, <a href="#why">a heading</a>, ' +
        '<a href="https://example.com/x">elsewhere</a></p><img src="https://www.ashleyconnor.co.uk/_astro/shot.webp" alt="A shot">',
    );
  });
});
