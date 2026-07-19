import {
    yomuAnkiCompanion,
    yomuBunproCompanion,
    yomuI18nCompanion,
    yomuKanjiStudyCompanion,
    yomuLocalDictionaries,
} from '../companions/registry';

export const READER_RUNTIME_MARKER_ID = 'jpdb-reader-runtime-owner';
const READER_RUNTIME_HEALTH_VERSION = 1;

const READER_RUNTIME_SERVICES = [
    'localization',
    'local-dictionary',
    'jiten',
    'yomu-srs',
    'jpdb',
    'bunpro',
    'translation',
    'grammar',
    'mining',
    'anki',
    'pitch',
    'audio',
    'nested-lookup',
] as const;

export type ReaderRuntimeService = typeof READER_RUNTIME_SERVICES[number];

export interface ReaderRuntimeHealth {
    readonly version: typeof READER_RUNTIME_HEALTH_VERSION;
    readonly state: 'ready' | 'degraded';
    readonly services: readonly ReaderRuntimeService[];
    readonly missing: readonly ReaderRuntimeService[];
}

export function currentReaderRuntimeHealth(): ReaderRuntimeHealth {
    const available = new Set<ReaderRuntimeService>([
        'jiten',
        'yomu-srs',
        'jpdb',
        'pitch',
        'audio',
        'nested-lookup',
    ]);
    const copy = yomuI18nCompanion();
    if (typeof copy?.uiText === 'function') available.add('localization');
    if (typeof yomuLocalDictionaries()?.YomitanDictionaryStore === 'function') available.add('local-dictionary');
    const study = yomuKanjiStudyCompanion();
    if (typeof study?.translateJapaneseSentence === 'function') available.add('translation');
    if (typeof study?.detectGrammarHints === 'function' && typeof study?.listLocalGrammarRules === 'function') available.add('grammar');
    if (typeof study?.normalizeMiningSentence === 'function' && typeof study?.StudySourceController === 'function') available.add('mining');
    if (typeof yomuAnkiCompanion()?.AnkiConnectClient === 'function') available.add('anki');
    if (typeof yomuBunproCompanion()?.BunproClient === 'function') available.add('bunpro');
    const services = READER_RUNTIME_SERVICES.filter(service => available.has(service));
    const missing = READER_RUNTIME_SERVICES.filter(service => !available.has(service));
    return {
        version: READER_RUNTIME_HEALTH_VERSION,
        state: missing.length ? 'degraded' : 'ready',
        services,
        missing,
    };
}

export function publishReaderRuntimeHealth(ownerId: string, root: ParentNode = document): ReaderRuntimeHealth | null {
    const marker = root.querySelector<HTMLElement>(`#${READER_RUNTIME_MARKER_ID}`);
    if (!marker || marker.dataset.yomuRuntimeOwner !== ownerId) return null;
    const health = currentReaderRuntimeHealth();
    marker.dataset.yomuRuntimeHealth = health.state;
    marker.dataset.yomuRuntimeHealthVersion = String(health.version);
    marker.dataset.yomuRuntimeServices = health.services.join(',');
    marker.dataset.yomuRuntimeMissingServices = health.missing.join(',');
    return health;
}

export function clearReaderRuntimeHealth(marker: HTMLElement): void {
    delete marker.dataset.yomuRuntimeHealth;
    delete marker.dataset.yomuRuntimeHealthVersion;
    delete marker.dataset.yomuRuntimeServices;
    delete marker.dataset.yomuRuntimeMissingServices;
}

export function readReaderRuntimeHealth(root: ParentNode = document): ReaderRuntimeHealth | null {
    const marker = root.querySelector<HTMLElement>(`#${READER_RUNTIME_MARKER_ID}`);
    if (!marker) return null;
    const version = Number(marker.dataset.yomuRuntimeHealthVersion);
    if (version !== READER_RUNTIME_HEALTH_VERSION) return null;
    const services = readerRuntimeServices(marker.dataset.yomuRuntimeServices);
    const missing = readerRuntimeServices(marker.dataset.yomuRuntimeMissingServices);
    const state = marker.dataset.yomuRuntimeHealth;
    if (state !== 'ready' && state !== 'degraded') return null;
    return { version: READER_RUNTIME_HEALTH_VERSION, state, services, missing };
}

export function readerRuntimeConforms(
    health: ReaderRuntimeHealth | null,
    required: readonly ReaderRuntimeService[] = READER_RUNTIME_SERVICES,
): boolean {
    if (!health || health.state !== 'ready') return false;
    const available = new Set(health.services);
    return required.every(service => available.has(service));
}

function readerRuntimeServices(value: string | undefined): ReaderRuntimeService[] {
    const values = new Set((value ?? '').split(',').map(item => item.trim()).filter(Boolean));
    return READER_RUNTIME_SERVICES.filter(service => values.has(service));
}
