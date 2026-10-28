// Lighthouse CI: in every category, on desktop and on mobile, each audited page must score 100 in at
// least one of its 3 runs (see `aggregationMethod`). Lighthouse emulates one form factor per run, so
// `pnpm lighthouse` runs this config once per preset, picked by LIGHTHOUSE_PRESET. Build first
// (`pnpm build`): it audits the built sites.
//
// Remote mode: with LHCI_BLOG_URL and LHCI_TIL_URL set (the PR previews job sets them to the preview
// URLs), it audits those origins instead and starts no server.

const remoteBlog = process.env.LHCI_BLOG_URL;
const remoteTil = process.env.LHCI_TIL_URL;
const remote = Boolean(remoteBlog || remoteTil);
if (remote && !(remoteBlog && remoteTil)) throw new Error('Set both LHCI_BLOG_URL and LHCI_TIL_URL, or neither');

const LOCAL_BLOG = 'http://127.0.0.1:4510';
const LOCAL_TIL = 'http://127.0.0.1:4511';
const BLOG = remote ? new URL(remoteBlog).origin : LOCAL_BLOG;
const TIL = remote ? new URL(remoteTil).origin : LOCAL_TIL;

const PRESETS = {
  desktop: { preset: 'desktop' },
  // Lighthouse's default: a mid-range phone on a throttled connection.
  mobile: {},
};

const preset = process.env.LIGHTHOUSE_PRESET ?? 'mobile';
if (!(preset in PRESETS)) throw new Error(`LIGHTHOUSE_PRESET must be one of ${Object.keys(PRESETS).join(', ')}`);

const perfect = ['error', { minScore: 1 }];

const localServer = {
  startServerCommand: `node --experimental-strip-types scripts/preview-sites.ts --blog ${new URL(LOCAL_BLOG).port} --til ${new URL(LOCAL_TIL).port}`,
  startServerReadyPattern: 'preview-sites: ready',
  startServerReadyTimeout: 60_000,
};

module.exports = {
  ci: {
    collect: {
      ...(remote ? {} : localServer),
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
      // Previews send `X-Robots-Tag: noindex` on purpose, which fails the SEO crawlability audit, so
      // remote mode skips that one audit; production builds keep it.
      settings: remote ? { ...PRESETS[preset], skipAudits: ['is-crawlable'] } : PRESETS[preset],
    },
    assert: {
      // Best of the runs. Simulated metrics are estimated from a real, unthrottled page load, so a
      // run the machine slowed down can score 0.99 on a page that scores 100 in the others; the
      // median or the worst run would fail on that noise. More runs make this gate looser, not
      // stricter: one 100 among them is enough.
      aggregationMethod: 'optimistic',
      assertions: {
        // Previews on mobile score 0.99: the simulated slow-4G connection pays HTTPS setup round trips
        // that a local http server does not, ahead of four preloaded fonts. Accepted for now
        // (Ashley, 2026-10-27); trimming the font preloads is the follow-up to get back to 100.
        'categories:performance': remote && preset === 'mobile' ? ['error', { minScore: 0.99 }] : perfect,
        'categories:accessibility': perfect,
        'categories:best-practices': perfect,
        'categories:seo': perfect,
      },
    },
    // Keeps each preset's reports (HTML, JSON and a manifest of scores) for a look after the run.
    upload: { target: 'filesystem', outputDir: `.lighthouseci/${preset}` },
  },
};
