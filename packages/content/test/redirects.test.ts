import { describe, expect, it } from 'vitest';
import { buildRedirects } from '../src/redirects';

const ASYNC_POST = {
  type: 'post' as const,
  href: '/2025/04/23/pythons-async-gap-why-the-standard-library-needs-a-run-sync/',
  legacyUrls: ['/2025/04/24/pythons-async-gap-why-the-standard-library-needs-a-run-sync.html'],
};

const ELIXIR_TIL = {
  type: 'til' as const,
  href: 'https://til.ashleyconnor.co.uk/2022-12-01-about-elixir-pattern-matching-in-anon-functions/',
  legacyUrls: ['/til/2022-12-01-about-elixir-pattern-matching-in-anon-functions'],
};

const lines = (text: string) => text.split('\n').filter(Boolean);

describe('buildRedirects', () => {
  it('buildRedirects maps legacy .html to new URL', () => {
    expect(lines(buildRedirects([ASYNC_POST]))).toContain(
      '/2025/04/24/pythons-async-gap-why-the-standard-library-needs-a-run-sync.html /2025/04/23/pythons-async-gap-why-the-standard-library-needs-a-run-sync/ 301',
    );
  });

  it('TIL legacy URLs go to subdomain', () => {
    const out = lines(buildRedirects([ELIXIR_TIL]));
    const explicit = out.indexOf(
      '/til/2022-12-01-about-elixir-pattern-matching-in-anon-functions https://til.ashleyconnor.co.uk/2022-12-01-about-elixir-pattern-matching-in-anon-functions/ 301',
    );
    expect(explicit).toBeGreaterThanOrEqual(0);
    // Cloudflare applies the first matching rule, so the wildcard must come after every explicit TIL line.
    expect(explicit).toBeLessThan(out.indexOf('/til/* https://til.ashleyconnor.co.uk/:splat 301'));
  });

  it('adds the static rules for URLs no entry owns, /til/index before the /til/* wildcard', () => {
    const out = lines(buildRedirects([]));
    expect(out).toEqual([
      '/til/index https://til.ashleyconnor.co.uk/ 301',
      '/til/* https://til.ashleyconnor.co.uk/:splat 301',
      '/page2/ / 301',
      '/assets/pdfs/resume.pdf /resume.pdf 301',
    ]);
  });

  it('redirects every legacy URL of an entry, and nothing for entries without any', () => {
    const out = lines(
      buildRedirects([
        {
          type: 'post',
          href: '/2014/09/07/the-digital-nomad-and-immigration-law/',
          legacyUrls: [
            '/2014/09/07/the-digital-nomad-and-immigration-law.html',
            '/blog/2014/09/07/the-digital-nomad-and-immigration-law/',
            '/blog/2014/09/07/working-in-thailand-as-a-digital-nomad/',
          ],
        },
        { type: 'photos', href: '/photos/anza-borrego/' },
        { type: 'post', href: '/2025/02/10/advanced-post/', legacyUrls: [] },
      ]),
    );
    expect(out.filter((line) => line.endsWith(' /2014/09/07/the-digital-nomad-and-immigration-law/ 301'))).toEqual([
      '/2014/09/07/the-digital-nomad-and-immigration-law.html /2014/09/07/the-digital-nomad-and-immigration-law/ 301',
      '/blog/2014/09/07/the-digital-nomad-and-immigration-law/ /2014/09/07/the-digital-nomad-and-immigration-law/ 301',
      '/blog/2014/09/07/working-in-thailand-as-a-digital-nomad/ /2014/09/07/the-digital-nomad-and-immigration-law/ 301',
    ]);
    expect(out).toHaveLength(3 + 4);
  });

  it('skips a legacy URL that is already the new URL', () => {
    const out = buildRedirects([
      { type: 'post', href: '/2022/04/03/pay-transparency/', legacyUrls: ['/2022/04/03/pay-transparency/'] },
    ]);
    expect(out).not.toContain('/2022/04/03/pay-transparency/ /2022/04/03/pay-transparency/');
    expect(lines(out)).toHaveLength(4);
  });

  it('lists entry rules first, in a stable order, as newline-terminated text', () => {
    const out = buildRedirects([ELIXIR_TIL, ASYNC_POST]);
    expect(buildRedirects([ASYNC_POST, ELIXIR_TIL])).toBe(out);
    expect(lines(out).slice(0, 2)).toEqual([
      '/2025/04/24/pythons-async-gap-why-the-standard-library-needs-a-run-sync.html /2025/04/23/pythons-async-gap-why-the-standard-library-needs-a-run-sync/ 301',
      '/til/2022-12-01-about-elixir-pattern-matching-in-anon-functions https://til.ashleyconnor.co.uk/2022-12-01-about-elixir-pattern-matching-in-anon-functions/ 301',
    ]);
    expect(out.endsWith('301\n')).toBe(true);
  });

  it('fails when two entries claim the same legacy URL', () => {
    expect(() =>
      buildRedirects([
        { type: 'post', href: '/2025/04/23/a/', legacyUrls: ['/old.html'] },
        { type: 'post', href: '/2025/04/23/b/', legacyUrls: ['/old.html'] },
      ]),
    ).toThrow(/\/old\.html.*\/2025\/04\/23\/a\/.*\/2025\/04\/23\/b\//);
  });
});
