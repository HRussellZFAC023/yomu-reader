import {
    yomuAnnotationsCompanion,
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
    'annotation-layout',
    'pitch',
    'audio',
    'nested-lookup',
] as const;

const CORE_RUNTIME_SERVICES = [
    'jiten',
    'yomu-srs',
    'jpdb',
    'audio',
    'nested-lookup',
] as const satisfies readonly ReaderRuntimeService[];

export type ReaderRuntimeService = typeof READER_RUNTIME_SERVICES[number];

export interface ReaderRuntimeHealth {
    readonly version: typeof READER_RUNTIME_HEALTH_VERSION;
    readonly state: 'ready' | 'degraded';
    readonly services: readonly ReaderRuntimeService[];
    readonly missing: readonly ReaderRuntimeService[];
}

const OPTIONAL_RUNTIME_SERVICE_PROBES: ReadonlyArray<readonly [
    ReaderRuntimeService,
    () => boolean,
]> = [
    ['annotation-layout', hasAnnotationLayoutRuntime],
    ['pitch', hasAnnotationLayoutRuntime],
    ['localization', () => typeof yomuI18nCompanion()?.uiText === 'function'],
    ['local-dictionary', () => typeof yomuLocalDictionaries()?.YomitanDictionaryStore === 'function'],
    ['translation', () => typeof yomuKanjiStudyCompanion()?.translateTargetSentence === 'function'],
    ['grammar', hasGrammarRuntime],
    ['mining', hasMiningRuntime],
    ['anki', () => typeof yomuAnkiCompanion()?.AnkiConnectClient === 'function'],
    ['bunpro', () => typeof yomuBunproCompanion()?.BunproClient === 'function'],
];

export function currentReaderRuntimeHealth(): ReaderRuntimeHealth {
    const available = new Set<ReaderRuntimeService>(CORE_RUNTIME_SERVICES);
    for (const [service, isAvailable] of OPTIONAL_RUNTIME_SERVICE_PROBES) {
        if (isAvailable()) available.add(service);
    }
    const services = READER_RUNTIME_SERVICES.filter(service => available.has(service));
    const missing = READER_RUNTIME_SERVICES.filter(service => !available.has(service));
    return {
        version: READER_RUNTIME_HEALTH_VERSION,
        state: missing.length ? 'degraded' : 'ready',
        services,
        missing,
    };
}

function hasAnnotationLayoutRuntime(): boolean {
    const annotations = yomuAnnotationsCompanion();
    return typeof annotations?.syncProjectedReadings === 'function'
        && typeof annotations?.clearProjectedReadings === 'function';
}

function hasGrammarRuntime(): boolean {
    const study = yomuKanjiStudyCompanion();
    return typeof study?.detectGrammarHints === 'function'
        && typeof study?.listLocalGrammarRules === 'function';
}

function hasMiningRuntime(): boolean {
    const study = yomuKanjiStudyCompanion();
    return typeof study?.normalizeMiningSentence === 'function'
        && typeof study?.StudySourceController === 'function';
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
