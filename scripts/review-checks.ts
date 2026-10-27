/**
 * Deterministic checks for draft entries: `pnpm review:check <file>...`. Prints one
 * `file:line [rule] message` line per finding and exits 1 when there are any, 0 when the files
 * are clean, and 2 when a file cannot be read (or none is given). See `lib/review-checks.ts`.
 */
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';

// `@ac/content` imports its own modules without extensions (Vite and Astro resolve those); plain
// Node does not, so retry a failed relative import with `.ts` appended.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

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
