// Astro-only (`astro:content`, the container API), so it is not in the barrel; import it as
// `@ac/content/entry-html` from Astro endpoints.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import type { SSRLoadedRenderer } from 'astro';
import { getCollection, render } from 'astro:content';
import type { StreamItem } from './listing';

/**
 * `items` with `html` set to each post's or TIL's body as its own page renders it, for full-content
 * feeds. Rendering through the container resolves local images to their built `/_astro/` files: an
 * entry's pre-rendered HTML only holds image placeholders. `renderers` are needed for MDX entries.
 */
export async function withHtml(items: StreamItem[], renderers: SSRLoadedRenderer[] = []): Promise<StreamItem[]> {
  const container = await AstroContainer.create({ renderers });
  const entries = new Map<string, Parameters<typeof render>[0]>();
  for (const collection of ['posts', 'til'] as const) {
    for (const entry of await getCollection(collection)) entries.set(`${collection === 'posts' ? 'post' : 'til'}:${entry.id}`, entry);
  }
  return Promise.all(
    items.map(async (item) => {
      const entry = entries.get(`${item.type}:${item.id}`);
      if (!entry) return item;
      const { Content } = await render(entry);
      return { ...item, html: await container.renderToString(Content) };
    }),
  );
}
