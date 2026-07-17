import { isNonNullObject as isRecord } from '../core/object-utils';
import type { ImmersionKitExample } from '../immersion/kit';
import { Logger } from '../app/logger';
import { gmStorageGetSync, gmStorageSetSync } from '../app/storage';
import type { ReaderSettings } from '../app/types';

const CONTEXT_PREFIX = 'yomu-mining-context:';
const CONTEXT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 21;
const MINING_SOURCE_KINDS = ['page', 'video', 'image', 'immersion-kit', 'jpdb'] as const;
const log = Logger.scope('MiningContext');

export type MiningSourceKind = 'page' | 'video' | 'image' | 'immersion-kit' | 'jpdb';
export type MiningContextDraft = Omit<StoredMiningContext, 'term' | 'updatedAt'>;

export interface MiningSourceHints {
    isImageSource?: boolean;
    hasVideo?: boolean;
    hostname?: string;
}

export interface MiningContextResolutionOptions {
    term: string;
    sentence?: string;
    settings: ReaderSettings;
    activeContext?: MiningContext;
    storedContext?: StoredMiningContext | null;
    sourceKind?: MiningSourceKind;
    imageDataUrl?: string;
    videoImageDataUrl?: string;
    fetchImageDataUrl?: (imageUrl: string, timeoutMs: number) => Promise<string | undefined>;
    fetchAudioDataUrl?: (audioUrls: string[], timeoutMs: number) => Promise<string | undefined>;
}

export interface StoredMiningContext {
    term: string;
    sentence: string;
    sourceKind: MiningSourceKind;
    sourceTitle: string;
    sourceUrl: string;
    imageUrl?: string;
    audioUrls?: string[];
    immersionIndex?: number;
    immersionTotal?: number;
    updatedAt: number;
}

export interface MiningContext extends StoredMiningContext {
    imageDataUrl?: string;
    audioDataUrl?: string;
}

export function normalizeMiningSentence(sentence?: string): string {
    return (sentence ?? '').replace(/\s+/g, ' ').trim();
}

export function inferMiningSourceKind({ isImageSource, hasVideo, hostname = location.hostname }: MiningSourceHints = {}): MiningSourceKind {
    if (isImageSource) return 'image';
    if (hasVideo) return 'video';
    if (hostname === 'jpdb.io') return 'jpdb';
    return 'page';
}

function createStoredMiningContext(term: string, context: MiningContextDraft, updatedAt = Date.now()): StoredMiningContext | null {
    const normalizedTerm = term.trim();
    const sentence = context.sentence.trim();
    if (!normalizedTerm || !sentence) return null;
    return {
        ...context,
        term: normalizedTerm,
        sentence,
        sourceTitle: context.sourceTitle.trim(),
        sourceUrl: context.sourceUrl.trim(),
        imageUrl: optionalText(context.imageUrl),
        audioUrls: optionalTextArray(context.audioUrls),
        immersionIndex: optionalNumber(context.immersionIndex),
        immersionTotal: optionalNumber(context.immersionTotal),
        updatedAt,
    };
}

export function createFallbackMiningContext(term: string, context: MiningContextDraft, updatedAt = Date.now()): StoredMiningContext {
    return createStoredMiningContext(term, context, updatedAt) ?? {
        ...context,
        term: term.trim(),
        sentence: context.sentence.trim() || term.trim(),
        sourceTitle: context.sourceTitle.trim(),
        sourceUrl: context.sourceUrl.trim(),
        imageUrl: optionalText(context.imageUrl),
        audioUrls: optionalTextArray(context.audioUrls),
        immersionIndex: optionalNumber(context.immersionIndex),
        immersionTotal: optionalNumber(context.immersionTotal),
        updatedAt,
    };
}

export async function resolveMiningContext({
    term,
    sentence,
    settings,
    activeContext,
    storedContext,
    sourceKind,
    imageDataUrl,
    videoImageDataUrl,
    fetchImageDataUrl,
    fetchAudioDataUrl,
}: MiningContextResolutionOptions): Promise<MiningContext> {
    const done = log.time('Resolve mining context', {
        term,
        hasSentence: Boolean(sentence?.trim()),
        activeKind: activeContext?.sourceKind,
        storedKind: storedContext?.sourceKind,
        sourceKind,
        hasImage: Boolean(imageDataUrl),
        hasVideoImage: Boolean(videoImageDataUrl),
    });
    const cleanSentence = normalizeMiningSentence(sentence);
    try {
        const direct = resolveDirectImageMiningContext(term, cleanSentence, imageDataUrl, videoImageDataUrl);
        if (direct) return direct;

        const immersion = await resolveStoredImmersionMiningContext({
            term,
            settings,
            activeContext,
            storedContext,
            fetchImageDataUrl,
            fetchAudioDataUrl,
        });
        return immersion ?? resolvePageMiningContext(term, cleanSentence, sourceKind);
    } finally {
        done();
    }
}

function resolveDirectImageMiningContext(term: string, sentence: string, imageDataUrl?: string, videoImageDataUrl?: string): MiningContext | null {
    if (imageDataUrl && sentence) {
        return miningContextWithImage(term, sentence, 'image', imageDataUrl);
    }
    if (videoImageDataUrl && sentence) {
        return miningContextWithImage(term, sentence, 'video', videoImageDataUrl);
    }
    return null;
}

async function resolveStoredImmersionMiningContext(options: Pick<MiningContextResolutionOptions, 'term' | 'settings' | 'activeContext' | 'storedContext' | 'fetchImageDataUrl' | 'fetchAudioDataUrl'>): Promise<MiningContext | null> {
    const { term, settings, activeContext, storedContext, fetchImageDataUrl, fetchAudioDataUrl } = options;
    const chosen = activeContext?.term === term ? activeContext : storedContext ?? undefined;
    if (!chosen || !shouldUseImmersionContext(settings, chosen)) return null;
    const [fetchedImageDataUrl, fetchedAudioDataUrl] = await Promise.all([
        fetchMiningContextImage(chosen, settings, fetchImageDataUrl),
        fetchMiningContextAudio(chosen, settings, fetchAudioDataUrl),
    ]);
    return { ...chosen, imageDataUrl: fetchedImageDataUrl, audioDataUrl: fetchedAudioDataUrl };
}

function fetchMiningContextImage(
    context: StoredMiningContext,
    settings: ReaderSettings,
    fetchImageDataUrl: MiningContextResolutionOptions['fetchImageDataUrl'],
): Promise<string | undefined> {
    if (!context.imageUrl || !settings.immersionKitShowImages || !fetchImageDataUrl) return Promise.resolve(undefined);
    return fetchImageDataUrl(context.imageUrl, settings.audioTimeoutMs).catch(() => {
        return undefined;
    });
}

function fetchMiningContextAudio(
    context: StoredMiningContext,
    settings: ReaderSettings,
    fetchAudioDataUrl: MiningContextResolutionOptions['fetchAudioDataUrl'],
): Promise<string | undefined> {
    if (!context.audioUrls?.length || !fetchAudioDataUrl) return Promise.resolve(undefined);
    return fetchAudioDataUrl(context.audioUrls, settings.audioTimeoutMs).catch(() => {
        return undefined;
    });
}

function resolvePageMiningContext(term: string, sentence: string, sourceKind: MiningContextResolutionOptions['sourceKind']): MiningContext {
    const context = pageMiningContext(sentence || term, sourceKind ?? inferMiningSourceKind());
    const result = saveMiningContext(term, context) ?? createFallbackMiningContext(term, context);
    return result;
}

function miningContextWithImage(term: string, sentence: string, sourceKind: 'image' | 'video', imageDataUrl: string): MiningContext {
    const context = pageMiningContext(sentence, sourceKind);
    return {
        ...(saveMiningContext(term, context) ?? createFallbackMiningContext(term, context)),
        imageDataUrl,
    };
}

export function saveMiningContext(term: string, context: MiningContextDraft): StoredMiningContext | null {
    const stored = createStoredMiningContext(term, context);
    if (!stored) {
        return null;
    }

    try {
        gmStorageSetSync(contextStorageKey(stored.term), stored);
    } catch (error) {
        log.warn('Mining context save failed', { term: stored.term, sourceKind: stored.sourceKind, error });
        // Metadata-only cache; failing to persist should never block mining.
    }
    return stored;
}

export function loadMiningContext(term: string): StoredMiningContext | null {
    const normalized = term.trim();
    if (!normalized) return null;
    try {
        const stored = gmStorageGetSync<StoredMiningContext | null>(contextStorageKey(normalized), null);
        if (!stored) {
            return null;
        }
        const context = parseStoredMiningContext(stored, normalized);
        return context;
    } catch (error) {
        log.warn('Mining context load failed', { term: normalized, error });
        return null;
    }
}

export function immersionContextFromExample(
    term: string,
    example: ImmersionKitExample,
    index: number,
    total: number,
    imageUrl: string,
    audioUrls: string[] = [],
): MiningContextDraft {
    return {
        sentence: example.sentence,
        sourceKind: 'immersion-kit',
        sourceTitle: example.sourceTitle || 'Immersion Kit',
        sourceUrl: immersionKitUrl(term, index),
        imageUrl: imageUrl || undefined,
        audioUrls: optionalTextArray(audioUrls),
        immersionIndex: index,
        immersionTotal: total,
    };
}

export function immersionContextFromElement(sentence: string, element: HTMLElement, sourceUrl = location.href): MiningContextDraft {
    return {
        sentence,
        sourceKind: 'immersion-kit',
        sourceTitle: element.dataset.immersionSourceTitle || 'Immersion Kit',
        sourceUrl,
        imageUrl: optionalText(element.dataset.immersionImageUrl),
        audioUrls: immersionAudioUrlsFromElement(element),
        immersionIndex: optionalNumber(Number(element.dataset.immersionIndex ?? 0)),
        immersionTotal: optionalNumber(Number(element.dataset.immersionTotal ?? 0)),
    };
}

export function pageMiningContext(sentence: string, sourceKind: MiningSourceKind = 'page'): MiningContextDraft {
    return {
        sentence,
        sourceKind,
        sourceTitle: document.title || location.hostname,
        sourceUrl: location.href,
    };
}

export function contextLabel(context: StoredMiningContext | MiningContext): string {
    const immersionLabel = immersionContextLabel(context);
    if (immersionLabel) return immersionLabel;
    const prefix = CONTEXT_LABEL_PREFIXES[context.sourceKind];
    if (prefix) return `${prefix}: ${context.sourceTitle}`;
    return context.sourceTitle || context.sourceUrl || 'Current page';
}

const CONTEXT_LABEL_PREFIXES: Partial<Record<MiningSourceKind, string>> = {
    video: 'Video',
    image: 'Image',
    jpdb: 'JPDB',
};

function immersionContextLabel(context: StoredMiningContext | MiningContext): string {
    return context.sourceKind === 'immersion-kit' && context.immersionIndex !== undefined && context.immersionTotal
        ? `${context.sourceTitle} ${context.immersionIndex + 1}/${context.immersionTotal}`
        : '';
}

function shouldUseImmersionContext(settings: ReaderSettings, context: StoredMiningContext | null): context is StoredMiningContext {
    return Boolean(settings.immersionKitEnabled && context?.sourceKind === 'immersion-kit' && context.sentence.trim());
}

function contextStorageKey(term: string): string {
    return `${CONTEXT_PREFIX}${term}`;
}

function parseStoredMiningContext(value: unknown, expectedTerm: string, now = Date.now()): StoredMiningContext | null {
    const record = storedMiningContextRecord(value, expectedTerm);
    if (!record) return null;
    const sourceKind = storedMiningSourceKind(record.sourceKind);
    if (!sourceKind) return null;
    const updatedAt = storedMiningContextUpdatedAt(record.updatedAt, now);
    if (updatedAt === null) return null;

    const context = createStoredMiningContext(expectedTerm, {
        sentence: text(record.sentence),
        sourceKind,
        sourceTitle: text(record.sourceTitle),
        sourceUrl: text(record.sourceUrl),
        imageUrl: optionalText(record.imageUrl),
        audioUrls: optionalTextArray(record.audioUrls),
        immersionIndex: optionalNumber(record.immersionIndex),
        immersionTotal: optionalNumber(record.immersionTotal),
    }, updatedAt);

    return context;
}

function storedMiningContextRecord(value: unknown, expectedTerm: string): Record<string, unknown> | null {
    if (!isRecord(value)) return null;
    return text(value.term) === expectedTerm ? value : null;
}

function storedMiningSourceKind(value: unknown): MiningSourceKind | null {
    return isMiningSourceKind(value) ? value : null;
}

function storedMiningContextUpdatedAt(value: unknown, now: number): number | null {
    const updatedAt = Number(value);
    if (!isStoredMiningContextFresh(updatedAt, now)) {
        return null;
    }
    return updatedAt;
}

function isStoredMiningContextFresh(updatedAt: number, now: number): boolean {
    return Number.isFinite(updatedAt) && now - updatedAt <= CONTEXT_MAX_AGE_MS;
}

function isMiningSourceKind(value: unknown): value is MiningSourceKind {
    return typeof value === 'string' && (MINING_SOURCE_KINDS as readonly string[]).includes(value);
}


function optionalText(value: unknown): string | undefined {
    const normalized = text(value);
    return normalized || undefined;
}

function optionalTextArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const values = uniqueTexts(value);
    return values.length ? values : undefined;
}

function immersionAudioUrlsFromElement(element: HTMLElement): string[] | undefined {
    const parsed = parseTextArray(element.dataset.immersionAudioUrls);
    return optionalTextArray(parsed ?? [element.dataset.immersionAudioUrl]);
}

function parseTextArray(value: unknown): unknown[] | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function uniqueTexts(values: unknown[]): string[] {
    return Array.from(new Set(values.map(text).filter(Boolean)));
}

function optionalNumber(value: unknown): number | undefined {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function immersionKitUrl(term: string, index: number): string {
    const url = new URL('https://www.immersionkit.com/dictionary');
    url.searchParams.set('keyword', term);
    url.searchParams.set('sort', 'sentence_length:asc');
    url.searchParams.set('page', String(index + 1));
    return url.toString();
}
