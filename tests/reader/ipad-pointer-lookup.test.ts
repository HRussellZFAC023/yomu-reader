import { describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { pointerTextLookupFromTextNode, type PointerTextLookup } from '../../src/reader/lookup/pointer-text-lookup';

interface PointerLookupInternals {
    settings: ReaderSettings;
    jitenPublicVocabulary: { lookupMany: (terms: readonly string[]) => Promise<Map<string, JPDBCard>> };
    parseJapanese(paragraphs: string[]): Promise<JPDBToken[][]>;
    publicLookupCard(term: string, exact?: boolean, options?: { allowCandidateLookup?: boolean }): Promise<JPDBCard | undefined>;
    showFirstPointerTextCandidate(
        candidate: PointerTextLookup,
        sentence: string,
        trigger: 'modal' | 'hover',
        options: { userGesture?: boolean },
    ): Promise<void>;
    showPointerTextCard(
        card: JPDBCard,
        sentence?: string,
        candidate?: PointerTextLookup,
        span?: { term: string; start: number; end: number },
    ): Promise<void>;
}

interface PublicLookupInternals {
    settings: ReaderSettings;
    jpdbVocabulary: { search: (term: string, limit: number) => Promise<JPDBCard[]> };
    publicLookupCard(term: string, exact?: boolean): Promise<JPDBCard | undefined>;
}

interface RenderedWordLookupInternals {
    settings: ReaderSettings;
    getCachedCard(vid: number, sid: number): JPDBCard | undefined;
    jitenPublicVocabulary: { lookupMany: (terms: readonly string[]) => Promise<Map<string, JPDBCard>> };
    publicLookupCard(term: string, exact?: boolean, options?: { allowCandidateLookup?: boolean }): Promise<JPDBCard | undefined>;
    showCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options?: unknown): Promise<void>;
    showWord(word: HTMLElement, options?: { trigger?: 'click' | 'hover'; userGesture?: boolean }): Promise<void>;
}

const KANA_RUN_SENTENCE = 'にほんごのじかん';

function testCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 1,
        sid: 2,
        rid: 3,
        spelling: 'よむ',
        reading: 'よむ',
        frequencyRank: 100,
        partOfSpeech: ['v5m'],
        meanings: [{ glosses: ['to read'], partOfSpeech: ['v5m'] }],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        ...overrides,
    };
}

function japaneseLanguageCard(): JPDBCard {
    return testCard({
        vid: 1464530,
        sid: 0,
        spelling: '日本語',
        reading: 'にほんご',
        source: 'jiten',
        meanings: [{ glosses: ['Japanese language'], partOfSpeech: ['n'] }],
    });
}

function fallbackFragmentToken(): JPDBToken {
    return {
        ...token('ほん', 1, 3),
        card: testCard({
            vid: 22,
            sid: 0,
            spelling: 'ほん',
            reading: 'ほん',
            source: 'fallback',
            meanings: [{ glosses: ['fragment'], partOfSpeech: [] }],
        }),
    };
}

function splitKanaRunCandidate(targetId = 'middle', characterOffset = 0): PointerTextLookup | null {
    document.body.innerHTML = '<div><span id="channel-name"><span>に</span><span id="middle">ほん</span><span id="tail">ごのじかん</span></span></div>';
    const target = document.getElementById(targetId)!;
    const node = target.firstChild as Text;
    return pointerTextLookupFromTextNode(node, characterOffset);
}

function setupPointerKanaRunLookup({
    jpdbDefinitionsEnabled = true,
    parsedTokens = [fallbackFragmentToken()],
}: {
    jpdbDefinitionsEnabled?: boolean;
    parsedTokens?: JPDBToken[];
} = {}) {
    const app = new ReaderApp();
    const internals = app as unknown as PointerLookupInternals;
    const jpdbCard = japaneseLanguageCard();
    const shownCards: JPDBCard[] = [];

    internals.settings = {
        ...DEFAULT_SETTINGS,
        apiKey: '',
        jpdbDefinitionsEnabled,
        showPitchAccent: false,
        localDictionariesEnabled: false,
    };
    internals.parseJapanese = vi.fn(async () => [parsedTokens]);
    internals.jitenPublicVocabulary = {
        lookupMany: vi.fn(async terms => new Map(terms.includes('にほんご') ? [['にほんご', jpdbCard]] : [])),
    };
    internals.publicLookupCard = vi.fn(async term => term === 'にほんご' ? jpdbCard : undefined);
    internals.showPointerTextCard = vi.fn(async card => {
        shownCards.push(card);
    });

    return { app, internals, jpdbCard, shownCards };
}

function expectPublicKanaLookupShown(internals: PointerLookupInternals, shownCards: JPDBCard[], jpdbCard: JPDBCard): void {
    expect(internals.jitenPublicVocabulary.lookupMany).toHaveBeenCalledWith(
        expect.arrayContaining(['にほんご']),
        expect.anything(),
    );
    expect(internals.publicLookupCard).not.toHaveBeenCalled();
    expect(shownCards).toEqual([jpdbCard]);
}

async function expectSplitKanaRunLookup(jpdbDefinitionsEnabled: boolean): Promise<void> {
    const { app, internals, jpdbCard, shownCards } = setupPointerKanaRunLookup({ jpdbDefinitionsEnabled });
    const candidate = splitKanaRunCandidate();

    try {
        expect(candidate).toMatchObject({
            text: KANA_RUN_SENTENCE,
            offset: 1,
            start: 0,
            end: 8,
        });

        await internals.showFirstPointerTextCandidate(candidate!, KANA_RUN_SENTENCE, 'modal', { userGesture: true });

        expectPublicKanaLookupShown(internals, shownCards, jpdbCard);
    } finally {
        app.destroy();
        document.body.replaceChildren();
    }
}

function token(spelling: string, start: number, end: number): JPDBToken {
    return {
        card: testCard({
            vid: start + 1,
            spelling,
            reading: spelling,
            meanings: [{ glosses: [spelling], partOfSpeech: [] }],
        }),
        start,
        end,
        length: end - start,
        rubies: [],
        pitchClass: 'unknown',
        sentence: 'よむ',
    };
}

describe('iPad pointer lookup', () => {
    it('reconstructs kana words split across inline mobile text nodes', async () => {
        await expectSplitKanaRunLookup(true);
    });

    it('reconstructs final kana taps split across inline mobile text nodes', async () => {
        const { app, internals, jpdbCard, shownCards } = setupPointerKanaRunLookup();
        const candidate = splitKanaRunCandidate('tail');

        try {
            expect(candidate).toMatchObject({
                text: KANA_RUN_SENTENCE,
                offset: 3,
                start: 0,
                end: 8,
            });

            await internals.showFirstPointerTextCandidate(candidate!, KANA_RUN_SENTENCE, 'modal', { userGesture: true });

            expectPublicKanaLookupShown(internals, shownCards, jpdbCard);
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('uses public kana-run identity when JPDB display and pitch are disabled', async () => {
        await expectSplitKanaRunLookup(false);
    });

    it('uses the full tapped kana run when parsing only finds single-mora fragments', async () => {
        const app = new ReaderApp();
        const anchor = document.createElement('span');
        document.body.append(anchor);
        const internals = app as unknown as PointerLookupInternals;
        const shownCards: JPDBCard[] = [];

        internals.settings = {
            ...DEFAULT_SETTINGS,
            jpdbDefinitionsEnabled: false,
            showPitchAccent: false,
            localDictionariesEnabled: false,
        };
        internals.parseJapanese = vi.fn(async () => [[token('よ', 0, 1), token('む', 1, 2)]]);
        internals.showPointerTextCard = vi.fn(async card => {
            shownCards.push(card);
        });

        try {
            await internals.showFirstPointerTextCandidate(
                { text: 'よむ', offset: 0, start: 0, end: 2, anchor },
                'よむ',
                'modal',
                { userGesture: true },
            );

            expect(shownCards).toHaveLength(1);
            expect(shownCards[0]?.spelling).toBe('よむ');
            expect(shownCards[0]?.source).toBe('fallback');
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it.each([
        { offset: 0, fragment: 'に', fragmentStart: 0, fragmentEnd: 1 },
        { offset: 1, fragment: 'ほ', fragmentStart: 1, fragmentEnd: 2 },
        { offset: 3, fragment: 'ご', fragmentStart: 3, fragmentEnd: 4 },
    ])('resolves にほんごのじかん tap offset $offset through the full public kana word', async ({ offset, fragment, fragmentStart, fragmentEnd }) => {
        const anchor = document.createElement('span');
        document.body.append(anchor);
        const { app, internals, jpdbCard, shownCards } = setupPointerKanaRunLookup({
            parsedTokens: [token(fragment, fragmentStart, fragmentEnd)],
        });

        try {
            await internals.showFirstPointerTextCandidate(
                { text: KANA_RUN_SENTENCE, offset, start: 0, end: 8, anchor },
                KANA_RUN_SENTENCE,
                'modal',
                { userGesture: true },
            );

            expectPublicKanaLookupShown(internals, shownCards, jpdbCard);
            expect(internals.showPointerTextCard).toHaveBeenCalledWith(
                jpdbCard,
                KANA_RUN_SENTENCE,
                expect.objectContaining({ offset, anchor }),
                { term: 'にほんご', start: 0, end: 4 },
                'modal',
                { userGesture: true },
            );
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it.each([
        { surface: 'に', tokenStart: 0, tokenEnd: 1, wrongFragment: 'にほ' },
        { surface: 'ほん', tokenStart: 1, tokenEnd: 3, wrongFragment: 'ほんご' },
        { surface: 'ご', tokenStart: 3, tokenEnd: 4, wrongFragment: 'んご' },
    ])('upgrades cached rendered kana fragment "$surface" through the full public kana word', async ({ surface, tokenStart, tokenEnd, wrongFragment }) => {
        const app = new ReaderApp();
        const internals = app as unknown as RenderedWordLookupInternals;
        const fragmentCard = testCard({
            vid: 2,
            sid: 0,
            spelling: surface,
            reading: surface,
            source: 'fallback',
            meanings: [{ glosses: ['book fragment'], partOfSpeech: [] }],
        });
        const jpdbCard = testCard({
            vid: 1464530,
            sid: 0,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jiten',
            meanings: [{ glosses: ['Japanese language'], partOfSpeech: ['n'] }],
        });
        const wrongCard = testCard({
            vid: 99,
            sid: 0,
            spelling: wrongFragment,
            reading: wrongFragment,
            source: 'jpdb',
            meanings: [{ glosses: ['wrong shorter fragment'], partOfSpeech: ['n'] }],
        });
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-not-in-deck';
        word.textContent = surface;
        word.dataset.vid = '2';
        word.dataset.sid = '0';
        word.dataset.expression = surface;
        word.dataset.reading = surface;
        word.dataset.sentence = 'にほんごのじかん';
        word.dataset.tokenStart = String(tokenStart);
        word.dataset.tokenEnd = String(tokenEnd);
        document.body.append(word);
        const shownCards: JPDBCard[] = [];

        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jpdbDefinitionsEnabled: true,
            showPitchAccent: false,
            localDictionariesEnabled: false,
        };
        internals.getCachedCard = vi.fn((vid, sid) => vid === 2 && sid === 0 ? fragmentCard : undefined);
        internals.jitenPublicVocabulary = {
            lookupMany: vi.fn(async terms => new Map(terms.includes('にほんご') ? [['にほんご', jpdbCard]] : [])),
        };
        internals.publicLookupCard = vi.fn(async term => {
            if (term === 'にほんご') return jpdbCard;
            if (term === wrongFragment) return wrongCard;
            return undefined;
        });
        internals.showCard = vi.fn(async card => {
            shownCards.push(card);
        });

        try {
            await internals.showWord(word, { trigger: 'click', userGesture: true });

            expect(internals.jitenPublicVocabulary.lookupMany).toHaveBeenCalledWith(expect.arrayContaining(['にほんご']));
            expect(internals.publicLookupCard).not.toHaveBeenCalled();
            expect(shownCards).toEqual([jpdbCard]);
            expect(internals.showCard).toHaveBeenCalledWith(
                jpdbCard,
                'にほんごのじかん',
                word,
                expect.objectContaining({ trigger: 'modal', userGesture: true }),
            );
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('accepts an exact JPDB public lookup match by reading', async () => {
        const app = new ReaderApp();
        const internals = app as unknown as PublicLookupInternals;
        const card = testCard({ spelling: '読む', reading: 'よむ', source: 'jpdb' });

        internals.settings = {
            ...DEFAULT_SETTINGS,
            jpdbDefinitionsEnabled: true,
            showPitchAccent: false,
        };
        internals.jpdbVocabulary = {
            search: vi.fn(async () => [card]),
        };

        try {
            await expect(internals.publicLookupCard('よむ', true)).resolves.toBe(card);
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('allows pointer text lookup inside subtitle player and list roots', () => {
        document.body.innerHTML = `
            <div class="jpdb-subtitle-player" data-jpdb-reader-root="true">
                <div class="jpdb-subtitle-text">
                    <span id="target">ハグ</span>
                </div>
            </div>
        `;
        try {
            const target = document.getElementById('target')!;
            const node = target.firstChild as Text;
            const candidate = pointerTextLookupFromTextNode(node, 0);

            expect(candidate).not.toBeNull();
            expect(candidate?.text).toBe('ハグ');
        } finally {
            document.body.replaceChildren();
        }
    });

    it('reads Japanese button labels when interactive text is allowed (hover lookups)', () => {
        document.body.innerHTML = '<button id="subscribe"><span id="label">登録する</span></button>';
        try {
            const node = document.getElementById('label')!.firstChild as Text;

            // Click-driven lookups keep treating controls as controls...
            expect(pointerTextLookupFromTextNode(node, 0)).toBeNull();

            // ...but a hover popover does not steal the click, so it may read
            // the label.
            const candidate = pointerTextLookupFromTextNode(node, 0, { allowInteractiveText: true });
            expect(candidate).not.toBeNull();
            expect(candidate?.text).toContain('登録する');
        } finally {
            document.body.replaceChildren();
        }
    });

    it('reads role=button and onclick hosts with interactive text allowed', () => {
        document.body.innerHTML = `
            <div role="button" id="chip">字幕</div>
            <span onclick="void 0" id="action">設定</span>
        `;
        try {
            const chipNode = document.getElementById('chip')!.firstChild as Text;
            const actionNode = document.getElementById('action')!.firstChild as Text;

            expect(pointerTextLookupFromTextNode(chipNode, 0)).toBeNull();
            expect(pointerTextLookupFromTextNode(actionNode, 0)).toBeNull();
            expect(pointerTextLookupFromTextNode(chipNode, 0, { allowInteractiveText: true })?.text).toContain('字幕');
            expect(pointerTextLookupFromTextNode(actionNode, 0, { allowInteractiveText: true })?.text).toContain('設定');
        } finally {
            document.body.replaceChildren();
        }
    });

    it('never reads structural skips even with interactive text allowed', () => {
        document.body.innerHTML = '<ruby id="word">読む<rt id="furi">よむ</rt></ruby>';
        try {
            const rtNode = document.getElementById('furi')!.firstChild as Text;

            expect(pointerTextLookupFromTextNode(rtNode, 0, { allowInteractiveText: true })).toBeNull();
        } finally {
            document.body.replaceChildren();
        }
    });
});
