import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import {
  convertBody,
  convertFrontMatter,
  convertPageFrontMatter,
  dropboxImagePath,
  finalizeBody,
  findImages,
  localImagePath,
  renderEntry,
  splitFrontMatter,
} from '../lib/convert.ts';

describe('convertBody: highlight blocks', () => {
  it('turns a highlight block into a fenced code block', () => {
    const { body, warnings } = convertBody(
      'Run it:\n\n{% highlight bash %}\nls -la\n{% endhighlight %}\n',
    );
    expect(body).toBe('Run it:\n\n```bash\nls -la\n```\n');
    expect(warnings).toEqual([]);
  });

  it('maps the yml language to yaml', () => {
    const { body } = convertBody('{% highlight yml %}\nfoo: bar\n{% endhighlight %}');
    expect(body).toBe('```yaml\nfoo: bar\n```');
  });

  it('drops blank lines Jekyll strips and tolerates an indented end tag', () => {
    const md =
      '{% highlight bash %}\n\n$ docker build .\n  Use Ctrl-C to stop\n\n  {% endhighlight %}\n';
    expect(convertBody(md).body).toBe('```bash\n$ docker build .\n  Use Ctrl-C to stop\n```\n');
  });

  it('fences with more backticks than the content contains', () => {
    const md = '{% highlight text %}\n```js\nx\n```\n{% endhighlight %}';
    expect(convertBody(md).body).toBe('````text\n```js\nx\n```\n````');
  });

  it('leaves existing fenced blocks, and tags inside them, untouched', () => {
    const md = '```elixir\n{:system, "PORT"}\n{: .notice--warning}\n{% highlight x %}\n```\n';
    const { body, warnings } = convertBody(md);
    expect(body).toBe(md);
    expect(warnings).toEqual([]);
  });

  it('warns about an unterminated highlight block and still closes the fence', () => {
    const { body, warnings } = convertBody('{% highlight bash %}\nls\n');
    expect(body).toBe('```bash\nls\n```');
    expect(warnings).toEqual(['unterminated highlight block (language: bash)']);
  });
});

describe('convertBody: kramdown attribute lists', () => {
  it('wraps a paragraph followed by a notice IAL in a Callout', () => {
    const md =
      'Before.\n\nI should break here to explain\nthat I am nervous\n{: .notice--warning}\n\nAfter.\n';
    expect(convertBody(md).body).toBe(
      'Before.\n\n<Callout type="warning">\n\nI should break here to explain\nthat I am nervous\n\n</Callout>\n\nAfter.\n',
    );
  });

  it.each([
    ['notice--info', 'note'],
    ['notice--success', 'tip'],
    ['notice--danger', 'warning'],
    ['notice', 'note'],
  ])('maps .%s to a %s callout', (cls, type) => {
    expect(convertBody(`Text\n{: .${cls}}\n`).body).toContain(`<Callout type="${type}">`);
  });

  it('wraps the preceding line in <small> for .small', () => {
    const md = '<cite>Max</cite> --- Expert string reverser\n{: .small}\n\nNext.';
    expect(convertBody(md).body).toBe(
      '<small><cite>Max</cite> --- Expert string reverser</small>\n\nNext.',
    );
  });

  it('inserts a blank line when text follows the IAL directly', () => {
    expect(convertBody('Text\n{: .notice--info}\nNext\n').body).toBe(
      '<Callout type="note">\n\nText\n\n</Callout>\n\nNext\n',
    );
  });

  it('drops an unsupported IAL and warns', () => {
    const { body, warnings } = convertBody('Text\n{: .align-right}\n');
    expect(body).toBe('Text\n');
    expect(warnings).toEqual(['unsupported kramdown attribute list: {: .align-right}']);
  });

  it('drops an IAL with nothing before it and warns', () => {
    const { body, warnings } = convertBody('Text\n\n{: .small}\n');
    expect(body).toBe('Text\n\n');
    expect(warnings).toEqual(['kramdown attribute list without a preceding paragraph: {: .small}']);
  });
});

describe('convertBody: images', () => {
  it('rewrites /assets/images paths relative to the shared images folder', () => {
    const { body, warnings } = convertBody(
      '![Rails via Docker](/assets/images/docker/docker_exposed.png)',
    );
    expect(body).toBe('![Rails via Docker](./_images/docker/docker_exposed.png)');
    expect(warnings).toEqual([]);
  });

  it('kebab-cases filenames containing spaces, encoded or in angle brackets', () => {
    expect(convertBody('![a](/assets/images/Screenshot%202021-06-07%20155944.png)').body).toBe(
      '![a](./_images/screenshot-2021-06-07-155944.png)',
    );
    expect(convertBody('![a](</assets/images/Screenshot 2021-06-07 155944.png>)').body).toBe(
      '![a](./_images/screenshot-2021-06-07-155944.png)',
    );
  });

  it('unwraps a link to the same file around an image, leaving just the rewritten image', () => {
    expect(convertBody('[![a](/assets/images/x/y.png)](/assets/images/x/y.png)').body).toBe(
      '![a](./_images/x/y.png)',
    );
  });

  it('unwraps linked images with titles, encoded spaces and angle brackets', () => {
    const md =
      '[![Finished](/assets/images/automator/workflow.png "Done")](/assets/images/automator/workflow.png)';
    expect(convertBody(md, { imageBase: '../posts/_images/' }).body).toBe(
      '![Finished](../posts/_images/automator/workflow.png "Done")',
    );
    expect(
      convertBody('[![a](</assets/images/My Shot.png>)](/assets/images/My%20Shot.png)').body,
    ).toBe('![a](./_images/my-shot.png)');
  });

  it('records an unwrapped linked image once', () => {
    const md = '[![a](/assets/images/x/y.png)](/assets/images/x/y.png)';
    expect(findImages(md).localImages).toEqual(['/assets/images/x/y.png']);
  });

  it('never rewrites a plain link to an image file, and warns about it', () => {
    const md = 'See the [full size image](/assets/images/x/y.png) here.';
    const { body, warnings } = convertBody(md);
    expect(body).toBe(md);
    expect(warnings).toEqual([`unconverted image reference: ${md}`]);
    expect(findImages(md).localImages).toEqual([]);
  });

  it('keeps a link around an image that points at a different file, and warns', () => {
    const md = '[![a](/assets/images/x/y.png)](/assets/images/x/z.png)';
    const { body, warnings } = convertBody(md);
    expect(body).toBe('[![a](./_images/x/y.png)](/assets/images/x/z.png)');
    expect(warnings).toEqual([`unconverted image reference: ${body}`]);
  });

  it('does not touch image-like text inside code fences or ordinary links', () => {
    const md = '```text\n![x](/assets/images/a.png)\n```\n\n[pdf](/assets/pdfs/resume.pdf)\n';
    expect(convertBody(md).body).toBe(md);
  });

  it('keeps an unavailable Dropbox image URL and warns', () => {
    const url = 'https://www.dropbox.com/s/abc/Screenshot%202016-03-06%2011.59.16.png?dl=1';
    const { body, warnings } = convertBody(`![Phoenix](${url})`);
    expect(body).toBe(`![Phoenix](${url})`);
    expect(warnings).toEqual([`dropbox image unavailable: ${url}`]);
  });

  it('rewrites a Dropbox image that was downloaded', () => {
    const url = 'https://www.dropbox.com/s/abc/Screenshot%202016-03-06%2011.59.16.png?dl=1';
    const dropboxImages = new Map([[url, 'dropbox/screenshot-2016-03-06-11.59.16.png']]);
    const { body, warnings } = convertBody(`![Phoenix](${url})`, { dropboxImages });
    expect(body).toBe('![Phoenix](./_images/dropbox/screenshot-2016-03-06-11.59.16.png)');
    expect(warnings).toEqual([]);
  });

  it('warns about leftover Liquid tags outside code', () => {
    const { warnings } = convertBody('{% include foo.html %}\n\n```\n{% raw %}\n```\n');
    expect(warnings).toEqual(['unhandled Liquid tag: {% include foo.html %}']);
  });
});

describe('image helpers', () => {
  it('computes the path under _images for a local image', () => {
    expect(localImagePath('/assets/images/WSL2/firefox_cert_settings.png')).toBe(
      'WSL2/firefox_cert_settings.png',
    );
    expect(localImagePath('/assets/images/Screenshot 2021-06-07 155944.png')).toBe(
      'screenshot-2021-06-07-155944.png',
    );
    expect(localImagePath('/assets/images/Screenshot%202021-06-07%20155944.png')).toBe(
      'screenshot-2021-06-07-155944.png',
    );
  });

  it('computes the path under _images/dropbox for a Dropbox image', () => {
    expect(
      dropboxImagePath('https://www.dropbox.com/s/abc/Screenshot%202016-03-06%2011.59.16.png?dl=1'),
    ).toBe('dropbox/screenshot-2016-03-06-11.59.16.png');
  });

  it('finds local and Dropbox images outside code fences', () => {
    const md = [
      '![a](/assets/images/docker/a.png)',
      '[![b](/assets/images/b.png)](/assets/images/b.png)',
      '![c](https://www.dropbox.com/s/x/c.png?dl=1)',
      '![e](/assets/images/Screenshot%202021-06-07%20155944.png)',
      '```',
      '![d](/assets/images/d.png)',
      '```',
    ].join('\n');
    expect(findImages(md)).toEqual({
      localImages: [
        '/assets/images/docker/a.png',
        '/assets/images/b.png',
        '/assets/images/Screenshot 2021-06-07 155944.png',
      ],
      dropboxImages: ['https://www.dropbox.com/s/x/c.png?dl=1'],
    });
  });
});

describe('convertFrontMatter', () => {
  const ctx = {
    file: '2025-04-23-pythons-async-gap-why-the-standard-library-needs-a-run-sync.md',
    liveUrl: '/2025/04/24/pythons-async-gap-why-the-standard-library-needs-a-run-sync.html',
    tags: ['python'],
  };

  it('keeps title, date and excerpt, normalising the date to ISO 8601 with its offset', () => {
    const fm = convertFrontMatter(
      {
        title: 'Python’s Async Gap: Why the Standard Library Needs a run_sync()',
        excerpt: 'Python still lacks a standard way...',
        date: '2025-04-23 19:39 -0700',
      },
      ctx,
    );
    expect(fm).toEqual({
      title: 'Python’s Async Gap: Why the Standard Library Needs a run_sync()',
      date: '2025-04-23T19:39:00-07:00',
      tags: ['python'],
      excerpt: 'Python still lacks a standard way...',
      legacyUrls: ['/2025/04/24/pythons-async-gap-why-the-standard-library-needs-a-run-sync.html'],
    });
  });

  it('normalises +HHMM offsets and keeps seconds', () => {
    const fm = convertFrontMatter(
      { title: 'T', date: '2014-09-07 16:14:37 +0100' },
      { file: '2014-09-07-x.md', liveUrl: '/2014/09/07/x.html', tags: ['travel'] },
    );
    expect(fm.date).toBe('2014-09-07T16:14:37+01:00');
  });

  it('uses the filename date at Los Angeles midnight when front matter has no date', () => {
    const date = (file: string) =>
      convertFrontMatter({ title: 'T' }, { file, liveUrl: '/x.html', tags: ['tools'] }).date;
    expect(date('2016-03-06-x.md')).toBe('2016-03-06T00:00:00-08:00');
    expect(date('2016-10-23-x.md')).toBe('2016-10-23T00:00:00-07:00');
  });

  it('uses the offset in force at local midnight on a daylight saving change day', () => {
    const date = (d: string) =>
      convertFrontMatter({ title: 'T', date: d }, { file: 'x.md', liveUrl: '/x', tags: ['tools'] })
        .date;
    expect(date('2016-03-13')).toBe('2016-03-13T00:00:00-08:00');
    expect(date('2016-03-14')).toBe('2016-03-14T00:00:00-07:00');
    expect(date('2016-11-06')).toBe('2016-11-06T00:00:00-07:00');
    expect(date('2016-11-07')).toBe('2016-11-07T00:00:00-08:00');
  });

  it('rejects a date it cannot read instead of guessing', () => {
    expect(() => convertFrontMatter({ title: 'T', date: 'last Tuesday' }, ctx)).toThrow(
      /last Tuesday/,
    );
    expect(() => convertFrontMatter({ title: 'T', date: '2020-01-01 10:00' }, ctx)).toThrow(
      /offset/,
    );
  });

  it('drops an empty excerpt and Jekyll-only keys', () => {
    const fm = convertFrontMatter(
      {
        title: 'Pay transparency',
        description: '',
        excerpt: '',
        layout: 'single',
        author_profile: false,
      },
      {
        file: '2022-04-03-pay-transparency.md',
        liveUrl: '/2022/04/03/pay-transparency.html',
        tags: ['career'],
      },
    );
    expect(Object.keys(fm)).toEqual(['title', 'date', 'tags', 'legacyUrls']);
  });

  it('maps hide: true to unlisted: true', () => {
    const fm = convertFrontMatter({ title: 'T', hide: true }, ctx);
    expect(fm.unlisted).toBe(true);
    expect(convertFrontMatter({ title: 'T', hide: false }, ctx)).not.toHaveProperty('unlisted');
  });

  it('adds redirect_from entries after the live URL as absolute paths', () => {
    const fm = convertFrontMatter(
      {
        title: 'Working in Thailand as a Digital Nomad',
        date: '2014-09-07 16:14:37 +0100',
        redirect_from: [
          'blog/2014/09/07/the-digital-nomad-and-immigration-law/',
          'blog/2014/09/07/working-in-thailand-as-a-digital-nomad/',
        ],
        hide: true,
      },
      {
        file: '2014-09-07-the-digital-nomad-and-immigration-law.md',
        liveUrl: '/2014/09/07/the-digital-nomad-and-immigration-law.html',
        tags: ['travel', 'career'],
      },
    );
    expect(fm.legacyUrls).toEqual([
      '/2014/09/07/the-digital-nomad-and-immigration-law.html',
      '/blog/2014/09/07/the-digital-nomad-and-immigration-law/',
      '/blog/2014/09/07/working-in-thailand-as-a-digital-nomad/',
    ]);
    expect(fm.unlisted).toBe(true);
  });

  it('accepts alias as a string or list, a full live URL, and removes duplicates', () => {
    const fm = convertFrontMatter(
      { title: 'T', alias: '/old/index.html', redirect_from: ['/old/index.html', 'other/'] },
      {
        file: '2020-01-01-x.md',
        liveUrl: 'https://www.ashleyconnor.co.uk/til/2020-01-01-x',
        tags: ['tools'],
      },
    );
    expect(fm.legacyUrls).toEqual(['/til/2020-01-01-x', '/old/index.html', '/other/']);
  });

  it('requires a title and at least one tag', () => {
    expect(() => convertFrontMatter({}, ctx)).toThrow(/title/);
    expect(() => convertFrontMatter({ title: 'T' }, { ...ctx, tags: [] })).toThrow(/tag/);
  });

  it('reports dropped keys that carry a value through ctx.warn', () => {
    const warnings: string[] = [];
    convertFrontMatter(
      { title: 'T', description: 'About it', layout: '', excerpt: '' },
      { ...ctx, warn: (m) => warnings.push(m) },
    );
    expect(warnings).toEqual(['dropped front matter key "description"']);
  });
});

describe('convertPageFrontMatter', () => {
  it('keeps only the title', () => {
    expect(
      convertPageFrontMatter({
        title: 'InstaBoxd Privacy Policy',
        layout: 'single',
        permalink: '/instaboxd/privacy/',
      }),
    ).toEqual({ title: 'InstaBoxd Privacy Policy' });
  });
});

describe('splitFrontMatter and renderEntry', () => {
  it('splits front matter from the body', () => {
    const { data, body } = splitFrontMatter('---\ntitle: "A: b"\ndate: 2025-01-02\n---\n\nHello\n');
    expect(data).toEqual({ title: 'A: b', date: '2025-01-02' });
    expect(body).toBe('\nHello\n');
  });

  it('throws when there is no front matter', () => {
    expect(() => splitFrontMatter('Hello')).toThrow(/front matter/);
  });

  it('renders quoted dates, unfolded long strings and a trimmed body that round-trips', () => {
    const fm = {
      title: 'Python’s Async Gap: Why the Standard Library Needs a run_sync()',
      date: '2025-04-23T19:39:00-07:00',
      tags: ['python'],
      excerpt: 'x'.repeat(200),
      unlisted: true,
      legacyUrls: ['/2025/04/24/a.html'],
    };
    const text = renderEntry(fm, '\n\nBody text\n\n\n');
    expect(text.startsWith('---\ntitle: ')).toBe(true);
    expect(text).toContain('date: "2025-04-23T19:39:00-07:00"\n');
    expect(text.endsWith('---\n\nBody text\n')).toBe(true);
    expect(text).not.toContain('excerpt: >');
    expect(splitFrontMatter(text).data).toEqual(fm);
    expect(parse(text.split('---\n')[1]!)).toEqual(fm);
  });
});

describe('finalizeBody', () => {
  it('leaves plain markdown as .md', () => {
    expect(finalizeBody('Hello\n')).toEqual({ body: 'Hello\n', extension: '.md' });
  });

  it('turns a post that uses Callout into .mdx with the import first', () => {
    const { body, extension } = finalizeBody(
      'Intro\n\n<Callout type="warning">\n\nCareful\n\n</Callout>\n',
    );
    expect(extension).toBe('.mdx');
    expect(
      body.startsWith("import Callout from '@ac/ui/components/Callout.astro';\n\nIntro\n"),
    ).toBe(true);
  });

  it('puts exactly one blank line between the import and the first line of the body', () => {
    const { body } = finalizeBody('\n\n<Callout type="note">\n\nHi\n\n</Callout>\n');
    expect(body).toBe(
      'import Callout from \'@ac/ui/components/Callout.astro\';\n\n<Callout type="note">\n\nHi\n\n</Callout>\n',
    );
  });

  it('does not treat a fenced <Callout> example as a use', () => {
    expect(finalizeBody('```html\n<Callout type="note">\n```\n').extension).toBe('.md');
  });
});
