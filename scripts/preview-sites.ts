/**
 * Serves both built sites with `astro preview` until stopped:
 * `node scripts/preview-sites.ts --blog <port> --til <port>`. Lighthouse CI starts it (see
 * `lighthouserc.cjs`) and waits for the "ready" line, which is printed only once both answer.
 */
import { parseArgs } from 'node:util';
import { type Preview, startPreview } from './lib/preview.ts';

const { values } = parseArgs({ options: { blog: { type: 'string' }, til: { type: 'string' } } });
if (!values.blog || !values.til) throw new Error('Usage: preview-sites.ts --blog <port> --til <port>');

const previews: Preview[] = [];
const stopAll = () => Promise.all(previews.map((preview) => preview.stop()));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void stopAll().then(() => process.exit(0)));
}

try {
  previews.push(await startPreview('blog', Number(values.blog)));
  previews.push(await startPreview('til', Number(values.til)));
} catch (error) {
  await stopAll();
  throw error;
}
console.log(`preview-sites: ready (blog ${previews[0]!.origin}/, til ${previews[1]!.origin}/)`);
