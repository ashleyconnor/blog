/**
 * Copies Jekyll's `assets/images/` to `apps/blog/public/assets/images/`, keeping every path (spaces
 * included), so the old image URLs keep working after the cutover: `global/og_banner.png` was every
 * page's `og:image`, and posts and TILs embedded the screenshots. The migrated content imports its
 * own optimised copies; these only serve the old URLs.
 *
 * Raster images are re-encoded by sharp, which writes no metadata unless asked to (no EXIF, GPS, XMP,
 * IPTC or ICC profile; colours are converted to sRGB). EXIF orientation is applied first, so a rotated
 * photo stays upright without it. SVG and ICO files carry no EXIF and are copied as they are. Run once
 * from the repository root; the copies are committed:
 *
 *   node --experimental-strip-types scripts/legacy-assets.ts
 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import sharp from 'sharp';

const root = join(import.meta.dirname, '..');
const from = join(root, 'assets/images');
const to = join(root, 'apps/blog/public/assets/images');

const AS_IS = new Set(['.svg', '.ico']);
const RASTER = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);

const files = readdirSync(from, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => relative(from, join(entry.parentPath, entry.name)))
  .sort();

for (const file of files) {
  const source = join(from, file);
  const target = join(to, file);
  const ext = extname(file).toLowerCase();
  mkdirSync(dirname(target), { recursive: true });
  if (AS_IS.has(ext)) {
    copyFileSync(source, target);
  } else if (RASTER.has(ext)) {
    const image = sharp(source).rotate();
    if (ext === '.png') image.png({ compressionLevel: 9 });
    else if (ext === '.jpg' || ext === '.jpeg') image.jpeg({ quality: 90, mozjpeg: true });
    await image.toFile(target);
  } else {
    throw new Error(`${file}: not a raster image sharp can strip, nor an SVG or ICO to copy as it is`);
  }
  console.log(`legacy-assets: ${relative(root, target)}`);
}
