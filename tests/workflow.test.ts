/**
 * The GitHub Actions workflow, checked structurally (nothing here talks to GitHub or Cloudflare), and
 * the Lighthouse config's remote mode, which the PR previews job uses to audit the deployed previews.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = join(import.meta.dirname, '..');
const workflowPath = join(root, '.github/workflows/site.yml');

interface Step {
  name?: string;
  id?: string;
  if?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}
interface Job {
  if?: string;
  needs?: string | string[];
  permissions?: Record<string, string>;
  steps: Step[];
}
interface Workflow {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  concurrency: { group: string; 'cancel-in-progress': unknown };
  jobs: Record<string, Job>;
}

const workflow = (): Workflow => parse(readFileSync(workflowPath, 'utf8')) as Workflow;
const job = (name: string): Job => {
  const found = workflow().jobs[name];
  if (!found) throw new Error(`no job ${name}`);
  return found;
};
const allSteps = (): Step[] => Object.values(workflow().jobs).flatMap((j) => j.steps);
/** The `if:` with whitespace collapsed, for substring checks. */
const condition = (name: string): string => (job(name).if ?? '').replace(/\s+/g, ' ');

const NOT_CLOSED = "github.event.action != 'closed'";
const CLOSED = "github.event.action == 'closed'";
const SAME_REPO = 'github.event.pull_request.head.repo.full_name == github.repository';

describe('site workflow', () => {
  it('exists', () => {
    expect(existsSync(workflowPath)).toBe(true);
  });

  it('runs on PR open, push, reopen and close, pushes to main, and by hand', () => {
    const { on } = workflow();
    expect(on.pull_request).toEqual({ types: ['opened', 'synchronize', 'reopened', 'closed'] });
    expect(on.push).toEqual({ branches: ['main'] });
    expect(on).toHaveProperty('workflow_dispatch');
  });

  it('reads contents only by default and cancels superseded PR runs', () => {
    const wf = workflow();
    expect(wf.permissions).toEqual({ contents: 'read' });
    expect(wf.concurrency.group).toContain('github.event.pull_request.number');
    expect(wf.concurrency.group).toContain('github.ref');
    expect(String(wf.concurrency['cancel-in-progress'])).toContain("github.event_name == 'pull_request'");
  });

  it('has the four jobs', () => {
    expect(Object.keys(workflow().jobs).sort()).toEqual(['checks', 'cleanup', 'deploy', 'preview']);
  });

  it('checks on every event but a PR closing: install, browser, test, check, build', () => {
    expect(condition('checks')).toBe(NOT_CLOSED);
    const runs = job('checks').steps.flatMap((s) => (s.run ? [s.run.trim()] : []));
    expect(runs).toEqual([
      'pnpm install --frozen-lockfile',
      'pnpm exec playwright install --with-deps chromium-headless-shell',
      'pnpm test',
      'pnpm check',
      'pnpm build',
    ]);
    const node = job('checks').steps.find((s) => s.uses?.startsWith('actions/setup-node@'));
    expect(node?.with?.['node-version-file']).toBe('.nvmrc');
  });

  it('previews only same-repo PRs that are not closing, after the checks, and may comment', () => {
    const preview = job('preview');
    expect(condition('preview')).toContain("github.event_name == 'pull_request'");
    expect(condition('preview')).toContain(NOT_CLOSED);
    expect(condition('preview')).toContain(SAME_REPO);
    expect(preview.needs).toBe('checks');
    expect(preview.permissions).toMatchObject({ 'pull-requests': 'write' });
  });

  it('cleans up only same-repo PRs that are closing', () => {
    expect(condition('cleanup')).toContain("github.event_name == 'pull_request'");
    expect(condition('cleanup')).toContain(CLOSED);
    expect(condition('cleanup')).toContain(SAME_REPO);
    expect(job('cleanup').permissions).toMatchObject({ 'pull-requests': 'write' });
  });

  it('deploys only on a push to main, after the checks', () => {
    expect(condition('deploy')).toBe("github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(job('deploy').needs).toBe('checks');
  });

  it('pins every action to a full commit SHA', () => {
    const uses = allSteps().flatMap((s) => (s.uses ? [s.uses] : []));
    expect(uses.length).toBeGreaterThan(0);
    for (const use of uses) expect(use).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
  });

  it('never puts a secret in a run script: secrets reach scripts through env only', () => {
    for (const step of allSteps()) expect(step.run ?? '').not.toContain('secrets.');
  });

  describe.each(['preview', 'cleanup', 'deploy'])('%s', (name) => {
    it('checks for the Cloudflare secrets first and skips with a notice without them', () => {
      const [first, ...rest] = job(name).steps;
      expect(first?.id).toBe('secrets');
      expect(first?.env?.TOKEN).toBe('${{ secrets.CLOUDFLARE_API_TOKEN }}');
      expect(first?.run).toContain('[ -z "$TOKEN" ]');
      expect(first?.run).toContain('::notice');
      expect(first?.run).not.toMatch(/echo[^\n]*\$TOKEN/);
      // Editing the PR comment needs only `github.token`, so cleanup does it with or without the secrets.
      const gated = rest.filter((s) => !(name === 'cleanup' && s.run?.includes('<!-- site-previews -->')));
      for (const step of gated) expect(step.if).toContain("steps.secrets.outputs.ready == 'true'");
    });

    it('passes the Cloudflare credentials to wrangler and nowhere else', () => {
      for (const step of job(name).steps.slice(1)) {
        const hasToken = step.env?.CLOUDFLARE_API_TOKEN !== undefined;
        expect(hasToken, step.name).toBe(Boolean(step.run?.includes('wrangler')));
      }
    });
  });

  it('builds the previews with drafts shown and noindex', () => {
    const build = job('preview').steps.find((s) => s.run?.trim() === 'pnpm build');
    expect(build?.env).toMatchObject({ PUBLIC_SHOW_DRAFTS: 'true', PREVIEW: 'true' });
  });

  it('builds production with neither preview flag', () => {
    const build = job('deploy').steps.find((s) => s.run?.trim() === 'pnpm build');
    expect(build).toBeDefined();
    expect(build?.env ?? {}).not.toHaveProperty('PUBLIC_SHOW_DRAFTS');
    expect(build?.env ?? {}).not.toHaveProperty('PREVIEW');
  });

  it('uploads a pr-<n> preview of each app and reads its first URL from the JSON', () => {
    const upload = job('preview').steps.find((s) => s.run?.includes('wrangler preview'));
    expect(upload?.run).toContain('for app in blog til');
    expect(upload?.run).toContain('cd "apps/$app"');
    expect(upload?.run).toContain('pnpm exec wrangler preview --name "pr-$PR" --json');
    expect(upload?.run).toContain('.preview.urls[0]');
    expect(upload?.env?.PR).toBe('${{ github.event.pull_request.number }}');
  });

  it('upserts one marked comment with both URLs and the commit', () => {
    const comment = job('preview').steps.find((s) => s.run?.includes('<!-- site-previews -->'));
    expect(comment?.env).toMatchObject({
      BLOG_URL: '${{ steps.upload.outputs.blog }}',
      TIL_URL: '${{ steps.upload.outputs.til }}',
      SHA: '${{ github.event.pull_request.head.sha }}',
    });
    expect(comment?.run).toContain('$BLOG_URL');
    expect(comment?.run).toContain('$TIL_URL');
    expect(comment?.run).toContain('$SHA');
    expect(comment?.run).toContain('-X PATCH');
  });

  it('audits the previews with Lighthouse in remote mode', () => {
    const { steps } = job('preview');
    const at = steps.findIndex((s) => s.run?.trim() === 'pnpm lighthouse');
    expect(steps[at]?.env).toEqual({
      LHCI_BLOG_URL: '${{ steps.upload.outputs.blog }}',
      LHCI_TIL_URL: '${{ steps.upload.outputs.til }}',
    });
    // After the comment, so a failing score still leaves the URLs on the PR.
    expect(at).toBeGreaterThan(steps.findIndex((s) => s.run?.includes('<!-- site-previews -->')));
  });

  it('deletes both previews on close, counting "not found" as success and failing on anything else', () => {
    const del = job('cleanup').steps.find((s) => s.run?.includes('wrangler preview delete'));
    const run = del?.run ?? '';
    expect(run).toContain('for app in blog til');
    expect(run).toContain('pnpm exec wrangler preview delete --name "pr-$PR" --skip-confirmation');
    expect(run).toContain("grep -qiE 'not found|does not exist|10007|404'");
    expect(run).toContain('exit 1');
  });

  describe('deleting the previews, against a stub wrangler', () => {
    /** Runs the cleanup delete script with a `pnpm` that prints `message` and exits `code`. */
    function runDelete(message: string, code: number): number {
      const run = job('cleanup').steps.find((s) => s.run?.includes('wrangler preview delete'))?.run;
      if (!run) throw new Error('no delete step');
      const dir = mkdtempSync(join(tmpdir(), 'cleanup-'));
      try {
        for (const sub of ['bin', 'apps/blog', 'apps/til']) mkdirSync(join(dir, sub), { recursive: true });
        const pnpm = join(dir, 'bin/pnpm');
        writeFileSync(pnpm, `#!/bin/sh\nprintf '%s\\n' "$STUB_MESSAGE" >&2\nexit "$STUB_CODE"\n`);
        chmodSync(pnpm, 0o755);
        const script = join(dir, 'run.sh');
        writeFileSync(script, run);
        try {
          // Actions runs `bash -e -o pipefail` scripts.
          execFileSync('bash', ['-e', '-o', 'pipefail', script], {
            cwd: dir,
            env: { PATH: `${join(dir, 'bin')}:${process.env.PATH}`, PR: '7', STUB_MESSAGE: message, STUB_CODE: String(code) },
            stdio: 'ignore',
          });
          return 0;
        } catch (error) {
          return (error as { status: number }).status;
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    it('succeeds when the deletes succeed', () => {
      expect(runDelete('Preview "pr-7" deleted successfully.', 0)).toBe(0);
    });

    it.each([
      'A request to the Cloudflare API failed. Preview not found [code: 10404]',
      'This Worker does not exist on your account. [code: 10007]',
      'workers.api.error.script_not_found [code: 10007]',
      'A request to the Cloudflare API (/accounts/x/workers/workers/blog/previews/pr-7) failed with status 404',
      'PREVIEW NOT FOUND',
    ])('counts a missing preview or Worker as success: %s', (message) => {
      expect(runDelete(message, 1)).toBe(0);
    });

    it.each([
      'Authentication error [code: 10000]',
      'A request to the Cloudflare API failed with status 500',
    ])('fails on any other error: %s', (message) => {
      expect(runDelete(message, 1)).toBe(1);
    });
  });

  it('checks out a commit that still exists after the PR is merged or closed', () => {
    const checkout = job('cleanup').steps.find((s) => s.uses?.startsWith('actions/checkout@'));
    expect(checkout?.with?.ref).toBe('${{ github.event.pull_request.base.sha }}');
  });

  it('marks the comment as removed on close, with or without the Cloudflare secrets', () => {
    const edit = job('cleanup').steps.find((s) => s.run?.includes('<!-- site-previews -->'));
    expect(edit?.run).toContain('-X PATCH');
    expect(edit?.run).toMatch(/removed/i);
    expect(edit?.if).toBeUndefined();
    expect(edit?.env).toEqual({ GH_TOKEN: '${{ github.token }}', PR: '${{ github.event.pull_request.number }}' });
  });

  it('keeps the Lighthouse reports, even when the gate fails', () => {
    const { steps } = job('preview');
    const at = steps.findIndex((s) => s.uses?.startsWith('actions/upload-artifact@'));
    expect(at).toBeGreaterThan(steps.findIndex((s) => s.run?.trim() === 'pnpm lighthouse'));
    expect(steps[at]?.if).toMatch(/^always\(\) && /);
    // `.lighthouseci` is a dot directory, which upload-artifact leaves out by default.
    expect(steps[at]?.with).toMatchObject({ path: '.lighthouseci/', 'include-hidden-files': true });
  });

  it('deploys each app with wrangler deploy', () => {
    const deploy = job('deploy').steps.find((s) => s.run?.includes('wrangler deploy'));
    expect(deploy?.run).toContain('for app in blog til');
    expect(deploy?.run).toContain('(cd "apps/$app" && pnpm exec wrangler deploy)');
  });
});

/** Loads `lighthouserc.cjs` in a fresh Node with exactly these Lighthouse env vars. */
function lighthouseConfig(env: Record<string, string>) {
  const clean = { ...process.env };
  for (const key of ['LHCI_BLOG_URL', 'LHCI_TIL_URL', 'LIGHTHOUSE_PRESET']) delete clean[key];
  const out = execFileSync(
    process.execPath,
    ['-e', "process.stdout.write(JSON.stringify(require('./lighthouserc.cjs')))"],
    { cwd: root, env: { ...clean, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return JSON.parse(out).ci;
}

const PATHS = [
  'blog/',
  'blog/2022/04/03/pay-transparency/',
  'blog/posts/',
  'blog/tags/python/',
  'blog/resume/',
  'til/',
  'til/2025-03-01-how-to-automatically-activate-venv-with-direnv/',
];

describe('lighthouserc.cjs', () => {
  it('serves the local builds itself when no remote origins are set', () => {
    const ci = lighthouseConfig({});
    expect(ci.collect.startServerCommand).toContain('scripts/preview-sites.ts');
    expect(ci.collect.url).toEqual(
      PATHS.map((p) => p.replace(/^blog\//, 'http://127.0.0.1:4510/').replace(/^til\//, 'http://127.0.0.1:4511/')),
    );
  });

  it.each(['desktop', 'mobile'])('audits the remote origins with the same gate on %s', (preset) => {
    const blog = 'https://pr-7-blog.example.workers.dev';
    const til = 'https://pr-7-til.example.workers.dev';
    const local = lighthouseConfig({ LIGHTHOUSE_PRESET: preset });
    // A trailing slash on an origin must not double up.
    const ci = lighthouseConfig({ LHCI_BLOG_URL: `${blog}/`, LHCI_TIL_URL: til, LIGHTHOUSE_PRESET: preset });
    expect(ci.collect.url).toEqual(PATHS.map((p) => p.replace(/^blog\//, `${blog}/`).replace(/^til\//, `${til}/`)));
    expect(ci.collect).not.toHaveProperty('startServerCommand');
    expect(ci.collect).not.toHaveProperty('startServerReadyPattern');
    expect(ci.collect.numberOfRuns).toBe(3);
    expect(ci.assert).toEqual(local.assert);
    expect(ci.assert.aggregationMethod).toBe('optimistic');
    expect(ci.upload).toEqual(local.upload);
    // Same preset; previews send `X-Robots-Tag: noindex` on purpose, so the crawlability audit is skipped.
    const { skipAudits, ...settings } = ci.collect.settings;
    expect(settings).toEqual(local.collect.settings);
    expect(skipAudits).toEqual(['is-crawlable']);
  });

  it('refuses one remote origin without the other', () => {
    expect(() => lighthouseConfig({ LHCI_BLOG_URL: 'https://example.com' })).toThrow(/LHCI_TIL_URL/);
  });
});
