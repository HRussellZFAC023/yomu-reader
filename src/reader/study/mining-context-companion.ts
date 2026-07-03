import { yomuKanjiStudyCompanion } from '../companions/registry';
import type * as MiningContextImpl from './mining-context';

export type MiningSourceKind = MiningContextImpl.MiningSourceKind;
export type MiningContextDraft = MiningContextImpl.MiningContextDraft;
export type MiningSourceHints = MiningContextImpl.MiningSourceHints;
export type MiningContextResolutionOptions = MiningContextImpl.MiningContextResolutionOptions;
export type StoredMiningContext = MiningContextImpl.StoredMiningContext;
export type MiningContext = MiningContextImpl.MiningContext;

export const normalizeMiningSentence: typeof MiningContextImpl.normalizeMiningSentence = sentence =>
    yomuKanjiStudyCompanion()?.normalizeMiningSentence?.(sentence) ?? (sentence ?? '').replace(/\s+/g, ' ').trim();

export const inferMiningSourceKind: typeof MiningContextImpl.inferMiningSourceKind = hints =>
    yomuKanjiStudyCompanion()?.inferMiningSourceKind?.(hints) ?? fallbackMiningSourceKind(hints);

export const createFallbackMiningContext: typeof MiningContextImpl.createFallbackMiningContext = (term, context, updatedAt = Date.now()) =>
    yomuKanjiStudyCompanion()?.createFallbackMiningContext?.(term, context, updatedAt) ?? fallbackStoredMiningContext(term, context, updatedAt);

export const resolveMiningContext: typeof MiningContextImpl.resolveMiningContext = async options =>
    yomuKanjiStudyCompanion()?.resolveMiningContext?.(options) ?? fallbackResolveMiningContext(options);

export const saveMiningContext: typeof MiningContextImpl.saveMiningContext = (term, context) =>
    yomuKanjiStudyCompanion()?.saveMiningContext?.(term, context) ?? fallbackStoredMiningContext(term, context, Date.now());

export const loadMiningContext: typeof MiningContextImpl.loadMiningContext = term =>
    yomuKanjiStudyCompanion()?.loadMiningContext?.(term) ?? null;

export const immersionContextFromExample: typeof MiningContextImpl.immersionContextFromExample = (...args) =>
    yomuKanjiStudyCompanion()?.immersionContextFromExample?.(...args) ?? fallbackImmersionContextFromExample(...args);

export const immersionContextFromElement: typeof MiningContextImpl.immersionContextFromElement = (...args) =>
    yomuKanjiStudyCompanion()?.immersionContextFromElement?.(...args) ?? fallbackImmersionContextFromElement(...args);

export const pageMiningContext: typeof MiningContextImpl.pageMiningContext = (sentence, sourceKind = 'page') =>
    yomuKanjiStudyCompanion()?.pageMiningContext?.(sentence, sourceKind) ?? fallbackPageMiningContext(sentence, sourceKind);

export const contextLabel: typeof MiningContextImpl.contextLabel = context =>
    yomuKanjiStudyCompanion()?.contextLabel?.(context) ?? fallbackContextLabel(context);

function fallbackResolveMiningContext(options: MiningContextResolutionOptions): MiningContext {
    const sentence = normalizeMiningSentence(options.sentence) || options.term.trim();
    const sourceKind = options.imageDataUrl
        ? 'image'
        : options.videoImageDataUrl
            ? 'video'
            : options.sourceKind ?? inferMiningSourceKind();
    return {
        ...fallbackStoredMiningContext(options.term, fallbackPageMiningContext(sentence, sourceKind), Date.now()),
        imageDataUrl: options.imageDataUrl ?? options.videoImageDataUrl,
    };
}

function fallbackImmersionContextFromExample(
    term: Parameters<typeof MiningContextImpl.immersionContextFromExample>[0],
    example: Parameters<typeof MiningContextImpl.immersionContextFromExample>[1],
    index: Parameters<typeof MiningContextImpl.immersionContextFromExample>[2],
    total: Parameters<typeof MiningContextImpl.immersionContextFromExample>[3],
    imageUrl: Parameters<typeof MiningContextImpl.immersionContextFromExample>[4],
    audioUrls: Parameters<typeof MiningContextImpl.immersionContextFromExample>[5] = [],
): MiningContextDraft {
    return {
        sentence: example.sentence,
        sourceKind: 'immersion-kit',
        sourceTitle: example.sourceTitle || 'Immersion Kit',
        sourceUrl: `https://www.immersionkit.com/dictionary?keyword=${encodeURIComponent(term)}&sort=sentence_length%3Aasc&page=${index + 1}`,
        imageUrl: imageUrl || undefined,
        audioUrls: audioUrls.length ? audioUrls : undefined,
        immersionIndex: index,
        immersionTotal: total,
    };
}

function fallbackImmersionContextFromElement(sentence: string, element: HTMLElement, sourceUrl = location.href): MiningContextDraft {
    return {
        sentence,
        sourceKind: 'immersion-kit',
        sourceTitle: element.dataset.immersionSourceTitle || 'Immersion Kit',
        sourceUrl,
        imageUrl: optionalText(element.dataset.immersionImageUrl),
        audioUrls: optionalTextArray(parseTextArray(element.dataset.immersionAudioUrls) ?? [element.dataset.immersionAudioUrl]),
        immersionIndex: optionalNumber(Number(element.dataset.immersionIndex ?? 0)),
        immersionTotal: optionalNumber(Number(element.dataset.immersionTotal ?? 0)),
    };
}

function fallbackStoredMiningContext(term: string, context: MiningContextDraft, updatedAt: number): StoredMiningContext {
    return {
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

function fallbackPageMiningContext(sentence: string, sourceKind: MiningSourceKind = 'page'): MiningContextDraft {
    return {
        sentence,
        sourceKind,
        sourceTitle: document.title || location.hostname,
        sourceUrl: location.href,
    };
}

function fallbackMiningSourceKind({ isImageSource, hasVideo, hostname = location.hostname }: MiningSourceHints = {}): MiningSourceKind {
    if (isImageSource) return 'image';
    if (hasVideo) return 'video';
    if (hostname === 'jpdb.io') return 'jpdb';
    return 'page';
}

function fallbackContextLabel(context: StoredMiningContext | MiningContext): string {
    if (context.sourceKind === 'immersion-kit' && context.immersionIndex !== undefined && context.immersionTotal) {
        return `${context.sourceTitle} ${context.immersionIndex + 1}/${context.immersionTotal}`;
    }
    const prefix = context.sourceKind === 'video' || context.sourceKind === 'image' || context.sourceKind === 'jpdb'
        ? context.sourceKind.toUpperCase()
        : '';
    return prefix ? `${prefix}: ${context.sourceTitle}` : context.sourceTitle || context.sourceUrl || 'Current page';
}

function optionalText(value: unknown): string | undefined {
    const text = typeof value === 'string' ? value.trim() : '';
    return text || undefined;
}

function optionalTextArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const values = Array.from(new Set(value.map(optionalText).filter((text): text is string => Boolean(text))));
    return values.length ? values : undefined;
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

function optionalNumber(value: unknown): number | undefined {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : undefined;
}
