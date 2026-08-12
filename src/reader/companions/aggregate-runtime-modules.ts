export interface AggregateRuntimeModules {
    readonly deinflection: Pick<
        typeof import('../lookup/deinflect'),
        | 'deinflectJapaneseTerm'
        | 'termRulesMatch'
    >;
    readonly settings: typeof import('../settings');
    readonly tokenTextRendering: Pick<
        typeof import('../dom/token-text-rendering'),
        | 'PITCH_CLASSES'
        | 'effectiveTokenRubies'
        | 'inferredInflectedSurfaceRubies'
        | 'isParticleCard'
        | 'localRubyRange'
        | 'miningInsightTokenKey'
        | 'miningInsightTokenKeys'
        | 'nonOverlappingTokens'
        | 'readerCardId'
        | 'readerCardSource'
        | 'readerReadingIndex'
        | 'readerWordClassName'
        | 'renderHighlightedTextHtml'
        | 'renderKanjiNavigationText'
        | 'renderRuby'
        | 'renderTokenReadings'
        | 'shouldHideFuriganaForCardState'
        | 'shouldRenderRuby'
        | 'tokenPitchClass'
    >;
    readonly localYomuDeck: Pick<
        typeof import('../srs/local-yomu-deck'),
        | 'mergeStoredYomuSrsCards'
        | 'mergeStoredYomuSrsDecks'
        | 'normalizeStoredYomuSrsDeck'
        | 'removeAcademyVocabularyProvenance'
        | 'upsertAcademyVocabulary'
    >;
    readonly interfaceDirection: Pick<
        typeof import('../locales/direction'),
        | 'applyInterfaceLocaleToRoot'
        | 'formatIsolated'
        | 'isRtlInterface'
    >;
    readonly interfaceLocaleResolution: Pick<
        typeof import('../locales/resolve'),
        'resolveInterfaceLocale'
    >;
    readonly handleDrag: Pick<
        typeof import('../popup/handle-drag'),
        | 'addViewportChangeListeners'
        | 'createHandleDragController'
        | 'firstChangedTouch'
        | 'getContainedClosest'
    >;
}

// The aggregate @require runtime and the split core are separate IIFEs in one
// userscript sandbox. Share implementation Modules through a sandbox-only slot
// so each stays readable but is emitted once. Unlike the public companion
// registry, this internal seam is never cloned into Firefox's page realm.
const AGGREGATE_RUNTIME_MODULES_SLOT = Symbol.for('yomu.aggregate-runtime-modules.v1');

type AggregateRuntimeRealm = typeof globalThis & { [key: symbol]: unknown };

export function registerAggregateRuntimeModules(modules: AggregateRuntimeModules): void {
    Object.defineProperty(globalThis as AggregateRuntimeRealm, AGGREGATE_RUNTIME_MODULES_SLOT, {
        configurable: true,
        enumerable: false,
        value: modules,
        writable: true,
    });
}

export function aggregateRuntimeModules(): AggregateRuntimeModules {
    const modules = (globalThis as AggregateRuntimeRealm)[AGGREGATE_RUNTIME_MODULES_SLOT];
    if (!isAggregateRuntimeModules(modules)) {
        throw new Error('The Yomu aggregate runtime Modules are not installed.');
    }
    return modules;
}

function isAggregateRuntimeModules(value: unknown): value is AggregateRuntimeModules {
    if (!value || typeof value !== 'object') return false;
    return [
        aggregateRuntimeMember(value, 'deinflection', 'deinflectJapaneseTerm'),
        aggregateRuntimeMember(value, 'deinflection', 'termRulesMatch'),
        aggregateRuntimeMember(value, 'settings', 'normalizeReaderSettings'),
        aggregateRuntimeMember(value, 'tokenTextRendering', 'renderRuby'),
        aggregateRuntimeMember(value, 'localYomuDeck', 'normalizeStoredYomuSrsDeck'),
        aggregateRuntimeMember(value, 'interfaceDirection', 'applyInterfaceLocaleToRoot'),
        aggregateRuntimeMember(value, 'interfaceLocaleResolution', 'resolveInterfaceLocale'),
        aggregateRuntimeMember(value, 'handleDrag', 'createHandleDragController'),
    ].every(member => typeof member === 'function');
}

function aggregateRuntimeMember(value: object, moduleName: string, memberName: string): unknown {
    const module = Reflect.get(value, moduleName) as unknown;
    if (!module || typeof module !== 'object') return undefined;
    return Reflect.get(module, memberName) as unknown;
}
