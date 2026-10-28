import { contentRoot } from '@ac/content';
import { definePagesCollection, defineSharedCollections } from '@ac/content/collections';

const root = contentRoot();

export const collections = { ...defineSharedCollections(root), pages: definePagesCollection(root) };
