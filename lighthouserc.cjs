// Lighthouse CI: every audited page must score 100 in every category, on desktop and on mobile.
// Lighthouse emulates one form factor per run, so `pnpm lighthouse` runs this config once per
// preset, picked by LIGHTHOUSE_PRESET. Build first (`pnpm build`): it audits the built sites.

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
      settings: PRESETS[preset],
    },
    assert: {
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
