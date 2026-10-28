import type { APIRoute } from 'astro';
import { feed } from '../../lib/feed';
import { publicStream } from '../../lib/stream';

export const GET: APIRoute = async ({ site }) =>
  feed({
    title: 'Posts · Ashley Connor',
    path: '/posts/',
    site,
    items: (await publicStream()).filter((item) => item.type === 'post'),
  });
