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
