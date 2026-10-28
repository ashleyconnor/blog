import type { APIRoute, GetStaticPaths } from 'astro';
import { buildRedirects } from '@ac/content';
import { builtItems } from '../lib/stream';

// Emits Cloudflare's `dist/_redirects`. Astro never routes files whose names start with `_`, so a
// `_redirects.ts` page would be ignored; the file name comes from this route's only param instead.
export const getStaticPaths = (() => [{ params: { redirects: '_redirects' } }]) satisfies GetStaticPaths;

export const GET: APIRoute = async () => new Response(buildRedirects(await builtItems()));
