/**
 * Every live URL the Jekyll site served on the blog's domain, as absolute URLs: the tests (simulated
 * `_redirects` and real `wrangler dev`) and the deploy checks walk the same list.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const BLOG_ORIGIN = 'https://www.ashleyconnor.co.uk';

/** Every URL the Jekyll site's sitemap listed (all on the blog's domain). */
export function legacySitemapUrls(): string[] {
  return JSON.parse(readFileSync(join(import.meta.dirname, '../legacy-sitemap.json'), 'utf8'));
}

/**
 * Every file under Jekyll's `assets/images/` (paths relative to it). They are live URLs the sitemap
 * never listed: `global/og_banner.png` was every page's `og:image`, and posts and TILs embedded the
 * screenshots. The blog serves metadata-stripped copies at the same paths (`scripts/legacy-assets.ts`).
 */
export const LEGACY_IMAGES = [
  'Screenshot 2021-06-07 155944.png',
  'WIN10_install_ROOT_CA.png',
  'WSL2/certificates_manager.png',
  'WSL2/chrome_ssl_success.png',
  'WSL2/edge_ssl_success.png',
  'WSL2/firefox_cert_settings.png',
  'WSL2/firefox_ssl_success.png',
  'WSL2/mkcert_firefox_certificate_manager.png',
  'WSL2/windows_10_install_root_ca.png',
  'automator/after.png',
  'automator/before.png',
  'automator/context_menu.png',
  'automator/quick_action.png',
  'automator/workflow.png',
  'avatar.jpg',
  'cloudflare-workers/account_id.png',
  'cloudflare-workers/workers_menu_item.png',
  'docker/docker_exposed.png',
  'docker/new_controller.png',
  'docker/new_controller_random_port.png',
  'favicon.ico',
  'global/og_banner.png',
  'tweets/talk_pay_tweet.png',
];

/**
 * Live URLs on the blog's domain that the sitemap snapshot leaves out: the Jekyll nav's `/til` link
 * (no trailing slash), `/til/`, jekyll-sitemap's `/sitemap.xml`, and the legacy images.
 */
export const EXTRA_URLS = ['/til', '/til/', '/sitemap.xml', ...LEGACY_IMAGES.map((path) => `/assets/images/${path}`)].map(
  (path) => new URL(path, BLOG_ORIGIN).href,
);

/** The sitemap snapshot plus the extra URLs: every legacy URL that must keep resolving. */
export function legacyUrls(): string[] {
  return [...legacySitemapUrls(), ...EXTRA_URLS];
}

/**
 * Legacy URLs that must be served as they are, with a 200 and no redirect: pages the new site builds
 * at the exact same path (an app's privacy policy links to `/instaboxd/privacy/`).
 */
export const DIRECT_URLS: ReadonlySet<string> = new Set(['/instaboxd/privacy/'].map((path) => new URL(path, BLOG_ORIGIN).href));
