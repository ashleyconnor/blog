// Lets plain `node --experimental-strip-types` load workspace TypeScript whose relative imports
// leave off the extension (as `@ac/content` does, for Vite). A failed relative import is retried
// with `.ts`. Import this module first, then load anything that needs it with a dynamic
// `import()`: static imports are all resolved before any module body runs.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const relative = specifier.startsWith('./') || specifier.startsWith('../');
      if (!relative || (error as { code?: string }).code !== 'ERR_MODULE_NOT_FOUND') throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});
