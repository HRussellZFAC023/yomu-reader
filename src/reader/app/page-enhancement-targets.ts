import {
    currentJpdbTermTarget,
    currentLocalDictionaryTargets,
    extractCurrentKanji,
    isJpdbHost,
    isKanjiPage,
    isKanjiReviewBack,
    isKanjiReviewFront,
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
import {
    currentBunproLocalDictionaryTargets,
    currentBunproTermTarget,
    isBunproEnhanceablePage,
    isBunproHost,
} from '../bunpro/page-targets';

export { isBunproHost, isBunproQuizAnswerHidden } from '../bunpro/page-targets';
export { isJitenHost } from '../jiten/jiten-page-targets';

export function isPageEnhancementHost(): boolean {
    return isJpdbHost() || isJitenHost() || isBunproHost();
}

export function isPageEnhancementReady(): boolean {
    if (isJpdbHost()) return true;
    if (isBunproHost()) return isBunproEnhanceablePage();
    return isJitenHost() && isJitenEnhanceablePage();
}

export function isCurrentKanjiSurface(): boolean {
    if (isBunproHost()) return false;
    if (isJitenHost()) return isJitenKanjiPage();
    return isKanjiPage() || isKanjiReviewFront() || isKanjiReviewBack();
}

export function currentPageKanji(): string {
    if (isBunproHost()) return '';
    return isJitenHost() ? extractCurrentJitenKanji() : extractCurrentKanji();
}

export function currentPageTermTarget(): JpdbTermTarget | null {
    if (isBunproHost()) return currentBunproTermTarget();
    return isJitenHost() ? currentJitenTermTarget() : currentJpdbTermTarget();
}

export function currentPageLocalDictionaryTargets(): LocalDictionaryTarget[] {
    if (isBunproHost()) return currentBunproLocalDictionaryTargets();
    return isJitenHost() ? currentJitenLocalDictionaryTargets() : currentLocalDictionaryTargets();
}
