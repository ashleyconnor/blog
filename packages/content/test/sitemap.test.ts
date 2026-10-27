import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadItems } from '../src/load-items';
import { sitemapFilter, unindexedHrefs } from '../src/sitemap';

const fixtures = join(import.meta.dirname, '../../../tests/fixtures/content');
const BLOG = 'https://www.ashleyconnor.co.uk';
const TIL = 'https://til.ashleyconnor.co.uk';

afterEach(() => vi.unstubAllEnvs());

const item = (href: string, overrides: { tags?: string[]; draft?: boolean; unlisted?: boolean } = {}) => ({
  href,
  tags: ['python'],
  draft: false,
  unlisted: false,
  ...overrides,
});

describe('unindexedHrefs', () => {
  it('hides unlisted entries and drafts, even when drafts are shown', () => {
    const items = [item('/public/'), item('/unlisted/', { unlisted: true }), item('/draft/', { draft: true })];
    for (const showDrafts of [false, true]) {
      expect(unindexedHrefs(items, [], { showDrafts })).toEqual(new Set(['/unlisted/', '/draft/']));
    }
  });

  it('hides tag pages with nothing public', () => {
    const items = [
      item('/a/', { tags: ['python'] }),
      item('/b/', { tags: ['travel'], unlisted: true }),
      item(`${TIL}/c/`, { tags: ['elixir'] }),
    ];
    const hidden = unindexedHrefs(items, ['python', 'travel', 'elixir', 'rails'], { showDrafts: false });
    expect(hidden).toEqual(new Set(['/b/', '/tags/travel/', '/tags/rails/']));
  });

  it('counts a draft towards its tags only when drafts are shown, as the tag pages do', () => {
    const items = [item('/draft/', { tags: ['tools'], draft: true })];
    expect(unindexedHrefs(items, ['tools'], { showDrafts: false })).toContain('/tags/tools/');
    expect(unindexedHrefs(items, ['tools'], { showDrafts: true })).not.toContain('/tags/tools/');
  });
});

describe('loadItems', () => {
  it('reads every entry under CONTENT_ROOT, with the ids Astro gives them', () => {
    vi.stubEnv('CONTENT_ROOT', fixtures);
    const items = loadItems();
    expect(items.map((i) => i.href).sort()).toEqual([
      '/2014/09/07/unlisted-post/',
      '/2025/02/10/advanced-post/',
      '/2025/04/22/draft-post/',
      '/2025/04/23/basic-post/',
      '/photos/anza-borrego/',
      `${TIL}/2022-12-01-elixir-pattern-matching-in-anon-functions/`,
      `${TIL}/2025-02-05-til-unlisted-entry/`,
      `${TIL}/2025-02-28-til-late-evening-entry/`,
      `${TIL}/2025-03-01-auto-activate-a-venv-with-direnv/`,
      `${TIL}/2025-04-03-til-zsh-glob-qualifiers/`,
      `${TIL}/2025-04-12-til-read-a-file-in-elixir/`,
      `${TIL}/2025-04-20-til-draft-entry/`,
    ]);
    const byHref = (href: string) => items.find((i) => i.href === href);
    expect(byHref('/2014/09/07/unlisted-post/')).toMatchObject({ type: 'post', unlisted: true, draft: false });
    expect(byHref('/2025/04/22/draft-post/')).toMatchObject({ draft: true, unlisted: false, tags: ['tools'] });
    expect(byHref('/photos/anza-borrego/')).toMatchObject({ type: 'photos', tags: ['travel'] });
  });
});

describe('sitemapFilter', () => {
  it('keeps public pages and drops unlisted, draft and empty tag pages of the content under CONTENT_ROOT', () => {
    vi.stubEnv('CONTENT_ROOT', fixtures);
    vi.stubEnv('PUBLIC_SHOW_DRAFTS', 'true');
    const keep = sitemapFilter(BLOG);
    for (const path of ['/', '/2025/04/23/basic-post/', '/photos/anza-borrego/', '/tags/python/', '/tags/tools/']) {
      expect(keep(`${BLOG}${path}`), path).toBe(true);
    }
    for (const path of ['/2014/09/07/unlisted-post/', '/2025/04/22/draft-post/', '/tags/rails/']) {
      expect(keep(`${BLOG}${path}`), path).toBe(false);
    }
  });

  it('works for the TIL site, whose entry links are absolute', () => {
    vi.stubEnv('CONTENT_ROOT', fixtures);
    vi.stubEnv('PUBLIC_SHOW_DRAFTS', 'false');
    const keep = sitemapFilter(TIL);
    expect(keep(`${TIL}/2025-04-12-til-read-a-file-in-elixir/`)).toBe(true);
    expect(keep(`${TIL}/2025-02-05-til-unlisted-entry/`)).toBe(false);
    expect(keep(`${TIL}/2025-04-20-til-draft-entry/`)).toBe(false);
  });
});
