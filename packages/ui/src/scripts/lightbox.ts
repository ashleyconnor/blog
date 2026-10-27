// The gallery lightbox, loaded by Gallery.astro only. PhotoSwipe is not downloaded with the page:
// the first click on a thumbnail imports it and opens the photo. Until then, and without
// JavaScript, every thumbnail is a plain link to its full-size image.
import type PhotoSwipeLightbox from 'photoswipe/lightbox';

const THUMB = 'a[data-pswp-width]';

// PhotoSwipe's own colours (black, greys, white) swapped for the site's palette tokens.
const PALETTE = `.pswp {
  --pswp-bg: var(--color-bg);
  --pswp-placeholder-bg: var(--color-surface);
  --pswp-preloader-color: var(--color-line);
  --pswp-preloader-color-secondary: var(--color-head);
  --pswp-icon-color: var(--color-head);
  --pswp-icon-color-secondary: var(--color-line);
  --pswp-icon-stroke-color: var(--color-line);
}`;

async function createLightbox(gallery: HTMLElement): Promise<PhotoSwipeLightbox> {
  // Everything loads here, PhotoSwipe's core included, so any failed chunk reaches the caller's
  // fallback. The stylesheet comes as a string: a plain CSS import would be added to the page's <head>.
  const [{ default: Lightbox }, { default: PhotoSwipe }, { default: css }] = await Promise.all([
    import('photoswipe/lightbox'),
    import('photoswipe'),
    import('photoswipe/style.css?inline'),
  ]);
  document.head.append(Object.assign(document.createElement('style'), { textContent: css + PALETTE }));
  return new Lightbox({ gallery, children: THUMB, pswpModule: PhotoSwipe });
}

for (const gallery of document.querySelectorAll<HTMLElement>('[data-gallery]')) {
  let lightbox: Promise<PhotoSwipeLightbox> | undefined;

  gallery.addEventListener('click', async (event) => {
    // Modified clicks keep their usual meaning, such as opening the image in a new tab.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const thumbs = [...gallery.querySelectorAll<HTMLAnchorElement>(THUMB)];
    const index = thumbs.findIndex((thumb) => thumb.contains(event.target as Node));
    if (index < 0) return;
    event.preventDefault();
    lightbox ??= createLightbox(gallery);
    try {
      (await lightbox).loadAndOpen(index, { gallery });
    } catch {
      // PhotoSwipe failed to load (offline?): forget the attempt and follow the link instead.
      lightbox = undefined;
      location.assign(thumbs[index]!.href);
    }
  });
}
