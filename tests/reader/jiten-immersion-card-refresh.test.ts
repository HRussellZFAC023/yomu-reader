import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReaderApp } from '../../src/reader/app/main';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { currentJitenLocalDictionaryTargets } from '../../src/reader/jiten/jiten-page-targets';
import type { ReaderSettings } from '../../src/reader/app/types';

// The Immersion Kit is mounted inside Yomu's jiten page addon
// ([data-yomu-jpdb-addon]) on jiten.moe. A user reported it "doesn't update
// when I switch to a new card": a jiten SRS study session serves every card
// under the same /srs/study URL, so advancing to the next card changes the
// headword without changing location.href, and the swipe carousel can leave the
// previous card's addon in the DOM. The refresh gate only checked whether *any*
// addon existed, never whether it still matched the current word — so it never
// re-rendered the addon (and its Immersion Kit) for the new card.

interface ReaderAppInternals {
    settings: ReaderSettings;
    lastEnhancedHref: string;
    jitenEnhancementsNeedRefresh(): boolean;
}

// Mirror ReaderApp.jpdbPageWordAddonKey without reaching into private state, so
// the reproduction fails at the gate assertion (not a missing helper) on the
// unfixed build.
function currentJitenWordAddonKey(): string {
    const [target] = currentJitenLocalDictionaryTargets();
    return target ? `word:${target.term}:${target.reading}` : '';
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

function renderStudyCard(options: { term: string; revealed: boolean }): void {
    document.title = `${options.term} - Jiten`;
    document.body.innerHTML = `
        <main>
            <div class="flex-grow flex flex-col">
                ${options.revealed ? '' : '<button type="button">Show Answer</button>'}
                <div class="relative touch-pan-y">
                    <div class="absolute inset-0 rounded-2xl pointer-events-none z-10"></div>
                    <div class="w-full mx-auto">
                        <div class="relative bg-surface-0 rounded-2xl shadow-lg" data-case="card">
                            <div class="text-5xl" lang="ja" data-case="headword">${options.term}</div>
                            <div data-case="kanji-breakdown">Kanji breakdown</div>
                            <div data-case="composed-of">Composed of</div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    `;
}

function mountAddonForKey(key: string): HTMLElement {
    const card = document.querySelector<HTMLElement>('[data-case="card"]')!;
    const addon = document.createElement('div');
    addon.dataset.jpdbReaderRoot = 'true';
    addon.dataset.yomuJpdbAddon = 'word';
    addon.dataset.yomuAddonKey = key;
    addon.dataset.yomuGeneration = '1';
    addon.dataset.yomuAnchorFallback = 'false';
    addon.innerHTML = '<details data-immersion-kit open><summary>Immersion Kit</summary></details>';
    // Real code inserts the addon after the card's last section (composed-of),
    // so it becomes the card's last child — mirror that here.
    card.append(addon);
    return addon;
}

describe('jiten in-place card swap refresh gate', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.replaceChildren();
        document.title = '';
    });

    it('re-renders the addon when the study card word changes under the same URL', () => {
        stubStudyLocation();
        const app = new ReaderApp();
        const internals = app as unknown as ReaderAppInternals;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            jpdbPageEnhancementsEnabled: true,
            jpdbPageWordEnhancementsEnabled: true,
            immersionKitEnabled: true,
        };

        try {
            // Card A revealed and enhanced: mount the addon with exactly the key
            // the enhancement pipeline would produce for the current headword.
            renderStudyCard({ term: '食べる', revealed: true });
            const keyA = currentJitenWordAddonKey();
            expect(keyA).toBe('word:食べる:食べる');
            mountAddonForKey(keyA);
            internals.lastEnhancedHref = location.href;

            // Steady state — same word, matching addon: no refresh (no churn).
            expect(internals.jitenEnhancementsNeedRefresh()).toBe(false);

            // Grade → next card: the headword changes in place, the URL stays
            // /srs/study, and the previous card's addon is still in the DOM.
            renderStudyCardKeepingAddon({ term: '百科事典' });

            // The gate must now request a refresh so the addon (and its
            // Immersion Kit) is rebuilt for the new word. Before the fix this
            // returned false and the stale card lingered.
            expect(internals.jitenEnhancementsNeedRefresh()).toBe(true);
        } finally {
            app.destroy();
        }
    });

    it('does not churn when only the headword reading drifts for the same word', () => {
        stubStudyLocation();
        const app = new ReaderApp();
        const internals = app as unknown as ReaderAppInternals;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            jpdbPageEnhancementsEnabled: true,
            jpdbPageWordEnhancementsEnabled: true,
            immersionKitEnabled: true,
        };

        try {
            // Current DOM headword resolves its reading from the spelling (no
            // furigana), i.e. word:食べる:食べる.
            renderStudyCard({ term: '食べる', revealed: true });
            expect(currentJitenWordAddonKey()).toBe('word:食べる:食べる');
            // The addon was mounted earlier while jiten furigana was present, so
            // its stored key carries the kana reading. Only the reading half
            // differs; it is the same card. Keying the refresh on the reading
            // too would tear the addon down and refetch the Immersion Kit on
            // every furigana-hydration flip — the gate must stay quiet.
            mountAddonForKey('word:食べる:たべる');
            internals.lastEnhancedHref = location.href;

            expect(internals.jitenEnhancementsNeedRefresh()).toBe(false);
        } finally {
            app.destroy();
        }
    });

    it('does not churn during the question phase, when no answer is revealed yet', () => {
        stubStudyLocation();
        const app = new ReaderApp();
        const internals = app as unknown as ReaderAppInternals;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            jpdbPageEnhancementsEnabled: true,
            jpdbPageWordEnhancementsEnabled: true,
            immersionKitEnabled: true,
        };

        try {
            renderStudyCard({ term: '食べる', revealed: true });
            mountAddonForKey(currentJitenWordAddonKey());
            internals.lastEnhancedHref = location.href;

            // Next card's question phase: a "Show Answer" button appears while
            // the previous card's addon is still attached. With the answer
            // hidden there is no target, so the gate must stay quiet (a refresh
            // here would spoil the front); the stale addon is corrected on
            // reveal, not before.
            const showAnswer = document.createElement('button');
            showAnswer.type = 'button';
            showAnswer.textContent = 'Show Answer';
            document.querySelector<HTMLElement>('.flex-grow')!.prepend(showAnswer);
            expect(document.querySelector('[data-yomu-jpdb-addon]')).not.toBeNull();
            expect(currentJitenLocalDictionaryTargets()).toEqual([]);
            expect(internals.jitenEnhancementsNeedRefresh()).toBe(false);
        } finally {
            app.destroy();
        }
    });
});

// Rewrite the study card headword in place (same URL) while leaving the
// previously mounted addon node attached to the card, reproducing jiten's
// carousel reusing the card container across grades.
function renderStudyCardKeepingAddon(options: { term: string }): void {
    document.title = `${options.term} - Jiten`;
    const headword = document.querySelector<HTMLElement>('[data-case="headword"]')!;
    headword.textContent = options.term;
}
