import { describe, expect, it, vi } from 'vitest';
import { hostedAccentCssVariables } from '../../../src/reader/core/hosted-accent-css';
import {
    registerReaderHelpersCleanup,
    DEFAULT_SETTINGS,
    DOCS_THEME_CSS,
    DOCS_THEME_TS,
    IMMERSION_STUDY_CSS,
    JpdbClient,
    KANJI_CSS,
    NEW_TAB_CSS,
    POPOVER_CORE_CSS,
    ReaderApp,
    SETTINGS_CSS,
    SETTINGS_DRAWER_HEIGHT_STORAGE_KEY,
    SHEET_HEIGHT_STORAGE_KEY,
    STATS_CSS,
    SUBTITLES_YOUTUBE_CSS,
    card,
    createFallbackJpdbDeckFetchMock,
    createJpdbDeckVocabularyFetchMock,
    createJpdbParseFetchMock,
    createReaderBackdrop,
    createReaderPopover,
    createSheetPopoverFixture,
    createStackedReaderSettingsFixture,
    dispatchTouchEvent,
    expectScheduledDeckCards,
    expectSettingsDialogStillMounted,
    expectStackedLookupOverSettings,
    installSettingsDrawerHandle,
    installSheetCloseButton,
    installSheetHandle,
    installVisualViewportFixture,
    jpdbDeckVocabularyInfoRow,
    jpdbJsonResponse,
    jpdbParseResultToTokens,
    jpdbVocabularyToCards,
    newTabSettingsJapaneseParserFixture,
    renderPitch,
    renderSettingsForm,
    renderTokensToHtml,
    renderedWordPrivateValue,
    restoreWindowDescriptor,
    setInnerHtml,
    settingsJapaneseParserFixture,
    shouldUseSheet,
    waitForExpect,
    withViewport,
} from './fixtures';
import type {
    JPDBCard,
    JPDBRawToken,
    JPDBToken,
} from './fixtures';

registerReaderHelpersCleanup();

describe('reader helpers', () => {
    it('adds cards to JPDB FORQ without parsing the web prioritize response as JSON', async () => {
        const client = new JpdbClient(() => 'token');
        const fetchMock = vi.fn(async (url: string | URL) => {
            const href = String(url);
            if (href === 'https://jpdb.io/prioritize') {
                return {
                    status: 200,
                    ok: true,
                    text: async () => '<!doctype html><html></html>',
                };
            }
            if (href === 'https://jpdb.io/api/v1/lookup-vocabulary') {
                return {
                    status: 200,
                    ok: true,
                    text: async () => JSON.stringify({
                        vocabulary_info: [[1, 2, 3, '食べる', 'たべる', 100, ['v1'], [['to eat']], [['v1']], ['new'], ['LHH']]],
                    }),
                };
            }
            throw new Error(`Unexpected URL: ${href}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const addedCard = { ...card };
            await expect(client.addToDeck('forq', addedCard)).resolves.toBeUndefined();
            expect(addedCard.cardState).toEqual(['new']);
            expect(fetchMock).toHaveBeenCalledWith('https://jpdb.io/prioritize', expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ v: 1, s: 2, origin: '/' }),
            }));
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('sends numeric user-deck ids as JSON numbers when adding and removing deck vocabulary', async () => {
        const client = new JpdbClient(() => 'token');
        const deckBodies: string[] = [];
        const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
            const href = String(url);
            if (href === 'https://jpdb.io/api/v1/deck/add-vocabulary' || href === 'https://jpdb.io/api/v1/deck/remove-vocabulary') {
                deckBodies.push(String(init?.body));
                return { status: 200, ok: true, text: async () => '{}' };
            }
            if (href === 'https://jpdb.io/api/v1/lookup-vocabulary') {
                return {
                    status: 200,
                    ok: true,
                    text: async () => JSON.stringify({
                        vocabulary_info: [[1, 2, 3, '食べる', 'たべる', 100, ['v1'], [['to eat']], [['v1']], ['new'], ['LHH']]],
                    }),
                };
            }
            throw new Error(`Unexpected URL: ${href}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(client.addToDeck('37100', { ...card })).resolves.toBeUndefined();
            await expect(client.removeFromDeck('37100', { ...card })).resolves.toBeUndefined();
            expect(deckBodies).toEqual([
                JSON.stringify({ id: 37100, vocabulary: [[1, 2]] }),
                JSON.stringify({ id: 37100, vocabulary: [[1, 2]] }),
            ]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('routes hosted JPDB API calls through the configured proxy before direct fetch', async () => {
        const proxyUrl = 'https://yomu-proxy.example/fetch';
        const target = 'https://jpdb.io/api/v1/list-user-decks';
        const client = new JpdbClient(() => 'token', () => proxyUrl);
        const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            expect(String(url)).toBe(`${proxyUrl}?url=${encodeURIComponent(target)}`);
            expect(init?.method).toBe('POST');
            expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token');
            return {
                status: 200,
                ok: true,
                text: async () => JSON.stringify({ decks: [['1', 'Main']] }),
            };
        });
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html',
            origin: 'https://hrussellzfac023.github.io',
            hostname: 'hrussellzfac023.github.io',
            pathname: '/yomu-reader/newtab/index.html',
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(client.listDecks()).resolves.toEqual([{ id: '1', name: 'Main' }]);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not retry the same rejected JPDB API key on later requests', async () => {
        const client = new JpdbClient(() => 'rejected-token');
        const fetchMock = vi.fn(async () => ({
            status: 403,
            ok: false,
            text: async () => 'forbidden',
        }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(client.listDecks()).rejects.toThrow('JPDB rejected the API key.');
            await expect(client.listDecks()).rejects.toThrow('JPDB rejected the API key.');

            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('retries retryable JPDB read requests after transient connection resets', async () => {
        const client = new JpdbClient(() => 'token');
        const fetchMock = vi.fn(async () => {
            if (fetchMock.mock.calls.length === 1) throw new Error('PR_END_OF_FILE_ERROR');
            return jpdbJsonResponse({ decks: [['1', 'Main']] });
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(client.listDecks()).resolves.toEqual([{ id: '1', name: 'Main' }]);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not retry JPDB write requests after connection resets', async () => {
        const client = new JpdbClient(() => 'token');
        const fetchMock = vi.fn(async () => {
            throw new Error('PR_END_OF_FILE_ERROR');
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(client.reviewCard(card, 'okay')).rejects.toThrow('PR_END_OF_FILE_ERROR');
            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('backs off after repeated JPDB connection failures', async () => {
        const client = new JpdbClient(() => 'token');
        const fetchMock = vi.fn(async () => {
            throw new Error('Failed to fetch');
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(client.listDecks()).rejects.toThrow('Failed to fetch');
            await expect(client.listDecks()).rejects.toThrow('JPDB connection is cooling down');
            expect(fetchMock).toHaveBeenCalledTimes(2);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('scans the whole JPDB deck in one bulk lookup and keeps only scheduled cards', async () => {
        const client = new JpdbClient(() => 'token');
        const lookupBatches: Array<Array<[number, number]>> = [];
        const fetchMock = createJpdbDeckVocabularyFetchMock({
            vocabulary: Array.from({ length: 205 }, (_, index) => {
                const vid = index + 1;
                return [vid, vid + 1000];
            }),
            lookupVocabulary: body => {
                const list = body.list ?? [];
                lookupBatches.push(list);
                return list.map(([vid, sid]) => [
                    vid,
                    sid,
                    vid + 2000,
                    `語${vid}`,
                    `ご${vid}`,
                    vid,
                    ['n'],
                    [[`word ${vid}`]],
                    [['n']],
                    vid === 150 ? ['due'] : vid === 151 ? ['new'] : ['known'],
                    [],
                ]);
            },
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const cards = await client.listDeckCards('deck', 2, { scheduledOnly: true });

            expect(cards.map(card => card.spelling)).toEqual(['語150', '語151']);
            // The API answers tens of thousands of pairs per call, so the
            // whole deck resolves in one bulk lookup instead of 100-pair
            // chunks (the chunked scan timed out on big accounts).
            expect(lookupBatches.map(batch => batch.length)).toEqual([205]);
            expect(lookupBatches[0][0]).toEqual([1, 1001]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('keeps locked JPDB deck cards in scheduled deck order', async () => {
        const client = new JpdbClient(() => 'token');
        const fetchMock = createJpdbDeckVocabularyFetchMock({
            vocabulary: [[1, 11], [2, 22], [3, 33]],
            lookupVocabulary: body => {
                const byVid: Record<number, string[]> = {
                    1: ['locked'],
                    2: ['due'],
                    3: ['known'],
                };
                return (body.list ?? []).map(pair => jpdbDeckVocabularyInfoRow(pair, { state: byVid[pair[0]] ?? ['known'] }));
            },
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const cards = await client.listDeckCards('deck', 10, { scheduledOnly: true });

            expectScheduledDeckCards(cards, ['語1', '語2']);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('lists all-decks scheduled JPDB vocabulary from the listed-decks union without requesting the bogus all id', async () => {
        const client = new JpdbClient(() => 'token');
        const requestedDecks: unknown[] = [];
        const fetchMock = createFallbackJpdbDeckFetchMock({
            requestedDecks,
            vocabularyForDeck: deckId => deckId === 'deck-a' ? [[9, 99], [7, 77]] : [[8, 88], [7, 77]],
            lookupVocabulary: body => {
                const byVid: Record<number, string[]> = {
                    7: ['due'],
                    8: ['known'],
                    9: ['locked'],
                };
                return (body.list ?? []).slice().reverse().map(pair => jpdbDeckVocabularyInfoRow(pair, {
                    spellingPrefix: '全',
                    readingPrefix: 'ぜん',
                    meaningPrefix: 'all',
                    state: byVid[pair[0]] ?? ['known'],
                }));
            },
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const cards = await client.listDeckCards('all', 10, { scheduledOnly: true });

            // 'all' is not a real jpdb API deck id (bad_deck): only the
            // listed decks are requested, duplicate pairs collapse.
            expect(requestedDecks).toEqual(['deck-a', 'deck-b']);
            expectScheduledDeckCards(cards, ['全9', '全7']);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('orders the JPDB study queue by due_at exactly like jpdb Learn', async () => {
        const client = new JpdbClient(() => 'token');
        const fetchMock = createJpdbDeckVocabularyFetchMock({
            vocabulary: [[1, 11], [2, 22], [3, 33], [4, 44]],
            lookupVocabulary: body => (body.list ?? []).map(pair => jpdbDeckVocabularyInfoRow(pair, {
                state: pair[0] === 4 ? ['new'] : ['due'],
                // deck order 1,2,3 but due times 3 < 1 < 2; the new card
                // (no due_at) comes after every timed card.
                dueAt: pair[0] === 1 ? 2000 : pair[0] === 2 ? 3000 : pair[0] === 3 ? 1000 : null,
            })),
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const cards = await client.listDeckCards('deck', 10, { scheduledOnly: true });
            expect(cards.map(card => card.spelling)).toEqual(['語3', '語1', '語2', '語4']);
            expect(cards[0]?.dueAt).toBe(1000);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('preserves JPDB deck vocabulary order after lookup responses are shuffled', async () => {
        const client = new JpdbClient(() => 'token');
        const fetchMock = createJpdbDeckVocabularyFetchMock({
            vocabulary: [[1, 11], [2, 22], [3, 33]],
            lookupVocabulary: body => {
                const list = [...(body.list ?? [])].reverse();
                return list.map(pair => jpdbDeckVocabularyInfoRow(pair, { state: ['new'], reviewState: ['new'] }));
            },
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const cards = await client.listDeckCards('deck', 3);

            expect(cards.map(card => card.spelling)).toEqual(['語1', '語2', '語3']);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('checks JPDB membership against the listed-decks vocabulary pool', async () => {
        const client = new JpdbClient(() => 'token');
        const requestedDecks: unknown[] = [];
        const fetchMock = createFallbackJpdbDeckFetchMock({
            requestedDecks,
            vocabularyForDeck: deckId => deckId === 'deck-b' ? [[1464530, 0]] : [[1, 1]],
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(client.isInUserDeckPool({ ...card, vid: 1464530, sid: 0 })).resolves.toBe(true);
            await expect(client.isInUserDeckPool({ ...card, vid: 777, sid: 0 })).resolves.toBe(false);
            expect(requestedDecks).toEqual(['deck-a', 'deck-b']);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('lists all-decks cards through the listed decks union', async () => {
        const client = new JpdbClient(() => 'token');
        const requestedDecks: unknown[] = [];
        const lookupPairs: Array<[number, number]> = [];
        const fetchMock = createFallbackJpdbDeckFetchMock({
            requestedDecks,
            vocabularyForDeck: deckId => deckId === 'deck-b' ? [[1464530, 0]] : [[12345, 0]],
            lookupVocabulary: body => {
                const list = body.list ?? [];
                lookupPairs.push(...list);
                return list.map(pair => jpdbDeckVocabularyInfoRow(pair, { state: ['due'], idOffset: 2000 }));
            },
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const cards = await client.listDeckCards('all', 10, { scheduledOnly: true });
            expect(requestedDecks).toEqual(expect.arrayContaining(['deck-a', 'deck-b']));
            expect(requestedDecks).not.toEqual(expect.arrayContaining(['all']));
            expect(cards.map(c => c.vid)).toEqual(expect.arrayContaining([1464530, 12345]));
            expect(lookupPairs).toEqual(expect.arrayContaining([[1464530, 0], [12345, 0]]));
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('reuses JPDB parse results for individual paragraphs after a batch parse', async () => {
        const client = new JpdbClient(() => 'token');
        const parseBodies: string[][] = [];
        const fetchMock = createJpdbParseFetchMock(
            parseBodies,
            paragraph => paragraph,
            paragraph => `meaning ${paragraph}`,
            paragraph => paragraph.length,
        );
        vi.stubGlobal('fetch', fetchMock);

        try {
            const [cat, dog] = await client.parse(['猫', '犬']);
            const [cachedCat] = await client.parse(['猫']);
            const [catAgain, bird] = await client.parse(['猫', '鳥']);

            expect(cat[0].card.spelling).toBe('猫');
            expect(dog[0].card.spelling).toBe('犬');
            expect(cachedCat[0].card.spelling).toBe('猫');
            expect(catAgain[0].card.spelling).toBe('猫');
            expect(bird[0].card.spelling).toBe('鳥');
            expect(parseBodies).toEqual([
                ['猫', '犬'],
                ['鳥'],
            ]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('batches large JPDB parse requests by UTF-8 size like the reference reader', async () => {
        const client = new JpdbClient(() => 'token');
        const parseBodies: string[][] = [];
        const fetchMock = createJpdbParseFetchMock(
            parseBodies,
            paragraph => paragraph.slice(0, 2),
            (_paragraph, index) => `meaning ${index}`,
            () => 2,
        );
        vi.stubGlobal('fetch', fetchMock);

        try {
            const first = '喧嘩'.repeat(1500);
            const second = '日本語'.repeat(1000);
            const [firstTokens, secondTokens] = await client.parse([first, second]);

            expect(firstTokens[0].card.spelling).toBe('喧嘩');
            expect(secondTokens[0].card.spelling).toBe('日本');
            expect(parseBodies).toEqual([[first], [second]]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('runs split JPDB parse batches concurrently while preserving paragraph order', async () => {
        const client = new JpdbClient(() => 'token');
        const first = '猫'.repeat(3000);
        const second = '犬'.repeat(3000);
        const requestOrder: string[] = [];
        const responseOrder: string[] = [];
        let resolveFirst!: () => void;
        const responseFor = (text: string[]) => ({
            status: 200,
            ok: true,
            text: async () => JSON.stringify({
                vocabulary: text.map((paragraph, index) => [
                    index + 1,
                    index + 2,
                    index + 3,
                    paragraph.slice(0, 1),
                    paragraph.slice(0, 1),
                    100 + index,
                    [],
                    [[`meaning ${paragraph.slice(0, 1)}`]],
                    [[]],
                    ['new'],
                    [],
                ]),
                tokens: text.map((_paragraph, index) => [[index, 0, 1, null]]),
            }),
        });
        const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body ?? '{}')) as { text?: string[] };
            const text = body.text ?? [];
            requestOrder.push(text[0] ?? '');
            if (text[0] === first) {
                return new Promise<ReturnType<typeof responseFor>>(resolve => {
                    resolveFirst = () => {
                        responseOrder.push('first');
                        resolve(responseFor(text));
                    };
                });
            }
            responseOrder.push('second');
            return Promise.resolve(responseFor(text));
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const parsed = client.parse([first, second]);
            await waitForExpect(() => expect(fetchMock).toHaveBeenCalledTimes(2));

            expect(requestOrder).toEqual([first, second]);
            expect(responseOrder).toEqual(['second']);

            resolveFirst();
            const [firstTokens, secondTokens] = await parsed;

            expect(firstTokens[0].card.spelling).toBe('猫');
            expect(secondTokens[0].card.spelling).toBe('犬');
            expect(responseOrder).toEqual(['second', 'first']);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('clears in-flight JPDB parses when caches are reset', async () => {
        const client = new JpdbClient(() => 'token');
        let resolveFirst!: (response: { status: number; ok: boolean; text: () => Promise<string> }) => void;
        const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body ?? '{}')) as { text?: string[] };
            const text = body.text ?? [];
            const response = {
                status: 200,
                ok: true,
                text: async () => JSON.stringify({
                    vocabulary: text.map((paragraph, index) => [
                        index + 1,
                        index + 2,
                        index + 3,
                        paragraph,
                        paragraph,
                        100 + index,
                        [],
                        [[`meaning ${paragraph}`]],
                        [[]],
                        ['new'],
                        [],
                    ]),
                    tokens: text.map((paragraph, index) => [[index, 0, paragraph.length, null]]),
                }),
            };
            if (fetchMock.mock.calls.length === 1) {
                return new Promise<typeof response>(resolve => {
                    resolveFirst = resolve;
                });
            }
            return Promise.resolve(response);
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const first = client.parse(['猫']);
            client.clear();
            const second = client.parse(['猫']);
            resolveFirst({
                status: 200,
                ok: true,
                text: async () => JSON.stringify({
                    vocabulary: [[9, 10, 11, '猫', '猫', 100, [], [['old']], [[]], ['new'], []]],
                    tokens: [[[0, 0, 1, null]]],
                }),
            });

            await expect(first).resolves.toHaveLength(1);
            await expect(second).resolves.toHaveLength(1);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('normalizes JPDB card states before using them for reader word classes', () => {
        const [neverForget, fallback] = jpdbVocabularyToCards([
            [1, 2, 3, '読む', 'よむ', 100, [], [], [], ['never_forget'], []],
            [4, 5, 6, '未知語', 'みちご', null, [], [], [], ['mystery-state'], []],
        ]);

        expect(neverForget.cardState).toEqual(['never-forget']);
        expect(fallback.cardState).toEqual(['not-in-deck']);

        const html = renderTokensToHtml('読む', [{
            card: { ...card, cardState: ['never_forget'] as unknown as JPDBCard['cardState'], spelling: '読む', reading: 'よむ' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
            sentence: '読む',
        }], DEFAULT_SETTINGS);

        expect(html).toContain('jpdb-reader-word jpdb-never-forget');
    });

    it('keeps JPDB particles visually neutral while leaving them clickable', () => {
        const text = '青空の下で';
        const tokens: JPDBToken[] = [
            {
                card: { ...card, vid: 10, sid: 10, spelling: '青空', reading: 'あおぞら', partOfSpeech: ['n'], cardState: ['known'] },
                start: 0,
                end: 2,
                length: 2,
                rubies: [{ text: 'あおぞら', start: 0, end: 2, length: 2 }],
                pitchClass: 'heiban',
                sentence: text,
            },
            {
                card: { ...card, vid: 11, sid: 11, spelling: 'の', reading: 'の', partOfSpeech: ['prt'], cardState: ['known'] },
                start: 2,
                end: 3,
                length: 1,
                rubies: [],
                pitchClass: 'heiban',
                sentence: text,
            },
            {
                card: { ...card, vid: 12, sid: 12, spelling: 'で', reading: '', partOfSpeech: [], cardState: ['not-in-deck'], source: 'fallback' },
                start: 4,
                end: 5,
                length: 1,
                rubies: [],
                pitchClass: '',
                sentence: text,
            },
        ];

        setInnerHtml(document.body, renderTokensToHtml(text, tokens, DEFAULT_SETTINGS));
        const particle = document.querySelector<HTMLElement>('[data-expression="の"]');
        const fallbackParticle = document.querySelector<HTMLElement>('[data-expression="で"]');

        try {
            expect(particle?.classList.contains('jpdb-reader-word')).toBe(true);
            expect(particle?.classList.contains('jpdb-reader-particle')).toBe(true);
            expect(particle && renderedWordPrivateValue(particle, 'vid')).toBe('11');
            expect(particle?.dataset.vid).toBeUndefined();
            expect(particle?.classList.contains('jpdb-known')).toBe(true);
            // Particles are deliberately accentless: a leaked homophone
            // pattern must not paint an underline, and ALL particles share the
            // same class instead of splitting into heiban/unknown by luck.
            expect(particle?.classList.contains('jpdb-pitch-particle')).toBe(true);
            expect(particle?.classList.contains('jpdb-pitch-heiban')).toBe(false);
            expect(fallbackParticle?.classList.contains('jpdb-reader-particle')).toBe(true);
            expect(fallbackParticle?.classList.contains('jpdb-not-in-deck')).toBe(true);
            expect(fallbackParticle?.classList.contains('fallback-not-in-deck')).toBe(false);
            expect(fallbackParticle && renderedWordPrivateValue(fallbackParticle, 'cardSource')).toBe('fallback');
            expect(fallbackParticle?.classList.contains('jpdb-pitch-particle')).toBe(true);
        } finally {
            document.body.replaceChildren();
        }
    });

    it('uses JPDB token ruby to repair ambiguous kanji readings from context', () => {
        const text = '青空の下で';
        const cards = jpdbVocabularyToCards([
            [1300, 0, 0, '下', 'もと', 1300, ['adv', 'n'], [['under guidance']], [['n']], ['locked'], ['LH']],
        ]);
        const rawTokens: JPDBRawToken[][] = [[[0, 3, 1, [['下', 'した']]]]];
        const [[token]] = jpdbParseResultToTokens([text], rawTokens, cards);
        const html = renderTokensToHtml(text, [token], DEFAULT_SETTINGS);

        expect(token.card.reading).toBe('した');
        expect(token.card.sourceCardKey).toBe('1300:0:下:もと');
        expect(token.card.pitchAccent).toEqual([]);
        expect(html).toContain('data-expression="下"');
        expect(html).toContain('data-reading="した"');
        expect(html).not.toContain('data-reading="もと"');
    });

    it('keeps supplementary-kanji ruby and token coordinates in UTF-16 units', () => {
        const text = 'A𠮟る';
        const supplementaryCard: JPDBCard = {
            ...card,
            spelling: '𠮟る',
            reading: '𠮟る',
            pitchAccent: [],
            wordWithReading: null,
        };
        const rawTokens: JPDBRawToken[][] = [[[0, 1, 3, [['𠮟', 'しか'], 'る']]]];

        const [[token]] = jpdbParseResultToTokens([text], rawTokens, [supplementaryCard]);

        expect(token).toMatchObject({
            start: 1,
            end: 4,
            length: 3,
            rubies: [{ text: 'しか', start: 1, end: 3, length: 2 }],
            card: {
                spelling: '𠮟る',
                reading: 'しかる',
                wordWithReading: '𠮟[しか]る',
            },
        });
        expect(text.slice(token.start, token.end)).toBe('𠮟る');
    });

    it('keeps JPDB conversion cardinality aligned with every requested paragraph', () => {
        const paragraphs = ['日本語', 'フィード', '参加'];
        const cards = jpdbVocabularyToCards([
            [1, 1, 1, '日本語', 'にほんご', 100, ['n'], [['Japanese']], [['n']], ['known'], ['LHHH']],
        ]);
        const rawTokens: JPDBRawToken[][] = [[[0, 0, 3, [['日本語', 'にほんご']]]]];

        const parsed = jpdbParseResultToTokens(paragraphs, rawTokens, cards);

        expect(parsed).toHaveLength(paragraphs.length);
        expect(parsed[0]).toHaveLength(1);
        expect(parsed[1]).toEqual([]);
        expect(parsed[2]).toEqual([]);
    });

    it('resolves contextual JPDB reading overrides to an exact public card', async () => {
        const app = new ReaderApp();
        const contextualCard: JPDBCard = {
            ...card,
            vid: 1300,
            sid: 0,
            spelling: '下',
            reading: 'した',
            source: 'jpdb',
            sourceCardKey: '1300:0:下:もと',
        };
        const exactCard: JPDBCard = {
            ...contextualCard,
            vid: 2400,
            sid: 1,
            meanings: [{ glosses: ['below'], partOfSpeech: ['n'] }],
            sourceCardKey: undefined,
        };
        const search = vi.fn(async () => [
            { ...contextualCard, reading: 'もと' },
            exactCard,
        ]);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbVocabulary: { search: typeof search };
            resolveLookupCard(card: JPDBCard): Promise<JPDBCard>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, jpdbDefinitionsEnabled: true, showPitchAccent: true };
        internals.jpdbVocabulary = { search };

        try {
            await expect(internals.resolveLookupCard(contextualCard)).resolves.toBe(exactCard);
            expect(search).toHaveBeenCalledWith('下', 12);
        } finally {
            app.destroy();
        }
    });

    it('keeps particle tokens visually styled from their shared state and pitch classes', () => {
        const text = '青空の下';
        const cards = jpdbVocabularyToCards([
            [1, 1, 1, '青空', 'あおぞら', 1200, ['n'], [['blue sky']], [['n']], ['known'], ['LHHH']],
            [2, 2, 2, 'の', 'の', null, ['prt'], [['particle']], [['prt']], ['known'], []],
            [3, 3, 3, '下', 'した', 1300, ['n'], [['below']], [['n']], ['known'], ['LH']],
        ]);
        const rawTokens: JPDBRawToken[][] = [[
            [0, 0, 2, [['青空', 'あおぞら']]],
            [1, 2, 1, null],
            [2, 3, 1, [['下', 'した']]],
        ]];
        const [[sky, particle, below]] = jpdbParseResultToTokens([text], rawTokens, cards);

        expect(sky.pitchClass).toBe('heiban');
        expect(particle.pitchClass).toBe('');
        expect(below.pitchClass).toBe('heiban');
    });

    it('derives each pitch class from its own card instead of inheriting the previous token', () => {
        const text = '青空。未知語猫';
        const cards = jpdbVocabularyToCards([
            [1, 1, 1, '青空', 'あおぞら', 1200, ['n'], [['blue sky']], [['n']], ['known'], ['LHHH']],
            [2, 2, 2, '未知語', 'みちご', null, ['n'], [['unknown word']], [['n']], ['known'], []],
            [3, 3, 3, '猫', 'ねこ', 1500, ['n'], [['cat']], [['n']], ['known'], ['HL']],
        ]);
        const rawTokens: JPDBRawToken[][] = [[
            [0, 0, 2, [['青空', 'あおぞら']]],
            [1, 3, 3, [['未知語', 'みちご']]],
            [2, 6, 1, [['猫', 'ねこ']]],
        ]];
        const [[sky, unrelated, cat]] = jpdbParseResultToTokens([text], rawTokens, cards);

        expect(sky.pitchClass).toBe('heiban');
        expect(unrelated.pitchClass).toBe('');
        expect(cat.pitchClass).toBe('atamadaka');
    });

    it('keeps an inflected surface as one token coloured by its own lexical card pitch', () => {
        const text = '読んで';
        const cards = jpdbVocabularyToCards([
            [1, 1, 1, '読む', 'よむ', 800, ['v5'], [['to read']], [['v5']], ['known'], ['HL']],
        ]);
        const rawTokens: JPDBRawToken[][] = [[
            [0, 0, 3, null],
        ]];
        const [[reading]] = jpdbParseResultToTokens([text], rawTokens, cards);

        expect(reading).toBeDefined();
        expect(reading.pitchClass).toBe('atamadaka');
    });

    it('keeps hosted dark brand buttons driven by the dynamic accent variables', () => {
        const normalizedDocsCss = DOCS_THEME_CSS.replace(/\s+/g, ' ');

        expect(normalizedDocsCss).toContain('.dark .VPButton.brand { border-color: var(--vp-button-brand-border) !important; background-color: var(--vp-button-brand-bg) !important; color: var(--vp-button-brand-text) !important; }');
        expect(normalizedDocsCss).toContain('.dark .VPButton.brand:hover, .dark .VPButton.brand:focus-visible { border-color: var(--vp-button-brand-hover-border) !important; background-color: var(--vp-button-brand-hover-bg) !important; color: var(--vp-button-brand-hover-text) !important; }');
        expect(normalizedDocsCss).toContain('.dark .VPButton.brand:active { border-color: var(--vp-button-brand-active-border) !important; background-color: var(--vp-button-brand-active-bg) !important; color: var(--vp-button-brand-active-text) !important; }');
        expect(normalizedDocsCss).not.toContain('.dark .VPButton.brand { border-color: #25573d !important; background-color: #25573d !important;');
        // Those variables come from the shared accent map, stamped by both the
        // pre-paint bootstrap and the hydrated theme.
        expect(hostedAccentCssVariables('#5ea780', true)['--vp-button-brand-active-bg']).toMatch(/^#[0-9a-f]{6}$/);
        expect(DOCS_THEME_TS).toContain('for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);');
    });




    it('uses configurable pitch colors in graphs and visible new-tab target highlights', () => {
        const normalizedKanjiCss = KANJI_CSS.replace(/\s+/g, ' ');
        const normalizedNewTabCss = NEW_TAB_CSS.replace(/\s+/g, ' ');
        const normalizedStatsCss = STATS_CSS.replace(/\s+/g, ' ');
        const normalizedImmersionCss = IMMERSION_STUDY_CSS.replace(/\s+/g, ' ');
        const html = renderPitch({ ...card, spelling: '読む', reading: 'よむ', pitchAccent: ['HLL'] });

        expect(normalizedKanjiCss).toContain('.jpdb-reader-pitch .atamadaka { color: var(--jpdb-reader-pitch-atamadaka-readable); }');
        expect(html).toContain('<polyline class="atamadaka"');
        expect(html).toContain('<circle class="atamadaka"');
        expect(normalizedNewTabCss).toContain('.jpdb-reader-newtab-sentence .jpdb-reader-example-target { padding: 0 0.08em; border-radius: 0.22em; background: var( --jpdb-reader-example-target-bg, var(--jpdb-reader-accent-soft) );');
        // Target highlighting and the overlay pill are shared rules in
        // immersion-study.css; new-tab.css must not re-declare them.
        expect(normalizedNewTabCss).not.toContain('.jpdb-reader-newtab-immersion .jpdb-reader-example-target {');
        expect(normalizedImmersionCss).toContain('background: var(--jpdb-ocr-background-rgba, var(--jpdb-reader-ocr-bg));');
        expect(normalizedImmersionCss).toContain('-webkit-box-decoration-break: clone; box-decoration-break: clone;');
        expect(normalizedImmersionCss).toContain('box-shadow: 0 6px 16px var(--jpdb-reader-shadow), inset 0 0 0 1px var(--jpdb-reader-ocr-inset);');
        expect(normalizedImmersionCss).toContain('touch-action: manipulation; -webkit-tap-highlight-color: transparent;');
        expect(normalizedImmersionCss).toContain('@media (pointer: coarse) { .jpdb-reader-example-translation[data-immersion-translation-blurred="true"], .jpdb-reader-example-translation[data-yomu-immersion-translation-blurred="true"] { min-height: 44px; padding: 10px 8px; }');
        expect(normalizedNewTabCss).not.toContain('.jpdb-reader-newtab-immersion .jpdb-reader-example-card.has-image .jpdb-reader-example-sentence .jpdb-reader-word.jpdb-reader-example-target {');
        expect(normalizedNewTabCss).toContain('@media (pointer: coarse) { .jpdb-reader-newtab:not(.jpdb-reader-newtab-search-mode):not(.jpdb-reader-newtab-stats-mode) .jpdb-reader-newtab-shell { padding-bottom: max(116px, calc(24px + env(safe-area-inset-bottom))); }');
        expect(normalizedNewTabCss).not.toContain('.jpdb-reader-newtab-install-app, .jpdb-reader-language-toggle { width: 44px !important;');
        // The inline toolbar keeps its compact row while every touch control
        // remains a genuine 44px one-tap target.
        expect(normalizedNewTabCss).toContain('.jpdb-reader-newtab-immersion .jpdb-reader-icon-mini { width: 44px !important; min-width: 44px !important; height: 44px !important; min-height: 44px !important; }');
        expect(normalizedNewTabCss).not.toContain('.jpdb-reader-newtab-revealed .jpdb-reader-newtab-shell { padding-bottom: max(148px');
        expect(normalizedNewTabCss).toContain('.jpdb-reader-newtab .jpdb-reader-newtab-overflow, .jpdb-reader-newtab-more-menu .jpdb-reader-newtab-menu-item, .jpdb-reader-newtab-mode button, button.jpdb-reader-newtab-status:not(:disabled), .jpdb-reader-newtab-source-select, .jpdb-reader-newtab-searchbox button, .jpdb-reader-newtab-grade-target-select, .jpdb-reader-newtab-controls button:not([data-grade]), .jpdb-reader-newtab-search-links a, .jpdb-reader-newtab-search-links button, .jpdb-reader-newtab-handwriting summary, .jpdb-reader-newtab-handwriting-candidates button, .jpdb-reader-newtab-doodle-actions button, .jpdb-reader-newtab-search-card, .jpdb-reader-newtab-kanji-details .jpdb-reader-source-card > summary.jpdb-reader-local-title, .jpdb-reader-newtab-kanji-details .jpdb-reader-component-button, .jpdb-reader-newtab-kanji-vocab > button, .jpdb-reader-newtab-mini-action { min-height: 44px !important; }');
        expect(normalizedNewTabCss).toContain('min-height: 44px !important; overflow: visible; touch-action: manipulation; }');
        expect(normalizedNewTabCss).toContain('.jpdb-reader-newtab-controls.jpdb-reader-newtab-grade-controls button::after { content: ""; position: absolute; inset: 0; border-radius: 10px; }');
        expect(normalizedNewTabCss).not.toContain('.jpdb-reader-newtab-theme-controls .jpdb-reader-theme-switch { min-height: 24px !important; }');
        expect(normalizedNewTabCss).toContain('.jpdb-reader-newtab-install-app[data-install-prompt-available="true"] .jpdb-reader-newtab-menu-description { color: var(--jpdb-reader-accent-readable, var(--jpdb-reader-text)); }');
        expect(normalizedStatsCss).toContain('@media (pointer: coarse) { .jpdb-reader-stats-refresh, .jpdb-reader-stats-tabs button, .jpdb-reader-stats-activity-tabs button, .jpdb-reader-stats-panel-button, .jpdb-reader-stats-deck-toggle, .jpdb-reader-stats-connection-actions button { min-height: 44px; touch-action: manipulation; }');
        expect(normalizedStatsCss).toContain('.jpdb-reader-stats-refresh { width: 44px; min-width: 44px; height: 44px; }');
        expect(normalizedStatsCss).not.toContain('.jpdb-reader-stats-bars { grid-template-columns: repeat(30, minmax(24px, 1fr)); overflow-x: auto; }');
        expect(normalizedStatsCss).not.toContain('.jpdb-reader-stats-month-strip { grid-auto-columns: 180px; }');
        expect(normalizedStatsCss).toContain('.jpdb-reader-stats-bar, .jpdb-reader-stats-heatmap-cell { touch-action: manipulation; }');
        expect(normalizedImmersionCss).toContain('.jpdb-reader-example-target { padding: 0 0.08em; border-radius: 0.22em; background: var( --jpdb-reader-example-target-bg, var(--jpdb-reader-accent-soft) );');
        expect(normalizedImmersionCss).toContain('background: var(--jpdb-ocr-background-rgba, var(--jpdb-reader-ocr-bg));');
        expect(normalizedImmersionCss).toContain('-webkit-box-decoration-break: clone; box-decoration-break: clone;');
        expect(normalizedImmersionCss).toContain('box-shadow: 0 6px 16px var(--jpdb-reader-shadow), inset 0 0 0 1px var(--jpdb-reader-ocr-inset);');
        expect(normalizedImmersionCss).toContain('.jpdb-reader-example-card.has-image .jpdb-reader-example-sentence :is(.jpdb-reader-example-target, .jpdb-reader-word.jpdb-reader-example-target) { --jpdb-reader-word-underline: transparent; background: color-mix( in srgb, var(--jpdb-reader-accent-readable, var(--jpdb-reader-accent)) 34%, var(--jpdb-reader-video-target-backdrop) ) !important;');
        expect(normalizedImmersionCss).toContain('.jpdb-reader-example-sentence .jpdb-reader-word.jpdb-reader-example-target.jpdb-reader-has-furi .jpdb-reader-ruby-base { background: transparent !important; box-shadow: none !important; }');
        expect(normalizedImmersionCss).toContain('.jpdb-reader-example-card.has-image .jpdb-reader-example-sentence .jpdb-reader-word.jpdb-reader-example-target.jpdb-reader-has-furi .jpdb-reader-ruby-base { background: transparent !important; box-shadow: none !important; text-decoration-color: transparent !important; }');
        expect(normalizedImmersionCss).toContain('.yomu-jpdb-page-addon .jpdb-reader-immersion .jpdb-reader-example-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; margin: 0 0 6px; }');
        expect(normalizedImmersionCss).toContain('width: fit-content; max-width: min(100%, 720px); overflow: visible; }');
        expect(normalizedImmersionCss).toContain('.yomu-jpdb-page-addon .jpdb-reader-immersion .jpdb-reader-example-card.has-image .jpdb-reader-example-sentence { left: clamp(8px, 3%, 16px); right: clamp(8px, 3%, 16px); bottom: clamp(10px, 4%, 16px); width: auto; max-width: none; padding: 0; transform: none; background: transparent; box-shadow: none; }');
    });

    it('resizes sheet popovers continuously when dragging the handle', () => {
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        const { popover, handle } = createSheetPopoverFixture({ pointerCapture: true });
        const dismiss = vi.fn();

        installSheetHandle(popover, dismiss);

        const down = Object.assign(new Event('pointerdown', { bubbles: true }), { clientY: 220, pointerId: 7 });
        const move = Object.assign(new Event('pointermove', { bubbles: true }), { clientY: 140, pointerId: 7 });
        const up = Object.assign(new Event('pointerup', { bubbles: true }), { clientY: 140, pointerId: 7 });
        handle.dispatchEvent(down);
        handle.dispatchEvent(move);

        expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('618px');
        expect(popover.style.getPropertyValue('--jpdb-reader-sheet-drag-up')).toBe('');
        expect(popover.style.transform).toBe('');

        handle.dispatchEvent(up);

        expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('618px');
        expect(handle.getAttribute('aria-valuenow')).toBe('618');
        expect(localStorage.getItem(SHEET_HEIGHT_STORAGE_KEY)).toBe('0.8047');
        expect(dismiss).not.toHaveBeenCalled();
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
    });

    // Canna's iPad report, 2026-07-31: "the popover is super tiny". The sheet grid is
    // `auto minmax(0, 1fr) auto`, so when the whole sheet collapses toward its floor
    // the card body is crushed to nothing and only the drag handle and the grade
    // buttons remain — which is exactly what her screenshot showed.
    it('keeps the sheet floor proportional to a tall tablet viewport', () => {
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        withViewport(820, 1024, () => {
            const { popover, handle } = createSheetPopoverFixture({ pointerCapture: true });
            installSheetHandle(popover, vi.fn());

            // The floor was `Math.min(viewportHeight, 180, Math.max(140, 32%))`, and the
            // 180 term inside a Math.min deleted the 32% term on every screen taller
            // than ~560px. On this viewport it gave 180px where 32% is 328px.
            expect(Number(handle.getAttribute('aria-valuemin'))).toBe(328);

            // Drag far past the bottom of the screen: the sheet must stop at the
            // proportional floor, not at a strip the height of its own buttons.
            handle.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { clientY: 300, pointerId: 3 }));
            handle.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true }), { clientY: 4000, pointerId: 3 }));
            handle.dispatchEvent(Object.assign(new Event('pointerup', { bubbles: true }), { clientY: 4000, pointerId: 3 }));

            expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('328px');
            // And a height the floor refused must never be remembered, or one bad
            // measurement leaves the reader with a tiny sheet in every later session.
            const stored = Number(localStorage.getItem(SHEET_HEIGHT_STORAGE_KEY) ?? '0');
            expect(stored === 0 || stored >= 0.32).toBe(true);
        });
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
    });

    it('ignores a remembered sheet ratio too small to have come from a real drag', () => {
        // Self-heals an install that already stored one: without this the reader has
        // no way back to a usable sheet except clearing storage.
        localStorage.setItem(SHEET_HEIGHT_STORAGE_KEY, '0.05');
        withViewport(820, 1024, () => {
            const { popover, handle } = createSheetPopoverFixture({ pointerCapture: true });
            installSheetHandle(popover, vi.fn());
            expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('717px');
            expect(handle.getAttribute('aria-valuenow')).toBe('717');
        });
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
    });

    it('dismisses on backdrop click while preserving the page text selection', () => {
        const dismiss = vi.fn();
        const backdrop = createReaderBackdrop(dismiss);

        const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        backdrop.dispatchEvent(mousedown);
        // preventDefault on the overlay mousedown is what keeps the page selection
        // from collapsing when the user clicks away to close the popover.
        expect(mousedown.defaultPrevented).toBe(true);

        backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(dismiss).toHaveBeenCalledTimes(1);
    });

    it('dismisses sheet popovers when tapping the handle', () => {
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        const { popover, handle } = createSheetPopoverFixture({ pointerCapture: true });
        const dismiss = vi.fn();

        installSheetHandle(popover, dismiss);

        const down = Object.assign(new Event('pointerdown', { bubbles: true }), { clientY: 120, pointerId: 9 });
        const up = Object.assign(new Event('pointerup', { bubbles: true }), { clientY: 120, pointerId: 9 });
        handle.dispatchEvent(down);
        handle.dispatchEvent(up);

        expect(dismiss).toHaveBeenCalledTimes(1);
    });

    it('swallows the trailing click after a handle tap so it cannot reopen a lookup under the drawer', () => {
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        const { popover, handle } = createSheetPopoverFixture({ pointerCapture: true });
        const pageWord = document.createElement('span');
        pageWord.className = 'jpdb-reader-word';
        pageWord.textContent = '場所';
        document.body.append(pageWord);
        // Stands in for both lookup handlers the orphaned synthetic click would
        // otherwise reach — the userscript's document-capture handler and the
        // hosted reader's root-bubble handler. Neither should fire.
        const lookup = vi.fn();
        document.addEventListener('click', lookup, { capture: true });
        const dismiss = vi.fn(() => popover.remove());

        try {
            installSheetHandle(popover, dismiss);
            handle.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { clientY: 120, pointerId: 21 }));
            handle.dispatchEvent(Object.assign(new Event('pointerup', { bubbles: true }), { clientY: 120, pointerId: 21 }));
            expect(dismiss).toHaveBeenCalledTimes(1);

            // The drawer is gone, so the browser's trailing click lands on the
            // page text it was covering — this is the bug it must not reopen.
            const orphanClick = new MouseEvent('click', { bubbles: true, cancelable: true });
            pageWord.dispatchEvent(orphanClick);
            expect(lookup).not.toHaveBeenCalled();
            expect(orphanClick.defaultPrevented).toBe(true);

            // One-shot: a genuine later tap still looks the word up.
            const nextClick = new MouseEvent('click', { bubbles: true, cancelable: true });
            pageWord.dispatchEvent(nextClick);
            expect(lookup).toHaveBeenCalledTimes(1);
            expect(nextClick.defaultPrevented).toBe(false);
        } finally {
            document.removeEventListener('click', lookup, true);
            pageWord.remove();
            localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        }
    });

    it('does not swallow clicks after a resize drag that keeps the sheet open', () => {
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        const { popover, handle } = createSheetPopoverFixture({ pointerCapture: true });
        const lookup = vi.fn();
        document.addEventListener('click', lookup, { capture: true });
        const dismiss = vi.fn();

        try {
            installSheetHandle(popover, dismiss);
            handle.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { clientY: 220, pointerId: 22 }));
            document.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true }), { clientY: 140, pointerId: 22 }));
            document.dispatchEvent(Object.assign(new Event('pointerup', { bubbles: true }), { clientY: 140, pointerId: 22 }));
            expect(dismiss).not.toHaveBeenCalled();

            const click = new MouseEvent('click', { bubbles: true, cancelable: true });
            document.body.dispatchEvent(click);
            expect(lookup).toHaveBeenCalledTimes(1);
            expect(click.defaultPrevented).toBe(false);
        } finally {
            document.removeEventListener('click', lookup, true);
            localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        }
    });

    it('resizes full-height sheet popovers downward without dismissing', () => {
        localStorage.setItem(SHEET_HEIGHT_STORAGE_KEY, JSON.stringify(1));
        const { popover, handle } = createSheetPopoverFixture({ expanded: true, pointerCapture: true });
        const dismiss = vi.fn();

        installSheetHandle(popover, dismiss);

        handle.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), { clientY: 120, pointerId: 10 }));
        document.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), { clientY: 320, pointerId: 10 }));
        document.dispatchEvent(Object.assign(new Event('pointerup', { bubbles: true, cancelable: true }), { clientY: 320, pointerId: 10 }));

        expect(popover.classList.contains('jpdb-reader-sheet-expanded')).toBe(false);
        expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('568px');
        expect(dismiss).not.toHaveBeenCalled();
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
    });

    it('resizes sheet popovers through touch drag events on iPhone-style WebKit', () => {
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        const { popover, handle } = createSheetPopoverFixture();
        const dismiss = vi.fn();

        installSheetHandle(popover, dismiss);

        dispatchTouchEvent(handle, 'touchstart', 220, 3);
        dispatchTouchEvent(document, 'touchmove', 136, 3);
        expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('622px');

        dispatchTouchEvent(document, 'touchend', 136, 3);

        expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('622px');
        expect(dismiss).not.toHaveBeenCalled();
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
    });

    it('resets sheet viewport sizing when the visual viewport changes', () => {
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        const { restore, viewport } = installVisualViewportFixture({ height: 640, width: 390 });

        try {
            const popover = document.createElement('div');
            popover.className = 'jpdb-reader-popover jpdb-reader-sheet';
            popover.innerHTML = '<div class="jpdb-reader-sheet-handle"></div>';
            popover.style.left = '24px';
            popover.style.maxHeight = '240px';
            document.body.append(popover);

            installSheetHandle(popover, vi.fn());

            expect(popover.style.left).toBe('');
            expect(popover.style.maxHeight).toBe('');
            expect(popover.style.getPropertyValue('--jpdb-reader-sheet-viewport-height')).toBe('640px');
            expect(popover.style.getPropertyValue('--jpdb-reader-sheet-collapsed-height')).toBe('448px');
            expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('448px');

            popover.style.maxHeight = '220px';
            (viewport as unknown as { height: number }).height = 812;
            viewport.dispatchEvent(new Event('resize'));

            expect(popover.style.maxHeight).toBe('');
            expect(popover.style.getPropertyValue('--jpdb-reader-sheet-viewport-height')).toBe('812px');
            expect(popover.style.getPropertyValue('--jpdb-reader-sheet-collapsed-height')).toBe('568px');
            expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('568px');
        } finally {
            restore();
            localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        }
    });

    it('keeps sheet popover drags active after the pointer leaves the handle', () => {
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        const { popover, handle } = createSheetPopoverFixture({ pointerCapture: true });
        const dismiss = vi.fn();

        installSheetHandle(popover, dismiss);

        handle.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), { clientY: 220, pointerId: 12 }));
        document.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), { clientY: 136, pointerId: 12 }));
        document.dispatchEvent(Object.assign(new Event('pointerup', { bubbles: true, cancelable: true }), { clientY: 136, pointerId: 12 }));

        expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('622px');
        expect(dismiss).not.toHaveBeenCalled();
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
    });

    it('restores sheet handle button state when popover content is re-rendered', async () => {
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover jpdb-reader-sheet';
        popover.innerHTML = '<div class="jpdb-reader-sheet-handle"></div>';
        document.body.append(popover);

        installSheetHandle(popover, vi.fn());
        popover.innerHTML = '<div class="jpdb-reader-sheet-handle"></div><p>updated</p>';
        await Promise.resolve();

        const handle = popover.querySelector<HTMLElement>('.jpdb-reader-sheet-handle');
        expect(handle?.getAttribute('role')).toBe('button');
        expect(handle?.getAttribute('tabindex')).toBe('0');
        expect(handle?.getAttribute('aria-expanded')).toBe('false');
    });

    it('keeps forced bottom-sheet popovers positioned on desktop viewports', () => {
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'sheet' as const };
        withViewport(1440, 900, () => {
            const popover = createReaderPopover('よむ', settings);
            const normalizedCss = POPOVER_CORE_CSS.replace(/\s+/g, ' ');

            expect(shouldUseSheet(settings)).toBe(true);
            expect(popover.classList.contains('jpdb-reader-sheet')).toBe(true);
            expect(normalizedCss).toContain('.jpdb-reader-popover.jpdb-reader-sheet { left: 0 !important; right: 0 !important; top: auto !important; bottom: var(--jpdb-reader-sheet-bottom, 0px) !important;');
            expect(normalizedCss).toContain('.jpdb-reader-sheet .jpdb-reader-sheet-handle { display: block; }');
        });
    });

    it('uses the auto drawer on portrait tablet viewports', () => {
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'auto' as const };

        withViewport(820, 1180, () => {
            const popover = createReaderPopover('よむ', settings);

            expect(shouldUseSheet(settings)).toBe(true);
            expect(popover.classList.contains('jpdb-reader-sheet')).toBe(true);
        });
    });

    it('uses the auto popover on landscape tablet viewports', () => {
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'auto' as const };

        withViewport(1180, 820, () => {
            const popover = createReaderPopover('よむ', settings);

            expect(shouldUseSheet(settings)).toBe(false);
            expect(popover.classList.contains('jpdb-reader-sheet')).toBe(false);
            expect(popover.style.width).toBe(`${settings.popoverWidth}px`);
        });
    });

    it('chooses auto lookup surfaces from Reddit physical viewport dimensions', () => {
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'auto' as const, popoverWidth: 520 };

        expect(shouldUseSheet(settings, 'modal', { width: 760, height: 980, pageScale: 1.6 })).toBe(true);
        expect(shouldUseSheet(settings, 'modal', { width: 1180, height: 820, pageScale: 1.6 })).toBe(false);
        expect(shouldUseSheet(settings, 'modal', { width: 540, height: 980, pageScale: 1.6 })).toBe(true);
    });

    it('keeps auto lookups in a drawer on constrained phone-sized viewports', () => {
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'auto' as const };

        withViewport(390, 844, () => {
            expect(shouldUseSheet(settings)).toBe(true);
        });
        withViewport(844, 390, () => {
            expect(shouldUseSheet(settings)).toBe(true);
        });
    });

    it('keeps hover lookups as a popover on constrained viewports by default', () => {
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'auto' as const };

        withViewport(390, 844, () => {
            expect(shouldUseSheet(settings, 'hover')).toBe(false);
            expect(shouldUseSheet(settings, 'modal')).toBe(true);
            const popover = createReaderPopover('よむ', settings, 'hover');
            expect(popover.classList.contains('jpdb-reader-sheet')).toBe(false);
            expect(popover.style.width).toBe(`${settings.popoverWidth}px`);
            expect(popover.getAttribute('role')).toBeNull();
            expect(popover.getAttribute('aria-modal')).toBeNull();
        });
    });

    it('honours an explicit hover popup mode independently of the tap popup mode', () => {
        const hoverSheet = { ...DEFAULT_SETTINGS, popupMode: 'popover' as const, hoverPopupMode: 'sheet' as const };
        const hoverAuto = { ...DEFAULT_SETTINGS, popupMode: 'sheet' as const, hoverPopupMode: 'auto' as const };

        withViewport(1440, 900, () => {
            expect(shouldUseSheet(hoverSheet, 'hover')).toBe(true);
            expect(shouldUseSheet(hoverSheet, 'modal')).toBe(false);
            expect(shouldUseSheet(hoverAuto, 'hover')).toBe(false);
            expect(shouldUseSheet(hoverAuto, 'modal')).toBe(true);
        });
        withViewport(390, 844, () => {
            expect(shouldUseSheet(hoverAuto, 'hover')).toBe(true);
        });
    });

    it('keeps an explicit sheet close button after drawer content rerenders', async () => {
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover jpdb-reader-sheet jpdb-reader-sheet-sticky';
        popover.innerHTML = '<div class="jpdb-reader-sheet-handle"></div>';
        document.body.append(popover);
        const dismiss = vi.fn();

        try {
            installSheetCloseButton(popover, dismiss, 'Close drawer');

            const initialButton = popover.querySelector<HTMLButtonElement>('[data-jpdb-reader-sheet-close="true"]');
            expect(initialButton?.title).toBe('Close drawer');
            initialButton?.click();
            expect(dismiss).toHaveBeenCalledTimes(1);

            popover.innerHTML = '<div class="jpdb-reader-sheet-handle"></div><p>updated</p>';
            await waitForExpect(() => {
                expect(popover.querySelector('[data-jpdb-reader-sheet-close="true"]')).not.toBeNull();
            });
        } finally {
            popover.remove();
        }
    });

    it('adds the sticky sheet close button only for click-opened sheets', () => {
        const app = new ReaderApp();
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'sheet' as const, stickyBottomSheet: true };
        const internals = app as unknown as {
            settings: typeof settings;
            mountPopover(popover: HTMLElement, anchor?: HTMLElement, options?: { mode?: 'modal' | 'hover' }): void;
        };
        internals.settings = settings;

        try {
            const modal = createReaderPopover('よむ', settings);
            modal.innerHTML = '<div class="jpdb-reader-popover-body"><div class="jpdb-reader-sheet-handle"></div></div>';
            internals.mountPopover(modal, undefined, { mode: 'modal' });

            expect(modal.getAttribute('aria-modal')).toBe('true');
            expect(modal.classList.contains('jpdb-reader-sheet-sticky')).toBe(true);
            expect(modal.querySelector('[data-jpdb-reader-sheet-close="true"]')).not.toBeNull();

            const hover = createReaderPopover('よむ', settings);
            hover.innerHTML = '<div class="jpdb-reader-popover-body"><div class="jpdb-reader-sheet-handle"></div></div>';
            internals.mountPopover(hover, undefined, { mode: 'hover' });

            expect(hover.classList.contains('jpdb-reader-sheet-sticky')).toBe(false);
            expect(hover.querySelector('[data-jpdb-reader-sheet-close="true"]')).toBeNull();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('pauses a playing subtitle video on lookup and resumes it when the popup closes', () => {
        const app = new ReaderApp();
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'popover' as const, subtitleMiningPause: true };
        const activeVideo = document.createElement('video');
        const staleBoundVideo = document.createElement('video');
        let paused = false;
        const pause = vi.fn(() => { paused = true; });
        const play = vi.fn(async () => { paused = false; });
        Object.defineProperty(activeVideo, 'readyState', { configurable: true, value: 4 });
        Object.defineProperty(activeVideo, 'paused', { configurable: true, get: () => paused });
        Object.defineProperty(activeVideo, 'pause', { configurable: true, value: pause });
        Object.defineProperty(activeVideo, 'play', { configurable: true, value: play });
        Object.defineProperty(staleBoundVideo, 'paused', { configurable: true, value: true });
        const internals = app as unknown as {
            settings: typeof settings;
            subtitles: { getBoundVideo: () => HTMLVideoElement | undefined; destroy: () => void };
            mountPopover(popover: HTMLElement, anchor?: HTMLElement, options?: { mode?: 'modal' | 'hover' }): void;
            dismiss(): void;
        };
        internals.settings = settings;
        internals.subtitles = { getBoundVideo: () => staleBoundVideo, destroy: vi.fn() };

        try {
            document.body.innerHTML = '<div class="jpdb-subtitle-player"><span class="jpdb-reader-word">音楽</span></div>';
            document.body.append(activeVideo);
            const anchor = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
            const popover = createReaderPopover('よむ', settings);

            internals.mountPopover(popover, anchor, { mode: 'modal' });

            expect(pause).toHaveBeenCalledTimes(1);
            expect(activeVideo.dataset.jpdbReaderMiningPause).toMatch(/^\d+$/);

            internals.dismiss();

            expect(play).toHaveBeenCalledTimes(1);
            expect(activeVideo.dataset.jpdbReaderMiningPause).toBeUndefined();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps sheet popover body scroll stable after in-body control actions', () => {
        const app = new ReaderApp();
        const frameCallbacks: FrameRequestCallback[] = [];
        const frameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frameCallbacks.push(callback);
            return frameCallbacks.length;
        });
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'sheet' as const };
        const internals = app as unknown as {
            settings: typeof settings;
            mountPopover(popover: HTMLElement, anchor?: HTMLElement, options?: { mode?: 'modal' | 'hover' }): void;
        };
        internals.settings = settings;
        const popover = createReaderPopover('よむ', settings);
        popover.innerHTML = `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-popover-body">
                <div style="height: 900px"></div>
                <button type="button" data-action="test-scroll-reset">Update</button>
            </div>
        `;
        const body = popover.querySelector<HTMLElement>('.jpdb-reader-popover-body')!;
        const button = popover.querySelector<HTMLButtonElement>('[data-action="test-scroll-reset"]')!;
        button.addEventListener('click', () => {
            body.scrollTop = 0;
        });

        try {
            internals.mountPopover(popover, undefined, { mode: 'modal' });
            frameCallbacks.length = 0;
            body.scrollTop = 320;

            button.click();
            expect(frameCallbacks).not.toHaveLength(0);
            frameCallbacks.splice(0).forEach(callback => callback(0));

            expect(body.scrollTop).toBe(320);
        } finally {
            frameSpy.mockRestore();
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps sheet body pan gestures away from host page touch handlers', () => {
        const app = new ReaderApp();
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'sheet' as const };
        const internals = app as unknown as {
            settings: typeof settings;
            mountPopover(popover: HTMLElement, anchor?: HTMLElement, options?: { mode?: 'modal' | 'hover' }): void;
        };
        internals.settings = settings;
        const hostTouchMove = vi.fn();
        const hostWheel = vi.fn();
        document.addEventListener('touchmove', hostTouchMove);
        document.addEventListener('wheel', hostWheel);

        try {
            const popover = createReaderPopover('よむ', settings);
            popover.innerHTML = `
                <div class="jpdb-reader-sheet-handle"></div>
                <div class="jpdb-reader-popover-body">
                    <p>人物</p>
                    <div style="height: 900px"></div>
                </div>
            `;
            internals.mountPopover(popover, undefined, { mode: 'modal' });
            const body = popover.querySelector<HTMLElement>('.jpdb-reader-popover-body')!;

            body.dispatchEvent(new Event('touchmove', { bubbles: true, cancelable: true }));
            body.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true }));

            expect(hostTouchMove).not.toHaveBeenCalled();
            expect(hostWheel).not.toHaveBeenCalled();
        } finally {
            document.removeEventListener('touchmove', hostTouchMove);
            document.removeEventListener('wheel', hostWheel);
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps click popovers modal even when visual page dimming is off', () => {
        const app = new ReaderApp();
        const settings = {
            ...DEFAULT_SETTINGS,
            popupMode: 'popover' as const,
            popoverBackdropEnabled: false,
        };
        const internals = app as unknown as {
            settings: typeof settings;
            mountPopover(popover: HTMLElement, anchor?: HTMLElement, options?: { mode?: 'modal' | 'hover' }): void;
        };
        internals.settings = settings;
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });

        try {
            const page = document.createElement('main');
            const anchor = document.createElement('button');
            anchor.textContent = '本文';
            page.append(anchor);
            document.body.append(page);
            const popover = createReaderPopover('よむ', settings);
            internals.mountPopover(popover, anchor, { mode: 'modal' });

            expect(popover.getAttribute('role')).toBe('dialog');
            expect(popover.getAttribute('aria-modal')).toBe('true');
            expect(page.getAttribute('aria-hidden')).toBe('true');
            expect(document.querySelector('.jpdb-reader-backdrop')).toBeNull();
        } finally {
            vi.unstubAllGlobals();
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('traps modal lookup tab order and restores the trigger after Escape', () => {
        const app = new ReaderApp();
        const settings = {
            ...DEFAULT_SETTINGS,
            popupMode: 'popover' as const,
            popoverBackdropEnabled: false,
        };
        const internals = app as unknown as {
            settings: typeof settings;
            mountPopover(popover: HTMLElement, anchor?: HTMLElement, options?: { mode?: 'modal' | 'hover' }): void;
            handleDocumentKeydown(event: KeyboardEvent): void;
        };
        internals.settings = settings;
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });

        try {
            const page = document.createElement('main');
            const trigger = document.createElement('button');
            trigger.textContent = '調べる';
            page.append(trigger);
            document.body.append(page);

            const popover = createReaderPopover('よむ', settings);
            popover.innerHTML = `
                <button id="plain" type="button">Plain</button>
                <button id="second" type="button" tabindex="2">Second</button>
                <input id="first" tabindex="1">
            `;
            const first = popover.querySelector<HTMLElement>('#first')!;
            const last = popover.querySelector<HTMLElement>('#plain')!;
            internals.mountPopover(popover, trigger, { mode: 'modal' });

            expect(document.activeElement).toBe(popover);
            expect(page.getAttribute('aria-hidden')).toBe('true');

            popover.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
            expect(document.activeElement).toBe(first);

            last.focus();
            last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
            expect(document.activeElement).toBe(first);

            first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
            expect(document.activeElement).toBe(last);

            internals.handleDocumentKeydown(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

            expect(popover.isConnected).toBe(false);
            expect(page.getAttribute('aria-hidden')).toBeNull();
            expect(document.activeElement).toBe(trigger);
        } finally {
            vi.unstubAllGlobals();
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('mounts hover lookups as passive content without modal semantics', () => {
        const app = new ReaderApp();
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'popover' as const };
        const internals = app as unknown as {
            settings: typeof settings;
            mountPopover(popover: HTMLElement, anchor?: HTMLElement, options?: { mode?: 'modal' | 'hover'; focusOnMount?: boolean }): void;
        };
        internals.settings = settings;
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });

        try {
            const page = document.createElement('main');
            const anchor = document.createElement('span');
            page.append(anchor);
            document.body.append(page);
            const popover = createReaderPopover('よむ', settings);

            internals.mountPopover(popover, anchor, { mode: 'hover', focusOnMount: false });

            expect(popover.getAttribute('role')).toBeNull();
            expect(popover.getAttribute('aria-modal')).toBeNull();
            expect(page.getAttribute('aria-hidden')).toBeNull();
        } finally {
            vi.unstubAllGlobals();
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('can mount selection popovers without taking focus from page text', () => {
        const app = new ReaderApp();
        const settings = {
            ...DEFAULT_SETTINGS,
            popupMode: 'popover' as const,
        };
        const pageButton = document.createElement('button');
        pageButton.textContent = '本文';
        document.body.append(pageButton);
        pageButton.focus();
        const internals = app as unknown as {
            settings: typeof settings;
            mountPopover(popover: HTMLElement, anchor?: HTMLElement, options?: { mode?: 'modal' | 'hover'; focusOnMount?: boolean }): void;
        };
        internals.settings = settings;

        try {
            const popover = createReaderPopover('よむ', settings);
            const focus = vi.spyOn(popover, 'focus');
            internals.mountPopover(popover, undefined, { mode: 'modal', focusOnMount: false });

            expect(focus).not.toHaveBeenCalled();
            expect(document.activeElement).toBe(pageButton);
            expect(popover.getAttribute('role')).toBeNull();
            expect(popover.getAttribute('aria-modal')).toBeNull();
            expect(pageButton.getAttribute('aria-hidden')).toBeNull();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('mounts anchored popovers inside the active fullscreen player tree', () => {
        const descriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
        let fullscreenElement: Element | null = null;
        Object.defineProperty(document, 'fullscreenElement', {
            configurable: true,
            get: () => fullscreenElement,
        });
        const app = new ReaderApp();
        const settings = {
            ...DEFAULT_SETTINGS,
            popupMode: 'popover' as const,
            popoverBackdropEnabled: true,
        };
        const internals = app as unknown as {
            settings: typeof settings;
            mountPopover(popover: HTMLElement, anchor?: HTMLElement, options?: { mode?: 'modal' | 'hover' }): void;
        };
        internals.settings = settings;
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });

        try {
            const frame = document.createElement('section');
            const anchor = document.createElement('span');
            frame.append(anchor);
            document.body.append(frame);
            fullscreenElement = frame;

            const popover = createReaderPopover('よむ', settings);
            internals.mountPopover(popover, anchor, { mode: 'modal' });

            expect(popover.parentElement).toBe(frame);
            expect(document.querySelector('.jpdb-reader-backdrop')?.parentElement).toBe(frame);
            expect(popover.getAttribute('aria-modal')).toBe('true');
        } finally {
            vi.unstubAllGlobals();
            if (descriptor) Object.defineProperty(document, 'fullscreenElement', descriptor);
            else delete (document as unknown as { fullscreenElement?: unknown }).fullscreenElement;
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('coalesces popover resize repositioning into one animation frame', () => {
        const app = new ReaderApp();
        const settings = {
            ...DEFAULT_SETTINGS,
            popupMode: 'popover' as const,
        };
        const internals = app as unknown as {
            settings: typeof settings;
            mountPopover(popover: HTMLElement, anchor?: HTMLElement, options?: { mode?: 'modal' | 'hover' }): void;
            repositionActivePopover(): void;
        };
        let resizeCallback: ResizeObserverCallback | undefined;
        const frameCallbacks: FrameRequestCallback[] = [];
        const reposition = vi.fn();

        internals.settings = settings;
        internals.repositionActivePopover = reposition;
        vi.stubGlobal('ResizeObserver', class {
            constructor(callback: ResizeObserverCallback) {
                resizeCallback = callback;
            }

            observe(): void {}
            disconnect(): void {}
        });
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frameCallbacks.push(callback);
            return frameCallbacks.length;
        });

        try {
            const popover = createReaderPopover('よむ', settings);
            popover.innerHTML = '<div class="jpdb-reader-popover-body">辞書</div>';
            internals.mountPopover(popover, undefined, { mode: 'hover' });
            frameCallbacks.length = 0;
            reposition.mockClear();

            resizeCallback?.([] as ResizeObserverEntry[], {} as ResizeObserver);
            resizeCallback?.([] as ResizeObserverEntry[], {} as ResizeObserver);

            expect(reposition).not.toHaveBeenCalled();
            expect(frameCallbacks).toHaveLength(1);

            frameCallbacks[0]?.(0);

            expect(reposition).toHaveBeenCalledTimes(1);
        } finally {
            vi.restoreAllMocks();
            vi.unstubAllGlobals();
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('can preserve parsed page words during demo-to-real runtime handoff', () => {
        const app = new ReaderApp();
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-pitch-heiban';
        word.dataset.vid = '10';
        word.dataset.sid = '20';
        word.textContent = '青空';
        document.body.replaceChildren(word);

        app.destroy({ preservePageWords: true });

        expect(document.querySelector('.jpdb-reader-word')).toBe(word);
        expect(word.textContent).toBe('青空');

        const cleanup = new ReaderApp();
        cleanup.destroy();

        expect(document.querySelector('.jpdb-reader-word')).toBeNull();
        expect(document.body.textContent).toBe('青空');
        document.body.replaceChildren();
    });

    it('stacks lookup popovers over settings without dismissing the settings dialog', () => {
        const app = new ReaderApp();
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        const { settings, settingsForm, settingsBackdrop, anchor, internals } = createStackedReaderSettingsFixture(app);

        try {
            const lookup = createReaderPopover('よむ', settings);
            lookup.innerHTML = '<div class="jpdb-reader-popover-body">辞書</div>';
            internals.mountPopover(lookup, anchor, { mode: 'modal', stackOverSettings: true });

            expectStackedLookupOverSettings({
                lookup,
                settingsForm,
                settingsBackdrop,
                activeLookup: internals.activePopover,
                activeBackdrop: internals.activeBackdrop,
            });

            internals.dismiss();

            expect(lookup.isConnected).toBe(false);
            expectSettingsDialogStillMounted({
                settingsForm,
                settingsBackdrop,
                activeDialog: internals.activePopover,
                activeBackdrop: internals.activeBackdrop,
            });
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('resizes the mobile settings drawer from its top handle and stores the chosen height', () => {
        localStorage.removeItem(SETTINGS_DRAWER_HEIGHT_STORAGE_KEY);
        const drawer = document.createElement('form');
        drawer.className = 'jpdb-reader-settings';
        drawer.innerHTML = `
            <div class="jpdb-reader-settings-head">
                <div class="jpdb-reader-settings-drag-handle"></div>
                <h2>よむ Settings</h2>
            </div>
            <div class="jpdb-reader-settings-scroll"></div>
            <div class="footer"></div>
        `;
        document.body.append(drawer);
        const handle = drawer.querySelector<HTMLElement>('.jpdb-reader-settings-drag-handle')!;
        handle.setPointerCapture = vi.fn();
        handle.releasePointerCapture = vi.fn();

        installSettingsDrawerHandle(drawer);

        expect(drawer.style.getPropertyValue('--jpdb-reader-settings-drawer-height')).toBe('676px');
        expect(handle.getAttribute('aria-valuenow')).toBe('676');

        handle.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), { clientY: 120, pointerId: 17 }));
        document.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), { clientY: 248, pointerId: 17 }));
        document.dispatchEvent(Object.assign(new Event('pointerup', { bubbles: true, cancelable: true }), { clientY: 248, pointerId: 17 }));

        expect(drawer.style.getPropertyValue('--jpdb-reader-settings-drawer-height')).toBe('548px');
        expect(handle.getAttribute('aria-valuenow')).toBe('548');
        expect(localStorage.getItem(SETTINGS_DRAWER_HEIGHT_STORAGE_KEY)).toBe('0.7135');
        localStorage.removeItem(SETTINGS_DRAWER_HEIGHT_STORAGE_KEY);
    });

    it('dismisses the mobile settings drawer when its top handle is tapped', () => {
        const drawer = document.createElement('form');
        drawer.className = 'jpdb-reader-settings';
        drawer.innerHTML = `
            <div class="jpdb-reader-settings-head">
                <div class="jpdb-reader-settings-drag-handle"></div>
                <h2>よむ Settings</h2>
            </div>
            <div class="jpdb-reader-settings-scroll"></div>
            <div class="footer"></div>
        `;
        document.body.append(drawer);
        const handle = drawer.querySelector<HTMLElement>('.jpdb-reader-settings-drag-handle')!;
        const dismiss = vi.fn();

        installSettingsDrawerHandle(drawer, 'Resize settings', dismiss);
        handle.click();

        expect(dismiss).toHaveBeenCalledOnce();
    });

    it('does not dismiss the mobile settings drawer after resizing from its top handle', () => {
        localStorage.removeItem(SETTINGS_DRAWER_HEIGHT_STORAGE_KEY);
        const drawer = document.createElement('form');
        drawer.className = 'jpdb-reader-settings';
        drawer.innerHTML = `
            <div class="jpdb-reader-settings-head">
                <div class="jpdb-reader-settings-drag-handle"></div>
                <h2>よむ Settings</h2>
            </div>
            <div class="jpdb-reader-settings-scroll"></div>
            <div class="footer"></div>
        `;
        document.body.append(drawer);
        const handle = drawer.querySelector<HTMLElement>('.jpdb-reader-settings-drag-handle')!;
        const dismiss = vi.fn();
        handle.setPointerCapture = vi.fn();
        handle.releasePointerCapture = vi.fn();

        installSettingsDrawerHandle(drawer, 'Resize settings', dismiss);

        handle.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), { clientY: 120, pointerId: 17 }));
        document.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), { clientY: 248, pointerId: 17 }));
        document.dispatchEvent(Object.assign(new Event('pointerup', { bubbles: true, cancelable: true }), { clientY: 248, pointerId: 17 }));
        handle.click();

        expect(dismiss).not.toHaveBeenCalled();
        localStorage.removeItem(SETTINGS_DRAWER_HEIGHT_STORAGE_KEY);
    });

    it('lifts the mobile settings drawer above the keyboard visual viewport', () => {
        localStorage.removeItem(SETTINGS_DRAWER_HEIGHT_STORAGE_KEY);
        const heightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight');
        const { restore, viewport } = installVisualViewportFixture({ height: 500, width: 390 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });

        try {
            const drawer = document.createElement('form');
            drawer.className = 'jpdb-reader-settings';
            drawer.innerHTML = `
                <div class="jpdb-reader-settings-head">
                    <div class="jpdb-reader-settings-drag-handle"></div>
                    <h2>よむ Settings</h2>
                </div>
                <div class="jpdb-reader-settings-scroll"></div>
                <div class="footer"></div>
            `;
            document.body.append(drawer);

            installSettingsDrawerHandle(drawer);

            expect(drawer.style.getPropertyValue('--jpdb-reader-settings-drawer-bottom')).toBe('300px');
            expect(drawer.style.getPropertyValue('--jpdb-reader-settings-drawer-viewport-height')).toBe('500px');
            expect(drawer.style.getPropertyValue('--jpdb-reader-settings-drawer-height')).toBe('440px');
            expect(drawer.classList.contains('jpdb-reader-settings-keyboard-open')).toBe(true);

            (viewport as unknown as { height: number; offsetTop: number }).height = 620;
            (viewport as unknown as { height: number; offsetTop: number }).offsetTop = 20;
            viewport.dispatchEvent(new Event('resize'));

            expect(drawer.style.getPropertyValue('--jpdb-reader-settings-drawer-bottom')).toBe('160px');
            expect(drawer.style.getPropertyValue('--jpdb-reader-settings-drawer-viewport-height')).toBe('620px');
            expect(drawer.style.getPropertyValue('--jpdb-reader-settings-drawer-height')).toBe('546px');
        } finally {
            restoreWindowDescriptor('innerHeight', heightDescriptor);
            restore();
            localStorage.removeItem(SETTINGS_DRAWER_HEIGHT_STORAGE_KEY);
        }
    });

    it('renders a mobile settings drawer handle for resizing', () => {
        const html = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        expect(html).toContain('jpdb-reader-settings-drag-handle');
        expect(SETTINGS_CSS).toContain('--jpdb-reader-settings-drawer-height');
        expect(SETTINGS_CSS).toContain('--jpdb-reader-settings-drawer-bottom');
        expect(SETTINGS_CSS).toContain('.jpdb-reader-settings-drag-handle');
        expect(SETTINGS_CSS).toContain('.jpdb-reader-settings-drag-handle:hover::before');
        expect(SUBTITLES_YOUTUBE_CSS).toContain('.jpdb-subtitle-transcript-bottom .jpdb-subtitle-resize:hover::before');
    });

    it('parses Japanese settings labels in the main reader runtime using current form display settings', async () => {
        const { app, form, parseJapanese, internals } = settingsJapaneseParserFixture({
            spelling: '設定',
            reading: 'せってい',
            vid: 2468,
            settings: {
                showFurigana: false,
                furiganaMode: 'off',
                showPitchAccent: false,
            },
        });
        form.querySelector<HTMLSelectElement>('select[name="furiganaMode"]')!.value = 'all';
        form.querySelector<HTMLInputElement>('input[name="showPitchAccent"]')!.checked = true;

        try {
            await internals.parseSettingsJapanese(form);

            expect(parseJapanese).toHaveBeenCalledWith(
                expect.arrayContaining(['よむ 設定']),
                expect.objectContaining({
                    allowApiTimeoutFallback: true,
                    allowJpdbTimeoutFallback: true,
                    allowSegmentedFallback: true,
                    apiTimeoutMs: 1_200,
                    includeLocalPitch: false,
                    jpdbTimeoutMs: 1_200,
                    requireApi: false,
                    requireJpdb: false,
                    skipApi: true,
                    skipJpdb: true,
                }),
            );
            const parsedWord = form.querySelector<HTMLElement>('h2 .jpdb-reader-word[data-expression="設定"]');
            expect(parsedWord).toBeTruthy();
            expect(parsedWord?.classList.contains('jpdb-reader-has-furi')).toBe(true);
            expect(parsedWord?.classList.contains('jpdb-pitch-heiban')).toBe(true);
            expect(parsedWord?.querySelector('.jpdb-reader-furi')?.textContent).toBe('せってい');
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('parses Japanese settings labels in the hosted newtab runtime with segmented fallback enabled', async () => {
        const { form, parse, internals } = newTabSettingsJapaneseParserFixture({
            spelling: '設定',
            reading: 'せってい',
            vid: 3579,
        });

        try {
            await internals.parseSettingsJapanese(form);

            expect(parse).toHaveBeenCalledWith(
                expect.arrayContaining(['よむ 設定']),
                expect.objectContaining({
                    allowJpdbTimeoutFallback: true,
                    allowSegmentedFallback: true,
                    includeLocalPitch: false,
                    jpdbTimeoutMs: 10_000,
                }),
            );
            const parsedWord = form.querySelector<HTMLElement>('h2 .jpdb-reader-word[data-expression="設定"]');
            expect(parsedWord).toBeTruthy();
            expect(parsedWord?.classList.contains('jpdb-reader-has-furi')).toBe(true);
            expect(parsedWord?.classList.contains('jpdb-pitch-heiban')).toBe(true);
            expect(parsedWord?.querySelector('.jpdb-reader-furi')?.textContent).toBe('せってい');
            expect(internals.hydrateSettingsFallbackTokens).toHaveBeenCalled();
            expect(internals.enrichPitchWords).toHaveBeenCalledWith(expect.any(Array), 192);
        } finally {
            document.body.replaceChildren();
        }
    });

});
