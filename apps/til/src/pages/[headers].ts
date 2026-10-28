import type { APIRoute, GetStaticPaths } from 'astro';
import { buildHeaders, isNoindexBuild } from '@ac/content';

// Emits Cloudflare's `dist/_headers`. Astro never routes files whose names start with `_`, so a
// `_headers.ts` page would be ignored; the file name comes from this route's only param instead.
export const getStaticPaths = (() => [{ params: { headers: '_headers' } }]) satisfies GetStaticPaths;

export const GET: APIRoute = () => new Response(buildHeaders({ preview: isNoindexBuild() }));
