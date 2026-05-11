import type { ImmersionKitExample } from './immersion-kit';
import type { ReaderSettings } from './types';

const CONTEXT_PREFIX = 'yomu-mining-context:';
const CONTEXT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 21;
const MINING_SOURCE_KINDS = ['page', 'video', 'image', 'immersion-kit', 'jpdb'] as const;

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
}

export interface StoredMiningContext {
    term: string;
    sentence: string;
    sourceKind: MiningSourceKind;
    sourceTitle: string;
    sourceUrl: string;
    imageUrl?: string;
    immersionIndex?: number;
    immersionTotal?: number;
    updatedAt: number;
}

export interface MiningContext extends StoredMiningContext {
    imageDataUrl?: string;
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

export function createStoredMiningContext(term: string, context: MiningContextDraft, updatedAt = Date.now()): StoredMiningContext | null {
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
}: MiningContextResolutionOptions): Promise<MiningContext> {
    const cleanSentence = normalizeMiningSentence(sentence);
    if (imageDataUrl && cleanSentence) return miningContextWithImage(term, cleanSentence, 'image', imageDataUrl);
    if (videoImageDataUrl && cleanSentence) return miningContextWithImage(term, cleanSentence, 'video', videoImageDataUrl);

    const chosen = activeContext?.term === term ? activeContext : storedContext ?? undefined;
    if (chosen && shouldUseImmersionContext(settings, chosen)) {
        const fetchedImageDataUrl = chosen.imageUrl && settings.immersionKitShowImages && fetchImageDataUrl
            ? await fetchImageDataUrl(chosen.imageUrl, settings.audioTimeoutMs).catch(() => undefined)
            : undefined;
        return { ...chosen, imageDataUrl: fetchedImageDataUrl };
    }

    const context = pageMiningContext(cleanSentence || term, sourceKind ?? inferMiningSourceKind());
    return saveMiningContext(term, context) ?? createFallbackMiningContext(term, context);
}

export function miningContextWithImage(term: string, sentence: string, sourceKind: 'image' | 'video', imageDataUrl: string): MiningContext {
    const context = pageMiningContext(sentence, sourceKind);
    return {
        ...(saveMiningContext(term, context) ?? createFallbackMiningContext(term, context)),
        imageDataUrl,
    };
}

export function saveMiningContext(term: string, context: MiningContextDraft): StoredMiningContext | null {
    const stored = createStoredMiningContext(term, context);
    if (!stored) return null;

    try {
        localStorage.setItem(contextStorageKey(stored.term), JSON.stringify(stored));
    } catch {
        // Metadata-only cache; failing to persist should never block mining.
    }
    return stored;
}

export function loadMiningContext(term: string): StoredMiningContext | null {
    const normalized = term.trim();
    if (!normalized) return null;
    try {
        const raw = localStorage.getItem(contextStorageKey(normalized));
        if (!raw) return null;
        return parseStoredMiningContext(JSON.parse(raw), normalized);
    } catch {
        return null;
    }
}

export function immersionContextFromExample(
    term: string,
    example: ImmersionKitExample,
    index: number,
    total: number,
    imageUrl: string,
): MiningContextDraft {
    return {
        sentence: example.sentence,
        sourceKind: 'immersion-kit',
        sourceTitle: example.sourceTitle || 'Immersion Kit',
        sourceUrl: immersionKitUrl(term, index),
        imageUrl: imageUrl || undefined,
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
    if (context.sourceKind === 'immersion-kit' && context.immersionIndex !== undefined && context.immersionTotal) {
        return `${context.sourceTitle} ${context.immersionIndex + 1}/${context.immersionTotal}`;
    }
    if (context.sourceKind === 'video') return `Video: ${context.sourceTitle}`;
    if (context.sourceKind === 'image') return `Image: ${context.sourceTitle}`;
    if (context.sourceKind === 'jpdb') return `JPDB: ${context.sourceTitle}`;
    return context.sourceTitle || context.sourceUrl || 'Current page';
}

export function shouldUseImmersionContext(settings: ReaderSettings, context: StoredMiningContext | null): context is StoredMiningContext {
    return Boolean(settings.immersionKitEnabled && context?.sourceKind === 'immersion-kit' && context.sentence.trim());
}

function contextStorageKey(term: string): string {
    return `${CONTEXT_PREFIX}${term}`;
}

function parseStoredMiningContext(value: unknown, expectedTerm: string, now = Date.now()): StoredMiningContext | null {
    if (!isRecord(value)) return null;
    if (text(value.term) !== expectedTerm) return null;
    if (!isMiningSourceKind(value.sourceKind)) return null;

    const updatedAt = Number(value.updatedAt);
    if (!Number.isFinite(updatedAt) || now - updatedAt > CONTEXT_MAX_AGE_MS) return null;

    const context = createStoredMiningContext(expectedTerm, {
        sentence: text(value.sentence),
        sourceKind: value.sourceKind,
        sourceTitle: text(value.sourceTitle),
        sourceUrl: text(value.sourceUrl),
        imageUrl: optionalText(value.imageUrl),
        immersionIndex: optionalNumber(value.immersionIndex),
        immersionTotal: optionalNumber(value.immersionTotal),
    }, updatedAt);

    return context;
}

function isMiningSourceKind(value: unknown): value is MiningSourceKind {
    return typeof value === 'string' && (MINING_SOURCE_KINDS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object');
}

function optionalText(value: unknown): string | undefined {
    const normalized = text(value);
    return normalized || undefined;
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
