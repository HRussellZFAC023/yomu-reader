type SharedStateRealm = typeof globalThis & { [key: symbol]: unknown };

const SYNTHETIC_INTERACTION_TEST_SLOT = Symbol.for('yomu.reader.synthetic-interaction-tests');

/** Unit tests exercise DOM handlers with synthetic jsdom events. */
export function allowSyntheticReaderInteractionsForTests(allowed: boolean): void {
    (globalThis as SharedStateRealm)[SYNTHETIC_INTERACTION_TEST_SLOT] = allowed;
}

export function syntheticEventsAllowed(): boolean {
    return (globalThis as SharedStateRealm)[SYNTHETIC_INTERACTION_TEST_SLOT] === true;
}

/**
 * The split core and the aggregate @require runtime are separate IIFEs in one
 * userscript sandbox, so module-private mutable state would otherwise exist
 * once per bundle. Share one instance through a sandbox-only slot; like the
 * aggregate runtime seam, it is never cloned into the page realm.
 */
export function sandboxSharedState<T extends object>(key: string, create: () => T): T {
    const realm = globalThis as SharedStateRealm;
    const slot = Symbol.for(key);
    const existing = realm[slot];
    if (existing && typeof existing === 'object') return existing as T;
    const created = create();
    Object.defineProperty(realm, slot, {
        configurable: true,
        enumerable: false,
        value: created,
        writable: true,
    });
    return created;
}
