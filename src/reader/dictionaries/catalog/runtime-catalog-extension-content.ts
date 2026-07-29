const runtimeCatalog = (globalThis as typeof globalThis & {
    __YOMU_RUNTIME_DICTIONARY_CATALOG__?: unknown;
}).__YOMU_RUNTIME_DICTIONARY_CATALOG__;

if (!runtimeCatalog) {
    throw new Error('The packaged dictionary catalog was not loaded before the reader started.');
}

export default runtimeCatalog;
