/**
 * Deterministic checks for draft entries: `pnpm review:check <file>...`. Prints one
 * `file:line [rule] message` line per finding and exits 1 when there are any, 0 when the files
 * are clean, and 2 when a file cannot be read (or none is given). See `lib/review-checks.ts`.
 */
import './lib/ts-resolve-hook.ts';
import { resolve } from 'node:path';

// Static imports are all resolved before any module runs, so the library (and `@ac/content`)
// is imported dynamically, after the resolve hook above is registered.
const { checkEntry } = await import('./lib/review-checks.ts');

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: pnpm review:check <file>...');
  process.exit(2);
}

// pnpm runs package scripts from the repository root; resolve paths against where it was invoked.
const cwd = process.env.npm_lifecycle_event === 'review:check' ? (process.env.INIT_CWD ?? process.cwd()) : process.cwd();

let status = 0;
for (const file of files) {
  try {
    for (const { line, rule, message } of checkEntry(resolve(cwd, file))) {
      console.log(`${file}:${line} [${rule}] ${message}`);
      status = Math.max(status, 1);
    }
  } catch (error) {
    console.error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    status = 2;
  }
}
process.exit(status);
