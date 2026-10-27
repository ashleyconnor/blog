import type { APIRoute } from 'astro';
import { feed } from '../lib/feed';
import { publicStream } from '../lib/stream';

// Every public entry, at the URL Jekyll's feed had. TIL items link to the TIL subdomain.
export const GET: APIRoute = async ({ site }) =>
  feed({ title: 'Ashley Connor', path: '/', site, items: await publicStream() });
