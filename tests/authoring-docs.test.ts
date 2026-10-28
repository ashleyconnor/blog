import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const commandFile = join(root, '.claude/commands/review-post.md');
const readme = () => readFileSync(join(root, 'README.md'), 'utf8');

describe('/review-post command', () => {
  it('exists', () => {
    expect(existsSync(commandFile)).toBe(true);
  });

  it('has a description in its front matter', () => {
    const text = readFileSync(commandFile, 'utf8');
    const frontMatter = text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
    expect(frontMatter).toMatch(/^description: \S/m);
  });

  it('runs the deterministic checks', () => {
    expect(readFileSync(commandFile, 'utf8')).toContain('pnpm review:check');
  });

  it('forbids editing the entry', () => {
    expect(readFileSync(commandFile, 'utf8')).toMatch(/never edit/i);
  });

  it('allows no tool that writes files', () => {
    const text = readFileSync(commandFile, 'utf8');
    const allowed = text.match(/^allowed-tools: (.*)$/m)?.[1] ?? '';
    expect(allowed).not.toBe('');
    expect(allowed).not.toMatch(/\b(Edit|Write|MultiEdit|NotebookEdit)\b/);
    expect(allowed).not.toMatch(/Bash\((?!pnpm review:check|git log|ls)/);
    // No step tells Claude to write, save or apply anything to the entry.
    expect(text).not.toMatch(/\b(write|save|apply) (the|your|a) (file|entry|changes?|fix(es)?)\b/i);
  });
});

describe('README', () => {
  it('documents the authoring workflow', () => {
    const text = readme();
    for (const needle of ['pnpm new', '/review-post', 'pnpm review:check', 'draft: true', 'templates/']) {
      expect(text).toContain(needle);
    }
  });

  it('no longer has a TODO under Development', () => {
    const text = readme();
    const development = text.match(/^## Development\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1] ?? '';
    expect(development).not.toContain('TODO');
    expect(text).not.toMatch(/^## Development\n+TODO/m);
  });

  it('keeps the licence section', () => {
    expect(readme()).toContain(
      'All posts in this blog are licensed under [CC BY-NC-ND](https://creativecommons.org/licenses/by-nc-nd/4.0/) Attribution-NonCommercial-NoDerivatives 4.0 International.',
    );
  });
});

describe('README Deploying section', () => {
  const deploying = () => readme().match(/^## Deploying\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1] ?? '';

  it('exists and covers secrets, previews, verify:live and the runbook', () => {
    const text = deploying();
    for (const needle of [
      'CLOUDFLARE_API_TOKEN',
      'CLOUDFLARE_ACCOUNT_ID',
      'Account API token',
      'Workers',
      'Admin',
      'gh secret set CLOUDFLARE_API_TOKEN',
      'gh secret set CLOUDFLARE_ACCOUNT_ID --body',
      '<!-- site-previews -->',
      'pnpm verify:live',
      'docs/cutover.md',
    ]) {
      expect(text).toContain(needle);
    }
  });

  it('no longer calls PR previews planned', () => {
    expect(readme()).not.toMatch(/previews[^.]*planned/i);
  });
});

describe('docs/cutover.md', () => {
  const runbook = () => readFileSync(join(root, 'docs/cutover.md'), 'utf8');

  it('exists', () => {
    expect(existsSync(join(root, 'docs/cutover.md'))).toBe(true);
  });

  it('lists the cutover steps in order, deleting DNS records before the cutover deploy', () => {
    const text = runbook();
    const steps = [
      'pnpm verify:live --blog https://blog.',
      '"custom_domain": true',
      'Workers Routes',
      'remove the custom domains from the Pages project',
      'delete the `www` CNAME',
      'Merge the cutover PR',
      'apex',
      'pnpm verify:live`',
      'Delete the Pages project',
      'AWS_ACCESS_KEY_ID',
      'Rollback',
    ];
    let last = -1;
    for (const step of steps) {
      const at = text.indexOf(step, last + 1);
      expect(at, `"${step}" should appear after the previous step`).toBeGreaterThan(last);
      last = at;
    }
  });

  it('marks who does each step', () => {
    const text = runbook();
    expect(text).toContain('**Claude (in a PR)**');
    expect(text).toContain('**Ashley (dashboard/merge)**');
  });

  it('covers the known behaviours and the Jekyll files to delete', () => {
    const text = runbook();
    for (const needle of [
      '307',
      '/404.html',
      'X-Robots-Tag: noindex',
      'AWS_SECRET_ACCESS_KEY',
      '_posts/',
      'jekyll-til/',
      'Gemfile',
      '_config.yml',
      '.ruby-version',
      'instaboxd/',
      'robots.txt',
      'outage',
    ]) {
      expect(text).toContain(needle);
    }
  });
});
