import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentJitenTermTarget } from '../../src/reader/jiten/jiten-page-targets';
import { isJitenStudyFrontPrompt } from "../../src/reader/jiten/jiten-page-targets";
import "../../src/reader/companions/register-build-companions";
import { ReaderApp } from "../../src/reader/app/main";

function stubStudyLocation(): void {
    vi.stubGlobal('location', {
        href: 'https://jiten.moe/srs/study',
        origin: 'https://jiten.moe',
        hostname: 'jiten.moe',
        pathname: '/srs/study',
        search: '',
    });
}

function renderStudyPage(options: { revealed: boolean }): void {
    document.title = '百科事典 - Jiten';
    document.body.innerHTML = `
        <main>
            <div class="flex-grow flex flex-col">
                ${options.revealed ? '' : '<button type="button">Show Answer</button>'}
                <div class="relative touch-pan-y">
                    <div class="absolute inset-0 rounded-2xl pointer-events-none z-10 bg-green-500"></div>
                    <div class="w-full mx-auto">
                        <div class="relative bg-surface-0 rounded-2xl shadow-lg" data-case="card">
                            <div lang="ja" data-case="headword">百科事典</div>
                            ${options.revealed ? '<div role="region" aria-label="Answer">' : ''}
                            <div data-case="kanji-breakdown">Kanji breakdown</div>
                            <div data-case="composed-of">Composed of</div>
                            ${options.revealed ? '</div>' : ''}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    `;
}

function stubParseLocation(query: string): void {
    vi.stubGlobal('location', {
        href: `https://jiten.moe/parse?text=${encodeURIComponent(query)}`,
        origin: 'https://jiten.moe',
        hostname: 'jiten.moe',
        pathname: '/parse',
        search: `?text=${encodeURIComponent(query)}`,
    });
}

describe('jiten parse-page addon target', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.replaceChildren();
        document.title = '';
    });

    it('produces no target on a no-results search page (garbage title term + body anchor)', () => {
        stubParseLocation('ペッパピック');
        document.title = 'Search ペッパピック - Jiten';
        document.body.innerHTML = '<div id="__nuxt"><header>Jiten</header><p>No results found for "ペッパピック"</p></div>';

        // Neither bug may resurface: the title fallback must refuse the
        // "Search <query>" chrome as a headword, and with no content column
        // there is no anchor — a document.body anchor once mounted an
        // Immersion Kit addon above the whole app shell.
        expect(currentJitenTermTarget()).toBeNull();
    });

    it('produces no target before the vocab column hydrates, even with a Japanese title', () => {
        stubParseLocation('食べる');
        document.title = '食べる - Jiten';
        document.body.innerHTML = '<div id="__nuxt"></div>';

        expect(currentJitenTermTarget()).toBeNull();
    });

    it('anchors after the vocab column\'s last child once hydrated', () => {
        stubParseLocation('食べる');
        document.title = 'Search 食べる - Jiten';
        document.body.innerHTML = `
            <div id="__nuxt">
                <div class="flex flex-col max-w-2xl">
                    <div class="text-3xl" lang="ja">食べる</div>
                    <div class="mt-2" data-case="last">senses</div>
                </div>
            </div>
        `;

        const target = currentJitenTermTarget();

        expect(target?.term).toBe('食べる');
        expect(target?.anchor.dataset.case).toBe('last');
    });
});

describe('jiten study-page addon anchor', () => {
    it.each(['reveal-leave-from', 'reveal-leave-active', 'reveal-leave-to'])('rejects the outgoing answer during %s', className => {
        stubStudyLocation();
        renderStudyPage({ revealed: true });
        document.querySelector('[aria-label="Answer"]')!.classList.add(className);
        expect(currentJitenTermTarget()).toBeNull();
    });

    it('accepts the native answer during its reveal animation', () => {
        stubStudyLocation();
        renderStudyPage({ revealed: true });
        document.querySelector('[aria-label="Answer"]')!.classList.add('reveal-enter-active');
        expect(currentJitenTermTarget()?.anchor.dataset.case).toBe('composed-of');
    });

    it('ignores answer regions outside the card or inside reader content', () => {
        stubStudyLocation();
        renderStudyPage({ revealed: false });
        document.querySelector('button')!.remove();
        document.body.insertAdjacentHTML('beforeend', '<div role="region" aria-label="Answer"><div>Other answer</div></div>');
        document.querySelector('[data-case="card"]')!.insertAdjacentHTML('beforeend',
            '<div data-jpdb-reader-root><div role="region" aria-label="Answer"><div>Reader answer</div></div></div>');
        expect(currentJitenTermTarget()).toBeNull();
    });

    it('does not treat a write-in front without Show Answer as revealed', () => {
        stubStudyLocation();
        renderStudyPage({ revealed: false });
        document.querySelector('button')!.remove();
        expect(currentJitenTermTarget()).toBeNull();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.replaceChildren();
    });

    it('anchors the addon inside the revealed study card, after its last section', () => {
        stubStudyLocation();
        renderStudyPage({ revealed: true });

        const target = currentJitenTermTarget();

        // Anchored to the card's last section: insertAdjacentElement('afterend')
        // places the addon INSIDE the card, after Composed of.
        expect(target?.anchor.dataset.case).toBe('composed-of');
        expect(target?.anchor.closest('[data-case="card"]')).not.toBeNull();
        expect(target?.anchor.closest('[role="region"][aria-label="Answer"]')).not.toBeNull();
    });

    it('produces no anchor while the answer is hidden so nothing spoils the front', () => {
        stubStudyLocation();
        renderStudyPage({ revealed: false });

        const target = currentJitenTermTarget();

        // No target at all during the question phase: mounting dictionary
        // entries anywhere on the page would spoil the answer. The refresh
        // loop mounts the addon inside the card right after reveal.
        expect(target).toBeNull();
    });
});

describe('jiten study front prompt detection', () => {
    // On the QUESTION side of a jiten SRS study card the learner should see only the
    // headword and recall the reading themselves. The scan drops the front headword
    // (plain prompt) instead of annotating it with furigana + a pitch underline, and
    // re-annotates once the answer is revealed. This guards the front-detection
    // predicate wired into src/reader/app/site-parsers.ts
    // (isReviewCardFrontPromptTarget -> shouldRejectProfileScanTarget).

    function stubLocation(pathname: string): void {
        vi.stubGlobal('location', {
            href: `https://jiten.moe${pathname}`,
            origin: 'https://jiten.moe',
            hostname: 'jiten.moe',
            pathname,
            search: '',
        });
    }

    function renderStudyCard(options: { revealed: boolean }): HTMLElement {
        document.body.innerHTML = `
            <main>
                <div class="flex-grow flex flex-col">
                    ${options.revealed ? '' : '<button type="button">Show Answer</button>'}
                    <div class="relative touch-pan-y">
                        <div class="w-full mx-auto">
                            <div class="relative bg-surface-0 rounded-2xl shadow-lg" data-case="card">
                                <div class="text-5xl" lang="ja" data-case="headword">友達</div>
                                ${options.revealed ? '<div role="region" aria-label="Answer"></div>' : ''}
                            </div>
                        </div>
                    </div>
                </div>
                <p lang="ja" data-case="chrome">読み込み中</p>
            </main>
        `;
        return document.querySelector<HTMLElement>('[data-case="headword"]')!;
    }


    it('keeps a write-in prompt plain without a Show Answer button', () => {
        stubLocation('/srs/study');
        const headword = renderStudyCard({ revealed: false });
        document.querySelector('button')!.remove();
        expect(isJitenStudyFrontPrompt(headword)).toBe(true);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.replaceChildren();
    });

    it('flags the study-card headword while the answer is hidden', () => {
        stubLocation('/srs/study');
        const headword = renderStudyCard({ revealed: false });
        expect(isJitenStudyFrontPrompt(headword)).toBe(true);
    });

    it('does not flag the headword once the answer is revealed', () => {
        stubLocation('/srs/study');
        const headword = renderStudyCard({ revealed: true });
        expect(isJitenStudyFrontPrompt(headword)).toBe(false);
    });

    it('does not flag page chrome outside the study card', () => {
        stubLocation('/srs/study');
        renderStudyCard({ revealed: false });
        const chrome = document.querySelector<HTMLElement>('[data-case="chrome"]')!;
        expect(isJitenStudyFrontPrompt(chrome)).toBe(false);
    });

    it('does not flag anything on a non-study jiten page', () => {
        stubLocation('/vocabulary/1234');
        const headword = renderStudyCard({ revealed: false });
        expect(isJitenStudyFrontPrompt(headword)).toBe(false);
    });
});

describe('jiten study scroll to top on new card', () => {
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
