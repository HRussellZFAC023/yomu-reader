import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import type { AudioDirector } from './director';

const LEARNING_VOICE_CATALOG_URL = '/academy/audio/learning-voice-playback.json';
const LEARNING_VOICE_SCHEMA = 'yomu-academy.learning-voice-playback.v3';

export const LEARNING_VOICE_BINDING_IDENTITIES = Object.freeze({
    'lesson-zero:greeting-rie-model': Object.freeze({
        lineId: 'lesson-zero:greeting-rie-model',
        japanese: 'こんばんは。はじめまして。りえです。よろしくお願いします。',
        sourceSha256: '832669f3318ff75391fb8badac54f8817dded282db4a770df8978a5bd9a136bc',
    }),
    'lesson-zero:vowel:hira-a': Object.freeze({
        lineId: 'lesson-zero:vowel:hira-a',
        japanese: 'あさです',
        sourceSha256: 'f799443c78776f5b5340a58b9d1454fc1ad8dc4111e974eac1755c72ab68afa1',
    }),
    'lesson-zero:vowel:hira-i': Object.freeze({
        lineId: 'lesson-zero:vowel:hira-i',
        japanese: 'いぬです',
        sourceSha256: '37f5138a57017798eaa60549c3d5fa532b864a5ac8535e80a4a596af69a651fe',
    }),
    'lesson-zero:vowel:hira-u': Object.freeze({
        lineId: 'lesson-zero:vowel:hira-u',
        japanese: 'うみです',
        sourceSha256: 'ef31cd953ba025568aaf4b84e3cc7e81e3f3b508c6de66fee12ede24b8978b19',
    }),
    'lesson-zero:vowel:hira-e': Object.freeze({
        lineId: 'lesson-zero:vowel:hira-e',
        japanese: 'えほんです',
        sourceSha256: '824d073e41a20ea93762e4c6e64ed2797448fc05674ac8eb5e8a17bfebc5c55b',
    }),
    'lesson-zero:vowel:hira-o': Object.freeze({
        lineId: 'lesson-zero:vowel:hira-o',
        japanese: 'おちゃです',
        sourceSha256: '11dc3f8cc0b518f844783a3d86e1d24d650874acdc97a9f460ad0ddd57232001',
    }),
    'lesson-zero:classroom-instruction:begin': Object.freeze({
        lineId: 'lesson-zero:classroom-instruction:begin',
        japanese: 'はじめましょう',
        sourceSha256: '1fbd90adcac45c55e62abde3e46439d3a5348552fc4a69b9f78a7edb10e58c52',
    }),
    'lesson-zero:classroom-instruction:finish': Object.freeze({
        lineId: 'lesson-zero:classroom-instruction:finish',
        japanese: 'おわりましょう',
        sourceSha256: '9c5f2de672f343767619e9450b5f7649d72be094c829777a39a201b08c394b6d',
    }),
    'lesson-zero:classroom-instruction:break': Object.freeze({
        lineId: 'lesson-zero:classroom-instruction:break',
        japanese: 'やすみましょう',
        sourceSha256: 'b9041e360b4b73ffcb249050cd789905004ced48a50353f7e626d0c88e545d26',
    }),
    'lesson-zero:classroom-instruction:look': Object.freeze({
        lineId: 'lesson-zero:classroom-instruction:look',
        japanese: 'みてください',
        sourceSha256: '9668a8b62bbb7c64c409ed7186efb71815b77fbfdcd3ed8c74bcbd7b7d67fb7d',
    }),
    'lesson-zero:classroom-instruction:say-together': Object.freeze({
        lineId: 'lesson-zero:classroom-instruction:say-together',
        japanese: 'みなさんでいってください',
        sourceSha256: 'aef85b41f752da817cd2f71a5d514813bc92f65c32cd9fc59c9c067e3a78bc06',
    }),
    'lesson-zero:classroom-instruction:listen': Object.freeze({
        lineId: 'lesson-zero:classroom-instruction:listen',
        japanese: 'きいてください',
        sourceSha256: '6e4eaeb1c7ea595b1d3b0a1dd39dc0d6bae2d544ef4e4565b21796adc3f0d6e9',
    }),
    'lesson-zero:classroom-instruction:write': Object.freeze({
        lineId: 'lesson-zero:classroom-instruction:write',
        japanese: 'かいてください',
        sourceSha256: '69472717888dbcdbd5277f2328ef49f43377f200832ce224244f8cf3ac56af82',
    }),
    'lesson-zero:desk-language:homework': Object.freeze({
        lineId: 'lesson-zero:desk-language:homework',
        japanese: 'しゅくだい。しゅくだいです。',
        sourceSha256: '6d79b7fadcc1887054829bb886255dc2eaced84e8021a528ecb3a82fa9c0ac29',
    }),
    'lesson-zero:desk-language:example': Object.freeze({
        lineId: 'lesson-zero:desk-language:example',
        japanese: 'これは、れいです。れい。',
        sourceSha256: '73e674f41209f7b8dd1b945d973fe88ac51f6dfc510b7546ae4cff246d071a4b',
    }),
    'lesson-zero:sentence-frame:identity:example': Object.freeze({
        lineId: 'lesson-zero:sentence-frame:identity:example',
        japanese: 'ソフィーさんは学生です。',
        sourceSha256: 'ded522f0e2985fa308b651743160eebd98a1bb7f56b67a5d7117e625746f137e',
    }),
    'lesson-zero:sentence-frame:identity:target': Object.freeze({
        lineId: 'lesson-zero:sentence-frame:identity:target',
        japanese: 'わたしは学生です。',
        sourceSha256: '0ce8978c8fe0ab0de70ff341c8997bac83decd5f3672ecd65f4b59e91fc33172',
    }),
    'lesson-zero:sentence-frame:identity:response': Object.freeze({
        lineId: 'lesson-zero:sentence-frame:identity:response',
        japanese: 'はい。学生ですね。よろしくお願いします。',
        sourceSha256: '226d823df4ea4eaf286f9695b0c80ca1266168fb89890fed7f4c06c5d8e3898c',
    }),
    'lesson-zero:sentence-frame:correction:example': Object.freeze({
        lineId: 'lesson-zero:sentence-frame:correction:example',
        japanese: 'ソフィーさんは先生じゃありません。',
        sourceSha256: 'aef95a4ca63097d85c473ccdec70587914edb5442492f48eb5dfefc8eb0a7aca',
    }),
    'lesson-zero:sentence-frame:correction:target': Object.freeze({
        lineId: 'lesson-zero:sentence-frame:correction:target',
        japanese: 'りえ先生は学生じゃありません。',
        sourceSha256: '71cc8bd36c15f7485515f012155b809740d81afd6f3adbe64e65162678dea9ed',
    }),
    'lesson-zero:sentence-frame:correction:response': Object.freeze({
        lineId: 'lesson-zero:sentence-frame:correction:response',
        japanese: 'そうです。わたしは先生です。',
        sourceSha256: '25b5223d3929abf67e68c031e34a8eb9b29676bda7caa7abd1f35f4a1ae5d70d',
    }),
    'lesson-zero:sentence-frame:question:example': Object.freeze({
        lineId: 'lesson-zero:sentence-frame:question:example',
        japanese: 'りえ先生は先生ですか。',
        sourceSha256: '1b3f033e65251a14e49d2280e1cd3d8a1b9a76a5bfc9b6df4204f4ec4e23d0d2',
    }),
    'lesson-zero:sentence-frame:question:target': Object.freeze({
        lineId: 'lesson-zero:sentence-frame:question:target',
        japanese: 'ソフィーさんは学生ですか。',
        sourceSha256: '0a7e793265200f754d798afd6c989cb230590b6d4c2b929cb1247965ff886df7',
    }),
    'lesson-zero:sentence-frame:question:response': Object.freeze({
        lineId: 'lesson-zero:sentence-frame:question:response',
        japanese: 'はい、学生です。よろしく。',
        sourceSha256: 'b5317e038c67ed83aaa0d641a3eae2388dbf36e05816e6c0ae3fc01c8c0f8f60',
    }),
    'lesson-zero:sentence-frame:noun-link:example': Object.freeze({
        lineId: 'lesson-zero:sentence-frame:noun-link:example',
        japanese: '日本語のクラスです。',
        sourceSha256: 'df4e78aa6efb8370ca04f00250afdbfca9e6e35d364f2df15f7743fbc2a89051',
    }),
    'lesson-zero:sentence-frame:noun-link:target': Object.freeze({
        lineId: 'lesson-zero:sentence-frame:noun-link:target',
        japanese: 'りえ先生のクラスです。',
        sourceSha256: 'cf4c2af2c9ba5099c1a725dc82c4269ec0cf2d4ea61ecff5c2cdef76359279fa',
    }),
    'lesson-zero:sentence-frame:noun-link:response': Object.freeze({
        lineId: 'lesson-zero:sentence-frame:noun-link:response',
        japanese: 'はい。今日から、あなたのクラスです。',
        sourceSha256: '326e9c0f1a23afcd8a3161c6b3818f7b662e7e395979e22c7f2bafe0fd792e75',
    }),
    'lesson-zero:sentence-frame:parallel:example': Object.freeze({
        lineId: 'lesson-zero:sentence-frame:parallel:example',
        japanese: 'わたしは学生です。',
        sourceSha256: '0ce8978c8fe0ab0de70ff341c8997bac83decd5f3672ecd65f4b59e91fc33172',
    }),
    'lesson-zero:sentence-frame:parallel:target': Object.freeze({
        lineId: 'lesson-zero:sentence-frame:parallel:target',
        japanese: 'ソフィーさんも学生です。',
        sourceSha256: '7135c35cb21c295c02e6f53151d1ba621cebc146b27f4ef312786a61b69d6f4b',
    }),
    'lesson-zero:sentence-frame:parallel:response': Object.freeze({
        lineId: 'lesson-zero:sentence-frame:parallel:response',
        japanese: 'はい。わたしたちは同じクラスですね。',
        sourceSha256: '6d9a673fb50902191e539ae668f32833e1ae4e69e1aa781a111b255d8a6f13b7',
    }),
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

type LearningVoiceBindingId = keyof typeof LEARNING_VOICE_BINDING_IDENTITIES;

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
    readonly modelLicense: 'ACML-1.0' | 'CC-BY-SA-4.0';
    readonly modelPayloadSha256: string;
    readonly styleId: number;
    readonly styleName: string;
    readonly queryOverrides: Readonly<Record<string, number>>;
    readonly moraOverrides: readonly Readonly<Record<string, number>>[];
    readonly review: Readonly<Record<string, unknown>>;
    readonly reviewStatus: 'accepted';
    readonly qualityApprovalStatus: 'codex-accepted';
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
        codexQualityAccepted: true;
        scope: string;
        ownerLineByLineReviewed: false;
        humanReviewed: false;
    }>;
    readonly acceptancePolicy: Readonly<{
        acceptedBy: 'Codex';
        humanReviewed: false;
        ownerLineByLineReviewed: false;
        independentAudioReviewRequired: true;
        blanketCharacterErrorRateAllowed: false;
        criticalMorphemeNumeralParticleMismatch: 'hard-fail';
    }>;
    readonly engine: Readonly<{
        name: 'AivisSpeech Engine';
        version: string;
        versionResponseSha256: string;
    }>;
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
    dispose?(): void;
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
        || !isLearningVoiceAcceptancePolicy(value.acceptancePolicy)
        || !isRecord(value.engine)
        || value.engine.name !== 'AivisSpeech Engine'
        || typeof value.engine.version !== 'string'
        || typeof value.engine.versionResponseSha256 !== 'string'
        || !SHA256.test(value.engine.versionResponseSha256)
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
    const acceptancePolicy = value.acceptancePolicy as LearningVoiceCatalog['acceptancePolicy'];
    return Object.freeze({
        schema: LEARNING_VOICE_SCHEMA,
        batchId: value.batchId,
        qualityApproval: deepFreeze({ ...qualityApproval }),
        acceptancePolicy: deepFreeze({ ...acceptancePolicy }),
        engine: Object.freeze({
            name: 'AivisSpeech Engine',
            version: value.engine.version,
            versionResponseSha256: value.engine.versionResponseSha256,
        }),
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
    private disposed = false;

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
        if (this.disposed) return { status: 'superseded' };
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
        return !this.disposed && generation === this.playGeneration && !signal.aborted;
    }

    private outcomeFor(generation: number, signal: AbortSignal): ExactLearningVoiceResult {
        return this.isCurrent(generation, signal) ? { status: 'miss' } : { status: 'superseded' };
    }

    private async getCatalog(signal: AbortSignal): Promise<LearningVoiceCatalog> {
        if (this.disposed) throw abortError(signal);
        if (this.catalog) return this.catalog;
        const catalog = await this.catalogSource(signal);
        if (this.disposed || signal.aborted) throw abortError(signal);
        this.catalog = catalog;
        return catalog;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.playGeneration += 1;
        this.activeRequest?.abort(new DOMException('Pronunciation service disposed.', 'AbortError'));
        this.activeRequest = null;
        this.active?.dispose();
        this.active = null;
        this.catalog = null;
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
        && (value.modelLicense === 'ACML-1.0' || value.modelLicense === 'CC-BY-SA-4.0')
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
        && value.qualityApprovalStatus === 'codex-accepted'
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
        && Object.keys(value).sort().join(',') === 'codexQualityAccepted,humanReviewed,ownerLineByLineReviewed,scope'
        && value.codexQualityAccepted === true
        && typeof value.scope === 'string'
        && value.scope.trim() === value.scope
        && value.scope.length > 0
        && value.ownerLineByLineReviewed === false
        && value.humanReviewed === false;
}

function isLearningVoiceAcceptancePolicy(value: unknown): boolean {
    return isRecord(value)
        && Object.keys(value).sort().join(',') === [
            'acceptedBy',
            'blanketCharacterErrorRateAllowed',
            'criticalMorphemeNumeralParticleMismatch',
            'humanReviewed',
            'independentAudioReviewRequired',
            'ownerLineByLineReviewed',
        ].sort().join(',')
        && value.acceptedBy === 'Codex'
        && value.humanReviewed === false
        && value.ownerLineByLineReviewed === false
        && value.independentAudioReviewRequired === true
        && value.blanketCharacterErrorRateAllowed === false
        && value.criticalMorphemeNumeralParticleMismatch === 'hard-fail';
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
    return value.listening.status === 'codex-accepted-objective-and-independent-audio-review'
        && value.listening.codexAccepted === true
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
