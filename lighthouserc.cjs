// Lighthouse CI: in every category, on desktop and on mobile, each audited page must score 100 in at
// least one of its 3 runs (see `aggregationMethod`). Lighthouse emulates one form factor per run, so
// `pnpm lighthouse` runs this config once per preset, picked by LIGHTHOUSE_PRESET. Build first
// (`pnpm build`): it audits the built sites.

const BLOG = 'http://127.0.0.1:4510';
const TIL = 'http://127.0.0.1:4511';

const PRESETS = {
  desktop: { preset: 'desktop' },
  // Lighthouse's default: a mid-range phone on a throttled connection.
  mobile: {},
};

const preset = process.env.LIGHTHOUSE_PRESET ?? 'mobile';
if (!(preset in PRESETS)) throw new Error(`LIGHTHOUSE_PRESET must be one of ${Object.keys(PRESETS).join(', ')}`);

const perfect = ['error', { minScore: 1 }];

module.exports = {
  ci: {
    collect: {
      startServerCommand: `node --experimental-strip-types scripts/preview-sites.ts --blog ${new URL(BLOG).port} --til ${new URL(TIL).port}`,
      startServerReadyPattern: 'preview-sites: ready',
      startServerReadyTimeout: 60_000,
      url: [
        `${BLOG}/`,
        `${BLOG}/2022/04/03/pay-transparency/`,
        `${BLOG}/posts/`,
        `${BLOG}/tags/python/`,
        `${BLOG}/resume/`,
        `${TIL}/`,
        `${TIL}/2025-03-01-how-to-automatically-activate-venv-with-direnv/`,
      ],
      numberOfRuns: 3,
      settings: PRESETS[preset],
    },
    assert: {
      // Best of the runs. Simulated metrics are estimated from a real, unthrottled page load, so a
      // run the machine slowed down can score 0.99 on a page that scores 100 in the others; the
      // median or the worst run would fail on that noise. More runs make this gate looser, not
      // stricter: one 100 among them is enough.
      aggregationMethod: 'optimistic',
      assertions: {
        'categories:performance': perfect,
        'categories:accessibility': perfect,
        'categories:best-practices': perfect,
        'categories:seo': perfect,
      },
    },
    // Keeps each preset's reports (HTML, JSON and a manifest of scores) for a look after the run.
    upload: { target: 'filesystem', outputDir: `.lighthouseci/${preset}` },
  },
};
