import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReaderApp } from '../../src/reader/app/main';
import { ImmersionPopoverController } from '../../src/reader/immersion/popover-controller';
import type { ImmersionKitClient, ImmersionKitExample } from '../../src/reader/immersion/kit';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { currentJitenLocalDictionaryTargets } from '../../src/reader/jiten/jiten-page-targets';
import { saveMiningContext } from '../../src/reader/study/mining-context';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';

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
    jpdbPageEnhancementGeneration: number;
    immersionKit: ImmersionKitClient | null;
    immersionPopover: ImmersionPopoverController | null;
    jitenEnhancementsNeedRefresh(): boolean;
    prefetchJitenStudyImmersion(): void;
    refreshJpdbPageEnhancements(): Promise<void>;
    scheduleJpdbPageEnhancements(delay?: number, options?: { preserveEarlier?: boolean }): void;
    updateJpdbPageAddonHtml(root: HTMLElement, html: string): boolean;
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

function renderStudyCard(options: { term: string; reading?: string; revealed: boolean }): void {
    document.title = `${options.term} - Jiten`;
    const headword = options.reading
        ? `<ruby>${options.term}<rt>${options.reading}</rt></ruby>`
        : options.term;
    document.body.innerHTML = `
        <main>
            <div class="flex-grow flex flex-col">
                ${options.revealed ? '' : '<button type="button">Show Answer</button>'}
                <div class="relative touch-pan-y">
                    <div class="absolute inset-0 rounded-2xl pointer-events-none z-10"></div>
                    <div class="w-full mx-auto">
                        <div class="relative bg-surface-0 rounded-2xl shadow-lg" data-case="card">
                            <div class="text-5xl" lang="ja" data-case="headword">${headword}</div>
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

    it('keeps the first frame-coalesced refresh instead of debouncing it behind later DOM churn', async () => {
        vi.useFakeTimers();
        stubStudyLocation();
        const app = new ReaderApp();
        const internals = app as unknown as ReaderAppInternals;
        const refresh = vi.fn(async () => undefined);
        internals.refreshJpdbPageEnhancements = refresh;

        try {
            internals.scheduleJpdbPageEnhancements(0, { preserveEarlier: true });
            internals.scheduleJpdbPageEnhancements(500, { preserveEarlier: true });
            internals.scheduleJpdbPageEnhancements(300, { preserveEarlier: true });

            await vi.advanceTimersByTimeAsync(0);

            expect(refresh).toHaveBeenCalledTimes(1);
        } finally {
            app.destroy();
            vi.useRealTimers();
        }
    });

    it('promotes an existing shell into the review layout, then preserves a user collapse', () => {
        stubStudyLocation();
        const app = new ReaderApp();
        const internals = app as unknown as ReaderAppInternals;
        const root = document.createElement('div');
        root.dataset.yomuPageContext = 'entry';
        document.body.append(root);
        const initialHtml = `
            <div class="jpdb-reader-definition-stack">
                <details data-source-state-key="definition-source:test"><summary>Dictionary</summary></details>
                <details data-immersion-kit data-source-state-key="definition-source:__immersion_kit__" data-source-initial-open="false">
                    <summary>Immersion Kit</summary>
                    <div data-case="media">Media</div>
                </details>
            </div>
        `;

        try {
            expect(internals.updateJpdbPageAddonHtml(root, initialHtml)).toBe(true);
            root.dataset.yomuPageContext = 'review';
            // Jiten can settle the layout context after the keyed shell HTML is
            // already current. The same-HTML pass must still apply review
            // placement/open state even though no content needs replacing.
            expect(internals.updateJpdbPageAddonHtml(root, initialHtml)).toBe(false);

            const immersion = root.querySelector<HTMLDetailsElement>('[data-immersion-kit]')!;
            expect(root.querySelector('.jpdb-reader-definition-stack')?.firstElementChild).toBe(immersion);
            expect(immersion.open).toBe(true);
            expect(immersion.dataset.sourceInitialOpen).toBe('true');
            expect(immersion.dataset.yomuReviewAutoOpened).toBe('true');

            immersion.open = false;
            expect(internals.updateJpdbPageAddonHtml(root, `
                <div class="jpdb-reader-definition-stack">
                    <details data-immersion-kit><summary>Replacement</summary></details>
                    <div data-case="progressive">Progressive source</div>
                </div>
            `)).toBe(true);

            expect(root.querySelector('[data-immersion-kit]')).toBe(immersion);
            expect(immersion.open).toBe(false);
        } finally {
            app.destroy();
        }
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

    it('refreshes same-spelling homographs when the revealed reading changes', () => {
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
            renderStudyCard({ term: '生', reading: 'なま', revealed: true });
            expect(currentJitenWordAddonKey()).toBe('word:生:なま');
            mountAddonForKey('word:生:せい');
            internals.lastEnhancedHref = location.href;

            expect(internals.jitenEnhancementsNeedRefresh()).toBe(true);
        } finally {
            app.destroy();
        }
    });

    it('removes the stale answer addon during the next question phase without mounting a spoiler', async () => {
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
            // the previous card's addon is still attached. There is no target
            // on the front, but the refresh must still run so it can remove the
            // stale answer within the same transition without mounting a new
            // definition/media surface.
            const showAnswer = document.createElement('button');
            showAnswer.type = 'button';
            showAnswer.textContent = 'Show Answer';
            document.querySelector<HTMLElement>('.flex-grow')!.prepend(showAnswer);
            expect(document.querySelector('[data-yomu-jpdb-addon]')).not.toBeNull();
            expect(currentJitenLocalDictionaryTargets()).toEqual([]);
            expect(internals.jitenEnhancementsNeedRefresh()).toBe(true);

            // The mounted addon belongs to the previous completed generation.
            internals.jpdbPageEnhancementGeneration = 1;
            await internals.refreshJpdbPageEnhancements();

            expect(document.querySelector('[data-yomu-jpdb-addon]')).toBeNull();
            expect(currentJitenLocalDictionaryTargets()).toEqual([]);
        } finally {
            app.destroy();
        }
    });

    it('removes stale content but does not mount into a phased next-card transition', async () => {
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
            internals.jpdbPageEnhancementGeneration = 1;
            internals.lastEnhancedHref = location.href;

            // Jiten can update the new headword one turn before it hides the old
            // answer. The immediate pass must remove stale content, but the new
            // Immersion shell must wait for a stable revealed target.
            renderStudyCardKeepingAddon({ term: '百科事典' });
            await internals.refreshJpdbPageEnhancements();
            expect(document.querySelector('[data-yomu-jpdb-addon]')).toBeNull();

            const showAnswer = document.createElement('button');
            showAnswer.type = 'button';
            showAnswer.textContent = 'Show Answer';
            document.querySelector<HTMLElement>('.flex-grow')!.prepend(showAnswer);
            await internals.refreshJpdbPageEnhancements();

            expect(currentJitenLocalDictionaryTargets()).toEqual([]);
            expect(document.querySelector('[data-yomu-jpdb-addon]')).toBeNull();
        } finally {
            app.destroy();
        }
    });

    it('warms the persisted Immersion example for a hidden Jiten card and only its adjacent review image', async () => {
        stubStudyLocation();
        const term = '食べる';
        const contextKey = `yomu-mining-context:${term}`;
        localStorage.removeItem(contextKey);
        const examples: ImmersionKitExample[] = [
            immersionExample('first', `${term}前。`, 'https://media.test/first.jpg'),
            immersionExample('second', `${term}途中。`, 'https://media.test/second.jpg'),
            immersionExample('third', `${term}後。`, 'https://media.test/third.jpg'),
        ];
        saveMiningContext(term, {
            sentence: examples[1]!.sentence,
            sourceKind: 'immersion-kit',
            sourceTitle: examples[1]!.sourceTitle,
            sourceUrl: 'https://www.immersionkit.com/',
            imageUrl: examples[1]!.imageUrl,
            audioUrls: [],
            immersionIndex: 1,
            immersionTotal: examples.length,
        });

        const rawMediaRequests: string[] = [];
        const mediaCache = new Map<string, Promise<string>>();
        const fetchBlobUrl = vi.fn((url: string | string[]) => {
            const candidate = Array.isArray(url) ? url[0] ?? '' : url;
            let cached = mediaCache.get(candidate);
            if (!cached) {
                rawMediaRequests.push(candidate);
                cached = Promise.resolve(`blob:http://localhost/${candidate}`);
                mediaCache.set(candidate, cached);
            }
            return cached;
        });
        const client = {
            search: vi.fn(async () => examples),
            mediaUrls: vi.fn((example: ImmersionKitExample, kind: 'image' | 'sound') => kind === 'image' ? [example.imageUrl] : []),
            fetchBlobUrl,
        } as unknown as ImmersionKitClient;
        const controller = new ImmersionPopoverController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                immersionKitEnabled: true,
                immersionKitShowImages: true,
                immersionKitAutoPlayAudio: false,
            }),
            client,
            audio: { play: vi.fn(async () => undefined), stop: vi.fn() } as never,
            parseJapanese: vi.fn(async () => []),
            canParseJapanese: () => false,
            parsePopoverJapanese: vi.fn(),
            enrichPitchWords: vi.fn(),
            enrichAnkiWords: vi.fn(),
            repositionPopover: vi.fn(),
            setImmersionTranslationBlurred: vi.fn(),
            toast: vi.fn(),
        });
        const app = new ReaderApp();
        const internals = app as unknown as ReaderAppInternals;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            immersionKitEnabled: true,
            immersionKitShowImages: true,
        };
        internals.immersionKit = client;
        internals.immersionPopover = controller;
        renderStudyCard({ term, revealed: false });

        const reviewRoot = document.createElement('div');
        reviewRoot.dataset.yomuJpdbAddon = 'word';
        reviewRoot.dataset.yomuPageContext = 'review';
        reviewRoot.innerHTML = '<details data-immersion-kit open></details>';

        try {
            internals.prefetchJitenStudyImmersion();
            await vi.waitFor(() => expect(rawMediaRequests).toEqual(['https://media.test/second.jpg']));

            document.body.append(reviewRoot);
            await controller.loadExamples(reviewRoot, jitenCard(term));
            expect(reviewRoot.querySelector<HTMLElement>('.jpdb-reader-example-card')?.dataset.immersionIndex).toBe('1');
            expect(rawMediaRequests).toEqual(['https://media.test/second.jpg']);

            reviewRoot.querySelector<HTMLImageElement>('[data-immersion-image]')?.dispatchEvent(new Event('load'));
            await vi.waitFor(() => expect(rawMediaRequests).toEqual([
                'https://media.test/second.jpg',
                'https://media.test/third.jpg',
            ]));
            expect(rawMediaRequests).not.toContain('https://media.test/first.jpg');
            expect(fetchBlobUrl.mock.calls.flatMap(([url]) => Array.isArray(url) ? url : [url]).some(url => url.endsWith('.mp3'))).toBe(false);
        } finally {
            reviewRoot.remove();
            app.destroy();
            localStorage.removeItem(contextKey);
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

function immersionExample(id: string, sentence: string, imageUrl: string): ImmersionKitExample {
    return {
        id,
        sentence,
        sentenceWithFurigana: '',
        translation: sentence,
        sourceTitle: `Example ${id}`,
        titleSlug: id,
        category: 'drama',
        soundFile: '',
        imageFile: '',
        soundUrl: '',
        imageUrl,
    };
}

function jitenCard(term: string): JPDBCard {
    return {
        vid: 0,
        sid: 0,
        rid: 0,
        spelling: term,
        reading: term,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: [],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jiten',
    };
}
