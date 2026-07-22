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

export type PageEnhancementLayoutContext = 'entry' | 'review';

const BUNPRO_LOCALE_PREFIX = /^\/(?:en|es|fr|id|ja)(?=\/|$)/;

export function isPageEnhancementHost(): boolean {
    return isJpdbHost() || isJitenHost() || isBunproHost();
}

export function isPageEnhancementReady(): boolean {
    if (isJpdbHost()) return true;
    if (isBunproHost()) return isBunproEnhanceablePage();
    return isJitenHost() && isJitenEnhanceablePage();
}

export function currentPageEnhancementLayoutContext(): PageEnhancementLayoutContext {
    const pathname = location.pathname;
    if (isJpdbHost() && pathname.startsWith('/review')) return 'review';
    if (isJitenHost() && pathname.startsWith('/srs/study')) return 'review';
    if (!isBunproHost()) return 'entry';

    const bunproPathname = pathname.replace(BUNPRO_LOCALE_PREFIX, '') || '/';
    const isReviewRoute = bunproPathname === '/reviews' || bunproPathname.startsWith('/reviews/');
    return isReviewRoute || Boolean(document.querySelector('#js-quiz')) ? 'review' : 'entry';
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
