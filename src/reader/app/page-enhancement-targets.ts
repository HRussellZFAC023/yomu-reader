import {
    currentJpdbTermTarget,
    currentLocalDictionaryTargets,
    extractCurrentKanji,
    isJpdbHost,
    isKanjiPage,
    isKanjiReviewBack,
    type JpdbTermTarget,
    type LocalDictionaryTarget,
} from '../jpdb/jpdb-page-targets';
import {
    currentJitenLocalDictionaryTargets,
    currentJitenTermTarget,
    extractCurrentJitenKanji,
    isJitenEnhanceablePage,
    isJitenHost,
    isJitenKanjiPage,
} from '../jiten/jiten-page-targets';

export { isJitenHost } from '../jiten/jiten-page-targets';

export function isPageEnhancementHost(): boolean {
    return isJpdbHost() || isJitenHost();
}

export function isPageEnhancementReady(): boolean {
    if (isJpdbHost()) return true;
    return isJitenHost() && isJitenEnhanceablePage();
}

export function isCurrentKanjiSurface(): boolean {
    if (isJitenHost()) return isJitenKanjiPage();
    return isKanjiPage() || isKanjiReviewBack();
}

export function currentPageKanji(): string {
    return isJitenHost() ? extractCurrentJitenKanji() : extractCurrentKanji();
}

export function currentPageTermTarget(): JpdbTermTarget | null {
    return isJitenHost() ? currentJitenTermTarget() : currentJpdbTermTarget();
}

export function currentPageLocalDictionaryTargets(): LocalDictionaryTarget[] {
    return isJitenHost() ? currentJitenLocalDictionaryTargets() : currentLocalDictionaryTargets();
}
