// One-off migration of the Jekyll site's posts, TILs and privacy page into `content/`.
//
//   node --experimental-strip-types scripts/migrate-jekyll.ts
//
// Reads `_posts/`, `_til/` and `instaboxd/`, writes `content/posts`, `content/til`, `content/pages`
// and the images they use under `content/posts/_images`, and prints a warning for everything it could
// not convert cleanly. The Jekyll sources were deleted at the cutover: to re-run it, check out a commit
// from before the cutover. Re-running overwrites `content/`, including any edits made since.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  convertBody,
  convertFrontMatter,
  convertPageFrontMatter,
  dropboxImagePath,
  finalizeBody,
  findImages,
  localImagePath,
  renderEntry,
  splitFrontMatter,
  type FrontMatter,
} from './lib/convert.ts';

const root = join(import.meta.dirname, '..');
const contentDir = join(root, 'content');
const imagesDir = join(contentDir, 'posts', '_images');

// Tags per entry, from the approved tag proposal. Keyed by file name without the date prefix.
const TAGS: Record<string, string[]> = {
  'the-digital-nomad-and-immigration-law': ['travel', 'career'],
  'deploying-a-phoenix-application-to-dokku': ['elixir', 'devops'],
  'shipping-dokku-logs-with-logspout-to-papertrail': ['devops'],
  'local-rails-development-with-docker-and-docker-compose': ['rails', 'docker'],
  'configuring-ssl-certificates-for-local-development': ['security', 'tools'],
  'deploying-sveltekit-using-cloudflare-workers': ['sveltekit', 'cloudflare'],
  'authenticated-server-rendered-pages-with-sveltekit-and-supabase': ['sveltekit', 'security'],
  'to-london-and-back-my-worst-tech-interview': ['career'],
  'pay-transparency': ['career'],
  'pythons-async-gap-why-the-standard-library-needs-a-run-sync': ['python'],
  'how-to-run-a-shell-script-over-images-with-automator': ['macos', 'tools'],
  'how-to-remove-self-control': ['macos'],
  'about-elixir-pattern-matching-in-anon-functions': ['elixir'],
  'how-to-strip-drm-from-audible-audiobooks': ['tools', 'python'],
  'how-to-automatically-activate-venv-with-direnv': ['python', 'tools'],
};

const sitemapPaths: string[] = (
  JSON.parse(readFileSync(join(import.meta.dirname, 'legacy-sitemap.json'), 'utf8')) as string[]
).map((url) => new URL(url).pathname);

const warnings: string[] = [];
const copiedImages = new Set<string>();
let downloadedImages = 0;

function warn(file: string, message: string) {
  warnings.push(`${file}: ${message}`);
}

function exactlyOne(candidates: string[], what: string): string {
  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one live sitemap URL for ${what}, found ${candidates.length}: ${candidates.join(', ')}`,
    );
  }
  return candidates[0]!;
}

/** Posts are matched to the live sitemap by slug, because the live URL's date can differ (Jekyll used UTC). */
function postLiveUrl(slug: string): string {
  return exactlyOne(
    sitemapPaths.filter(
      (p) => /^\/\d{4}\/\d{2}\/\d{2}\/[^/]+\.html$/.test(p) && p.endsWith(`/${slug}.html`),
    ),
    `post "${slug}"`,
  );
}

function tilLiveUrl(id: string): string {
  return exactlyOne(
    sitemapPaths.filter((p) => p === `/til/${id}`),
    `TIL "${id}"`,
  );
}

/** Downloads a Dropbox image; null if it is gone. */
async function downloadImage(url: string): Promise<Uint8Array | null> {
  try {
    const target = new URL(url);
    target.searchParams.set('dl', '1');
    const response = await fetch(target, { signal: AbortSignal.timeout(20_000) });
    if (response.status !== 200) return null;
    // Dead share links answer 200 with an HTML error page, so the status alone proves nothing.
    if (!response.headers.get('content-type')?.startsWith('image/')) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function writeFile(path: string, data: string | Uint8Array) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

interface Migration {
  /** File name of the Jekyll source, used in warnings. */
  file: string;
  /** Destination directory and file stem (no extension). */
  outDir: string;
  stem: string;
  /** Path from the output file to the shared images folder. */
  imageBase: string;
  source: string;
  frontMatter: (data: FrontMatter, onWarn: (message: string) => void) => FrontMatter;
}

async function migrate({ file, outDir, stem, imageBase, source, frontMatter }: Migration) {
  const { data, body } = splitFrontMatter(readFileSync(source, 'utf8'));
  const onWarn = (message: string) => warn(file, message);
  const front = frontMatter(data, onWarn);

  const images = findImages(body);
  for (const asset of images.localImages) {
    const from = join(root, asset);
    if (!existsSync(from)) {
      onWarn(`local image missing: ${asset}`);
      continue;
    }
    const to = join(imagesDir, localImagePath(asset));
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    copiedImages.add(to);
  }

  const dropboxImages = new Map<string, string>();
  for (const url of images.dropboxImages) {
    const image = await downloadImage(url);
    if (!image) continue; // convertBody keeps the URL and reports it
    const path = dropboxImagePath(url);
    writeFile(join(imagesDir, path), image);
    dropboxImages.set(url, path);
    downloadedImages++;
  }

  const converted = convertBody(body, { imageBase, dropboxImages });
  for (const message of converted.warnings) onWarn(message);
  const { body: finalBody, extension } = finalizeBody(converted.body);

  // A re-run may flip an entry between .md and .mdx; make sure only one of them is left.
  rmSync(join(outDir, `${stem}${extension === '.md' ? '.mdx' : '.md'}`), { force: true });
  writeFile(join(outDir, `${stem}${extension}`), renderEntry(front, finalBody));
  return extension;
}

function markdownFiles(dir: string): string[] {
  return readdirSync(join(root, dir))
    .filter((name) => name.endsWith('.md'))
    .sort();
}

async function main() {
  const used = new Set<string>();
  const slugOf = (file: string) => file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
  const tagsFor = (file: string) => {
    const slug = slugOf(file);
    const tags = TAGS[slug];
    if (!tags) throw new Error(`No tags configured for ${file}`);
    used.add(slug);
    return tags;
  };

  const postFiles = markdownFiles('_posts');
  for (const file of postFiles) {
    await migrate({
      file,
      outDir: join(contentDir, 'posts'),
      stem: file.replace(/\.md$/, ''),
      imageBase: './_images/',
      source: join(root, '_posts', file),
      frontMatter: (data, onWarn) =>
        convertFrontMatter(data, {
          file,
          liveUrl: postLiveUrl(slugOf(file)),
          tags: tagsFor(file),
          warn: onWarn,
        }),
    });
  }

  const tilFiles = markdownFiles('_til');
  for (const file of tilFiles) {
    await migrate({
      file,
      outDir: join(contentDir, 'til'),
      stem: file.replace(/\.md$/, ''),
      imageBase: '../posts/_images/',
      source: join(root, '_til', file),
      frontMatter: (data, onWarn) =>
        convertFrontMatter(data, {
          file,
          liveUrl: tilLiveUrl(file.replace(/\.md$/, '')),
          tags: tagsFor(file),
          warn: onWarn,
        }),
    });
  }

  await migrate({
    file: 'instaboxd/privacy.md',
    outDir: join(contentDir, 'pages'),
    stem: 'instaboxd-privacy',
    imageBase: '../posts/_images/',
    source: join(root, 'instaboxd', 'privacy.md'),
    frontMatter: (data) => convertPageFrontMatter(data),
  });

  const unused = Object.keys(TAGS).filter((slug) => !used.has(slug));
  if (unused.length)
    throw new Error(`Tags configured for files that were not found: ${unused.join(', ')}`);

  console.log(
    `Migrated ${postFiles.length} posts, ${tilFiles.length} TILs and 1 page ` +
      `(${copiedImages.size} images copied, ${downloadedImages} downloaded from Dropbox).`,
  );
  console.log('Skipped _til/index.html (replaced by the TIL app index).');
  console.log(
    `${warnings.length} warning${warnings.length === 1 ? '' : 's'}${warnings.length ? ':' : '.'}`,
  );
  for (const message of warnings) console.log(`  - ${message}`);
}

await main();
