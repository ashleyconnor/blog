import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadResume, parseResume, resumeSchema } from '../src/resume';

const fixtureRoot = resolve(import.meta.dirname, '../../../tests/fixtures/content');

afterEach(() => {
  vi.unstubAllEnvs();
});

const job = { company: 'Acme', role: 'Engineer', location: 'Remote', start: 'May 2014' };
const minimal = { name: 'Ada', location: 'London, UK', experience: [job] };

describe('resumeSchema', () => {
  it('accepts a minimal resume and defaults the lists', () => {
    const parsed = resumeSchema.parse(minimal);
    expect(parsed.headline).toBeUndefined();
    expect(parsed.summary).toBeUndefined();
    expect(parsed.links).toEqual([]);
    expect(parsed.education).toEqual([]);
    expect(parsed.skills).toEqual([]);
    expect(parsed.experience[0]).toEqual({ ...job, bullets: [], tech: [] });
  });

  it('keeps dates as the strings written, with no end meaning a current role', () => {
    const parsed = resumeSchema.parse({ ...minimal, experience: [{ ...job, start: 'Aug 2012', end: 'Mar 2014' }] });
    expect(parsed.experience[0]).toMatchObject({ start: 'Aug 2012', end: 'Mar 2014' });
  });

  it('accepts links, education and skills', () => {
    const parsed = resumeSchema.parse({
      ...minimal,
      links: [{ label: 'me@example.com', href: 'mailto:me@example.com' }],
      education: [{ institution: 'Uni', degree: 'BSc', location: 'Leeds, UK', start: '2009', end: '2012' }],
      skills: ['Go'],
    });
    expect(parsed.links[0].href).toBe('mailto:me@example.com');
    expect(parsed.education[0].degree).toBe('BSc');
    expect(parsed.skills).toEqual(['Go']);
  });

  it('rejects unknown keys, so a typo fails the build', () => {
    expect(resumeSchema.safeParse({ ...minimal, sumary: 'x' }).success).toBe(false);
    expect(resumeSchema.safeParse({ ...minimal, experience: [{ ...job, bullet: ['x'] }] }).success).toBe(false);
  });

  it('requires at least one role, and a company, role and start for each', () => {
    expect(resumeSchema.safeParse({ ...minimal, experience: [] }).success).toBe(false);
    for (const key of ['company', 'role', 'start'] as const) {
      const { [key]: _, ...rest } = job;
      expect(resumeSchema.safeParse({ ...minimal, experience: [rest] }).success, key).toBe(false);
    }
  });

  it('rejects empty strings and links that are not URLs', () => {
    expect(resumeSchema.safeParse({ ...minimal, experience: [{ ...job, bullets: [''] }] }).success).toBe(false);
    expect(resumeSchema.safeParse({ ...minimal, links: [{ label: 'x', href: 'not a url' }] }).success).toBe(false);
  });
});

describe('parseResume', () => {
  it('parses YAML text', () => {
    const resume = parseResume('name: Ada\nlocation: London\nexperience:\n  - { company: A, role: B, location: C, start: "2020" }\n', 'inline');
    expect(resume.experience[0].company).toBe('A');
  });

  it('names the source in validation errors', () => {
    expect(() => parseResume('name: Ada\n', 'my/resume.yml')).toThrow(/my\/resume\.yml/);
  });
});

describe('loadResume', () => {
  it('loads <contentRoot>/resume.yml by default', () => {
    vi.stubEnv('CONTENT_ROOT', fixtureRoot);
    expect(loadResume().name).toBe('Fixture Person');
  });

  it('loads the real resume when CONTENT_ROOT is unset', () => {
    vi.stubEnv('CONTENT_ROOT', undefined);
    expect(loadResume().name).toBe('Ashley Connor');
  });

  it('throws when the file does not exist', () => {
    expect(() => loadResume('/nonexistent/resume.yml')).toThrow(/resume\.yml/);
  });
});
