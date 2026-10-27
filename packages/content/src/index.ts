// `defineSharedCollections` lives in '@ac/content/collections': it needs Astro's virtual
// `astro:content` module, which would break plain Node / Vitest imports of this barrel.
export * from './items';
export * from './listing';
export * from './schema';
export * from './tags';
export * from './post';
export * from './resume';
