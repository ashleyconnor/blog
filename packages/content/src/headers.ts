/** Hashed build output: a changed file gets a new name, so a cached copy never goes stale. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

const SECURITY_HEADERS = [
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'Permissions-Policy: camera=(), microphone=(), geolocation=()',
  'X-Frame-Options: DENY',
];

/**
 * A site's Cloudflare `_headers` file. Cloudflare applies every rule whose path matches, so `/_astro/*`
 * files get both rules. A preview build adds `X-Robots-Tag: noindex` to every response, so search
 * engines never index a PR preview. Production sends it only on `/404`, where Workers serves the 404 page
 * with status 200 (`/404.html` redirects there), so that page never gets indexed either.
 */
export function buildHeaders({ preview }: { preview: boolean }): string {
  const all = preview ? [...SECURITY_HEADERS, 'X-Robots-Tag: noindex'] : SECURITY_HEADERS;
  const rule = (path: string, headers: string[]) => [path, ...headers.map((header) => `  ${header}`)].join('\n');
  const rules = [rule('/_astro/*', [`Cache-Control: ${IMMUTABLE}`]), rule('/*', all)];
  if (!preview) rules.push(rule('/404', ['X-Robots-Tag: noindex']));
  return rules.join('\n\n') + '\n';
}
