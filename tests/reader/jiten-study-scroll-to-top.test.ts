import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReaderApp } from '../../src/reader/app/main';

// A jiten SRS study session keeps the same /srs/study URL across cards, so
// advancing to the next card must scroll back to the top — but only on a genuine
// new card, never on revealing the same card or on the first card.

interface ReaderAppInternals {
    maybeScrollJitenStudyToNewCard(): void;
}

function stubStudyLocation(): void {
    vi.stubGlobal('location', {
        href: 'https://jiten.moe/srs/study',
        origin: 'https://jiten.moe',
        hostname: 'jiten.moe',
        pathname: '/srs/study',
        search: '',
    });
}

function renderHeadword(term: string): void {
    document.body.innerHTML = `<main><div class="flex-grow flex flex-col"><div class="relative touch-pan-y">
        <div class="w-full mx-auto"><div class="relative bg-surface-0" data-case="card">
            <div class="text-5xl" lang="ja" data-case="headword">${term}</div>
        </div></div></div></main>`;
}

describe('jiten study scroll to top on new card', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        document.body.replaceChildren();
    });

    it('scrolls to top only when the study headword changes to a new card', () => {
        stubStudyLocation();
        const scrollTo = vi.fn();
        vi.stubGlobal('scrollTo', scrollTo);
        const app = new ReaderApp();
        const internals = app as unknown as ReaderAppInternals;

        try {
            // First card: no scroll (the learner is already at the top).
            renderHeadword('友達');
            internals.maybeScrollJitenStudyToNewCard();
            expect(scrollTo).not.toHaveBeenCalled();

            // Revealing the same card leaves the headword unchanged: no scroll.
            internals.maybeScrollJitenStudyToNewCard();
            expect(scrollTo).not.toHaveBeenCalled();

            // Grade -> next card: the headword changes, so scroll to the top.
            renderHeadword('時間');
            internals.maybeScrollJitenStudyToNewCard();
            expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
            expect(scrollTo).toHaveBeenCalledTimes(1);

            // Revealing the second card does not scroll again.
            internals.maybeScrollJitenStudyToNewCard();
            expect(scrollTo).toHaveBeenCalledTimes(1);
        } finally {
            app.destroy();
        }
    });

    it('does not scroll on a jiten page that is not the study session', () => {
        vi.stubGlobal('location', {
            href: 'https://jiten.moe/vocabulary/1234',
            origin: 'https://jiten.moe',
            hostname: 'jiten.moe',
            pathname: '/vocabulary/1234',
            search: '',
        });
        const scrollTo = vi.fn();
        vi.stubGlobal('scrollTo', scrollTo);
        const app = new ReaderApp();
        const internals = app as unknown as ReaderAppInternals;

        try {
            renderHeadword('友達');
            internals.maybeScrollJitenStudyToNewCard();
            renderHeadword('時間');
            internals.maybeScrollJitenStudyToNewCard();
            expect(scrollTo).not.toHaveBeenCalled();
        } finally {
            app.destroy();
        }
    });
});
