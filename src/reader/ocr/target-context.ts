import type { JPDBCard } from '../app/types';
import { stablePositiveHashId } from '../core/stable-hash';
import {
    activeLearningTarget,
    activeLearningTargetGeneration,
    activeLearningTargetLanguage,
} from '../languages/target-runtime';
import { normalizeFallbackTerm } from '../lookup/japanese-segments';

export interface OcrTargetContext {
    readonly generation: number;
    cacheKey(contentKey: string): string;
    workKey(contentKey: string): string;
    isCurrent(): boolean;
    requireCurrent(staleState: unknown): void;
}

export interface OcrTargetWork {
    readonly target: OcrTargetContext;
    readonly contentKey: string;
    readonly cacheKey: string;
    readonly workKey: string;
}

interface OcrScanOwner {
    scan?: symbol;
    loading: boolean;
    manualRequested: boolean;
}

export function claimOcrScan(owner: OcrScanOwner): symbol {
    const token = Symbol('ocr-scan');
    owner.scan = token;
    owner.loading = true;
    return token;
}

export function releaseOcrScan(owner: OcrScanOwner, token: symbol): void {
    if (owner.scan !== token) return;
    owner.scan = undefined;
    owner.loading = false;
    owner.manualRequested = false;
}

/** Captures the target identity shared by every async stage of one OCR render. */
export function captureOcrTargetContext(): OcrTargetContext {
    const target = activeLearningTarget();
    const generation = activeLearningTargetGeneration();
    const isCurrent = () => activeLearningTarget() === target
        && activeLearningTargetGeneration() === generation;
    return {
        generation,
        cacheKey: contentKey => `${contentKey}\n@yomu-target:${target.language}`,
        workKey: contentKey => `${contentKey}\n@yomu-target:${target.language}:${generation}`,
        isCurrent,
        requireCurrent(staleState: unknown): void {
            if (!isCurrent()) throw staleState;
        },
    };
}

/** Namespaces reusable OCR work by the target whose provider hint produced it. */
export function ocrTargetCacheKey(contentKey: string): string {
    return captureOcrTargetContext().cacheKey(contentKey);
}

export function ocrTargetWorkKey(contentKey: string): string {
    return captureOcrTargetContext().workKey(contentKey);
}

/** Separates reusable per-language OCR results from one selection epoch's live work. */
export function ocrTargetWork(
    contentKey: string,
    target = captureOcrTargetContext(),
): OcrTargetWork {
    return {
        target,
        contentKey,
        cacheKey: target.cacheKey(contentKey),
        workKey: target.workKey(contentKey),
    };
}

/** Builds a target-scoped fallback card for OCR gaps. */
export function ocrFallbackCardFromText(text: string): JPDBCard {
    const spelling = normalizeFallbackTerm(text);
    const language = activeLearningTargetLanguage();
    const id = -stablePositiveHashId(`ocr-fallback\n${language}\n${spelling}`);
    return {
        vid: id,
        sid: id,
        rid: 0,
        spelling,
        reading: '',
        language,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'fallback',
    };
}
