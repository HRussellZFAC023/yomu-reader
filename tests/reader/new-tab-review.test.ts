import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnkiConnectClient } from '../../src/reader/anki';
import { listNewTabAnkiCards } from '../../src/reader/anki-new-tab';
import { NewTabController, selectNewTabStudyPool } from '../../src/reader/new-tab-controller';
import { parseJpdbReviewDocument } from '../../src/reader/jpdb-review-bridge';
import { installKanjiDoodle } from '../../src/reader/kanji-doodle';
import { assessKanjiStrokes } from '../../src/reader/kanji-stroke-grader';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { definitionSourceRows } from '../../src/reader/source-sections';
import type { JPDBCard } from '../../src/reader/types';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function newTabTestCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    const spelling = overrides.spelling ?? '読む';
    return {
        vid: overrides.vid ?? spelling.charCodeAt(0),
        sid: overrides.sid ?? 1,
        rid: overrides.rid ?? 1,
        spelling,
        reading: overrides.reading ?? spelling,
        frequencyRank: overrides.frequencyRank ?? null,
        partOfSpeech: overrides.partOfSpeech ?? [],
        meanings: overrides.meanings ?? [{ glosses: ['to read'], partOfSpeech: [] }],
        cardState: overrides.cardState ?? ['new'],
        pitchAccent: overrides.pitchAccent ?? [],
        wordWithReading: overrides.wordWithReading ?? null,
        source: overrides.source ?? 'local',
        reviewSource: overrides.reviewSource,
        ankiCardId: overrides.ankiCardId,
        sentence: overrides.sentence,
        kanjiKeyword: overrides.kanjiKeyword,
        jpdbReviewId: overrides.jpdbReviewId,
    };
}

describe('new tab review helpers', () => {
    it('parses live JPDB kanji review fronts from the review card id', () => {
        const doc = new DOMParser().parseFromString(`
            <main>
                <input name="c" value="kb,記">
                <div class="kind">Kanji</div>
                <div class="plain">record</div>
            </main>
        `, 'text/html');

        const status = parseJpdbReviewDocument(doc, 'https://jpdb.io/review?c=kb,%E8%A8%98');

        expect(status.connected).toBe(true);
        expect(status.card?.kind).toBe('kanji');
        expect(status.card?.phase).toBe('front');
        expect(status.card?.kanji).toBe('記');
        expect(status.card?.prompt).toContain('record');
    });

    it('parses JPDB vocabulary review sentences and highlighted targets', () => {
        const doc = new DOMParser().parseFromString(`
            <main>
                <div class="kind">Vocabulary</div>
                <div class="card-sentence">
                    <div class="sentence">ここへ<span class="highlight">来て</span>見てみなよ。</div>
                </div>
            </main>
        `, 'text/html');

        const status = parseJpdbReviewDocument(doc, 'https://jpdb.io/review#demo');

        expect(status.card?.kind).toBe('vocabulary');
        expect(status.card?.sentence).toContain('ここへ');
        expect(status.card?.spelling).toBe('来て');
    });

    it('grades kanji doodles from stroke count and basic drawing coverage', () => {
        const assessment = assessKanjiStrokes([
            [{ x: 0.1, y: 0.1, pressure: 0.5 }, { x: 0.9, y: 0.1, pressure: 0.5 }],
            [{ x: 0.2, y: 0.2, pressure: 0.5 }, { x: 0.2, y: 0.9, pressure: 0.5 }],
        ], 2);

        expect(assessment.passed).toBe(true);
        expect(assessment.score).toBeGreaterThanOrEqual(68);
    });

    it('checks same-count kanji doodles against the expected KanjiVG stroke shape', () => {
        const twoTemplate = [
            [{ x: 0.23, y: 0.30 }, { x: 0.74, y: 0.27 }],
            [{ x: 0.11, y: 0.74 }, { x: 0.89, y: 0.70 }],
        ];

        const correct = assessKanjiStrokes([
            [{ x: 0.20, y: 0.31, pressure: 0.5 }, { x: 0.79, y: 0.29, pressure: 0.5 }],
            [{ x: 0.10, y: 0.77, pressure: 0.5 }, { x: 0.90, y: 0.73, pressure: 0.5 }],
        ], 2, twoTemplate);
        const wrongShape = assessKanjiStrokes([
            [{ x: 0.30, y: 0.18, pressure: 0.5 }, { x: 0.30, y: 0.82, pressure: 0.5 }],
            [{ x: 0.70, y: 0.18, pressure: 0.5 }, { x: 0.70, y: 0.82, pressure: 0.5 }],
        ], 2, twoTemplate);
        const wrongOrder = assessKanjiStrokes([
            [{ x: 0.10, y: 0.77, pressure: 0.5 }, { x: 0.90, y: 0.73, pressure: 0.5 }],
            [{ x: 0.20, y: 0.31, pressure: 0.5 }, { x: 0.79, y: 0.29, pressure: 0.5 }],
        ], 2, twoTemplate);

        expect(correct.passed).toBe(true);
        expect(correct.shapeScore).toBeGreaterThanOrEqual(0.56);
        expect(wrongShape.passed).toBe(false);
        expect(wrongShape.message).toContain('shape/order');
        expect(wrongOrder.passed).toBe(false);
        expect(wrongOrder.message).toContain('shape/order');
    });

    it('loads Anki due and new cards through AnkiConnect review actions', async () => {
        const actions: string[] = [];
        vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
            const request = JSON.parse(String(init?.body ?? '{}')) as { action: string; params: Record<string, unknown> };
            actions.push(request.action);
            const result = (() => {
                if (request.action === 'findCards') return [101, 102, 103];
                if (request.action === 'areDue') return [true, false, true];
                if (request.action === 'cardsInfo') return [
                    { cardId: 101, note: 1, deckName: 'Yomu', queue: 2, type: 2, due: 0 },
                    { cardId: 102, note: 2, deckName: 'Yomu', queue: 2, type: 2, due: 99 },
                    { cardId: 103, note: 3, deckName: 'Yomu', queue: 0, type: 0, due: 0 },
                ];
                if (request.action === 'notesInfo') return [
                    {
                        noteId: 1,
                        modelName: 'Yomu Japanese',
                        tags: [],
                        cards: [101],
                        fields: {
                            Expression: { value: '読む' },
                            Reading: { value: 'よむ' },
                            Meaning: { value: 'to read' },
                            Sentence: { value: '本を読む。' },
                        },
                    },
                    {
                        noteId: 3,
                        modelName: 'Yomu Japanese',
                        tags: [],
                        cards: [103],
                        fields: {
                            Expression: { value: '書く' },
                            Reading: { value: 'かく' },
                            Meaning: { value: 'to write' },
                            Sentence: { value: '名前を書く。' },
                        },
                    },
                ];
                return null;
            })();
            return new Response(JSON.stringify({ result, error: null }), { status: 200 });
        });

        const settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            ankiDeck: 'Yomu',
            ankiModel: 'Yomu Japanese',
        };
        const client = new AnkiConnectClient(() => settings);
        const cards = await listNewTabAnkiCards(client, settings, 10);

        expect(actions).toEqual(['findCards', 'areDue', 'cardsInfo', 'notesInfo']);
        expect(cards.map(card => card.spelling)).toEqual(['読む', '書く']);
        expect(cards[0].ankiCardId).toBe(101);
        expect(cards[0].sentence).toBe('本を読む。');
    });

    it('does not query AnkiConnect for new-tab Anki cards on mobile handoff devices', async () => {
        const originalUserAgent = navigator.userAgent;
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            configurable: true,
        });
        const fetchMock = vi.fn(() => Promise.reject(new Error('fetch should not be called')));
        vi.stubGlobal('fetch', fetchMock);

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                ankiMobileHandoff: true,
                ankiDeck: 'Yomu',
                ankiModel: 'Yomu Japanese',
            };
            const client = new AnkiConnectClient(() => settings);

            await expect(listNewTabAnkiCards(client, settings, 10)).resolves.toEqual([]);
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
        }
    });

    it('keeps JPDB and Anki study cards in the same new tab pool', () => {
        const card = (spelling: string, state: JPDBCard['cardState'][number], source: JPDBCard['source']): JPDBCard => ({
            vid: spelling.charCodeAt(0),
            sid: 1,
            rid: 1,
            spelling,
            reading: spelling,
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [{ glosses: [spelling], partOfSpeech: [] }],
            cardState: [state],
            pitchAccent: [],
            wordWithReading: null,
            source,
        });

        const pool = selectNewTabStudyPool([
            card('新規', 'new', 'jpdb'),
            card('失敗', 'failed', 'jpdb'),
            card('アンキ新規', 'new', 'anki'),
            card('復習', 'due', 'anki'),
        ]);

        expect(pool.map(item => item.spelling)).toEqual(['新規', '失敗', 'アンキ新規', '復習']);
        expect(selectNewTabStudyPool([
            card('新規', 'new', 'jpdb'),
            card('アンキ新規', 'new', 'anki'),
        ]).map(item => item.spelling)).toEqual(['新規', 'アンキ新規']);
    });

    it('keeps JPDB visible in the dictionary source rows when disabled', () => {
        const rows = definitionSourceRows({
            ...DEFAULT_SETTINGS,
            jpdbDefinitionsEnabled: false,
        });

        const jpdb = rows.find(row => row.name === 'JPDB');
        expect(jpdb).toBeTruthy();
        expect(jpdb?.enabled).toBe(false);
    });

    it('uses dictionary cards only as the new tab auto-source fallback', async () => {
        const jpdbCard: JPDBCard = {
            vid: 1,
            sid: 1,
            rid: 1,
            spelling: '読む',
            reading: 'よむ',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
            cardState: ['new'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jpdb',
        };
        const loadDictionary = vi.fn(async () => [{
            expression: '書く',
            reading: 'かく',
            glossary: ['to write'],
            score: 1,
            dictionary: 'Local',
        }]);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                newTabSource: 'auto',
            }),
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {
                listDecks: vi.fn(async () => [{ id: 'deck', name: 'Deck' }]),
                listDeckCards: vi.fn(async () => [jpdbCard]),
            } as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
                requestCurrent: vi.fn(),
            } as never,
            parser: {
                localCardFromEntry: vi.fn(() => ({ ...jpdbCard, spelling: '書く', reading: 'かく', source: 'local' })),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: ['Local'], dictionaryTypes: {} })),
                listRandomTopTerms: loadDictionary,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();

        expect(result.cards.map(card => card.spelling)).toEqual(['読む']);
        expect(result.sourceLabel).toBe('JPDB');
        expect(loadDictionary).not.toHaveBeenCalled();
    });

    it('marks JPDB API deck cards as review cards for stable new-tab counts', async () => {
        const jpdbCard = newTabTestCard({ spelling: '安定', reading: 'あんてい', source: 'jpdb' });
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'deck',
            }),
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {
                listDeckCards: vi.fn(async () => [jpdbCard]),
            } as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
                requestCurrent: vi.fn(),
            } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; reviewCountMode?: boolean }> }).loadWords();

        expect(result.reviewCountMode).toBe(true);
        expect(result.cards).toHaveLength(1);
        expect(result.cards[0]?.reviewSource).toBe('jpdb-api');
    });

    it('uses the JPDB-style new-tab kanji front canvas and reveal preview flow', async () => {
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: vi.fn(() => ({
                clearRect: vi.fn(),
                beginPath: vi.fn(),
                moveTo: vi.fn(),
                lineTo: vi.fn(),
                stroke: vi.fn(),
                save: vi.fn(),
                restore: vi.fn(),
            })),
        });
        Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
            configurable: true,
            value: vi.fn(() => 'data:image/png;base64,doodle'),
        });
        const card: JPDBCard = {
            vid: 1,
            sid: 1,
            rid: 1,
            spelling: '返',
            reading: 'へんじ',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [{ glosses: ['return'], partOfSpeech: [] }],
            cardState: ['new'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jpdb',
            kanjiKeyword: 'return',
        };
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, newTabKanjiAutogradeEnabled: true }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: { lookup: vi.fn(async () => ({ kanji: '返', keyword: 'return', meanings: ['return'], readings: [{ reading: 'へん', type: 'on' }], components: [], vocabulary: [], frequencyRank: null })) } as never,
            kanjiVG: { lookup: vi.fn(async () => ({ kanji: '返', strokeCount: 7, svg: '<svg class="jpdb-reader-kanjivg-svg"><g><path d="M0 0L1 1"></path></g></svg>' })) } as never,
            rtk: { lookup: vi.fn(async () => null) } as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        Object.assign(controller as unknown as { visibleWords: JPDBCard[]; sourceLabel: string; state: { mode: string; revealAnswer: boolean } }, {
            visibleWords: [card],
            sourceLabel: 'JPDB',
            state: { mode: 'kanji', revealAnswer: false },
        });

        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);
        await Promise.resolve();

        await (controller as unknown as { assessDoodle(slots: unknown, card: JPDBCard, kanji: string, strokes: Parameters<typeof assessKanjiStrokes>[0]): Promise<void> }).assessDoodle(
            { answer: root.querySelector('[data-newtab-reading]') },
            card,
            '返',
            [[{ x: 0.1, y: 0.1, pressure: 0.5 }, { x: 0.8, y: 0.1, pressure: 0.5 }]],
        );
        expect(root.querySelector('[data-newtab-doodle-result]')?.textContent).toBe('');

        expect(root.querySelector('.jpdb-reader-doodle-canvas')).not.toBeNull();
        expect(root.querySelector('.jpdb-reader-newtab-doodle')?.classList.contains('trace-hidden')).toBe(true);
        expect(root.querySelector('.jpdb-reader-newtab-doodle .jpdb-reader-newtab-doodle-actions')).toBeNull();
        expect(root.querySelector('.jpdb-reader-newtab-kanji-front > .jpdb-reader-newtab-doodle-actions')).not.toBeNull();
        expect(root.querySelector('[data-newtab-doodle-ghost]')).toHaveProperty('hidden', true);
        expect(root.querySelector('[data-doodle-trace]')?.textContent).toBe('Show trace');
        expect(root.querySelector('[data-newtab-meaning]')?.textContent).toBe('');

        (controller as unknown as { doodlePreviewCache: Map<string, string> }).doodlePreviewCache.set('1:1:返:へんじ', 'data:image/png;base64,doodle');
        (controller as unknown as { state: { mode: string; revealAnswer: boolean } }).state = { mode: 'kanji', revealAnswer: true };
        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);
        await Promise.resolve();

        expect(root.querySelector('.jpdb-reader-doodle-canvas')).toBeNull();
        expect(root.querySelector('.jpdb-reader-newtab-kanji-glyph')).toBeNull();
        expect(root.querySelector('.jpdb-reader-newtab-kanji-svg')).not.toBeNull();
        expect(root.querySelector('.jpdb-reader-newtab-doodle-preview img')?.getAttribute('src')).toBe('data:image/png;base64,doodle');
        expect(root.querySelector('.jpdb-reader-newtab-kanji-details')?.textContent).toContain('Keyword');
        expect(root.querySelector('.jpdb-reader-newtab-kanji-details')?.textContent).toContain('return');
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: originalGetContext,
        });
        Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
            configurable: true,
            value: originalToDataURL,
        });
    });

    it('does not flip the new-tab card when interacting with revealed details', () => {
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.innerHTML = `
            <section data-newtab-study>
                <div data-newtab-reading class="jpdb-reader-newtab-answer"></div>
                <div data-newtab-meaning class="jpdb-reader-newtab-meaning">
                    <details><summary>JPDB mnemonic</summary><p>Story text</p></details>
                </div>
            </section>
        `;
        let toggles = 0;
        (controller as unknown as { toggleReveal(root: HTMLElement): void }).toggleReveal = () => {
            toggles += 1;
        };
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

        const summary = root.querySelector<HTMLElement>('summary');
        const study = root.querySelector<HTMLElement>('[data-newtab-study]');
        expect(summary).not.toBeNull();
        expect(study).not.toBeNull();

        const summaryClickWasNotCanceled = summary!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(summaryClickWasNotCanceled).toBe(true);
        expect(toggles).toBe(0);

        const summaryKeyWasNotCanceled = summary!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
        expect(summaryKeyWasNotCanceled).toBe(true);
        expect(toggles).toBe(0);

        const studyClickWasNotCanceled = study!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(studyClickWasNotCanceled).toBe(false);
        expect(toggles).toBe(1);
    });

    it('ignores duplicate pointer navigation clicks from touch browsers', () => {
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.innerHTML = '<button type="button" data-newtab-action="next">Next</button>';
        Object.assign(controller as unknown as { visibleWords: JPDBCard[] }, {
            visibleWords: [{
                vid: 1,
                sid: 1,
                rid: 1,
                spelling: '読む',
                reading: 'よむ',
                frequencyRank: null,
                partOfSpeech: [],
                meanings: [],
                cardState: ['new'],
                pitchAccent: [],
                wordWithReading: null,
                source: 'local',
            }],
        });
        let advances = 0;
        (controller as unknown as { showNextWord(): void }).showNextWord = () => {
            advances += 1;
        };
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

        const button = root.querySelector('button')!;
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(advances).toBe(1);
    });

    it('routes nested kanji detail buttons and dictionary links to the popup lookup handlers', () => {
        const lookupText = vi.fn();
        const lookupDictionaryReference = vi.fn();
        const showKanjiCard = vi.fn();
        const card: JPDBCard = {
            vid: 1,
            sid: 1,
            rid: 1,
            spelling: '事情',
            reading: 'じじょう',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [{ glosses: ['circumstances'], partOfSpeech: [] }],
            cardState: ['new'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'local',
            sentence: '事情を説明する。',
        };
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            lookupText,
            lookupDictionaryReference,
            showKanjiCard,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.innerHTML = `
            <section data-newtab-study>
                <a class="gloss-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="国家" data-dictionary-reading="こっか" data-dictionary="Jitendex">国家</a>
                <button type="button" data-action="similar-word" data-expression="何事" data-reading="なにごと">何事</button>
                <button type="button" data-action="kanji" data-kanji="事">事</button>
            </section>
        `;
        Object.assign(controller as unknown as { visibleWords: JPDBCard[]; index: number }, {
            visibleWords: [card],
            index: 0,
        });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

        root.querySelector<HTMLAnchorElement>('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        root.querySelectorAll<HTMLButtonElement>('button')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        root.querySelectorAll<HTMLButtonElement>('button')[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(lookupDictionaryReference).toHaveBeenCalledWith('国家', 'こっか', 'Jitendex', root.querySelector('a'));
        expect(lookupText).toHaveBeenCalledWith('何事', 'なにごと', root.querySelectorAll('button')[0]);
        expect(showKanjiCard).toHaveBeenCalledWith(card, '事', '事情を説明する。', root.querySelectorAll('button')[1]);
    });

    it('reveals blurred Immersion Kit translations on the new tab card', () => {
        const settings = { ...DEFAULT_SETTINGS, immersionKitRevealTranslationOnClick: true };
        const onSettingsChange = vi.fn();
        const setImmersionTranslationBlurred = vi.fn((blurred: boolean) => {
            settings.immersionKitRevealTranslationOnClick = blurred;
        });
        const controller = new NewTabController({
            getSettings: () => settings,
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            setImmersionTranslationBlurred,
            onSettingsChange,
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.innerHTML = `
            <section data-newtab-study>
                <div class="jpdb-reader-newtab-meaning">
                    <div class="jpdb-reader-example-translation jpdb-reader-parseable" data-yomu-immersion-translation-blurred="true" role="button" tabindex="0" aria-label="Reveal translation">Either way, there wouldn't have been a peaceful alternative.</div>
                </div>
            </section>
        `;
        let toggles = 0;
        (controller as unknown as { toggleReveal(root: HTMLElement): void }).toggleReveal = () => {
            toggles += 1;
        };
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

        const translation = root.querySelector<HTMLElement>('.jpdb-reader-example-translation')!;
        const clickWasNotCanceled = translation.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(clickWasNotCanceled).toBe(false);
        expect(settings.immersionKitRevealTranslationOnClick).toBe(false);
        expect(setImmersionTranslationBlurred).toHaveBeenCalledWith(false);
        expect(onSettingsChange).not.toHaveBeenCalled();
        expect(translation.dataset.yomuImmersionTranslationBlurred).toBeUndefined();
        expect(translation.hasAttribute('role')).toBe(false);
        expect(translation.hasAttribute('tabindex')).toBe(false);
        expect(translation.hasAttribute('aria-label')).toBe(false);
        expect(toggles).toBe(0);

        settings.immersionKitRevealTranslationOnClick = true;
        translation.dataset.yomuImmersionTranslationBlurred = 'true';
        translation.setAttribute('role', 'button');
        translation.setAttribute('tabindex', '0');
        translation.setAttribute('aria-label', 'Reveal translation');
        setImmersionTranslationBlurred.mockClear();
        onSettingsChange.mockClear();

        const keyWasNotCanceled = translation.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));

        expect(keyWasNotCanceled).toBe(false);
        expect(settings.immersionKitRevealTranslationOnClick).toBe(false);
        expect(setImmersionTranslationBlurred).toHaveBeenCalledWith(false);
        expect(onSettingsChange).not.toHaveBeenCalled();
        expect(translation.dataset.yomuImmersionTranslationBlurred).toBeUndefined();
        expect(toggles).toBe(0);
    });

    it('uses dark ink for the light-grid popover kanji doodle even in dark theme', () => {
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        const context = {
            strokeStyle: '',
            lineCap: '',
            lineJoin: '',
            lineWidth: 0,
            clearRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
        };
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: vi.fn(() => context),
        });
        document.documentElement.style.setProperty('--jpdb-reader-text', '#fff');
        const root = document.createElement('div');
        root.innerHTML = `
            <div class="jpdb-reader-doodle-stage" data-kanji="会">
                <div class="jpdb-reader-doodle-ghost"></div>
                <canvas class="jpdb-reader-doodle-canvas"></canvas>
            </div>
        `;
        const stage = root.querySelector<HTMLElement>('.jpdb-reader-doodle-stage')!;
        const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
        stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
        canvas.getBoundingClientRect = stage.getBoundingClientRect;

        installKanjiDoodle(root, () => DEFAULT_SETTINGS.interfaceLanguage);
        canvas.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), {
            clientX: 10,
            clientY: 10,
            pointerId: 1,
            pointerType: 'mouse',
            pressure: 0.5,
        }));
        canvas.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), {
            clientX: 80,
            clientY: 80,
            pointerId: 1,
            pointerType: 'mouse',
            pressure: 0.5,
        }));

        expect(context.strokeStyle).toBe('#141820');
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: originalGetContext,
        });
        document.documentElement.style.removeProperty('--jpdb-reader-text');
    });

    it('keeps Apple Pencil doodle strokes when the pointer leaves the canvas and suppresses text selection', () => {
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        const context = {
            strokeStyle: '',
            fillStyle: '',
            lineCap: '',
            lineJoin: '',
            lineWidth: 0,
            clearRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            arc: vi.fn(),
            fill: vi.fn(),
            stroke: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
        };
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: vi.fn(() => context),
        });
        const onChange = vi.fn();
        const root = document.createElement('div');
        root.innerHTML = `
            <div class="jpdb-reader-doodle-stage" data-kanji="会">
                <div class="jpdb-reader-doodle-ghost"></div>
                <canvas class="jpdb-reader-doodle-canvas"></canvas>
            </div>
            <div class="jpdb-reader-doodle-tools">
                <button class="jpdb-reader-btn jpdb-reader-doodle-control" type="button" data-doodle-trace>Show trace</button>
            </div>
        `;
        document.body.append(root);
        const stage = root.querySelector<HTMLElement>('.jpdb-reader-doodle-stage')!;
        const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
        const trace = root.querySelector<HTMLButtonElement>('[data-doodle-trace]')!;
        stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
        canvas.getBoundingClientRect = stage.getBoundingClientRect;

        installKanjiDoodle(root, () => DEFAULT_SETTINGS.interfaceLanguage, { onChange });
        canvas.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), {
            clientX: 10,
            clientY: 10,
            pointerId: 9,
            pointerType: 'pen',
            pressure: 0.4,
        }));
        document.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), {
            clientX: 120,
            clientY: 120,
            pointerId: 9,
            pointerType: 'pen',
            pressure: 0.6,
            getCoalescedEvents: () => [
                { clientX: 40, clientY: 45, pressure: 0.5 },
                { clientX: 80, clientY: 88, pressure: 0.6 },
            ],
        }));
        document.dispatchEvent(Object.assign(new Event('pointerup', { bubbles: true, cancelable: true }), {
            clientX: 120,
            clientY: 120,
            pointerId: 9,
            pointerType: 'pen',
            pressure: 0,
        }));

        expect(onChange).toHaveBeenCalledWith([
            expect.arrayContaining([
                expect.objectContaining({ x: 0.1, y: 0.1 }),
                expect.objectContaining({ x: 0.4, y: 0.45 }),
                expect.objectContaining({ x: 0.8, y: 0.88 }),
            ]),
        ]);
        expect(context.arc).toHaveBeenCalled();
        expect(context.lineTo).toHaveBeenCalled();

        const range = document.createRange();
        range.selectNodeContents(trace);
        document.getSelection()?.removeAllRanges();
        document.getSelection()?.addRange(range);
        const selectStart = new Event('selectstart', { bubbles: true, cancelable: true });
        trace.dispatchEvent(selectStart);
        expect(selectStart.defaultPrevented).toBe(true);
        expect(document.getSelection()?.isCollapsed).toBe(true);

        root.remove();
        document.documentElement.classList.remove('jpdb-reader-doodle-active');
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: originalGetContext,
        });
    });

    it('keeps new-tab word readings and meanings off the front side until reveal', async () => {
        const card: JPDBCard = {
            vid: 1,
            sid: 1,
            rid: 1,
            spelling: '返す',
            reading: 'かえす',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [{ glosses: ['to return'], partOfSpeech: [] }],
            cardState: ['new'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jpdb',
        };
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        Object.assign(controller as unknown as { visibleWords: JPDBCard[]; sourceLabel: string; state: { mode: string; revealAnswer: boolean } }, {
            visibleWords: [card],
            sourceLabel: 'JPDB',
            state: { mode: 'word', revealAnswer: false },
        });

        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

        expect(root.querySelector('[data-newtab-reading]')?.textContent).toBe('');
        expect(root.querySelector('[data-newtab-meaning]')?.textContent).toBe('');

        (controller as unknown as { state: { mode: string; revealAnswer: boolean } }).state = { mode: 'word', revealAnswer: true };
        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

        expect(root.querySelector('[data-newtab-reading]')?.textContent).toBe('かえす');
        expect(root.querySelector('[data-newtab-meaning]')?.textContent).toContain('to return');
    });

    it('opens dictionary settings from the empty new-tab setup state', () => {
        const showSettings = vi.fn();
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
            } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings,
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderDictionarySetup(root: HTMLElement): void }).bindRootEvents(root);
        (controller as unknown as { renderDictionarySetup(root: HTMLElement): void }).renderDictionarySetup(root);

        root.querySelector<HTMLButtonElement>('[data-newtab-action="load-dictionary"]')?.click();

        expect(showSettings).toHaveBeenCalledWith('dictionaries');
        expect(root.querySelector('[data-newtab-prompt]')?.textContent).toBe('Start with a dictionary');
    });

    it('does not retry empty dictionary setup in a loading loop', () => {
        vi.useFakeTimers();
        const invalidateCaches = vi.fn();
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
            } as never,
            parser: {} as never,
            dictionaries: { invalidateCaches } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());

        (controller as unknown as { renderDictionarySetup(root: HTMLElement): void }).renderDictionarySetup(root);
        vi.advanceTimersByTime(30_000);

        expect(invalidateCaches).not.toHaveBeenCalled();
        expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('');
    });

    it('does not reload dictionary setup on a later new-tab render', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const summary = vi.fn(async () => ({ dictionaries: [], dictionaryTypes: {} }));
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, newTabSource: 'dictionary' }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
            } as never,
            parser: { cacheCards: vi.fn() } as never,
            dictionaries: { summary } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        await controller.renderPage();
        await controller.renderPage();

        expect(summary).toHaveBeenCalledTimes(1);
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('Start with a dictionary');
        expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('');
        document.body.replaceChildren();
    });

    it('reloads the empty dictionary setup after dictionary settings change', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const settings = {
            ...DEFAULT_SETTINGS,
            newTabEnabled: true,
            newTabSource: 'dictionary' as const,
            immersionKitEnabled: false,
        };
        const localCard = newTabTestCard({ spelling: '書く', reading: 'かく', source: 'local' });
        const summary = vi.fn(async () => settings.dictionaryPreferences.length
            ? {
                dictionaries: [{ title: 'Local', alias: 'Tiny Alias', enabled: true, priority: 0, type: 'terms' as const }],
                terms: 1,
                kanji: 0,
                termMeta: 0,
                kanjiMeta: 0,
            }
            : {
                dictionaries: [],
                terms: 0,
                kanji: 0,
                termMeta: 0,
                kanjiMeta: 0,
            });
        const listRandomTopTerms = vi.fn(async () => [{
            expression: '書く',
            reading: 'かく',
            glossary: ['to write'],
            score: 1,
            dictionary: 'Local',
        }]);
        const invalidateCaches = vi.fn();
        const controller = new NewTabController({
            getSettings: () => settings,
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
            } as never,
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(() => localCard),
            } as never,
            dictionaries: {
                summary,
                listRandomTopTerms,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        await controller.renderPage();
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('Start with a dictionary');

        settings.dictionaryPreferences = [{ name: 'Local', alias: 'Tiny Alias', enabled: true, priority: 0, type: 'terms' }];
        await controller.renderPage();

        expect(summary).toHaveBeenCalledTimes(2);
        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 4000, settings.dictionaryPreferences);
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('書く');
        expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionaries');
        document.body.replaceChildren();
    });

    it('can force-retry dictionary setup when dictionaries appear outside settings', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const settings = {
            ...DEFAULT_SETTINGS,
            newTabEnabled: true,
            newTabSource: 'dictionary' as const,
            localDictionariesEnabled: true,
            dictionaryPreferences: [{ name: 'Local', alias: 'Local', enabled: true, priority: 0, type: 'terms' as const }],
            immersionKitEnabled: false,
            newTabOfflineEnabled: false,
        };
        const localCard = newTabTestCard({ spelling: '書く', reading: 'かく', source: 'local' });
        const summary = vi.fn()
            .mockResolvedValueOnce({
                dictionaries: [],
                terms: 0,
                kanji: 0,
                termMeta: 0,
                kanjiMeta: 0,
            })
            .mockResolvedValueOnce({
                dictionaries: [{ title: 'Local', alias: 'Local', enabled: true, priority: 0, type: 'terms' as const }],
                terms: 1,
                kanji: 0,
                termMeta: 0,
                kanjiMeta: 0,
            });
        const listRandomTopTerms = vi.fn(async () => [{
            expression: '書く',
            reading: 'かく',
            glossary: ['to write'],
            score: 1,
            dictionary: 'Local',
        }]);
        const invalidateCaches = vi.fn();
        const controller = new NewTabController({
            getSettings: () => settings,
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
            } as never,
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(() => localCard),
            } as never,
            dictionaries: {
                invalidateCaches,
                summary,
                listRandomTopTerms,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        await controller.renderPage();
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('Start with a dictionary');

        await controller.refreshExternalData();

        expect(summary).toHaveBeenCalledTimes(2);
        expect(invalidateCaches).toHaveBeenCalledTimes(1);
        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 4000, settings.dictionaryPreferences);
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('書く');
        expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionaries');
        document.body.replaceChildren();
    });

    it('keeps auto dictionary fallback out of review count mode and uses the shared card limit', async () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const localCard = newTabTestCard({ spelling: '書く', reading: 'かく', source: 'local' });
        const listRandomTopTerms = vi.fn(async () => [{
            expression: '書く',
            reading: 'かく',
            glossary: ['to write'],
            score: 1,
            dictionary: 'Local',
        }]);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                ankiEnabled: false,
                newTabSource: 'auto',
            }),
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
                requestCurrent: vi.fn(),
            } as never,
            parser: {
                localCardFromEntry: vi.fn(() => localCard),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: ['Local'], dictionaryTypes: {} })),
                listRandomTopTerms,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; reviewCountMode?: boolean }> }).loadWords();

        expect(result.cards.map(card => card.spelling)).toEqual(['書く']);
        expect(result.reviewCountMode).toBe(false);
        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 4000, DEFAULT_SETTINGS.dictionaryPreferences);
    });

    it('hides counts for dictionary cards while showing review totals', () => {
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const dictionaryCard = newTabTestCard({ spelling: '辞書', source: 'local' });
        const jpdbCard = newTabTestCard({ spelling: '復習', source: 'jpdb' });
        const ankiCard = newTabTestCard({ spelling: '暗記', source: 'anki' });
        Object.assign(controller as unknown as { visibleWords: JPDBCard[]; index: number; reviewCountMode: boolean }, {
            visibleWords: [dictionaryCard, jpdbCard, ankiCard],
            index: 0,
            reviewCountMode: false,
        });

        expect((controller as unknown as { newTabCountLabel(card: JPDBCard): string }).newTabCountLabel(dictionaryCard)).toBe('');
        expect((controller as unknown as { newTabCountLabel(card: JPDBCard): string }).newTabCountLabel(jpdbCard)).toBe('1 / 3');
        expect((controller as unknown as { newTabCountLabel(card: JPDBCard): string }).newTabCountLabel(ankiCard)).toBe('1 / 3');
    });

    it('restores the saved refresh card at the first visible position', () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        sessionStorage.setItem('jpdb-reader-newtab-current-word', JSON.stringify({
            signature: 'dictionary|word|Dictionaries',
            key: '1:1:読む:よむ',
        }));
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const read = newTabTestCard({ vid: 1, spelling: '読む', reading: 'よむ', source: 'local' });
        const write = newTabTestCard({ vid: 2, spelling: '書く', reading: 'かく', source: 'local' });
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, newTabSource: 'dictionary', immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            allWords: [read, write],
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'dictionary', revealAnswer: false },
        });

        (controller as unknown as { applyWords(root: HTMLElement, preferStoredWord: boolean): void }).applyWords(root, true);

        expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords[0]?.spelling).toBe('読む');
        expect(root.querySelector('[data-newtab-count]')?.textContent).toBe('');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
    });

    it('omits popover-style kanji source cards from new-tab kanji details', () => {
        vi.stubGlobal('CSS', { ...(globalThis.CSS ?? {}), escape: (value: string) => value });
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                similarKanjiWords: false,
                kanjiOriginGraphEnabled: true,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const details = (controller as unknown as {
            renderKanjiDetails(card: JPDBCard, kanji: string, info: unknown, rtk: null, vg: null, local: [], similar: []): HTMLElement;
        }).renderKanjiDetails(newTabTestCard({ spelling: '休', source: 'jpdb' }), '休', {
            kanji: '休',
            keyword: 'rest',
            frequency: '',
            type: '',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [],
            components: [{ kanji: '亻', keyword: 'person' }, { kanji: '木', keyword: 'tree' }],
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }, null, null, [], []);
        expect(details.querySelector('.jpdb-reader-newtab-kanji-sources')).toBeNull();
        expect(details.querySelector('.jpdb-reader-origin-graph-wrap')).not.toBeNull();
        expect(details.querySelector('.jpdb-reader-component-card')).not.toBeNull();
    });
});
