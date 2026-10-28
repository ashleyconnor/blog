/**
 * Side-effect module: import it first (or pass it to `node --import`) so plain
 * `node --experimental-strip-types` can load workspace TypeScript, such as `@ac/content`, that
 * imports its own modules without extensions (Vite and Astro resolve those; Node does not).
 * A relative specifier that is not found is retried once with `.ts` appended, and only from
 * files outside `node_modules`. When the retry fails too, the original error is rethrown.
 */
import { registerHooks } from 'node:module';

const RELATIVE = /^\.\.?\//;
const HAS_EXTENSION = /\.[cm]?[jt]sx?$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const retry =
        (error as { code?: unknown }).code === 'ERR_MODULE_NOT_FOUND' &&
        RELATIVE.test(specifier) &&
        !HAS_EXTENSION.test(specifier) &&
        context.parentURL !== undefined &&
        !context.parentURL.includes('/node_modules/');
      if (!retry) throw error;
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        throw error;
      }
    }
  },
});
