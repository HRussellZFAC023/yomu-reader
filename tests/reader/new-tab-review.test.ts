import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnkiConnectClient } from '../../src/reader/anki';
import { NewTabController, selectNewTabStudyPool } from '../../src/reader/new-tab-controller';
import { parseJpdbReviewDocument } from '../../src/reader/jpdb-review-bridge';
import { installKanjiDoodle } from '../../src/reader/kanji-doodle';
import { assessKanjiStrokes } from '../../src/reader/kanji-stroke-grader';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { definitionSourceRows } from '../../src/reader/source-sections';
import type { JPDBCard } from '../../src/reader/types';

afterEach(() => {
    vi.unstubAllGlobals();
});

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

        const client = new AnkiConnectClient(() => ({
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            ankiDeck: 'Yomu',
            ankiModel: 'Yomu Japanese',
        }));
        const cards = await client.listNewTabCards(10);

        expect(actions).toEqual(['findCards', 'areDue', 'cardsInfo', 'notesInfo']);
        expect(cards.map(card => card.spelling)).toEqual(['読む', '書く']);
        expect(cards[0].ankiCardId).toBe(101);
        expect(cards[0].sentence).toBe('本を読む。');
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
            ensureStarterDictionary: vi.fn(),
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
            ensureStarterDictionary: vi.fn(),
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
            ensureStarterDictionary: vi.fn(),
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
            ensureStarterDictionary: vi.fn(),
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
            ensureStarterDictionary: vi.fn(),
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
            ensureStarterDictionary: vi.fn(),
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

    it('opens dictionary settings instead of showing a no-userscript download status', async () => {
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
            ensureStarterDictionary: vi.fn(),
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings,
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.innerHTML = '<div data-newtab-status></div>';

        await (controller as unknown as { installStarterDictionary(root: HTMLElement): Promise<void> }).installStarterDictionary(root);

        expect(showSettings).toHaveBeenCalledWith('dictionaries');
        expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('');
    });

    it('allows the hosted demo runtime to install the starter dictionary', async () => {
        vi.stubGlobal('__yomuDemoApp', {});
        const ensureStarterDictionary = vi.fn(async () => false);
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
            ensureStarterDictionary,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings,
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.innerHTML = '<div data-newtab-status></div>';

        await (controller as unknown as { installStarterDictionary(root: HTMLElement): Promise<void> }).installStarterDictionary(root);

        expect(showSettings).not.toHaveBeenCalled();
        expect(ensureStarterDictionary).toHaveBeenCalledTimes(1);
        expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionary was not added.');
    });
});
