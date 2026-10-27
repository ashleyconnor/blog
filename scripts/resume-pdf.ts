/**
 * Prints the built resume page to `apps/blog/dist/resume.pdf`. The blog's `build` script runs this
 * after `astro build`: it serves `dist/` with `astro preview` on a free port, prints `/resume/`
 * with Playwright's Chromium (so the print styles apply), then stops the server.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { type AddressInfo, createServer } from 'node:net';
import { join, relative } from 'node:path';
import { chromium } from 'playwright';

const blogDir = join(import.meta.dirname, '../apps/blog');
const output = join(blogDir, 'dist/resume.pdf');
const host = '127.0.0.1';

/** A port that was free a moment ago: the OS picks one for a throwaway server. */
async function freePort(): Promise<number> {
  const server = createServer().listen(0, host);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  server.close();
  await once(server, 'close');
  return port;
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

const port = await freePort();
const url = `http://${host}:${port}/resume/`;
// Astro's own entry point under this Node, not the `.bin` shim: a shim (or a Node version manager
// behind `node`) would sit between us and the server, and killing it could leave the server running.
// `--ignore-lock` keeps the server in the foreground and untracked: without it Astro refuses to start
// while another `astro preview` is running, and detaches into the background when it detects an AI
// agent, so killing this process would not stop it.
const astro = join(blogDir, 'node_modules/astro/bin/astro.mjs');
const preview = spawn(process.execPath, [astro, 'preview', '--ignore-lock', '--host', host, '--port', String(port)], {
  cwd: blogDir,
  stdio: ['ignore', 'ignore', 'inherit'],
});

try {
  await waitForServer(url, preview);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    // Print only once the web fonts have loaded, or the PDF falls back to system fonts.
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.pdf({ path: output, format: 'A4', printBackground: true });
  } finally {
    await browser.close();
  }
} finally {
  await stop(preview);
}

console.log(`resume-pdf: wrote ${relative(process.cwd(), output)}`);
