import { describe, expect, it, vi } from 'vitest';
import {
    registerNewTabReviewCleanup,
    DEFAULT_SETTINGS,
    newTabTestCard,
    deferred,
    newTabImmersionExample,
    stubClientRects,
    newTabPromptController,
    renderEnabledNewTabRoot,
    expectOpaqueStudyCardToken,
    createNewTabKanjiFrontFixture,
    newTabBareController,
    renderSeededNewTabWord,
    renderNewTabCardFront,
    renderNewTabWordFront,
    expectRevealedPromptPitch,
    stubKanjiDoodleBrowserApis,
    NewTabController,
    assessKanjiStrokes,
    BASE_DEFAULT_SETTINGS,
    waitForExpect,
} from './fixtures';
import type {
    ImmersionKitExample,
    JPDBCard,
} from './fixtures';

describe('new tab review — card fronts, pitch/audio & front-sentence parsing', () => {
    registerNewTabReviewCleanup();


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
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                newTabKanjiAutogradeEnabled: true,
                newTabStudyStepOrder: BASE_DEFAULT_SETTINGS.newTabStudyStepOrder,
                newTabStudyDisabledSteps: [],
            }),
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
        const root = renderEnabledNewTabRoot(controller);
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

    it('drops a stale kanji SVG enrichment so the previous kanji never fills the next step ghost', () => {
        const controller = newTabBareController();
        const answer = document.createElement('div');
        answer.innerHTML = `
            <div class="jpdb-reader-doodle-stage" data-study-doodle-step="kanji-doodle:1">
                <div class="jpdb-reader-doodle-ghost" data-newtab-doodle-ghost></div>
            </div>
        `;
        const ghost = answer.querySelector<HTMLElement>('[data-newtab-doodle-ghost]')!;
        const applySvg = (stepId: string) => (controller as unknown as {
            applyEnrichedKanjiSvg(answer: HTMLElement | null, stepId: string, svg: string | undefined): void;
        }).applyEnrichedKanjiSvg(answer, stepId, '<svg class="jpdb-reader-kanjivg-svg"><g><path d="M0 0L1 1"></path></g></svg>');

        applySvg('kanji-doodle:0');
        expect(ghost.querySelector('svg')).toBeNull();

        applySvg('kanji-doodle:1');
        expect(ghost.querySelector('svg')).not.toBeNull();
    });

    it('fronts the blanked cloze WITHOUT the word meaning on the kanji front', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const lookup = deferred<{ kanji: string; keyword: string; meanings: string[]; readings: []; components: []; vocabulary: []; frequencyRank: null }>();
        const card = newTabTestCard({
            vid: 20,
            sid: 20,
            spelling: '播く',
            reading: 'まく',
            meanings: [{ glosses: ['5-dan transitive kana to sow to plant to seed to sow'], partOfSpeech: [] }],
        });
        try {
            const { root } = createNewTabKanjiFrontFixture(card, {
                jpdbKanji: { lookup: vi.fn(() => lookup.promise) } as never,
            });

            // The blanked cloze fronts immediately, but the word meaning must
            // NOT: it is the answer to the session's word step (owner: "showing
            // 'time ＿＿' gives away the answer for the next part"). The meaning
            // stays reachable behind the Hint button.
            const promptText = root.querySelector('[data-newtab-prompt]')?.textContent ?? '';
            expect(promptText).not.toContain('to sow');
            expect(promptText).toContain('＿く');
            expect(promptText).not.toContain('5-dan transitive');
            expect(promptText).toContain('Hint');

            lookup.resolve({ kanji: '播', keyword: 'disseminate', meanings: ['disseminate'], readings: [], components: [], vocabulary: [], frequencyRank: null });
            await waitForExpect(() => {
                expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('JPDB');
                expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('disseminate');
            });
        } finally {
            restoreCanvas();
        }
    });

    it('drops a kanji keyword that merely restates the fronted word meaning', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const lookup = deferred<{ kanji: string; keyword: string; meanings: string[]; readings: []; components: []; vocabulary: []; frequencyRank: null }>();
        const card = newTabTestCard({
            vid: 21,
            sid: 21,
            spelling: '飲み物',
            reading: 'のみもの',
            meanings: [{ glosses: ['drink'], partOfSpeech: [] }],
        });
        try {
            const { root } = createNewTabKanjiFrontFixture(card, {
                jpdbKanji: { lookup: vi.fn(() => lookup.promise) } as never,
            });
            lookup.resolve({ kanji: '飲', keyword: 'drink', meanings: ['drink'], readings: [], components: [], vocabulary: [], frequencyRank: null });
            await waitForExpect(() => {
                const prompt = root.querySelector('[data-newtab-prompt]');
                expect(prompt?.querySelector('.jpdb-reader-newtab-kanji-front-context')).not.toBeNull();
            });
            const prompt = root.querySelector('[data-newtab-prompt]');
            expect(prompt?.textContent).toContain('＿み＿');
            // The context row already fronts "drink" — a "JPDB drink" pill below
            // would be pure repetition.
            expect(prompt?.querySelectorAll('.jpdb-reader-newtab-kanji-front-keyword:not(.jpdb-reader-newtab-kanji-front-context)').length).toBe(0);
        } finally {
            restoreCanvas();
        }
    });

    it('hydrates 川 kanji study cards from JPDB facts instead of showing missing-keyword states', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const jpdbKanjiLookup = vi.fn(async () => ({
            kanji: '川',
            keyword: 'river',
            frequency: 'Top 300',
            type: 'Joyo',
            kanken: '10',
            heisig: '#127',
            oldForms: [],
            readings: [
                { reading: 'かわ', share: '77%', common: true },
                { reading: 'セン', share: '23%', common: true },
            ],
            components: [],
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [{ expression: '川辺', reading: 'かわべ', meaning: 'riverside', url: 'https://jpdb.io/vocabulary/1/川辺/かわべ' }],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }));
        const card = newTabTestCard({
            spelling: '川',
            reading: '川',
            meanings: [],
            source: 'jpdb',
            kanjiKeyword: '',
        });
        try {
            const { root: frontRoot } = createNewTabKanjiFrontFixture(card, {
                jpdbKanji: { lookup: jpdbKanjiLookup } as never,
            });

            await waitForExpect(() => {
                const prompt = frontRoot.querySelector('[data-newtab-prompt]')?.textContent ?? '';
                expect(prompt).toContain('JPDB');
                expect(prompt).toContain('river');
                expect(prompt).not.toContain('No kanji keyword found');
            });
            expect(jpdbKanjiLookup).toHaveBeenCalledWith('川');
            frontRoot.remove();

            const { root: answerRoot } = createNewTabKanjiFrontFixture(card, {
                jpdbKanji: { lookup: jpdbKanjiLookup } as never,
            }, { revealAnswer: true });

            await waitForExpect(() => {
                const meaning = answerRoot.querySelector('[data-newtab-meaning]')?.textContent ?? '';
                expect(meaning).toContain('JPDB');
                expect(meaning).toContain('Keywordriver');
                expect(meaning).toContain('かわ 77%');
                expect(meaning).toContain('川辺');
                expect(meaning).not.toContain('Kanji details are not available yet');
            });
            answerRoot.remove();
        } finally {
            restoreCanvas();
        }
    });

    it('shows JPDB, RTK, and imported-dictionary kanji keywords on the unrevealed front', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const card = newTabTestCard({
            vid: 21,
            sid: 21,
            spelling: '柔',
            reading: 'じゅう',
            source: 'jpdb',
            kanjiKeyword: 'gentle',
        });
        try {
            const { root } = createNewTabKanjiFrontFixture(card, {
                jpdbKanji: { lookup: vi.fn(async () => ({ kanji: '柔', keyword: 'gentle', meanings: ['gentle'], readings: [], components: [], vocabulary: [], frequencyRank: null })) } as never,
                rtk: { lookup: vi.fn(async () => ({ kanji: '柔', keyword: 'tenderness', frameNumber: '2042', onYomi: '', kunYomi: '', elements: '', componentKanji: [], heisigStory: '', heisigComment: '', koohiiStories: [] })) } as never,
                dictionaries: { lookupKanji: vi.fn(async () => [{ character: '柔', onyomi: [], kunyomi: [], tags: [], meanings: ['soft', 'flexible', 'yielding'], dictionary: 'KANJIDIC' }]), lookupSimilarTermsByKanji: vi.fn(async () => []) } as never,
            }, {}, { corsProxyUrl: 'https://proxy.example/fetch' });

            await waitForExpect(() => {
                const rows = [...root.querySelectorAll('.jpdb-reader-newtab-kanji-front-keyword')].map(row => row.textContent);
                expect(rows).toEqual(['JPDBgentle', 'RTKtenderness', 'dictsoft']);
            });
        } finally {
            restoreCanvas();
        }
    });

    it('keeps the current card selected when switching between word and kanji mode', () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const current = newTabTestCard({ vid: 10, sid: 10, spelling: '月', reading: 'つき', kanjiKeyword: 'moon' });
        const other = newTabTestCard({ vid: 11, sid: 11, spelling: '胸', reading: 'むね', kanjiKeyword: 'chest' });
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            immersionKitEnabled: false,
            newTabKanjiAutogradeEnabled: false,
            newTabStudyDisabledSteps: [],
        }, {
            dictionaries: { lookupKanji: vi.fn(async () => []), lookupSimilarTermsByKanji: vi.fn(async () => []) } as never,
        });
        try {
            const root = renderEnabledNewTabRoot(controller);
            Object.assign(controller as unknown as {
                allWords: JPDBCard[];
                visibleWords: JPDBCard[];
                index: number;
                sourceLabel: string;
                state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            }, {
                allWords: [other, current],
                visibleWords: [other, current],
                index: 1,
                sourceLabel: 'JPDB',
                state: { mode: 'word', sort: 'random', filter: 'study', source: 'dictionary', revealAnswer: false },
            });
            (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderWord(root: HTMLElement, card: JPDBCard): void }).bindRootEvents(root);
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, current);

            root.querySelector<HTMLButtonElement>('[data-study-step-kind="kanji-doodle"]')?.click();

            expect((controller as unknown as { currentVisibleWordKey(): string }).currentVisibleWordKey()).toBe('10:10:月:つき');
            expectOpaqueStudyCardToken(root, '月', 'つき');
            expect(root.classList.contains('jpdb-reader-newtab-kanji-mode')).toBe(true);
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('moon');
        } finally {
            restoreCanvas();
        }
    });

    it('keeps kanji-draw answers out of the DOM until reveal while preserving the shared reveal flow', () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const card = newTabTestCard({
            vid: 41,
            sid: 42,
            spelling: '買い物',
            reading: 'かいもの',
            meanings: [{ glosses: ['shopping'], partOfSpeech: [] }],
            kanjiKeyword: 'buy',
        });
        const playWordAudio = vi.fn();
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            immersionKitEnabled: false,
            newTabKanjiAutogradeEnabled: false,
            newTabStudyDisabledSteps: [],
        }, { playWordAudio });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'Dictionaries',
            state: { source: 'dictionary', revealAnswer: false },
            bindRootEvents: true,
            studyStepId: 'kanji-doodle:0',
        });

        try {
            const study = root.querySelector<HTMLElement>('[data-newtab-study]')!;
            const preRevealMarkup = study.outerHTML;

            expect(study.dataset.newtabCard).toMatch(/^study-card-\d+$/);
            expect(study.dataset.newtabCard).not.toContain('買');
            expect(study.dataset.newtabCard).not.toContain('かいもの');
            expect(study.querySelector('[data-study-step-kanji]')).toBeNull();
            expect(study.querySelector('[data-study-hint-kanji]')).toBeNull();
            expect(study.querySelector('.jpdb-reader-doodle-stage')?.hasAttribute('data-kanji')).toBe(false);
            expect(study.querySelector('.jpdb-reader-doodle-canvas')?.getAttribute('aria-label')).toBe('Write by hand');
            expect(preRevealMarkup).not.toContain('買');
            expect(preRevealMarkup).not.toContain('買い物');
            expect(preRevealMarkup).toContain('＿い＿');

            root.querySelector<HTMLButtonElement>('[data-study-step-kind="word"]')!.click();
            const preRevealCardIds = Array.from(study.querySelectorAll<HTMLElement>('[data-newtab-card]'))
                .map(element => element.dataset.newtabCard);
            expect(new Set(preRevealCardIds)).toEqual(new Set([study.dataset.newtabCard]));
            expect(study.dataset.newtabCard).toMatch(/^study-card-\d+$/);
            study.querySelector<HTMLButtonElement>('[data-action="study-word-audio"]')!.click();
            expect(playWordAudio).toHaveBeenCalledWith(card);

            root.querySelector<HTMLButtonElement>('[data-study-step-kind="final-reveal"]')!.click();

            expect(root.classList.contains('jpdb-reader-newtab-revealed')).toBe(true);
            expect(study.dataset.newtabCard).toBe('41:42:買い物:かいもの');
            expect(study.querySelector<HTMLElement>('.jpdb-reader-word')?.dataset.expression).toBe('買い物');
            expect(study.textContent).toContain('shopping');
        } finally {
            root.remove();
            restoreCanvas();
        }
    });

    it('renders the word front as a large keyword with the sentence below', () => {
        const sentence = '難波金満(なにわきんまん)高校 生徒会長 宝多金男(かねお)や';
        const card = newTabTestCard({ spelling: '難波', reading: 'なにわ', sentence, source: 'anki', pitchAccent: ['LHH'] });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false });

        const root = renderNewTabCardFront(controller, card, { studyStepId: 'final-reveal' });

        const prompt = root.querySelector<HTMLElement>('[data-newtab-prompt]');
        const promptTerm = prompt?.querySelector<HTMLElement>('.jpdb-reader-newtab-term .jpdb-reader-word');
        expect(promptTerm?.dataset.expression).toBe('難波');
        expect(promptTerm?.dataset.reading).toBe('なにわ');
        expect(promptTerm?.querySelector('rt')?.textContent).toBe('なにわ');
        expect(promptTerm?.dataset.pitchClass).toBeUndefined();
        expect(promptTerm?.classList.contains('jpdb-pitch-heiban')).toBe(false);
        expect(prompt?.querySelector('.jpdb-reader-newtab-sentence')?.textContent).toBe(sentence);
        expect(prompt?.querySelector('.jpdb-reader-newtab-sentence .jpdb-reader-word')?.textContent).toBe('難波');
        expect(prompt?.querySelector('.jpdb-reader-newtab-sentence .jpdb-reader-word')?.classList.contains('jpdb-pitch-heiban')).toBe(false);
    });

    it('omits the prompt sentence after reveal when Immersion Kit owns the example below', () => {
        const sentence = 'この忙しいのに映画？ 堕落ね';
        const card = newTabTestCard({ spelling: '映画', reading: 'えいが', sentence });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: true });
        const front = renderSeededNewTabWord(controller, card);
        const back = renderSeededNewTabWord(controller, card, {
            state: { revealAnswer: true },
        });

        try {
            expect(front.querySelector('.jpdb-reader-newtab-sentence')?.textContent).toBe(sentence);
            expect(back.querySelector('.jpdb-reader-newtab-sentence')).toBeNull();
            expect(back.querySelector('[data-newtab-prompt] .jpdb-reader-newtab-term')?.textContent).toContain('映画');
        } finally {
            front.remove();
            back.remove();
        }
    });

    it('renders Anki review cards from their original rendered front and back', () => {
        const card = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 404,
            ankiDeckNames: ['Core'],
            ankiAudioFilenames: ['nihongo-front.mp3'],
            ankiRenderedCards: [
                {
                    cardId: 404,
                    deckName: 'Core',
                    question: '<div class="front" style="font: italic 700 96px/1.2 serif">日本語 [anki:play:q:0]</div>',
                    answer: '<div class="back">Japanese language</div><script>window.bad = true</script>',
                },
                {
                    cardId: 405,
                    deckName: 'Core',
                    question: '<div>Reverse card should stay hidden</div>',
                    answer: '<div>日本語</div>',
                },
            ],
        });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false });
        const root = renderNewTabWordFront(controller, card);

        try {
            const front = root.querySelector<HTMLElement>('[data-newtab-prompt]')!;
            expect(front.classList.contains('jpdb-reader-newtab-prompt-anki-card')).toBe(true);
            expect(front.querySelector<HTMLElement>('.jpdb-reader-anki-rendered-card')?.dataset.ankiRenderedCardId).toBe('404');
            expect(front.textContent).toContain('日本語');
            expect(front.textContent).not.toContain('Card audio');
            expect(front.textContent).not.toContain('Japanese language');
            expect(front.textContent).not.toContain('Reverse card should stay hidden');
            expect(front.querySelector<HTMLElement>('.front')?.getAttribute('style') ?? '')
                .toMatch(/font:\s*italic\s+700\s+52px\/1\.2\s+serif/i);
            expect(front.innerHTML).not.toContain('96px');
            const audio = front.querySelector<HTMLButtonElement>('[data-action="anki-media-audio"]');
            expect(audio?.dataset.ankiMediaName).toBe('nihongo-front.mp3');
            expect(audio?.classList.contains('jpdb-reader-audio-control')).toBe(true);
            expect(audio?.classList.contains('jpdb-reader-anki-primary-sound')).toBe(true);
            expect(audio?.classList.contains('jpdb-reader-icon-btn')).toBe(true);
            expect(audio?.classList.contains('jpdb-reader-icon-mini')).toBe(false);
            expect(audio?.parentElement).toBe(front);
            expect(front.firstElementChild).toBe(audio);
            expect(audio?.getAttribute('aria-label')).toBe('Anki audio nihongo-front.mp3');
            expect(audio?.querySelector('svg')).not.toBeNull();
            expect(root.querySelector('[data-newtab-reading]')?.textContent).toBe('');
            expect(root.querySelector('[data-newtab-meaning]')?.textContent).toBe('');

            (controller as unknown as { state: { revealAnswer: boolean } }).state.revealAnswer = true;
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            const revealed = root.querySelector<HTMLElement>('[data-newtab-prompt]')!;
            expect(revealed.querySelectorAll('.jpdb-reader-anki-rendered-side-body')).toHaveLength(2);
            expect(revealed.textContent).toContain('日本語');
            expect(revealed.textContent).toContain('Japanese language');
            expect(revealed.textContent).not.toContain('Reverse card should stay hidden');
            expect(revealed.querySelector('script')).toBeNull();
            expect(root.querySelector('[data-newtab-reading]')?.textContent).toBe('');
            expect(root.querySelector('[data-newtab-meaning]')?.textContent).toBe('');
        } finally {
            root.remove();
        }
    });

    it('routes Anki rendered-card [sound:] audio controls through the newtab card action handler', () => {
        const card = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            sentence: '日本語を読みます。',
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 404,
            ankiDeckNames: ['Core'],
            ankiRenderedCards: [{
                cardId: 404,
                deckName: 'Core',
                question: '<div>日本語 [sound:rendered-front.mp3]</div>',
                answer: '<div>Japanese language</div>',
            }],
        });
        const performCardAction = vi.fn();
        const playWordAudio = vi.fn();
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }, {
            performCardAction,
            playWordAudio,
        });
        const root = renderNewTabWordFront(controller, card);

        try {
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
            const audio = root.querySelector<HTMLButtonElement>('[data-action="anki-media-audio"]')!;
            const clickTarget = audio.querySelector('svg') ?? audio;
            const clickWasNotCanceled = clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(clickWasNotCanceled).toBe(false);
            expect(audio.dataset.ankiMediaName).toBe('rendered-front.mp3');
            expect(audio.classList.contains('jpdb-reader-icon-btn')).toBe(true);
            expect(audio.classList.contains('jpdb-reader-icon-mini')).toBe(false);
            expect(performCardAction).toHaveBeenCalledOnce();
            expect(performCardAction).toHaveBeenCalledWith(audio, card, card.sentence, audio);
            expect(playWordAudio).not.toHaveBeenCalled();
        } finally {
            root.remove();
        }
    });

    it('enriches new-tab word pitch from local dictionary metadata without a JPDB API key', async () => {
        const card = newTabTestCard({ spelling: '計量', reading: 'けいりょう', source: 'local', pitchAccent: [] });
        const lookupTermMeta = vi.fn(async () => [{
            dictionary: 'Jitendex',
            expression: '計量',
            mode: 'pitch',
            data: { reading: 'けいりょう', position: 0 },
        }]);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false, showPitchAccent: true }, {
            dictionaries: { lookupTermMeta } as never,
            jpdbPublicPitch: { lookup: vi.fn(async () => { throw new Error('public pitch should not be needed'); }) },
        });
        const root = renderNewTabWordFront(controller, card);
        const word = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-word')!;

        try {
            expect(word.classList.contains('jpdb-pitch-unknown')).toBe(true);
            await waitForExpect(() => {
                expect(card.pitchAccent).toEqual(['LHHHH']);
            });
            expect(word.classList.contains('jpdb-pitch-heiban')).toBe(false);
            expect(word.dataset.pitchClass).toBeUndefined();
            expectRevealedPromptPitch(controller, card, 'heiban');
            expect(lookupTermMeta).toHaveBeenCalledWith('計量', 12, expect.any(Array));
        } finally {
            root.remove();
        }
    });

    it('does not let slow local metadata block new-tab public pitch fallback', async () => {
        const card = newTabTestCard({ spelling: '読む', reading: 'よむ', source: 'jpdb', pitchAccent: [] });
        const localMeta = deferred<never[]>();
        const lookupTermMeta = vi.fn(() => localMeta.promise);
        const publicPitch = vi.fn(async () => ['HLL']);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', immersionKitEnabled: false, showPitchAccent: true }, {
            dictionaries: { lookupTermMeta } as never,
            jpdbPublicPitch: { lookup: publicPitch },
        });
        const root = renderNewTabWordFront(controller, card);
        const word = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-word')!;

        try {
            expect(word.classList.contains('jpdb-pitch-unknown')).toBe(true);
            await waitForExpect(() => {
                expect(publicPitch).toHaveBeenCalledWith('読む', 'よむ');
                expect(card.pitchAccent).toEqual(['HLL']);
            });
            expect(word.classList.contains('jpdb-pitch-atamadaka')).toBe(false);
            expect(word.dataset.pitchClass).toBeUndefined();
            expectRevealedPromptPitch(controller, card, 'atamadaka');
        } finally {
            localMeta.resolve([]);
            root.remove();
        }
    });

    it('preloads keyless public JPDB pitch on new-tab cards (the source needs no key)', async () => {
        const card = newTabTestCard({ spelling: '読む', reading: 'よむ', source: 'jpdb', pitchAccent: [] });
        const localMeta = deferred<never[]>();
        const lookupTermMeta = vi.fn(() => localMeta.promise);
        const publicPitch = vi.fn(async () => ['HLL']);
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            immersionKitEnabled: false,
            showPitchAccent: true,
        }, {
            dictionaries: { lookupTermMeta } as never,
            jpdbPublicPitch: { lookup: publicPitch },
        });
        const root = renderNewTabWordFront(controller, card);
        const word = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-word')!;

        try {
            expect(word.classList.contains('jpdb-pitch-unknown')).toBe(true);
            await waitForExpect(() => {
                expect(publicPitch).toHaveBeenCalledWith('読む', 'よむ');
                expect(card.pitchAccent).toEqual(['HLL']);
            });
            expect(word.classList.contains('jpdb-pitch-atamadaka')).toBe(false);
            expect(word.dataset.pitchClass).toBeUndefined();
            expectRevealedPromptPitch(controller, card, 'atamadaka');
        } finally {
            localMeta.resolve([]);
            root.remove();
        }
    });

    it('prefetches lookahead word pitch before the next card is shown', async () => {
        const first = newTabTestCard({ vid: 1, sid: 1, spelling: '軽い', reading: 'かるい', pitchAccent: [] });
        const second = newTabTestCard({ vid: 2, sid: 2, spelling: '椅子', reading: 'いす', pitchAccent: [] });
        const publicPitch = vi.fn(async () => ['LHH']);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', immersionKitEnabled: false, showPitchAccent: true }, {
            jpdbPublicPitch: { lookup: publicPitch },
        });
        const root = renderSeededNewTabWord(controller, first, {
            visibleWords: [first, second],
            state: { sort: 'frequency' },
            appendToDocument: true,
        });

        try {
            await waitForExpect(() => {
                expect(publicPitch).toHaveBeenCalledWith('軽い', 'かるい');
                expect(publicPitch).toHaveBeenCalledWith('椅子', 'いす');
            });
            expect(second.pitchAccent).toEqual(['LHH']);
        } finally {
            root.remove();
        }
    });

    it('preloads current study word audio as soon as the word front renders', () => {
        const card = newTabTestCard({ spelling: '月光', reading: 'げっこう' });
        const preloadWordAudio = vi.fn();
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            preloadWordAudio,
        });
        const root = renderNewTabWordFront(controller, card);

        try {
            expect(preloadWordAudio).toHaveBeenCalledWith(card);
        } finally {
            root.remove();
        }
    });

    it('keeps pitch tools hidden before reveal, then renders compact reveal tools with inline audio', async () => {
        const card = newTabTestCard({
            spelling: '返す',
            reading: 'かえす',
            wordWithReading: '返[かえ]す',
            pitchAccent: ['HLL'],
            frequencyRank: 777,
            meanings: [{ glosses: ['to return'], partOfSpeech: [] }],
        });
        const loadCardRenderData = vi.fn(async () => ({
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [{ expression: '返す', mode: 'freq', data: 123, dictionary: 'Freq Local' }],
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            jitenVocabularyInfo: null,
        } as never));
        const renderStudyWordPills = vi.fn(() => '<div class="jpdb-reader-word-pills"><span>Freq Local 123</span></div>');
        const renderStudyDefinitionSources = vi.fn(() => '<details class="jpdb-reader-local jpdb-reader-source-card" open><summary>Jiten</summary><p>duplicate lookup card</p></details>');
        const playWordAudio = vi.fn();
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            audioEnabled: true,
            furiganaMode: 'off',
            immersionKitEnabled: false,
            showFurigana: false,
            showPitchAccent: true,
        }, {
            loadCardRenderData,
            renderStudyWordPills,
            renderStudyDefinitionSources,
            playWordAudio,
        });
        const frontRoot = renderSeededNewTabWord(controller, card, {
            bindRootEvents: true,
        });

        try {
            const frontTerm = frontRoot.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-newtab-term .jpdb-reader-word')!;
            const frontTools = frontRoot.querySelector<HTMLElement>('[data-newtab-study-tools]')!;
            expect(frontTerm.querySelector('ruby')).not.toBeNull();
            expect(frontTerm.querySelector('rt')?.textContent).toBe('かえ');
            expect(frontTools.textContent?.trim()).toBe('');
            expect(frontTools.querySelector('.jpdb-reader-pitch')).toBeNull();
            await waitForExpect(() => {
                expect(loadCardRenderData).toHaveBeenCalledWith(card);
                expect(frontRoot.querySelector('[data-newtab-study-tools] .jpdb-reader-pitch')).toBeNull();
                expect(frontRoot.querySelector('[data-newtab-study-tools] .jpdb-reader-reading')).toBeNull();
            });
        } finally {
            frontRoot.remove();
        }
        vi.clearAllMocks();

        const root = renderSeededNewTabWord(controller, card, {
            state: { revealAnswer: true },
            bindRootEvents: true,
        });

        try {
            const term = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-newtab-term .jpdb-reader-word')!;
            const tools = root.querySelector<HTMLElement>('[data-newtab-study-tools]')!;
            expect(root.querySelector('[data-newtab-answer-header]')).toBeNull();
            expect(term.querySelector('ruby')?.textContent).toContain('かえ');
            expect(tools.textContent).not.toContain('#777');
            expect(tools.querySelector('.jpdb-reader-frequency-pill')).toBeNull();
            expect(tools.querySelector('.jpdb-reader-pitch svg')).not.toBeNull();
            await waitForExpect(() => {
                expect(loadCardRenderData).toHaveBeenCalledWith(card);
                expect(renderStudyDefinitionSources).toHaveBeenCalledWith(card, expect.any(Object), card.sentence || card.spelling);
                // Source pills are intentionally NOT rendered on the card front now
                // (they live in the lookup/detail view), so the pill renderer is
                // never invoked for the front and no pill markup appears.
                expect(renderStudyWordPills).not.toHaveBeenCalled();
                expect(root.querySelector('[data-newtab-prompt] .jpdb-reader-word-pills')).toBeNull();
                expect(root.querySelector('[data-newtab-prompt] .jpdb-reader-source-card')).toBeNull();
                expect(root.querySelector('[data-newtab-study-tools] .jpdb-reader-pitch svg')).not.toBeNull();
                expect(root.querySelector('[data-newtab-meaning] [data-newtab-reveal-dictionaries] .jpdb-reader-source-card')?.textContent).toContain('duplicate lookup card');
            });

            // Audio sits inline next to the headword (term row), not in the meta row.
            const speaker = root.querySelector<HTMLButtonElement>('.jpdb-reader-newtab-term-row [data-action="study-word-audio"]');
            speaker?.click();
            speaker?.click();
            expect(playWordAudio).toHaveBeenCalledTimes(2);
            expect(playWordAudio).toHaveBeenNthCalledWith(1, card);
            expect(playWordAudio).toHaveBeenNthCalledWith(2, card);
        } finally {
            root.remove();
        }
    });

    it('hydrates installed dictionary definitions when the first render is the no-definition placeholder', async () => {
        const card = newTabTestCard({ spelling: '余白', reading: 'よはく', meanings: [] });
        const richer = newTabTestCard({ spelling: '余白', reading: 'よはく', meanings: [{ glosses: ['margin'], partOfSpeech: [] }] });
        const emptyData = {
            localEntries: [], kanjiEntries: [], metaEntries: [], ankiLookup: null,
            jpdbDecks: [], ankiDecks: [], jpdbVocabularyInfo: null, jitenVocabularyInfo: null,
        };
        const richData = {
            ...emptyData,
            localEntries: [{ expression: '余白', reading: 'よはく', glossary: ['margin; blank space'], dictionary: 'Installed Jitendex' }],
        };
        const loadCardRenderData = vi.fn(async (candidate: JPDBCard) => (candidate === richer ? richData : emptyData) as never);
        const lookupStudyCard = vi.fn(async () => richer);
        const renderStudyDefinitionSources = vi.fn((_candidate, data: { localEntries: unknown[] }) => data.localEntries.length
            ? '<details class="jpdb-reader-source-card" open><summary>Installed Jitendex</summary><p>margin; blank space</p></details>'
            : '<div class="jpdb-reader-help jpdb-reader-no-definitions">No definition found</div>');
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }, {
            loadCardRenderData,
            lookupStudyCard,
            renderStudyDefinitionSources,
        });
        const root = renderSeededNewTabWord(controller, card, { state: { revealAnswer: true }, appendToDocument: true });

        try {
            await waitForExpect(() => {
                expect(lookupStudyCard).toHaveBeenCalledWith('余白', 'よはく');
                expect(root.querySelector('[data-newtab-reveal-dictionaries]')?.textContent).toContain('Installed Jitendex');
                expect(root.querySelector('[data-newtab-reveal-dictionaries]')?.textContent).not.toContain('No definition found');
            });
        } finally {
            root.remove();
        }
    });

    it('recovers revealed furigana and pitch from local dictionaries when the card reading is not kana', async () => {
        const card = newTabTestCard({
            spelling: '映画',
            reading: '映画',
            source: 'local',
            pitchAccent: [],
        });
        const lookupTermMeta = vi.fn(async () => [{
            dictionary: 'Jitendex',
            expression: '映画',
            mode: 'pitch',
            data: { reading: 'えいが', position: 1 },
        }]);
        const loadCardRenderData = vi.fn(async () => ({
            localEntries: [{ expression: '映画', reading: 'えいが', glossary: [], dictionary: 'Jitendex' }],
            kanjiEntries: [],
            metaEntries: [{ dictionary: 'Jitendex', expression: '映画', mode: 'pitch', data: { reading: 'えいが', position: 1 } }],
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            jitenVocabularyInfo: null,
            componentPitches: [],
        } as never));
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            immersionKitEnabled: false,
            localDictionariesEnabled: true,
            showPitchAccent: true,
        }, {
            dictionaries: { lookupTermMeta } as never,
            loadCardRenderData,
        });
        const root = renderSeededNewTabWord(controller, card, {
            state: { revealAnswer: true },
            appendToDocument: true,
        });

        try {
            const word = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-newtab-term .jpdb-reader-word')!;
            expect(word.querySelector('rt')).toBeNull();
            await waitForExpect(() => {
                const updated = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-newtab-term .jpdb-reader-word')!;
                expect(updated.dataset.reading).toBe('えいが');
                expect(updated.querySelector('rt')?.textContent).toBe('えいが');
                expect(root.querySelector('[data-newtab-study-tools] .jpdb-reader-pitch svg')).not.toBeNull();
            });
        } finally {
            root.remove();
        }
    });

    it('does not expose stale JPDB supplemental slugs as new-tab readings', async () => {
        const publicPitch = vi.fn(async () => ['LHHH']);
        const card = newTabTestCard({ spelling: '日本語', reading: 'used-in', source: 'jpdb', pitchAccent: [] });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', immersionKitEnabled: false, showPitchAccent: true }, {
            jpdbPublicPitch: { lookup: publicPitch },
        });

        const root = renderNewTabWordFront(controller, card);
        const word = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-word')!;

        expect(word.dataset.reading).toBe('日本語');
        await waitForExpect(() => {
            expect(publicPitch).toHaveBeenCalledWith('日本語', '日本語');
        });
    });

    it('parses the front sentence with the same content parser used by other card text', async () => {
        const sentence = 'お母ちゃん中学生？';
        const card = newTabTestCard({
            vid: 88,
            sid: 44,
            spelling: '中学生',
            reading: 'ちゅうがくせい',
            sentence,
            cardState: ['due'],
            pitchAccent: ['LH'],
        });
        const parseContent = vi.fn(async (sentenceNode: HTMLElement) => {
            sentenceNode.innerHTML = 'お母ちゃん<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-unknown" data-vid="-1" data-sid="-1" data-sentence="お母ちゃん中学生？" tabindex="-1">中学生</span>？';
        });
        const controller = newTabPromptController(DEFAULT_SETTINGS, { parseContent });
        const root = renderSeededNewTabWord(controller, card, {
            state: { sort: 'frequency' },
            appendToDocument: true,
        });

        try {
            await waitForExpect(() => {
                expect(parseContent).toHaveBeenCalledWith(
                    root.querySelector('[data-newtab-prompt] [data-newtab-sentence-render]'),
                    expect.objectContaining({ jpdbTimeoutMs: 1_200 }),
                );
                expect(root.querySelector('[data-newtab-study-tools]')).not.toBeNull();
                const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-sentence .jpdb-reader-word');
                expect(word?.textContent).toBe('中学生');
                expect(word?.classList.contains('jpdb-reader-example-target')).toBe(true);
                expect(word?.classList.contains('jpdb-due')).toBe(true);
                expect(word?.classList.contains('jpdb-not-in-deck')).toBe(false);
                expect(word?.classList.contains('jpdb-pitch-heiban')).toBe(false);
                expect(word?.classList.contains('jpdb-pitch-unknown')).toBe(true);
                expect(word?.dataset.pitchClass).toBeUndefined();
                expect(word?.dataset.vid).toBe('88');
                expect(word?.dataset.sid).toBe('44');
            });
        } finally {
            root.remove();
        }
    });

    it('opens lookups from parsed front sentence words', async () => {
        const sentence = 'お連れ様との会話は日本語でした。';
        const current = newTabTestCard({ spelling: '日本語', reading: 'にほんご', sentence });
        const related = newTabTestCard({ vid: 1198880, sid: 0, spelling: '会話', reading: 'かいわ', sentence });
        const showLookupCard = vi.fn();
        const lookupText = vi.fn();
        const parseContent = vi.fn((sentenceNode: HTMLElement) => {
            sentenceNode.innerHTML = 'お連れ様との<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-heiban" data-vid="1198880" data-sid="0" data-pitch-class="heiban" data-sentence="お連れ様との会話は日本語でした。" data-expression="会話" data-reading="かいわ" tabindex="-1">会話</span>は日本語でした。';
        });
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            parseContent,
            parser: {
                getCachedCard: vi.fn((vid: number, sid: number) => vid === related.vid && sid === related.sid ? related : undefined),
            } as never,
            showLookupCard,
            lookupText,
        });
        const root = renderNewTabWordFront(controller, current);

        try {
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-newtab-sentence .jpdb-reader-word')).not.toBeNull();
            });
            const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-sentence .jpdb-reader-word')!;
            const clickWasNotCanceled = word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(clickWasNotCanceled).toBe(false);
            expect(showLookupCard).toHaveBeenCalledWith(related, sentence, word, expect.objectContaining({
                navigation: 'push-current',
                reuseActivePopover: true,
                userGesture: true,
            }));
            expect(lookupText).not.toHaveBeenCalled();
        } finally {
            root.remove();
        }
    });

    it('uses parsed front sentence word geometry before the prompt fallback', async () => {
        const sentence = 'メイは座って食べなさいと言った。';
        const current = newTabTestCard({ spelling: '食べる', reading: 'たべる', sentence });
        const related = newTabTestCard({ vid: 1291770, sid: 0, spelling: '座', reading: 'ざ', sentence });
        const showLookupCard = vi.fn();
        const lookupText = vi.fn();
        const parseContent = vi.fn((sentenceNode: HTMLElement) => {
            sentenceNode.innerHTML = '<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-atamadaka" data-vid="2188120" data-sid="0" data-pitch-class="atamadaka" data-sentence="メイは座って食べなさいと言った。" tabindex="-1" data-expression="メイ" data-reading="メイ">メイ</span>は<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-unknown" data-vid="1291770" data-sid="0" data-pitch-class="unknown" data-sentence="メイは座って食べなさいと言った。" tabindex="-1" data-expression="座" data-reading="ざ">座</span>って食べなさいと言った。';
        });
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            parseContent,
            parser: {
                getCachedCard: vi.fn((vid: number, sid: number) => vid === related.vid && sid === related.sid ? related : undefined),
            } as never,
            showLookupCard,
            lookupText,
        });
        const root = renderNewTabWordFront(controller, current);

        try {
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
            const prompt = root.querySelector<HTMLElement>('[data-newtab-prompt]')!;
            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-newtab-sentence .jpdb-reader-word[data-expression="座"]')).not.toBeNull();
            });
            const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-sentence .jpdb-reader-word[data-expression="座"]')!;
            stubClientRects(word, { left: 40, top: 20, right: 62, bottom: 52, width: 22, height: 32 });
            const clickWasNotCanceled = prompt.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: 50,
                clientY: 32,
            }));

            expect(clickWasNotCanceled).toBe(false);
            expect(showLookupCard).toHaveBeenCalledWith(related, sentence, word, expect.objectContaining({
                navigation: 'push-current',
                reuseActivePopover: true,
                userGesture: true,
            }));
            expect(lookupText).not.toHaveBeenCalledWith('食べる', 'たべる', prompt);
        } finally {
            root.remove();
        }
    });

    it('uses parsed front sentence word data when a card is not cached yet', async () => {
        const sentence = 'メイは座って食べなさいと言った。';
        const current = newTabTestCard({ spelling: '食べる', reading: 'たべる', sentence });
        const showLookupCard = vi.fn();
        const lookupText = vi.fn();
        const parseContent = vi.fn((sentenceNode: HTMLElement) => {
            sentenceNode.innerHTML = '<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-atamadaka" data-vid="2188120" data-sid="0" data-pitch-class="atamadaka" data-sentence="メイは座って食べなさいと言った。" tabindex="-1" data-expression="メイ" data-reading="メイ">メイ</span>は座って食べなさいと言った。';
        });
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            parseContent,
            parser: { getCachedCard: vi.fn(() => undefined) } as never,
            showLookupCard,
            lookupText,
        });
        const root = renderNewTabWordFront(controller, current);

        try {
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-newtab-sentence .jpdb-reader-word[data-expression="メイ"]')).not.toBeNull();
            });
            const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-sentence .jpdb-reader-word[data-expression="メイ"]')!;
            const clickWasNotCanceled = word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(clickWasNotCanceled).toBe(false);
            expect(lookupText).toHaveBeenCalledWith('メイ', 'メイ', word, expect.objectContaining({
                navigation: 'push-current',
                reuseActivePopover: true,
                userGesture: true,
            }));
            expect(lookupText).not.toHaveBeenCalledWith('食べる', 'たべる', expect.any(HTMLElement));
            expect(showLookupCard).not.toHaveBeenCalled();
        } finally {
            root.remove();
        }
    });

    it('omits front sentences when the new-tab sentence toggle is off', () => {
        const card = newTabTestCard({ spelling: '難波', reading: 'なにわ', sentence: '難波金満高校や', source: 'anki' });
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            immersionKitEnabled: false,
            newTabFrontSentenceEnabled: false,
        });

        const root = renderNewTabWordFront(controller, card);
        const prompt = root.querySelector<HTMLElement>('[data-newtab-prompt]');

        expect(prompt?.querySelector<HTMLElement>('.jpdb-reader-newtab-term .jpdb-reader-word')?.dataset.expression).toBe('難波');
        expect(prompt?.querySelector('.jpdb-reader-newtab-sentence')).toBeNull();
        expect(prompt?.textContent).toContain('難波');
    });

    it('does not duplicate the pending Immersion Kit example in the word prompt', async () => {
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const search = vi.fn(async (): Promise<ImmersionKitExample[]> => [{
            id: 'ik-front',
            sentence: 'お母ちゃん中学生？',
            sentenceWithFurigana: '',
            translation: 'Are you a middle schooler, kid?',
            sourceTitle: 'Mahou Shoujo Madoka Magica',
            titleSlug: 'mahou-shoujo-madoka-magica',
            category: 'anime',
            soundFile: '',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        }]);
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            immersionKit: {
                search,
                mediaUrls: vi.fn(() => []),
            } as never,
        });
        void (controller as unknown as { loadImmersionExamples(card: JPDBCard): Promise<ImmersionKitExample[]> }).loadImmersionExamples(card);
        const root = renderNewTabWordFront(controller, card);
        document.body.append(root);

        try {
            expect(root.querySelector('.jpdb-reader-newtab-sentence')).toBeNull();
            expect(search).toHaveBeenCalledWith(
                '中学生',
                expect.objectContaining({ immersionKitEnabled: true }),
                expect.objectContaining({ requestLimit: 10, resultLimit: DEFAULT_SETTINGS.immersionKitLimit }),
            );
        } finally {
            root.remove();
        }
    });

    it('prefetches current new-tab Immersion Kit examples before reveal without mirroring them in the prompt', async () => {
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const search = vi.fn(async (_query: string): Promise<ImmersionKitExample[]> => [{
            ...newTabImmersionExample('中学生'),
            sentence: 'お母ちゃん中学生？',
        }]);
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            immersionKit: {
                search,
                mediaUrls: vi.fn(() => []),
            } as never,
        });
        const root = renderNewTabWordFront(controller, card);
        document.body.append(root);

        try {
            await waitForExpect(() => {
                expect(search.mock.calls.map(([query]) => query).filter(query => query === '中学生')).toHaveLength(1);
            });
            expect(root.querySelector('.jpdb-reader-newtab-sentence')).toBeNull();
        } finally {
            root.remove();
        }
    });

    it('does not mirror pending Immersion Kit examples into the prompt or replace the term word', async () => {
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const examples = deferred<ImmersionKitExample[]>();
        const parseContent = vi.fn(async () => undefined);
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            parseContent,
            immersionKit: {
                search: vi.fn(() => examples.promise),
                mediaUrls: vi.fn(() => []),
            } as never,
        });
        void (controller as unknown as { loadImmersionExamples(card: JPDBCard): Promise<ImmersionKitExample[]> }).loadImmersionExamples(card);
        const root = renderNewTabWordFront(controller, card);
        document.body.append(root);
        const term = root.querySelector<HTMLElement>('.jpdb-reader-newtab-term .jpdb-reader-word')!;
        term.dataset.stabilityMarker = 'keep-me';

        try {
            examples.resolve([{
                ...newTabImmersionExample('中学生'),
                sentence: 'お母ちゃん中学生？',
            }]);

            await expect(examples.promise).resolves.toHaveLength(1);

            expect(root.querySelector('.jpdb-reader-newtab-term .jpdb-reader-word')).toBe(term);
            expect(term.dataset.stabilityMarker).toBe('keep-me');
            expect(term.dataset.sentence).toBe('中学生');
            expect(root.querySelector('.jpdb-reader-newtab-sentence')).toBeNull();
            expect(parseContent).not.toHaveBeenCalled();
        } finally {
            root.remove();
        }
    });

    it('prefetches current and next new-tab Immersion Kit examples before reveal', async () => {
        const first = newTabTestCard({ spelling: '一番', reading: 'いちばん' });
        const second = newTabTestCard({ spelling: '二番', reading: 'にばん' });
        const search = vi.fn(async (query: string): Promise<ImmersionKitExample[]> => [newTabImmersionExample(query)]);
        const fetchBlobUrl = vi.fn(async () => 'blob:http://localhost/media');
        const parse = vi.fn(async (_paragraphs: string[], _options?: unknown) => [[]]);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitShowImages: true }, {
            immersionKit: {
                search,
                mediaUrls: vi.fn((example: ImmersionKitExample, kind: 'image' | 'sound') => (
                    kind === 'image' ? [`https://media.test/${example.id}.jpg`] : [`https://media.test/${example.id}.mp3`]
                )),
                fetchBlobUrl,
            } as never,
            parser: {
                canParse: () => true,
                parse,
            } as never,
        });
        const root = renderSeededNewTabWord(controller, first, {
            visibleWords: [first, second],
            state: { sort: 'frequency' },
            appendToDocument: true,
        });

        try {
            await waitForExpect(() => {
                expect(search.mock.calls.map(([query]) => query)).toEqual(expect.arrayContaining(['一番', '二番']));
            });
            expect(root.querySelector('.jpdb-reader-newtab-immersion')).toBeNull();
            expect(fetchBlobUrl).toHaveBeenCalled();
            expect(parse).toHaveBeenCalledWith(['一番を見た。'], { includeLocalPitch: true, requireApi: true, requireJpdb: true, allowSegmentedFallback: true });
            expect(parse).toHaveBeenCalledWith(['二番を見た。'], { includeLocalPitch: true, requireApi: true, requireJpdb: true, allowSegmentedFallback: true });
        } finally {
            root.remove();
        }
    });

    it('does not let stale new-tab Immersion Kit prefetches fetch media or parse after navigation', async () => {
        const first = newTabTestCard({ spelling: '一番', reading: 'いちばん' });
        const second = newTabTestCard({ spelling: '二番', reading: 'にばん' });
        const third = newTabTestCard({ spelling: '三番', reading: 'さんばん' });
        const firstExamples = deferred<ImmersionKitExample[]>();
        const secondExamples = deferred<ImmersionKitExample[]>();
        const thirdExamples = deferred<ImmersionKitExample[]>();
        const search = vi.fn((query: string): Promise<ImmersionKitExample[]> => (
            query === '一番' ? firstExamples.promise : query === '二番' ? secondExamples.promise : thirdExamples.promise
        ));
        const fetchBlobUrl = vi.fn(async (urls: string | string[]) => `blob:http://localhost/${Array.isArray(urls) ? urls[0] : urls}`);
        const parse = vi.fn(async (_paragraphs: string[], _options?: unknown) => [[]]);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitShowImages: true }, {
            immersionKit: {
                search,
                mediaUrls: vi.fn((example: ImmersionKitExample, kind: 'image' | 'sound') => (
                    kind === 'image' ? [`https://media.test/${example.id}.jpg`] : [`https://media.test/${example.id}.mp3`]
                )),
                fetchBlobUrl,
            } as never,
            parser: {
                canParse: () => true,
                parse,
            } as never,
        });
        const root = renderSeededNewTabWord(controller, first, {
            visibleWords: [first, second, third],
            state: { sort: 'frequency' },
            appendToDocument: true,
        });

        try {
            await waitForExpect(() => expect(search.mock.calls.map(([query]) => query)).toContain('一番'));

            (controller as unknown as { index: number }).index = 1;
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, second);
            await waitForExpect(() => expect(search.mock.calls.map(([query]) => query)).toContain('二番'));

            firstExamples.resolve([newTabImmersionExample('一番')]);
            await new Promise(resolve => setTimeout(resolve, 20));

            expect(fetchBlobUrl.mock.calls.flatMap(([urls]) => Array.isArray(urls) ? urls : [urls]).join('\n')).not.toContain('ik-一番');
            expect(parse.mock.calls.map(call => call[0])).not.toContainEqual(['一番を見た。']);

            secondExamples.resolve([newTabImmersionExample('二番')]);
            await waitForExpect(() => {
                expect(fetchBlobUrl.mock.calls.flatMap(([urls]) => Array.isArray(urls) ? urls : [urls]).join('\n')).toContain('ik-二番');
                expect(parse).toHaveBeenCalledWith(['二番を見た。'], { includeLocalPitch: true, requireApi: true, requireJpdb: true, allowSegmentedFallback: true });
            });
        } finally {
            root.remove();
        }
    });

    it('tries cheap new-tab Immersion Kit fallbacks before parser fallback work', async () => {
        const card = newTabTestCard({ spelling: '食べ物', reading: 'たべもの' });
        const search = vi.fn(async (query: string): Promise<ImmersionKitExample[]> => (
            query === 'たべもの' ? [newTabImmersionExample(query)] : []
        ));
        const parse = vi.fn(async () => {
            throw new Error('parser fallback should not run before cheap fallback hits');
        });
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            immersionKit: {
                search,
                mediaUrls: vi.fn(() => []),
            } as never,
            parser: {
                canParse: () => true,
                parse,
            } as never,
        });

        await expect((controller as unknown as {
            loadImmersionExamples(card: JPDBCard): Promise<ImmersionKitExample[]>;
        }).loadImmersionExamples(card)).resolves.toHaveLength(1);

        expect(search.mock.calls.map(([query]) => query)).toEqual(['食べ物', 'たべもの']);
        expect(parse).not.toHaveBeenCalled();
    });

    it('falls back to a JPDB example sentence on the front when Immersion Kit is off', async () => {
        const card = newTabTestCard({ vid: 120, spelling: '辞書', reading: 'じしょ' });
        const lookup = vi.fn(async () => ({
            meanings: [],
            compounds: [],
            examples: [{ sentence: '辞書を引く。', translation: '' }],
        }));
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', immersionKitEnabled: false }, {
            jpdbVocabulary: { lookup },
        });
        const root = renderNewTabWordFront(controller, card);
        document.body.append(root);

        try {
            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-newtab-sentence')?.textContent).toBe('辞書を引く。');
            });
            expect(lookup).toHaveBeenCalledWith(120, '辞書', 'じしょ');
        } finally {
            root.remove();
        }
    });

    it('opens lookup from a word prompt tap even when the tap lands on prompt whitespace', () => {
        const lookupText = vi.fn();
        const card = newTabTestCard({ vid: 10, sid: 10, spelling: '月光', reading: 'げっこう', sentence: '月光を見る。' });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }, {
            lookupText,
        });
        const root = renderNewTabWordFront(controller, card);
        (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderWord(root: HTMLElement, card: JPDBCard): void }).bindRootEvents(root);

        root.querySelector<HTMLElement>('[data-newtab-prompt]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(lookupText).toHaveBeenCalledWith('月光', 'げっこう', root.querySelector('[data-newtab-prompt]'), expect.objectContaining({
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        }));
        expect((controller as unknown as { state: { revealAnswer: boolean } }).state.revealAnswer).toBe(false);
    });

    it('dismisses active new-tab lookups from outside page taps without interrupting nested lookups', () => {
        const lookupText = vi.fn();
        const dismissLookup = vi.fn();
        const card = newTabTestCard({ vid: 10, sid: 10, spelling: '月光', reading: 'げっこう', sentence: '月光を見る。' });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }, {
            lookupText,
            dismissLookup,
        });
        const root = renderNewTabWordFront(controller, card);

        try {
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

            root.querySelector<HTMLElement>('[data-newtab-prompt]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            expect(lookupText).toHaveBeenCalledWith('月光', 'げっこう', root.querySelector('[data-newtab-prompt]'), expect.objectContaining({
                navigation: 'push-current',
                reuseActivePopover: true,
            }));
            expect(dismissLookup).not.toHaveBeenCalled();

            root.querySelector<HTMLElement>('[data-newtab-action="next"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(dismissLookup).toHaveBeenCalledTimes(1);
        } finally {
            root.remove();
        }
    });

    it('opens Anki review prompt lookups with the source card identity intact', () => {
        const lookupText = vi.fn();
        const showLookupCard = vi.fn();
        const card = newTabTestCard({
            vid: -9900,
            sid: 0,
            rid: 38800,
            spelling: '難波',
            reading: 'なにわ',
            sentence: '難波を見る。',
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 38800,
            ankiNoteId: 9900,
            ankiDeckNames: ['Mining'],
            ankiModelName: 'Imported',
            cardState: ['due'],
        });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }, {
            lookupText,
            showLookupCard,
        });
        const root = renderNewTabCardFront(controller, card, { source: 'anki', sourceLabel: 'Anki' });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderWord(root: HTMLElement, card: JPDBCard): void }).bindRootEvents(root);

        root.querySelector<HTMLElement>('[data-newtab-prompt]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(showLookupCard).toHaveBeenCalledWith(card, '難波を見る。', root.querySelector('[data-newtab-prompt]'), expect.objectContaining({
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        }));
        expect(lookupText).not.toHaveBeenCalled();
    });

    it('opens JPDB review prompt word lookups with the source card identity intact', () => {
        const lookupText = vi.fn();
        const showLookupCard = vi.fn();
        const card = newTabTestCard({
            vid: 12000,
            sid: 1,
            rid: 8800,
            spelling: '読む',
            reading: 'よむ',
            sentence: '本を読む。',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            jpdbReviewId: 'jpdb-review-8800',
            cardState: ['due'],
        });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', immersionKitEnabled: false }, {
            lookupText,
            showLookupCard,
        });
        const root = renderNewTabCardFront(controller, card, { source: 'jpdb', sourceLabel: 'JPDB' });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
        const word = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-word')!;

        word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(showLookupCard).toHaveBeenCalledWith(card, '本を読む。', word, expect.objectContaining({
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        }));
        expect(lookupText).not.toHaveBeenCalled();
    });

    it('opens Jiten review prompt word lookups with the source card identity intact', () => {
        const lookupText = vi.fn();
        const showLookupCard = vi.fn();
        const card = newTabTestCard({
            vid: 4300,
            sid: 2,
            rid: 9900,
            spelling: '試験',
            reading: 'しけん',
            sentence: '試験を受ける。',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 4300,
            jitenReadingIndex: 2,
            cardState: ['due'],
        });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, jitenApiKey: 'jiten-key', immersionKitEnabled: false }, {
            lookupText,
            showLookupCard,
        });
        const root = renderNewTabCardFront(controller, card, { source: 'jpdb', sourceLabel: 'Jiten' });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
        const word = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-word')!;

        word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(showLookupCard).toHaveBeenCalledWith(card, '試験を受ける。', word, expect.objectContaining({
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        }));
        expect(lookupText).not.toHaveBeenCalled();
    });
});
