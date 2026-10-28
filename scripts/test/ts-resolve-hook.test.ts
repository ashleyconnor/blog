import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hook = pathToFileURL(join(import.meta.dirname, '../lib/ts-resolve-hook.ts')).href;
const tmpBase = join(import.meta.dirname, '../.tmp');
let dir: string;

beforeAll(() => {
  mkdirSync(tmpBase, { recursive: true });
  dir = mkdtempSync(join(tmpBase, 'hook-'));
  writeFileSync(join(dir, 'lib.ts'), "export const answer: number = 42;\n");
  writeFileSync(join(dir, 'ok.ts'), "import { answer } from './lib';\nconsole.log(answer);\n");
  writeFileSync(join(dir, 'missing.ts'), "import './nowhere';\n");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const run = (file: string) =>
  spawnSync(process.execPath, ['--experimental-strip-types', '--import', hook, join(dir, file)], { encoding: 'utf8' });

describe('ts-resolve-hook', () => {
  it('resolves an extensionless relative import to its .ts file', () => {
    const result = run('ok.ts');
    expect(result.stderr).toBe('');
    expect(result.stdout.trim()).toBe('42');
  });

  it('rethrows the original error when the .ts file does not exist either', () => {
    const result = run('missing.ts');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ERR_MODULE_NOT_FOUND');
    expect(result.stderr).toMatch(/nowhere'/);
    expect(result.stderr).not.toContain('nowhere.ts');
  });

  it('does not change how imports without the hook fail', () => {
    const result = spawnSync(process.execPath, ['--experimental-strip-types', join(dir, 'ok.ts')], { encoding: 'utf8' });
    expect(result.stderr).toContain('ERR_MODULE_NOT_FOUND');
  });
});
