import { yomuKanjiStudyCompanion } from '../companions/registry';
import type * as MiningContextImpl from './mining-context';

export type MiningSourceKind = MiningContextImpl.MiningSourceKind;
export type MiningContextDraft = MiningContextImpl.MiningContextDraft;
export type MiningSourceHints = MiningContextImpl.MiningSourceHints;
export type MiningContextResolutionOptions = MiningContextImpl.MiningContextResolutionOptions;
export type StoredMiningContext = MiningContextImpl.StoredMiningContext;
export type MiningContext = MiningContextImpl.MiningContext;

// Without the Kanji/Study companion no mining UI renders, so these fallbacks
// only keep render paths alive. They stay deliberately minimal — the rich
// normalization and immersion metadata handling live in the companion
// implementation (mining-context.ts), keeping the core bundle inside the
// Greasy Fork size budget.
export const normalizeMiningSentence: typeof MiningContextImpl.normalizeMiningSentence = sentence =>
    yomuKanjiStudyCompanion()?.normalizeMiningSentence?.(sentence) ?? (sentence ?? '').replace(/\s+/g, ' ').trim();

export const inferMiningSourceKind: typeof MiningContextImpl.inferMiningSourceKind = (hints = {}) =>
    yomuKanjiStudyCompanion()?.inferMiningSourceKind?.(hints)
        ?? (hints.isImageSource ? 'image' : hints.hasVideo ? 'video' : (hints.hostname ?? location.hostname) === 'jpdb.io' ? 'jpdb' : 'page');

export const createFallbackMiningContext: typeof MiningContextImpl.createFallbackMiningContext = (term, context, updatedAt = Date.now()) =>
    yomuKanjiStudyCompanion()?.createFallbackMiningContext?.(term, context, updatedAt) ?? fallbackStored(term, context, updatedAt);

export const resolveMiningContext: typeof MiningContextImpl.resolveMiningContext = async options =>
    yomuKanjiStudyCompanion()?.resolveMiningContext?.(options) ?? {
        ...fallbackStored(options.term, fallbackDraft(normalizeMiningSentence(options.sentence) || options.term.trim(),
            options.imageDataUrl ? 'image' : options.videoImageDataUrl ? 'video' : options.sourceKind ?? inferMiningSourceKind()), Date.now()),
        imageDataUrl: options.imageDataUrl ?? options.videoImageDataUrl,
    };

export const saveMiningContext: typeof MiningContextImpl.saveMiningContext = (term, context) =>
    yomuKanjiStudyCompanion()?.saveMiningContext?.(term, context) ?? fallbackStored(term, context, Date.now());

export const loadMiningContext: typeof MiningContextImpl.loadMiningContext = term =>
    yomuKanjiStudyCompanion()?.loadMiningContext?.(term) ?? null;

export const immersionContextFromExample: typeof MiningContextImpl.immersionContextFromExample = (term, example, index, total, imageUrl, audioUrls = []) =>
    yomuKanjiStudyCompanion()?.immersionContextFromExample?.(term, example, index, total, imageUrl, audioUrls) ?? {
        sentence: example.sentence,
        sourceKind: 'immersion-kit',
        sourceTitle: example.sourceTitle || 'Immersion Kit',
        sourceUrl: location.href,
        imageUrl: imageUrl || undefined,
        audioUrls: audioUrls.length ? audioUrls : undefined,
        immersionIndex: index,
        immersionTotal: total,
    };

export const immersionContextFromElement: typeof MiningContextImpl.immersionContextFromElement = (sentence, element, sourceUrl = location.href) =>
    yomuKanjiStudyCompanion()?.immersionContextFromElement?.(sentence, element, sourceUrl) ?? {
        ...fallbackDraft(sentence, 'immersion-kit'),
        sourceTitle: element.dataset.immersionSourceTitle || 'Immersion Kit',
        sourceUrl,
    };

export const pageMiningContext: typeof MiningContextImpl.pageMiningContext = (sentence, sourceKind = 'page') =>
    yomuKanjiStudyCompanion()?.pageMiningContext?.(sentence, sourceKind) ?? fallbackDraft(sentence, sourceKind);

export const contextLabel: typeof MiningContextImpl.contextLabel = context =>
    yomuKanjiStudyCompanion()?.contextLabel?.(context) ?? (context.sourceTitle || context.sourceUrl || 'Current page');

function fallbackDraft(sentence: string, sourceKind: MiningSourceKind): MiningContextDraft {
    return {
        sentence,
        sourceKind,
        sourceTitle: document.title || location.hostname,
        sourceUrl: location.href,
    };
}

function fallbackStored(term: string, context: MiningContextDraft, updatedAt: number): StoredMiningContext {
    return {
        ...context,
        term: term.trim(),
        sentence: context.sentence.trim() || term.trim(),
        updatedAt,
    };
}
