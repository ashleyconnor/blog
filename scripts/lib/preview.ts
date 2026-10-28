/**
 * Serves an app's build with `astro preview`, for scripts that drive a browser against it (the
 * resume PDF, Lighthouse).
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { type AddressInfo, createServer } from 'node:net';
import { join } from 'node:path';

export const host = '127.0.0.1';

export interface Preview {
  /** `http://127.0.0.1:<port>` */
  origin: string;
  stop: () => Promise<void>;
}

/** A port that was free a moment ago: the OS picks one for a throwaway server. */
export async function freePort(): Promise<number> {
  const server = createServer().listen(0, host);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  server.close();
  await once(server, 'close');
  return port;
}

/** Fails when something already listens on `port`: Vite would quietly move the preview to another one. */
async function ensureFree(port: number): Promise<void> {
  const server = createServer().listen(port, host);
  try {
    await once(server, 'listening');
  } catch (error) {
    throw new Error(`Port ${port} is already in use`, { cause: error });
  }
  server.close();
  await once(server, 'close');
}

/** Polls until `url` answers 200, failing early if the server process has exited. */
async function waitForServer(url: string, server: ChildProcess, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`astro preview exited with code ${server.exitCode}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`astro preview did not serve ${url} within ${timeoutMs / 1000}s`);
}

async function stop(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.signalCode !== null) return;
  server.kill();
  await once(server, 'exit');
}

/**
 * Starts `astro preview` for `apps/<app>` on `port` and resolves once `readyPath` answers 200. It
 * serves the app's `dist/`, or `outDir` for a build made with `astro build --outDir <dir>`.
 */
export async function startPreview(
  app: 'blog' | 'til',
  port: number,
  { outDir, readyPath = '/' }: { outDir?: string; readyPath?: string } = {},
): Promise<Preview> {
  await ensureFree(port);
  const appDir = join(import.meta.dirname, '../../apps', app);
  // Astro's own entry point under this Node, not the `.bin` shim: a shim (or a Node version manager
  // behind `node`) would sit between us and the server, and killing it could leave the server running.
  // `--ignore-lock` keeps the server in the foreground and untracked: without it Astro refuses to start
  // while another `astro preview` is running, and detaches into the background when it detects an AI
  // agent, so killing this process would not stop it.
  const astro = join(appDir, 'node_modules/astro/bin/astro.mjs');
  const args = [astro, 'preview', '--ignore-lock', '--host', host, '--port', String(port)];
  if (outDir) args.push('--outDir', outDir);
  const server = spawn(process.execPath, args, { cwd: appDir, stdio: ['ignore', 'ignore', 'inherit'] });
  const origin = `http://${host}:${port}`;
  try {
    await waitForServer(`${origin}${readyPath}`, server);
  } catch (error) {
    await stop(server);
    throw error;
  }
  return { origin, stop: () => stop(server) };
}
