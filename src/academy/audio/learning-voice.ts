import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import type { AudioDirector } from './director';

export const LEARNING_VOICE_CATALOG_URL = '/academy/audio/learning-voice-playback.json';
export const LEARNING_VOICE_SCHEMA = 'yomu-academy.learning-voice-playback.v3';

export const LEARNING_VOICE_BINDING_IDENTITIES = Object.freeze({
    'lesson-screen:textbook-pair-prompt': Object.freeze({
        lineId: 'lesson-screen:textbook-pair-prompt',
        japanese: 'では、教科書の五ページを開いて、二人で話してください。',
        sourceSha256: '07d4462d7ea11b73a081590ca76c56e646e602df0caf9beb4fb7e81f19d291ff',
    }),
    'world-practice:cafe-coffee-price': Object.freeze({
        lineId: 'world-practice:cafe-coffee-price',
        japanese: 'コーヒーは三百円です。',
        sourceSha256: '6d93b616889866689095753a9b7580236729c693ba52936613e2191526e72f79',
    }),
    'world-practice:cafe-coffee-counter': Object.freeze({
        lineId: 'world-practice:cafe-coffee-counter',
        japanese: 'コーヒーを一つ、お願いします。',
        sourceSha256: '15ad2f7463775fbdafc5675c97f10e88a95205b0b273aec337d24289eb3ade79',
    }),
    'world-practice:lab-classroom-repair': Object.freeze({
        lineId: 'world-practice:lab-classroom-repair',
        japanese: 'もう一度お願いします。',
        sourceSha256: 'c0d3550aa3107ae4883f823b09d3ec758db10797797b3ffec70f1fbd03298690',
    }),
    'world-practice:lab-classroom-repeat': Object.freeze({
        lineId: 'world-practice:lab-classroom-repeat',
        japanese: 'もう一度お願いします。',
        sourceSha256: 'c0d3550aa3107ae4883f823b09d3ec758db10797797b3ffec70f1fbd03298690',
    }),
} satisfies Readonly<Record<string, LearningVoiceLineIdentity>>);

export type LearningVoiceBindingId = keyof typeof LEARNING_VOICE_BINDING_IDENTITIES;

export interface LearningVoiceBinding {
    readonly lineId: string;
    readonly surface: string;
    readonly accessibleReplayLabel: Readonly<{ en: string; ja: string }>;
}

export interface LearningVoiceLineIdentity {
    readonly lineId: string;
    readonly japanese: string;
    readonly sourceSha256: string;
}

export interface LearningVoiceEntry {
    readonly lineId: string;
    readonly bindings: readonly LearningVoiceBinding[];
    readonly speakerId: string;
    readonly role: 'learning-ui' | 'textbook-character' | 'academy-character';
    readonly intent: string;
    readonly locale: 'ja-JP';
    readonly band: 'native';
    readonly surface: string;
    readonly japanese: string;
    readonly sourceSha256: string;
    readonly sourceRevision: string;
    readonly audioQuerySha256: string;
    readonly cacheKey: string;
    readonly assetSha256: string;
    readonly bytes: number;
    readonly durationSeconds: number;
    readonly url: string;
    readonly modelUuid: string;
    readonly modelName: string;
    readonly modelVersion: string;
    readonly modelSourceUrl: string;
    readonly modelLicense: 'ACML-1.0';
    readonly modelPayloadSha256: string;
    readonly styleId: number;
    readonly styleName: string;
    readonly queryOverrides: Readonly<Record<string, number>>;
    readonly moraOverrides: readonly Readonly<Record<string, number>>[];
    readonly review: Readonly<Record<string, unknown>>;
    readonly reviewStatus: 'accepted';
    readonly qualityApprovalStatus: 'owner-approved';
    readonly disclosure: Readonly<{
        synthetic: true;
        officialCharacterVoice: false;
        livingPersonSource: boolean;
    }>;
    readonly provenance: 'Yomu-authored';
}

export interface LearningVoiceCatalog {
    readonly schema: typeof LEARNING_VOICE_SCHEMA;
    readonly batchId: string;
    readonly qualityApproval: Readonly<{
        ownerQualityApproved: true;
        scope: string;
        ownerLineByLineReviewed: false;
        humanReviewed: false;
    }>;
    readonly engine: Readonly<{ name: 'AivisSpeech Engine'; version: string }>;
    readonly encoder: Readonly<{
        name: 'ffmpeg/libopus';
        version: string;
        bitrateKbps: 64;
        application: 'voip';
    }>;
    readonly entries: readonly LearningVoiceEntry[];
}

export interface LearningVoiceMedia {
    preload: string;
    volume: number;
    currentTime: number;
    play(): Promise<void>;
    pause(): void;
    addEventListener(type: 'ended' | 'error', listener: EventListener, options?: AddEventListenerOptions): void;
    removeEventListener(type: 'ended' | 'error', listener: EventListener): void;
}

export interface LearningVoicePlayback extends Disposable {
    /** Resolves only when playback fails after play() has already succeeded. */
    readonly failure: Promise<void>;
    /** Resolves only when playback reaches its natural end. */
    readonly completion: Promise<void>;
}

export type ExactLearningVoiceResult =
    | Readonly<{ status: 'playing'; playback: LearningVoicePlayback }>
    | Readonly<{ status: 'miss' }>
    | Readonly<{ status: 'superseded' }>;

export interface ExactLearningVoiceService {
    playExact(term: string, reading?: string, signal?: AbortSignal): Promise<ExactLearningVoiceResult>;
    playLine?(identity: LearningVoiceLineIdentity, signal?: AbortSignal): Promise<ExactLearningVoiceResult>;
}

export interface StaticLearningVoiceOptions {
    readonly catalog?: LearningVoiceCatalog | Promise<LearningVoiceCatalog>;
    readonly loadCatalog?: (signal?: AbortSignal) => Promise<unknown>;
    readonly createMedia?: (url: string) => LearningVoiceMedia;
}

const SHA256 = /^[a-f0-9]{64}$/u;
const MODEL_UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u;
const LEARNING_URL = /^\/academy\/audio\/learning-lines\/[a-z0-9][a-z0-9._/-]*\.opus$/u;
const LINE_ID = /^[a-z0-9][a-z0-9._:-]*$/u;
const SURFACE_ID = /^[a-z0-9][a-z0-9._-]*$/u;
const QUERY_FIELDS = new Set([
    'speedScale',
    'pitchScale',
    'intonationScale',
    'volumeScale',
    'prePhonemeLength',
    'postPhonemeLength',
    'pauseLengthScale',
]);
const MORA_OVERRIDE_FIELDS = new Set([
    'accentPhrase',
    'mora',
    'pitch',
    'vowel_length',
    'consonant_length',
]);

export async function loadLearningVoiceCatalog(
    url = LEARNING_VOICE_CATALOG_URL,
    fetcher: typeof fetch = fetch,
    signal?: AbortSignal,
): Promise<LearningVoiceCatalog> {
    const response = await fetcher(url, { credentials: 'same-origin', signal });
    if (!response.ok) throw new Error(`Learning voice catalog request failed (${response.status}).`);
    return parseLearningVoiceCatalog(await response.json(), { invalidEntry: 'skip' });
}

export function parseLearningVoiceCatalog(
    value: unknown,
    options: Readonly<{ invalidEntry?: 'reject' | 'skip' }> = {},
): LearningVoiceCatalog {
    if (!isRecord(value)
        || value.schema !== LEARNING_VOICE_SCHEMA
        || typeof value.batchId !== 'string'
        || !LINE_ID.test(value.batchId)
        || !isLearningVoiceQualityApproval(value.qualityApproval)
        || !isRecord(value.engine)
        || value.engine.name !== 'AivisSpeech Engine'
        || typeof value.engine.version !== 'string'
        || !isRecord(value.encoder)
        || value.encoder.name !== 'ffmpeg/libopus'
        || typeof value.encoder.version !== 'string'
        || value.encoder.bitrateKbps !== 64
        || value.encoder.application !== 'voip'
        || !Array.isArray(value.entries)) {
        throw new TypeError('Invalid learning voice playback catalog.');
    }
    const assetLineIds = new Set<string>();
    const bindingLineIds = new Set<string>();
    const entries: LearningVoiceEntry[] = [];
    value.entries.forEach((entry, index) => {
        if (!isLearningVoiceEntry(entry)) {
            if (options.invalidEntry === 'skip') {
                console.warn(`Skipping invalid learning voice playback entry at index ${index}.`);
                return;
            }
            throw new TypeError(`Invalid learning voice playback entry at index ${index}.`);
        }
        const duplicateAsset = assetLineIds.has(entry.lineId);
        const duplicateBinding = entry.bindings.find(binding => bindingLineIds.has(binding.lineId));
        if (duplicateAsset || duplicateBinding) {
            const duplicate = duplicateAsset ? entry.lineId : duplicateBinding?.lineId ?? entry.lineId;
            if (options.invalidEntry === 'skip') {
                console.warn(`Skipping duplicate learning voice playback entry at index ${index}: ${duplicate}.`);
                return;
            }
            throw new TypeError(duplicateAsset
                ? `Duplicate learning voice asset line: ${duplicate}.`
                : `Duplicate learning voice binding: ${duplicate}.`);
        }
        assetLineIds.add(entry.lineId);
        for (const binding of entry.bindings) bindingLineIds.add(binding.lineId);
        entries.push(deepFreeze({ ...entry }));
    });
    if (value.entries.length > 0 && entries.length === 0) {
        throw new TypeError('Learning voice playback catalog contains no usable entries.');
    }
    const qualityApproval = value.qualityApproval as LearningVoiceCatalog['qualityApproval'];
    return Object.freeze({
        schema: LEARNING_VOICE_SCHEMA,
        batchId: value.batchId,
        qualityApproval: deepFreeze({ ...qualityApproval }),
        engine: Object.freeze({ name: 'AivisSpeech Engine', version: value.engine.version }),
        encoder: Object.freeze({
            name: 'ffmpeg/libopus',
            version: value.encoder.version,
            bitrateKbps: 64,
            application: 'voip',
        }),
        entries: Object.freeze(entries),
    });
}

/** Prefer a stable reviewed binding; preserve the ordinary pronunciation ladder as fallback. */
export async function playLearningVoiceBinding(
    pronunciation: PronunciationService,
    bindingId: string,
    japanese: string,
    signal?: AbortSignal,
): Promise<Disposable | null> {
    const identity = LEARNING_VOICE_BINDING_IDENTITIES[bindingId as LearningVoiceBindingId];
    if (identity && identity.japanese === japanese) {
        const capable = pronunciation as PronunciationService & ExactLearningVoiceService;
        const result = await capable.playLine?.(identity, signal);
        if (result?.status === 'playing') return result.playback;
        if (result?.status === 'superseded') return null;
    }
    return pronunciation.play(japanese, undefined, signal);
}

export function resolveLearningVoiceEntry(
    catalog: LearningVoiceCatalog,
    term: string,
    reading?: string,
): LearningVoiceEntry | null {
    const japanese = term.trim();
    const explicitReading = reading?.trim();
    if (!japanese || (explicitReading && explicitReading !== japanese)) return null;
    const matches = catalog.entries.filter(entry => entry.japanese === japanese);
    return matches.length === 1 ? matches[0] : null;
}

/** A runtime binding is playable only while its stable ID, exact text, and source hash all agree. */
export function resolveLearningVoiceLine(
    catalog: LearningVoiceCatalog,
    identity: LearningVoiceLineIdentity,
): LearningVoiceEntry | null {
    const entry = catalog.entries.find(candidate => (
        candidate.bindings.some(binding => binding.lineId === identity.lineId)
    ));
    if (!entry
        || entry.japanese !== identity.japanese
        || entry.sourceSha256 !== identity.sourceSha256) return null;
    return entry;
}

/** Exact static learning voices share the Academy lesson bus and never synthesize arbitrary text. */
export class StaticLearningVoiceService implements ExactLearningVoiceService {
    private readonly catalogSource: (signal: AbortSignal) => Promise<LearningVoiceCatalog>;
    private readonly createMedia: (url: string) => LearningVoiceMedia;
    private catalog: LearningVoiceCatalog | null = null;
    private active: LearningVoicePlayback | null = null;
    private activeRequest: AbortController | null = null;
    private playGeneration = 0;

    constructor(
        private readonly director: AudioDirector,
        options: StaticLearningVoiceOptions = {},
    ) {
        if (options.catalog) {
            this.catalogSource = () => Promise.resolve(options.catalog).then(parseLearningVoiceCatalog);
        } else if (options.loadCatalog) {
            this.catalogSource = signal => options.loadCatalog!(signal).then(parseLearningVoiceCatalog);
        } else {
            this.catalogSource = signal => loadLearningVoiceCatalog(LEARNING_VOICE_CATALOG_URL, fetch, signal);
        }
        this.createMedia = options.createMedia ?? (url => new Audio(url));
    }

    async playExact(term: string, reading?: string, signal?: AbortSignal): Promise<ExactLearningVoiceResult> {
        return this.playResolved(catalog => resolveLearningVoiceEntry(catalog, term, reading), signal);
    }

    async playLine(identity: LearningVoiceLineIdentity, signal?: AbortSignal): Promise<ExactLearningVoiceResult> {
        return this.playResolved(catalog => resolveLearningVoiceLine(catalog, identity), signal);
    }

    private async playResolved(
        resolveEntry: (catalog: LearningVoiceCatalog) => LearningVoiceEntry | null,
        externalSignal?: AbortSignal,
    ): Promise<ExactLearningVoiceResult> {
        const generation = ++this.playGeneration;
        const request = this.beginRequest(externalSignal);
        this.active?.dispose();
        if (request.signal.aborted) {
            request.release();
            return { status: 'superseded' };
        }
        let entry: LearningVoiceEntry | null;
        try {
            entry = resolveEntry(await waitForAbort(this.getCatalog(request.signal), request.signal));
        } catch {
            request.release();
            return this.outcomeFor(generation, request.signal);
        }
        if (!this.isCurrent(generation, request.signal)) {
            request.release();
            return { status: 'superseded' };
        }
        if (!entry) {
            request.release();
            return { status: 'miss' };
        }

        try {
            await waitForAbort(this.director.unlock(), request.signal);
        } catch {
            request.release();
            return this.outcomeFor(generation, request.signal);
        }
        if (!this.isCurrent(generation, request.signal)) {
            request.release();
            return { status: 'superseded' };
        }
        this.active?.dispose();
        let media: LearningVoiceMedia;
        try {
            media = this.createMedia(entry.url);
        } catch {
            request.release();
            return this.outcomeFor(generation, request.signal);
        }
        let releaseDuck: () => void;
        try {
            releaseDuck = this.director.beginExternalLesson();
        } catch {
            request.release();
            return this.outcomeFor(generation, request.signal);
        }
        media.preload = 'auto';
        media.volume = this.director.settings.muted ? 0 : this.director.settings.volumes.lesson;
        let disposed = false;
        let resolveFailure: () => void = () => undefined;
        let resolveCompletion: () => void = () => undefined;
        const failure = new Promise<void>(resolve => { resolveFailure = resolve; });
        const completion = new Promise<void>(resolve => { resolveCompletion = resolve; });
        const release = (pause: boolean) => {
            if (disposed) return;
            disposed = true;
            if (pause) {
                media.pause();
                try {
                    media.currentTime = 0;
                } catch {
                    // Seeking can fail before media metadata has loaded.
                }
            }
            media.removeEventListener('ended', onEnded);
            media.removeEventListener('error', onError);
            request.signal.removeEventListener('abort', onAbort);
            releaseDuck();
            if (this.active === playback) this.active = null;
            request.release();
        };
        const onEnded: EventListener = () => {
            resolveCompletion();
            release(false);
        };
        const onError: EventListener = () => {
            resolveFailure();
            release(false);
        };
        const onAbort = () => release(true);
        const playback: LearningVoicePlayback = {
            failure,
            completion,
            dispose: () => release(true),
        };
        media.addEventListener('ended', onEnded, { once: true });
        media.addEventListener('error', onError, { once: true });
        request.signal.addEventListener('abort', onAbort, { once: true });
        this.active = playback;
        if (!this.isCurrent(generation, request.signal)) {
            playback.dispose();
            return { status: 'superseded' };
        }
        try {
            await waitForAbort(media.play(), request.signal);
            if (!this.isCurrent(generation, request.signal)) {
                playback.dispose();
                return { status: 'superseded' };
            }
            return { status: 'playing', playback };
        } catch {
            playback.dispose();
            return this.outcomeFor(generation, request.signal);
        }
    }

    private beginRequest(externalSignal?: AbortSignal): PlaybackRequest {
        this.activeRequest?.abort();
        const controller = new AbortController();
        this.activeRequest = controller;
        const onExternalAbort = () => controller.abort(externalSignal?.reason);
        if (externalSignal?.aborted) onExternalAbort();
        else externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
        let released = false;
        return {
            signal: controller.signal,
            release: () => {
                if (released) return;
                released = true;
                externalSignal?.removeEventListener('abort', onExternalAbort);
                if (this.activeRequest === controller) this.activeRequest = null;
            },
        };
    }

    private isCurrent(generation: number, signal: AbortSignal): boolean {
        return generation === this.playGeneration && !signal.aborted;
    }

    private outcomeFor(generation: number, signal: AbortSignal): ExactLearningVoiceResult {
        return this.isCurrent(generation, signal) ? { status: 'miss' } : { status: 'superseded' };
    }

    private async getCatalog(signal: AbortSignal): Promise<LearningVoiceCatalog> {
        if (this.catalog) return this.catalog;
        const catalog = await this.catalogSource(signal);
        if (signal.aborted) throw abortError(signal);
        this.catalog = catalog;
        return catalog;
    }
}

interface PlaybackRequest {
    readonly signal: AbortSignal;
    release(): void;
}

function abortError(signal: AbortSignal): unknown {
    return signal.reason ?? new DOMException('Playback aborted.', 'AbortError');
}

function waitForAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(abortError(signal));
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => {
            signal.removeEventListener('abort', onAbort);
            reject(abortError(signal));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        void promise.then(value => {
            signal.removeEventListener('abort', onAbort);
            resolve(value);
        }, error => {
            signal.removeEventListener('abort', onAbort);
            reject(error);
        });
    });
}

function isLearningVoiceEntry(value: unknown): value is LearningVoiceEntry {
    if (!isRecord(value)
        || !isRecord(value.queryOverrides)
        || !Array.isArray(value.bindings)
        || !Array.isArray(value.moraOverrides)) return false;
    const queryOverrides = Object.entries(value.queryOverrides);
    const moraOverrides = value.moraOverrides;
    return typeof value.lineId === 'string'
        && LINE_ID.test(value.lineId)
        && value.bindings.length > 0
        && value.bindings.every(isLearningVoiceBinding)
        && typeof value.speakerId === 'string'
        && LINE_ID.test(value.speakerId)
        && (value.role === 'learning-ui'
            || value.role === 'textbook-character'
            || value.role === 'academy-character')
        && typeof value.intent === 'string'
        && value.intent.trim() === value.intent
        && value.intent.length > 0
        && value.locale === 'ja-JP'
        && value.band === 'native'
        && typeof value.surface === 'string'
        && SURFACE_ID.test(value.surface)
        && typeof value.japanese === 'string'
        && value.japanese.trim() === value.japanese
        && value.japanese.length > 0
        && typeof value.sourceSha256 === 'string'
        && SHA256.test(value.sourceSha256)
        && value.sourceRevision === value.sourceSha256
        && typeof value.cacheKey === 'string'
        && SHA256.test(value.cacheKey)
        && typeof value.audioQuerySha256 === 'string'
        && SHA256.test(value.audioQuerySha256)
        && typeof value.assetSha256 === 'string'
        && SHA256.test(value.assetSha256)
        && Number.isInteger(value.bytes)
        && Number(value.bytes) > 0
        && typeof value.durationSeconds === 'number'
        && value.durationSeconds > 0
        && typeof value.url === 'string'
        && isConfinedLearningUrl(value.url)
        && typeof value.modelUuid === 'string'
        && MODEL_UUID.test(value.modelUuid)
        && typeof value.modelName === 'string'
        && value.modelName.length > 0
        && typeof value.modelVersion === 'string'
        && value.modelVersion.length > 0
        && typeof value.modelSourceUrl === 'string'
        && value.modelSourceUrl === `https://hub.aivis-project.com/aivm-models/${value.modelUuid}`
        && value.modelLicense === 'ACML-1.0'
        && typeof value.modelPayloadSha256 === 'string'
        && SHA256.test(value.modelPayloadSha256)
        && Number.isInteger(value.styleId)
        && typeof value.styleName === 'string'
        && value.styleName.length > 0
        && queryOverrides.length === QUERY_FIELDS.size
        && queryOverrides.every(([field, amount]) => (
            QUERY_FIELDS.has(field) && typeof amount === 'number' && Number.isFinite(amount)
        ))
        && moraOverrides.every(isLearningVoiceMoraOverride)
        && value.reviewStatus === 'accepted'
        && value.qualityApprovalStatus === 'owner-approved'
        && isLearningVoiceReview(value.review)
        && isLearningVoiceDisclosure(value.disclosure)
        && value.provenance === 'Yomu-authored';
}

function isLearningVoiceDisclosure(value: unknown): boolean {
    return isRecord(value)
        && Object.keys(value).sort().join(',') === 'livingPersonSource,officialCharacterVoice,synthetic'
        && value.synthetic === true
        && value.officialCharacterVoice === false
        && typeof value.livingPersonSource === 'boolean';
}

function isLearningVoiceQualityApproval(value: unknown): boolean {
    return isRecord(value)
        && Object.keys(value).sort().join(',') === 'humanReviewed,ownerLineByLineReviewed,ownerQualityApproved,scope'
        && value.ownerQualityApproved === true
        && typeof value.scope === 'string'
        && value.scope.trim() === value.scope
        && value.scope.length > 0
        && value.ownerLineByLineReviewed === false
        && value.humanReviewed === false;
}

function isLearningVoiceBinding(value: unknown): value is LearningVoiceBinding {
    if (!isRecord(value) || !isRecord(value.accessibleReplayLabel)) return false;
    const labels = value.accessibleReplayLabel;
    return typeof value.lineId === 'string'
        && LINE_ID.test(value.lineId)
        && typeof value.surface === 'string'
        && SURFACE_ID.test(value.surface)
        && Object.keys(labels).length === 2
        && isAccessibleLabel(labels.en)
        && isAccessibleLabel(labels.ja);
}

function isLearningVoiceReview(value: unknown): value is Record<string, unknown> {
    if (!isRecord(value)
        || !isRecord(value.naturalness)
        || !isRecord(value.accent)
        || !isRecord(value.pause)
        || !isRecord(value.listening)) return false;
    const common = value.naturalness.status === 'reviewed-text'
        && value.accent.status === 'validated-query-plan'
        && value.pause.status === 'validated-query-plan';
    if (!common) return false;
    return value.listening.status === 'owner-approved-objective-pass'
        && value.listening.ownerQualityApproved === true
        && value.listening.ownerLineByLineReviewed === false
        && typeof value.listening.audioModelReviewed === 'boolean'
        && value.listening.humanReviewed === false
        && Number.isInteger(value.listening.independentAudioModelReviews)
        && Number(value.listening.independentAudioModelReviews) >= 0
        && ((value.listening.audioModelReviewed === true
            && Number(value.listening.independentAudioModelReviews) >= 1)
            || (value.listening.audioModelReviewed === false
                && Number(value.listening.independentAudioModelReviews) === 0));
}

function isLearningVoiceMoraOverride(value: unknown): boolean {
    if (!isRecord(value)) return false;
    const keys = Object.keys(value);
    return keys.length >= 3
        && keys.every(key => MORA_OVERRIDE_FIELDS.has(key))
        && Number.isInteger(value.accentPhrase)
        && Number(value.accentPhrase) >= 0
        && Number.isInteger(value.mora)
        && Number(value.mora) >= 0
        && ['pitch', 'vowel_length', 'consonant_length'].some(field => (
            typeof value[field] === 'number' && Number.isFinite(value[field])
        ))
        && Object.entries(value).every(([field, amount]) => (
            (field === 'accentPhrase' || field === 'mora')
                ? Number.isInteger(amount)
                : typeof amount === 'number' && Number.isFinite(amount)
        ));
}

function isAccessibleLabel(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function isConfinedLearningUrl(value: unknown): value is string {
    return typeof value === 'string'
        && LEARNING_URL.test(value)
        && value.split('/').every(segment => segment !== '.' && segment !== '..');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
    if (Array.isArray(value)) {
        value.forEach(item => deepFreeze(item));
        return Object.freeze(value);
    }
    if (isRecord(value)) {
        Object.values(value).forEach(item => deepFreeze(item));
        return Object.freeze(value) as T;
    }
    return value;
}
