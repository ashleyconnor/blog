/**
 * Prints the built resume page to `apps/blog/dist/resume.pdf`. The blog's `build` script runs this
 * after `astro build`: it serves `dist/` with `astro preview` on a free port, prints `/resume/`
 * with Playwright's Chromium (so the print styles apply), then stops the server. For a build made
 * with `astro build --outDir <dir>`, pass the same `--outDir <dir>` to print from and into it.
 */
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { freePort, startPreview } from './lib/preview.ts';

const { outDir } = parseArgs({ options: { outDir: { type: 'string' } } }).values;
const distDir = outDir ? resolve(outDir) : join(import.meta.dirname, '../apps/blog/dist');
const output = join(distDir, 'resume.pdf');

const preview = await startPreview('blog', await freePort(), { outDir: distDir, readyPath: '/resume/' });
try {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${preview.origin}/resume/`, { waitUntil: 'networkidle' });
    // Print only once the web fonts have loaded, or the PDF falls back to system fonts.
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.pdf({ path: output, format: 'A4', printBackground: true });
  } finally {
    await browser.close();
  }
} finally {
  await preview.stop();
}

console.log(`resume-pdf: wrote ${relative(process.cwd(), output)}`);
