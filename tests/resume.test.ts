import { execa } from 'execa';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
// The root package does not depend on @ac/content, so import the module directly.
import { loadResume } from '../packages/content/src/resume';

const root = join(import.meta.dirname, '..');
const dist = join(root, 'apps/blog/dist');

describe('resume.yml', () => {
  it('validates', () => {
    expect(() => loadResume()).not.toThrow();
  });

  it('transcribes every role from the PDF, newest first', () => {
    expect(loadResume().experience.map((job) => job.company)).toEqual([
      'HashiCorp',
      'Capital One Canada',
      'Ontario Teachers’ Pension Plan',
      'Sportech PLC (Football Pools)',
      'Sensible Development',
    ]);
  });
});

describe('built resume', () => {
  let html: string;

  beforeAll(async () => {
    // The full `build` script: astro build, then the PDF step.
    await execa('pnpm', ['--filter', 'blog', 'build'], { cwd: root });
    html = readFileSync(join(dist, 'resume/index.html'), 'utf8');
  }, 300_000);

  it('resume page lists every role in resume.yml', () => {
    const { experience } = loadResume();
    // Each role is one timeline item; split on them so every check is scoped to its own item.
    const items = html.split(/<li[^>]*\bdata-experience\b/).slice(1).map(text);
    expect(items).toHaveLength(experience.length);
    experience.forEach((job, i) => {
      const item = items[i];
      for (const value of [job.role, job.company, job.location, job.start, job.end ?? 'Present']) {
        expect(item, job.company).toContain(value);
      }
      for (const bullet of job.bullets) expect(item, job.company).toContain(bullet);
      for (const tech of job.tech) expect(item, job.company).toContain(tech);
    });
  });

  it('lists education and contact links from resume.yml', () => {
    const page = text(html);
    const { education, links } = loadResume();
    for (const school of education) {
      expect(page).toContain(school.institution);
      expect(page).toContain(school.degree);
    }
    for (const link of links) expect(html).toContain(`href="${link.href}"`);
  });

  it('links to the PDF and ships no client JS', () => {
    expect(html).toMatch(/<a[^>]*href="\/resume\.pdf"[^>]*>[\s\S]*?Download PDF[\s\S]*?<\/a>/);
    expect(html).not.toContain('<script');
    expect(html).toContain('<link rel="canonical" href="https://www.ashleyconnor.co.uk/resume/">');
  });

  it('prints on A4 with a light background, black text and no nav or footer', () => {
    const print = mediaBlocks(builtCss(html), 'print').join('\n');
    expect(print).toMatch(/@page\s*\{[^}]*size:\s*a4/i);
    expect(print).toMatch(/--color-bg:\s*#fff\b/);
    expect(print).toMatch(/--color-text:\s*#000\b/);
    expect(print).toMatch(/--color-head:\s*#000\b/);
    expect(print).toMatch(/nav\[aria-label=["']?Main["']?\][^{]*\{[^}]*display:\s*none/);
    expect(print).toMatch(/footer[^{]*\{[^}]*display:\s*none/);
  });

  it('dist/resume.pdf exists, starts with %PDF, ≤ 3 pages', () => {
    const file = join(dist, 'resume.pdf');
    expect(existsSync(file)).toBe(true);
    const pdf = readFileSync(file);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const pages = pdf.toString('latin1').match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? [];
    expect(pages.length).toBeGreaterThanOrEqual(1);
    expect(pages.length).toBeLessThanOrEqual(3);
  });
});

/** Visible text of an HTML fragment, with tags removed and whitespace collapsed. */
function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/** Every stylesheet the page gets: `_astro/*.css` plus its inline `<style>` blocks (the site stylesheet is inlined). */
function builtCss(html: string): string {
  const dir = join(dist, '_astro');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.css')) : [];
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  return [...files.map((f) => readFileSync(join(dir, f), 'utf8')), ...inline].join('\n');
}

/** Bodies of every `@media <query> { … }` block, matched by brace depth. */
function mediaBlocks(css: string, query: string): string[] {
  const blocks: string[] = [];
  const opener = new RegExp(`@media\\s+${query}\\s*\\{`, 'g');
  for (const match of css.matchAll(opener)) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
    }
    blocks.push(css.slice(start, i - 1));
  }
  return blocks;
}
