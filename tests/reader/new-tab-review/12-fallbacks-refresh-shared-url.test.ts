import { describe, expect, it, vi } from 'vitest';
import {
    registerNewTabReviewCleanup,
    DEFAULT_SETTINGS,
    NEW_TAB_UI_KEY,
    NEW_TAB_CURRENT_WORD_KEY,
    newTabTestCard,
    deferred,
    newTabLocalDictionaryEntries,
    newTabLocalCardFromEntry,
    newTabPromptController,
    renderEnabledNewTabRoot,
    expectOpaqueStudyCardToken,
    newTabBareController,
    newTabLocalDictionarySummary,
    newTabEmptyDictionarySummary,
    newTabTermDictionarySummary,
    newTabLocalFallbackController,
    newTabDictionaryReloadFixture,
    newTabBuiltInFallbackFixture,
    expectBuiltInFallbackWords,
    resetNewTabReviewStorage,
    expectNewTabDictionaryCard,
    newTabPromptText,
    showNextNewTabWord,
    applySeededNewTabWords,
    renderTestKanjiDetails,
    stubKanjiDoodleBrowserApis,
    cardKey,
    APP_NAME,
    NewTabController,
    NEW_TAB_PUBLIC_FALLBACK_GRACE_MS,
    NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS,
    waitForExpect,
} from './fixtures';
import type {
    NewTabRenderedState,
    JPDBCard,
} from './fixtures';
import { DOCS_BASE_URL } from '../../../src/reader/app/constants';
import { studyShellNavRoutes } from '../../../src/reader/app/site-nav';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../../src/reader/languages/target-runtime';

describe('new tab review — dictionary fallbacks, refresh & shared-URL history', () => {
    registerNewTabReviewCleanup();

    it('keeps the extension Study and Stats routes on the extension origin', () => {
        const extensionPage = 'moz-extension://yomu-test/newtab/index.html';
        const links = studyShellNavRoutes(DOCS_BASE_URL, extensionPage);

        for (const label of ['Study', 'Stats']) {
            const link = links.find(candidate => candidate.text === label);
            expect(link, `${label} is missing from the Study menu`).toBeDefined();
            expect(new URL(link!.href, extensionPage).origin).toBe(new URL(extensionPage).origin);
        }
        expect(links.find(link => link.text === 'Study')?.href).toBe('./');
        expect(links.find(link => link.text === 'Stats')?.href).toBe('./?mode=stats');
        expect(links.find(link => link.text === 'Academy')?.href).toBe(`${DOCS_BASE_URL}academy/`);
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
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }));
        const root = renderEnabledNewTabRoot(controller);
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

        const term = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-newtab-term .jpdb-reader-word');
        expect(root.querySelector('[data-newtab-answer-header]')).toBeNull();
        expect(term?.querySelector('ruby')?.textContent).toContain('かえ');
        expect(root.querySelector('.jpdb-reader-newtab-term-row .jpdb-reader-audio-control')).not.toBeNull();
        expect(root.querySelector('[data-newtab-meaning]')?.textContent).toContain('to return');
    });

    it('recovers revealed Study readings from annotated wordWithReading text', async () => {
        const card = newTabTestCard({
            spelling: '前方',
            reading: '',
            meanings: [{ glosses: ['front; ahead'], partOfSpeech: [] }],
            wordWithReading: '前方[ぜんぽう]',
            source: 'jpdb',
        });
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }));
        const root = renderEnabledNewTabRoot(controller);
        Object.assign(controller as unknown as { visibleWords: JPDBCard[]; sourceLabel: string; state: { mode: string; revealAnswer: boolean } }, {
            visibleWords: [card],
            sourceLabel: 'JPDB',
            state: { mode: 'word', revealAnswer: false },
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            expect(root.querySelector('[data-newtab-reading]')?.textContent).toBe('');

            (controller as unknown as { state: { mode: string; revealAnswer: boolean } }).state = { mode: 'word', revealAnswer: true };
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            expect(root.querySelector('[data-newtab-prompt] .jpdb-reader-newtab-term rt')?.textContent).toContain('ぜんぽう');
            expect(root.querySelector('[data-newtab-meaning]')?.textContent).toContain('front; ahead');
        } finally {
            root.remove();
        }
    });

    it('shows the full Jiten word on revealed kanji cards because Jiten grades that word', async () => {
        const card: JPDBCard = {
            vid: 2701,
            sid: 0,
            rid: 1,
            spelling: '図鑑',
            reading: 'ずかん',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [{ glosses: ['picture book; field guide'], partOfSpeech: [] }],
            cardState: ['due'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 2701,
            jitenReadingIndex: 0,
        };
        const playWordAudio = vi.fn();
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false, kanjiImmersionKitEnabled: false }), {
            playWordAudio,
        });
        const root = renderEnabledNewTabRoot(controller);
        const internals = controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            sourceLabel: string;
            state: { mode: string; revealAnswer: boolean };
            bindRootEvents(root: HTMLElement): void;
            studyPool: { kanjiStudyCardFromSourceCard(card: JPDBCard, kanji: string): JPDBCard };
            renderWord(root: HTMLElement, card: JPDBCard): void;
        };
        const kanjiCard = internals.studyPool.kanjiStudyCardFromSourceCard(card, '図');
        Object.assign(internals, {
            allWords: [card],
            visibleWords: [kanjiCard],
            sourceLabel: 'Jiten',
            state: { mode: 'kanji', revealAnswer: true },
        });

        internals.renderWord(root, kanjiCard);
        internals.bindRootEvents(root);

        const backingWord = root.querySelector<HTMLElement>('[data-newtab-kanji-backing-word]');
        expect(backingWord?.textContent).toContain('図鑑');
        expect(backingWord?.textContent).toContain('ずかん');
        expect(backingWord?.textContent).toContain('picture book; field guide');
        expect(backingWord?.querySelector('.jpdb-reader-word')?.textContent).toContain('図鑑');
        expect(backingWord?.querySelector('.jpdb-reader-word rt')?.textContent).toContain('ずかん');
        const speaker = backingWord?.querySelector<HTMLButtonElement>('[data-action="study-word-audio"]');
        expect(speaker).toBeTruthy();
        speaker?.click();
        expect(playWordAudio).toHaveBeenCalledWith(card);
        expect(playWordAudio).not.toHaveBeenCalledWith(kanjiCard);
    });

    it('does not recheck an empty dictionary source on a later new-tab render', async () => {
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
        expect(newTabPromptText()).toBe(APP_NAME);
        expect(document.querySelector('[data-newtab-answer]')?.textContent).toBe('No cards.');
        expect(document.querySelector('[data-newtab-action="empty-fallback"]')?.textContent).toBe('Starter words');
        expect(document.querySelector('[data-newtab-action="settings"]')?.textContent).toContain('Connections & settings');
        expect(document.querySelector('[data-newtab-action="mode"][data-mode="search"]')?.textContent).toBe('Library');
        document.body.replaceChildren();
    });

    it('shows a Study app install affordance and uses the browser install prompt when available', async () => {
        document.body.replaceChildren();
        const toast = vi.fn();
        const prompt = vi.fn(async () => undefined);
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            newTabEnabled: true,
            newTabSource: 'dictionary',
            immersionKitEnabled: false,
        }, {
            toast,
            dictionaries: { summary: vi.fn(async () => newTabEmptyDictionarySummary()) } as never,
        });

        await controller.renderPage();
        const menu = document.querySelector<HTMLElement>('.jpdb-reader-newtab-more-menu')!;
        expect(menu).not.toBeNull();
        const button = document.querySelector<HTMLButtonElement>('[data-newtab-install-app]')!;
        expect(button).not.toBeNull();
        expect(button.closest('.jpdb-reader-newtab-more-menu')).toBe(menu);
        expect(document.querySelector('[data-newtab-install]')).toBeNull();
        expect(button.disabled).toBe(false);
        expect(button.dataset.installPromptAvailable).toBe('false');
        expect(button.querySelector('.jpdb-reader-newtab-menu-description')?.textContent).toContain('browser install button');

        const event = new Event('beforeinstallprompt') as Event & {
            prompt: () => Promise<void>;
            userChoice: Promise<{ outcome: string }>;
        };
        event.prompt = prompt;
        event.userChoice = Promise.resolve({ outcome: 'accepted' });
        window.dispatchEvent(event);

        expect(button.dataset.installPromptAvailable).toBe('true');
        expect(button.querySelector('.jpdb-reader-newtab-menu-description')?.textContent).toBe('Install the Study app on this device.');
        button.click();
        await waitForExpect(() => expect(prompt).toHaveBeenCalledTimes(1));
        await waitForExpect(() => expect(toast).toHaveBeenCalledWith('Study app installed.'));

        document.body.replaceChildren();
    });

    it('loads dictionary cards after dictionary settings change', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            newTabEnabled: true,
            newTabSource: 'dictionary' as const,
            immersionKitEnabled: false,
        };
        const summary = vi.fn(async () => settings.dictionaryPreferences.length
            ? {
                ...newTabTermDictionarySummary('Tiny Alias'),
            }
            : {
                ...newTabEmptyDictionarySummary(),
            });
        const { controller, listRandomTopTerms } = newTabDictionaryReloadFixture({ settings, summary });

        await controller.renderPage();
        expect(newTabPromptText()).toBe(APP_NAME);
        expect(document.querySelector('[data-newtab-answer]')?.textContent).toBe('No cards.');

        settings.dictionaryPreferences = [{ name: 'Local', alias: 'Tiny Alias', enabled: true, priority: 0, type: 'terms' }];
        await controller.renderPage();

        expect(summary).toHaveBeenCalledTimes(2);
        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, settings.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        expect(newTabPromptText()).toBe('書く');
        expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionary');
        resetNewTabReviewStorage();
    });

    it('can force-retry dictionary source when dictionaries appear outside settings', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            newTabEnabled: true,
            newTabSource: 'dictionary' as const,
            localDictionariesEnabled: true,
            dictionaryPreferences: [{ name: 'Local', alias: 'Local', enabled: true, priority: 0, type: 'terms' as const }],
            immersionKitEnabled: false,
            newTabOfflineEnabled: false,
        };
        const summary = vi.fn()
            .mockResolvedValueOnce({
                ...newTabEmptyDictionarySummary(),
            })
            .mockResolvedValueOnce({
                ...newTabTermDictionarySummary(),
            });
        const invalidateCaches = vi.fn();
        const { controller, listRandomTopTerms } = newTabDictionaryReloadFixture({ settings, summary, invalidateCaches });

        await controller.renderPage();
        expect(newTabPromptText()).toBe(APP_NAME);
        expect(document.querySelector('[data-newtab-answer]')?.textContent).toBe('No cards.');

        await controller.refreshExternalData();

        expect(summary).toHaveBeenCalledTimes(2);
        expect(invalidateCaches).toHaveBeenCalledTimes(1);
        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, settings.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        expect(newTabPromptText()).toBe('書く');
        expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionary');
        resetNewTabReviewStorage();
    });

    it('falls back to dictionary cards when auto has no JPDB or Anki services', async () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const localCard = newTabTestCard({ spelling: '書く', reading: 'かく', source: 'local' });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['書く', 'かく', 'to write']));
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: false,
            newTabAnkiEnabled: false,
            newTabSource: 'auto',
        }), localCard, listRandomTopTerms, {
            anki: {
                listNewTabCards: vi.fn(async () => {
                    throw new Error('Anki should not be queried when new-tab Anki is off.');
                }),
            } as never,
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.cards.map(card => card.spelling)).toEqual(['書く']);
        expect(result.sourceLabel).toBe('Dictionary');
        expect(result.reviewCountMode).toBe(false);
        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
    });

    it('falls back to dictionary cards when auto live JPDB has no API key and Anki is off', async () => {
        resetNewTabReviewStorage();
        const localCard = newTabTestCard({ spelling: '稽古', reading: 'けいこ', source: 'local' });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['稽古', 'けいこ', 'practice']));
        const listNewTabCards = vi.fn(async () => {
            throw new Error('Anki should not be queried when new-tab Anki is off.');
        });
        const requestCurrent = vi.fn();
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            ankiEnabled: false,
            newTabAnkiEnabled: false,
            newTabSource: 'auto',
            newTabJpdbReviewMode: 'live-review',
            immersionKitEnabled: false,
        }), localCard, listRandomTopTerms, {
            anki: { listNewTabCards } as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: true, card: null }),
                requestCurrent,
            } as never,
        });

        try {
            await controller.renderPage();

            await expectNewTabDictionaryCard('稽古');
            expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
            expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
            expect(listNewTabCards).not.toHaveBeenCalled();
            expect(requestCurrent).not.toHaveBeenCalled();
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('falls back to dictionary cards when auto Anki is unreachable and JPDB is unconfigured', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const localCard = newTabTestCard({ spelling: '書く', reading: 'かく', source: 'local' });
        const listNewTabCards = vi.fn(async () => {
            throw new Error('AnkiConnect is not reachable.');
        });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['書く', 'かく', 'to write']));
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'auto',
            immersionKitEnabled: false,
        }), localCard, listRandomTopTerms, {
            anki: {
                listNewTabCards,
            } as never,
        });

        try {
            await controller.renderPage();

            await expectNewTabDictionaryCard('書く');
            expect(document.querySelector<HTMLElement>('[data-newtab-status]')?.dataset.sourceToggleTarget).toBeUndefined();
            expect(listNewTabCards).toHaveBeenCalledOnce();
            expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        } finally {
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            localStorage.removeItem('jpdb-reader-newtab-card-cache');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
    });

    it('falls back to dictionary cards when auto Anki is offered but unavailable before setup', async () => {
        resetNewTabReviewStorage();
        const localCard = newTabTestCard({ spelling: '初め', reading: 'はじめ', source: 'local' });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['初め', 'はじめ', 'beginning']));
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'auto',
            immersionKitEnabled: false,
        }), localCard, listRandomTopTerms);

        try {
            await controller.renderPage();

            await expectNewTabDictionaryCard('初め');
            expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('falls back to dictionary study cards when configured JPDB and Anki review queues are empty', async () => {
        resetNewTabReviewStorage();
        const knownJpdbCard = newTabTestCard({ spelling: '既知', reading: 'きち', source: 'jpdb', cardState: ['known'] });
        const localCard = newTabTestCard({ spelling: '余白', reading: 'よはく', source: 'local' });
        const listDeckCards = vi.fn(async () => [knownJpdbCard]);
        const listNewTabCards = vi.fn(async () => [] as JPDBCard[]);
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['余白', 'よはく', 'blank space']));
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'auto',
            newTabJpdbDeck: 'deck',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }), localCard, listRandomTopTerms, {
            anki: { listNewTabCards } as never,
            jpdb: { listDeckCards } as never,
        });

        try {
            const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

            expect(listDeckCards).toHaveBeenCalledWith('deck', 180, { scheduledOnly: true });
            expect(listNewTabCards).toHaveBeenCalledWith(180, undefined);
            expect(result.cards.map(card => card.spelling)).toEqual(['余白']);
            expect(result.sourceLabel).toBe('Dictionary');
            expect(result.reviewCountMode).toBe(false);
            expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('uses built-in study words when auto has no local dictionaries installed without public JPDB fallback', async () => {
        const { controller, publicSearch, fallbackCardFromText } = newTabBuiltInFallbackFixture('auto');
        await expectBuiltInFallbackWords(controller, fallbackCardFromText);
        expect(publicSearch).not.toHaveBeenCalled();
    });

    it('uses built-in study words when auto has no local dictionaries and public JPDB is unavailable', async () => {
        const { controller, fallbackCardFromText } = newTabBuiltInFallbackFixture('auto');

        try {
            await expectBuiltInFallbackWords(controller, fallbackCardFromText);

            await controller.renderPage();
            expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('uses keyless fallback material when legacy Kanji state migrates into the shared stepper', async () => {
        const { controller, fallbackCardFromText } = newTabBuiltInFallbackFixture('auto', {
            newTabStudyDisabledSteps: [],
        });
        const internals = controller as unknown as {
            state: NewTabRenderedState['state'];
        };
        internals.state = { ...internals.state, mode: 'kanji', revealAnswer: true };

        try {
            const result = await expectBuiltInFallbackWords(controller, fallbackCardFromText);
            expect(result.cards.length).toBeGreaterThan(0);

            await controller.renderPage();
            const prompt = document.querySelector('[data-newtab-prompt] [data-kanji]')?.textContent ?? '';
            expect(prompt).toMatch(/^[一-龯]$/u);
            expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('Looking for more kanji...');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('uses keyless fallback material for a query-bearing empty dictionary Word tab', async () => {
        const { controller, fallbackCardFromText } = newTabBuiltInFallbackFixture('dictionary');
        (controller as unknown as { searchController: { setInitialQuery(query: string): void } }).searchController.setInitialQuery('読み取る');

        try {
            const result = await expectBuiltInFallbackWords(controller, fallbackCardFromText);
            expect(result.cards.length).toBeGreaterThan(0);
            expect(result.sourceLabel).toBe('Starter words');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('keeps query-bearing fallback words intact while legacy Kanji state migrates', async () => {
        const { controller, fallbackCardFromText } = newTabBuiltInFallbackFixture('dictionary');
        const internals = controller as unknown as {
            state: NewTabRenderedState['state'];
        };
        (controller as unknown as { searchController: { setInitialQuery(query: string): void } }).searchController.setInitialQuery('よむ');
        internals.state = { ...internals.state, mode: 'kanji', revealAnswer: false };

        try {
            const result = await expectBuiltInFallbackWords(controller, fallbackCardFromText);
            expect(result.cards.length).toBeGreaterThan(0);
            const generatedTerms = new Set(fallbackCardFromText.mock.calls.map(([text]) => text));
            expect(result.cards.every(card => generatedTerms.has(card.spelling))).toBe(true);
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('replaces unavailable explicit Anki review state with built-in study fallback words', async () => {
        const { controller, fallbackCardFromText } = newTabBuiltInFallbackFixture('anki');

        try {
            const result = await expectBuiltInFallbackWords(controller, fallbackCardFromText);
            expect(result.emptyMessageKey).toBeUndefined();

            await controller.renderPage();
            expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('uses built-in study words when auto local dictionaries are disabled without public JPDB fallback', async () => {
        const { controller, publicSearch, fallbackCardFromText } = newTabBuiltInFallbackFixture('auto', {
            localDictionariesEnabled: false,
        });
        const internals = controller as unknown as {
            loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }>;
        };
        const result = await internals.loadWords();
        expect(result.cards.length).toBeGreaterThan(0);
        expect(result.sourceLabel).toBe('Starter words');
        expect(fallbackCardFromText).toHaveBeenCalled();
        expect(publicSearch).not.toHaveBeenCalled();

        await controller.renderPage();
        expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
        resetNewTabReviewStorage();
    });

    it('uses first-run local dictionary fallback when JPDB and Anki are unconfigured', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const localCard = newTabTestCard({ spelling: '今日', reading: 'きょう', source: 'local' });
        const publicSearch = vi.fn(async () => []);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                ankiEnabled: false,
                newTabAnkiEnabled: false,
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
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
                requestCurrent: vi.fn(),
            } as never,
            parser: {
                localCardFromEntry: vi.fn(() => localCard),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: ['Local'], terms: 1, kanji: 0, termMeta: 0, kanjiMeta: 0 })),
                listRandomTopTerms: vi.fn(async () => [{ expression: '今日', reading: 'きょう', glossary: ['today'], score: 1, dictionary: 'Local' }]),
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        try {
            const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();

            expect(result.sourceLabel).toBe('Dictionary');
            expect(result.cards.map(card => card.spelling)).toEqual(['今日']);

            await controller.renderPage();
            expect(newTabPromptText()).toBe('今日');
            expect(document.querySelector('[data-newtab-status]')?.textContent).toContain('Dictionary');
            expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
        } finally {
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            localStorage.removeItem('jpdb-reader-newtab-card-cache');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
    });

    it('ignores stale persisted Anki source when settings are auto and Anki setup is unavailable', async () => {
        resetNewTabReviewStorage();
        localStorage.setItem(NEW_TAB_UI_KEY, JSON.stringify({
            mode: 'word',
            sort: 'random',
            filter: 'study',
            source: 'anki',
            revealAnswer: false,
        }));
        const localCard = newTabTestCard({ spelling: '地元', reading: 'じもと', source: 'local' });
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: false,
            newTabAnkiEnabled: false,
            newTabSource: 'auto',
            immersionKitEnabled: false,
        }), localCard, vi.fn(async () => newTabLocalDictionaryEntries(['地元', 'じもと', 'local area'])));

        try {
            await controller.renderPage();

            expect((controller as unknown as { state: { source: string } }).state.source).toBe('auto');
            await expectNewTabDictionaryCard('地元');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('falls back to study words when a stale explicit Anki source remains after Anki is turned off', async () => {
        resetNewTabReviewStorage();
        const localCard = newTabTestCard({ spelling: '安心', reading: 'あんしん', source: 'local' });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['安心', 'あんしん', 'relief']));
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: false,
            newTabAnkiEnabled: false,
            newTabSource: 'anki',
            immersionKitEnabled: false,
        }), localCard, listRandomTopTerms);

        try {
            await controller.renderPage();

            await expectNewTabDictionaryCard('安心');
            expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('falls back to study words when explicit Anki is enabled but unreachable', async () => {
        resetNewTabReviewStorage();
        const localCard = newTabTestCard({ spelling: '飲み物', reading: 'のみもの', source: 'local' });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['飲み物', 'のみもの', 'drink']));
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'anki',
            immersionKitEnabled: false,
        }), localCard, listRandomTopTerms, {
            anki: {
                listNewTabCards: vi.fn(async () => {
                    throw new Error('AnkiConnect needs the userscript request bridge on content pages.');
                }),
            } as never,
        });

        try {
            await controller.renderPage();

            await expectNewTabDictionaryCard('飲み物', document, 'Dictionary');
            expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('starts auto JPDB and Anki review sources in parallel while preserving display order', async () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const jpdbCard = newTabTestCard({ spelling: '日本語', reading: 'にほんご', source: 'jpdb', reviewSource: 'jpdb-api' });
        const ankiCard = newTabTestCard({ spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' });
        const jpdbGate = deferred<void>();
        const events: string[] = [];
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'api-key',
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                newTabSource: 'auto',
            }),
            anki: {} as never,
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
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        Object.assign(controller as unknown as {
            loadJpdbWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean }>;
            loadAnkiWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean }>;
        }, {
            async loadJpdbWords() {
                events.push('jpdb-start');
                await jpdbGate.promise;
                events.push('jpdb-finish');
                return { cards: [jpdbCard], sourceLabel: 'JPDB', reviewCountMode: true };
            },
            async loadAnkiWords() {
                events.push('anki-start');
                return { cards: [ankiCard], sourceLabel: 'Anki', reviewCountMode: true };
            },
        });

        const resultPromise = (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();
        await Promise.resolve();
        await Promise.resolve();
        expect(events).toEqual(['jpdb-start', 'anki-start']);

        jpdbGate.resolve();
        const result = await resultPromise;

        expect(events).toEqual(['jpdb-start', 'anki-start', 'jpdb-finish']);
        expect(result.cards.map(card => card.spelling)).toEqual(['日本語', '暗記']);
        expect(result.sourceLabel).toBe('JPDB + Anki');
    });

    it('keeps auto review empty when review sources stall', async () => {
        vi.useFakeTimers();
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
                apiKey: 'api-key',
                ankiEnabled: true,
                newTabSource: 'auto',
            }),
            anki: {
                listNewTabCards: vi.fn(() => new Promise(() => undefined)),
            } as never,
            jpdb: {
                listDecks: vi.fn(() => new Promise(() => undefined)),
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
                localCardFromEntry: vi.fn(() => localCard),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        try {
            const resultPromise = (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; reviewCountMode?: boolean }> }).loadWords();
            await vi.advanceTimersByTimeAsync(8000);
            const result = await resultPromise;

            expect(result.cards.map(card => card.spelling)).toEqual(['書く']);
            expect(result.reviewCountMode).toBe(false);
            expect(listRandomTopTerms).toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('previews practice words while slow auto review sources are still loading', async () => {
        vi.useFakeTimers();
        resetNewTabReviewStorage();
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
                apiKey: 'api-key',
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                newTabSource: 'auto',
            }),
            anki: {
                listNewTabCards: vi.fn(() => new Promise(() => undefined)),
            } as never,
            jpdb: {
                listDeckCards: vi.fn(() => new Promise(() => undefined)),
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
                localCardFromEntry: vi.fn(() => localCard),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });

        try {
            const loadPromise = (controller as unknown as {
                loadWordsInto(root: HTMLElement, preferStoredWord: boolean): Promise<void>;
            }).loadWordsInto(root, true);
            await Promise.resolve();

            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('Loading...');

            await vi.advanceTimersByTimeAsync(NEW_TAB_PUBLIC_FALLBACK_GRACE_MS - 1);
            expect(newTabPromptText(root)).toBe(APP_NAME);

            await vi.advanceTimersByTimeAsync(1);
            expect(newTabPromptText(root)).toBe('書く');
            expect(root.querySelector('[data-newtab-count]')?.textContent)
                .toContain('No reviews ready — showing practice words');

            await vi.advanceTimersByTimeAsync(NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS * 3);
            await loadPromise;

            expect(newTabPromptText(root)).toBe('書く');
            expect(root.querySelector('[data-newtab-count]')?.textContent)
                .toContain('No reviews ready — showing practice words');
            expect(listRandomTopTerms).toHaveBeenCalled();
        } finally {
            resetNewTabReviewStorage();
            vi.useRealTimers();
        }
    });

    it('falls back from top 2k dictionary words to 6k and then the corpus', async () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const listRandomTopTerms = vi.fn(async (_limit: number, maxRank: number) => {
            if (maxRank === 2000) return [];
            if (maxRank === 6000) return [];
            return [];
        });
        const listRandomTerms = vi.fn(async () => [{
            expression: '珍語',
            reading: 'ちんご',
            glossary: ['rare word'],
            score: 0,
            dictionary: 'Local',
        }]);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                newTabSource: 'dictionary',
            }),
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
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
                listRandomTerms,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[] }> }).loadWords();

        expect(listRandomTopTerms).toHaveBeenNthCalledWith(1, 180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        expect(listRandomTopTerms).toHaveBeenNthCalledWith(2, 180, 6000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        expect(listRandomTerms).toHaveBeenCalledWith(180, DEFAULT_SETTINGS.dictionaryPreferences, expect.any(Object));
        expect(result.cards.map(card => card.spelling)).toEqual(['珍語']);
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

    it('starts on the card front even when the saved new-tab state was revealed', () => {
        localStorage.setItem('jpdb-reader-newtab-ui', JSON.stringify({
            mode: 'kanji',
            sort: 'frequency',
            filter: 'all',
            source: 'dictionary',
            revealAnswer: true,
        }));
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, newTabSource: 'auto' }),
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

        expect((controller as unknown as { state: unknown }).state).toMatchObject({
            route: 'study',
            sort: 'frequency',
            filter: 'all',
            source: 'auto',
            revealAnswer: false,
        });
        localStorage.removeItem('jpdb-reader-newtab-ui');
    });

    it('uses the settings new-tab source instead of a stale saved UI source', async () => {
        localStorage.setItem('jpdb-reader-newtab-ui', JSON.stringify({
            mode: 'word',
            sort: 'random',
            filter: 'study',
            source: 'anki',
            revealAnswer: false,
        }));
        const jpdbCard = newTabTestCard({ spelling: '設定', reading: 'せってい', source: 'jpdb', reviewSource: 'jpdb-api' });
        const ankiCard = newTabTestCard({ spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' });
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'deck',
                newTabJpdbReviewMode: 'api-vocabulary',
                immersionKitEnabled: false,
            }),
            anki: {
                listNewTabCards: vi.fn(async () => [ankiCard]),
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
            parser: { cacheCards: vi.fn() } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        try {
            await controller.renderPage();

            expect((controller as unknown as { state: { source: string } }).state.source).toBe('jpdb');
            expect(newTabPromptText()).toBe('設定');
        } finally {
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
    });

    it('reloads the queue when external new-tab state changes review source', async () => {
        const jpdbCard = newTabTestCard({ spelling: '設定', reading: 'せってい', source: 'jpdb', reviewSource: 'jpdb-api' });
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, newTabAnkiEnabled: true, newTabSource: 'auto' }),
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
        document.body.append(root);
        const reload = vi.fn(async () => undefined);
        const applyWords = vi.fn();
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            sourceLabel: string;
            reviewCountMode: boolean;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            loadWordsInto: typeof reload;
            applyWords: typeof applyWords;
        }, {
            allWords: [jpdbCard],
            visibleWords: [jpdbCard],
            index: 0,
            sourceLabel: 'JPDB',
            reviewCountMode: true,
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
            loadWordsInto: reload,
            applyWords,
        });

        try {
            await (controller as unknown as {
                applyExternalState(state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean }): Promise<void>;
            }).applyExternalState({ mode: 'word', sort: 'random', filter: 'study', source: 'anki', revealAnswer: false });

            expect((controller as unknown as { state: { source: string } }).state.source).toBe('anki');
            expect((controller as unknown as { allWords: JPDBCard[] }).allWords).toEqual([]);
            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords).toEqual([]);
            expect(reload).toHaveBeenCalledWith(root, false, { useOfflineCache: false });
            expect(applyWords).not.toHaveBeenCalled();
        } finally {
            root.remove();
            controller.destroy();
        }
    });

    it('restores the saved refresh card at the first visible position', () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-daily-study-time');
        sessionStorage.setItem('jpdb-reader-newtab-current-word', JSON.stringify({
            signature: 'dictionary|word|Dictionaries',
            key: '1:1:読む:よむ',
        }));
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const read = newTabTestCard({ vid: 1, spelling: '読む', reading: 'よむ', source: 'local' });
        const write = newTabTestCard({ vid: 2, spelling: '書く', reading: 'かく', source: 'local' });
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, newTabSource: 'dictionary', immersionKitEnabled: false }));
        const root = renderEnabledNewTabRoot(controller);
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
        // Word study always shows the ticking session timer + daily goal now
        // (user-requested session timer).
        // Yomu local SRS is now the default no-account path, so first-run
        // study stays unblocked without a provider-connection nudge.
        expect(root.querySelector('[data-newtab-count]')?.textContent).toMatch(/^\d\d:\d\d · 0\/60 min/);
        expect(root.querySelector('[data-newtab-count] .jpdb-reader-newtab-connect-cta')).toBeNull();
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
    });

    it('restores a shared card URL ahead of stored session position and queue order', () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const read = newTabTestCard({ vid: 1, spelling: '読む', reading: 'よむ', source: 'local' });
        const write = newTabTestCard({ vid: 2, spelling: '書く', reading: 'かく', source: 'local' });
        sessionStorage.setItem(NEW_TAB_CURRENT_WORD_KEY, JSON.stringify({
            signature: 'dictionary|word|Dictionaries',
            key: cardKey(read),
        }));
        window.history.replaceState(null, '', `/newtab/index.html#card=${encodeURIComponent(cardKey(write))}`);
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, newTabSource: 'dictionary', immersionKitEnabled: false }));
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });

        try {
            applySeededNewTabWords(controller, root, {
                allWords: [read, write],
                sourceLabel: 'Dictionaries',
                state: { mode: 'word', sort: 'random', filter: 'all', source: 'dictionary', revealAnswer: false },
            });

            expect(newTabPromptText(root)).toBe('書く');
            const token = expectOpaqueStudyCardToken(root, write.spelling, write.reading);
            const params = new URLSearchParams(location.hash.slice(1));
            expect(params.get('review')).toBe(token);
            expect(params.has('card')).toBe(false);
            expect(decodeURIComponent(location.href)).not.toMatch(/書く|かく/u);
        } finally {
            root.remove();
            sessionStorage.removeItem(NEW_TAB_CURRENT_WORD_KEY);
        }
    });

    it('opens a portable shared study URL even when the exact provider card is absent', async () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        window.history.replaceState(null, '', `/newtab/index.html#card=${encodeURIComponent('999:1:図鑑:ずかん')}&w=${encodeURIComponent('図鑑')}&r=${encodeURIComponent('ずかん')}`);
        const queued = newTabTestCard({ vid: 1, spelling: '読む', reading: 'よむ', source: 'jpdb', reviewSource: 'jpdb-api' });
        const shared = newTabTestCard({ vid: 88, sid: 7, spelling: '図鑑', reading: 'ずかん', source: 'jpdb', pitchAccent: ['LHHH'] });
        const lookupStudyCard = vi.fn(async () => shared);
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, newTabSource: 'jpdb', immersionKitEnabled: false }), {
            lookupStudyCard,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });

        try {
            await (controller as unknown as {
                applyLoadedWords(
                    root: HTMLElement,
                    preferStoredWord: boolean,
                    loadGeneration: number,
                    result: { cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean },
                    useOfflineCache: boolean,
                    usedCachedWords: boolean,
                    navigationGeneration: number,
                ): Promise<void>;
            }).applyLoadedWords(root, true, 0, { cards: [queued], sourceLabel: 'JPDB', reviewCountMode: true }, false, false, 0);

            const visible = (controller as unknown as { visibleWords: JPDBCard[] }).visibleWords;
            expect(newTabPromptText(root)).toBe('図鑑');
            expect(visible[0]).toMatchObject({
                spelling: '図鑑',
                reading: 'ずかん',
                source: 'local',
                reviewSource: 'yomu-local',
            });
            expect(visible[0]?.sourceCardKey).toBe(cardKey(shared));
            expect(lookupStudyCard).toHaveBeenCalledWith('図鑑', 'ずかん');
            const params = new URLSearchParams(location.hash.slice(1));
            expect(params.get('review')).toMatch(/^study-card-\d+$/u);
            expect(params.has('card')).toBe(false);
            expect(decodeURIComponent(location.href)).not.toMatch(/図鑑|ずかん/u);
        } finally {
            root.remove();
        }
    });

    it('ignores stale portable shared URL lookups after a newer load starts', async () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        window.history.replaceState(null, '', `/newtab/index.html#card=${encodeURIComponent('999:1:図鑑:ずかん')}&w=${encodeURIComponent('図鑑')}&r=${encodeURIComponent('ずかん')}`);
        const current = newTabTestCard({ vid: 1, spelling: '読む', reading: 'よむ', source: 'jpdb', reviewSource: 'jpdb-api' });
        const queued = newTabTestCard({ vid: 2, spelling: '書く', reading: 'かく', source: 'jpdb', reviewSource: 'jpdb-api' });
        const shared = newTabTestCard({ vid: 88, sid: 7, spelling: '図鑑', reading: 'ずかん', source: 'jpdb' });
        const lookup = deferred<JPDBCard>();
        const lookupStudyCard = vi.fn(() => lookup.promise);
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, newTabSource: 'jpdb', immersionKitEnabled: false }), {
            lookupStudyCard,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });

        try {
            applySeededNewTabWords(controller, root, {
                allWords: [current],
                sourceLabel: 'JPDB',
                state: { mode: 'word', sort: 'random', filter: 'all', source: 'jpdb', revealAnswer: false },
            });
            window.history.replaceState(null, '', `/newtab/index.html#card=${encodeURIComponent('999:1:図鑑:ずかん')}&w=${encodeURIComponent('図鑑')}&r=${encodeURIComponent('ずかん')}`);
            Object.assign(controller as unknown as { loadGeneration: number }, { loadGeneration: 1 });
            const load = (controller as unknown as {
                applyLoadedWords(
                    root: HTMLElement,
                    preferStoredWord: boolean,
                    loadGeneration: number,
                    result: { cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean },
                    useOfflineCache: boolean,
                    usedCachedWords: boolean,
                    navigationGeneration: number,
                ): Promise<void>;
            }).applyLoadedWords(root, true, 1, { cards: [queued], sourceLabel: 'JPDB', reviewCountMode: true }, false, false, 0);

            await waitForExpect(() => {
                expect(lookupStudyCard).toHaveBeenCalledWith('図鑑', 'ずかん');
            });
            Object.assign(controller as unknown as { loadGeneration: number }, { loadGeneration: 2 });
            lookup.resolve(shared);
            await load;

            expect(newTabPromptText(root)).toBe('読む');
            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['読む']);
        } finally {
            root.remove();
        }
    });

    it('does not turn a target-change lookup rejection into an ambient portable fallback card', async () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        window.history.replaceState(null, '', `/newtab/index.html#card=${encodeURIComponent('999:1:図鑑:ずかん')}&w=${encodeURIComponent('図鑑')}&r=${encodeURIComponent('ずかん')}`);
        const queued = newTabTestCard({ vid: 1, spelling: '読む', reading: 'よむ', source: 'jpdb', reviewSource: 'jpdb-api' });
        let rejectLookup!: (error: Error) => void;
        const lookupPromise = new Promise<JPDBCard | null>((_resolve, reject) => { rejectLookup = reject; });
        const lookupStudyCard = vi.fn(() => lookupPromise);
        const fallbackCardFromText = vi.fn(() => newTabTestCard({ spelling: '図鑑', reading: 'ずかん', source: 'fallback' }));
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, newTabSource: 'jpdb', immersionKitEnabled: false }), {
            lookupStudyCard,
            parser: {
                cacheCards: vi.fn(),
                fallbackCardFromText,
            } as never,
        });
        const internals = controller as unknown as {
            withPortableUrlCard(cards: JPDBCard[]): Promise<JPDBCard[]>;
        };

        try {
            const resolved = internals.withPortableUrlCard([queued]);
            await waitForExpect(() => expect(lookupStudyCard).toHaveBeenCalledWith('図鑑', 'ずかん'));
            expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
            expect(setActiveLearningTargetLanguage('ja')).not.toBeNull();
            rejectLookup(new Error('target changed'));

            await expect(resolved).resolves.toEqual([queued]);
            expect(fallbackCardFromText).not.toHaveBeenCalled();
        } finally {
            resetActiveLearningTargetLanguage();
        }
    });

    it('conceals unrevealed history, exposes a portable link after reveal, and navigates opaque entries', () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        window.history.replaceState(null, '', '/newtab/index.html');
        const read = newTabTestCard({ vid: 1, spelling: '読む', reading: 'よむ', source: 'local' });
        const write = newTabTestCard({ vid: 2, spelling: '書く', reading: 'かく', source: 'local' });
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, newTabSource: 'dictionary', immersionKitEnabled: false }));
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });

        try {
            applySeededNewTabWords(controller, root, {
                allWords: [read, write],
                sourceLabel: 'Dictionaries',
                state: { mode: 'word', sort: 'random', filter: 'all', source: 'dictionary', revealAnswer: false },
            });

            expect(newTabPromptText(root)).toBe('読む');
            const readToken = expectOpaqueStudyCardToken(root, read.spelling, read.reading);
            let params = new URLSearchParams(location.hash.slice(1));
            expect(params.get('review')).toBe(readToken);
            expect(decodeURIComponent(location.href)).not.toMatch(/読む|よむ/u);

            Object.assign(controller as unknown as { state: { revealAnswer: boolean } }, {
                state: { ...(controller as unknown as { state: object }).state, revealAnswer: true },
            });
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, read);
            params = new URLSearchParams(location.hash.slice(1));
            expect(params.get('card')).toBe(cardKey(read));
            expect(params.get('w')).toBe('読む');
            expect(params.get('r')).toBe('よむ');

            (controller as unknown as { showNextWord(): void }).showNextWord();
            expect(newTabPromptText(root)).toBe('書く');
            const writeToken = expectOpaqueStudyCardToken(root, write.spelling, write.reading);
            expect(writeToken).not.toBe(readToken);
            params = new URLSearchParams(location.hash.slice(1));
            expect(params.get('review')).toBe(writeToken);
            expect(decodeURIComponent(location.href)).not.toMatch(/書く|かく/u);

            window.history.replaceState(null, '', `/newtab/index.html#review=${readToken}`);
            (controller as unknown as { handleCardPopstate(root: HTMLElement): void }).handleCardPopstate(root);

            expect(newTabPromptText(root)).toBe('読む');
            expect(expectOpaqueStudyCardToken(root, read.spelling, read.reading)).toBe(readToken);
            params = new URLSearchParams(location.hash.slice(1));
            expect(params.get('review')).toBe(readToken);
            expect(params.has('card')).toBe(false);
        } finally {
            root.remove();
        }
    });

    it('never lets an embedded Academy Study surface write the host URL', () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        window.history.replaceState(null, '', '/study/?return=academy&context=lesson-0');
        const card = newTabTestCard({ vid: 1, spelling: '読む', reading: 'よむ', source: 'local' });
        const host = document.createElement('section');
        const controller = newTabBareController(
            () => ({ ...DEFAULT_SETTINGS, newTabSource: 'dictionary', immersionKitEnabled: false }),
            {},
            { host, surface: 'academy' },
        );
        const root = renderEnabledNewTabRoot(controller);
        const href = location.href;

        applySeededNewTabWords(controller, root, {
            allWords: [card],
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', sort: 'random', filter: 'all', source: 'dictionary', revealAnswer: false },
        });

        expect(location.href).toBe(href);
        expect(location.hash).toBe('');
        root.remove();
        controller.destroy();
    });

    it('keeps embedded Academy Study state out of the standalone state store', () => {
        const standaloneState = {
            mode: 'listen',
            listenSubMode: 'shadow',
            sort: 'frequency',
            filter: 'known',
            source: 'jpdb',
            revealAnswer: false,
            jpdbDeck: 'core',
            ankiDeck: '',
            keyHintsDismissed: true,
        };
        localStorage.setItem(NEW_TAB_UI_KEY, JSON.stringify(standaloneState));
        const controller = newTabBareController(
            () => ({ ...DEFAULT_SETTINGS, newTabSource: 'jpdb', yomuLocalSrsEnabled: false }),
            {},
            { host: document.createElement('section'), surface: 'academy' },
        );
        const internals = controller as unknown as {
            state: { source: string; revealAnswer: boolean };
            persistState(): void;
        };

        internals.state.source = 'yomu-local';
        internals.state.revealAnswer = true;
        internals.persistState();

        expect(JSON.parse(localStorage.getItem(NEW_TAB_UI_KEY) ?? 'null')).toEqual(standaloneState);
        controller.destroy();
    });

    it('restores a persisted legacy Listen Shadow session before stripping legacy keys on persist', () => {
        localStorage.setItem(NEW_TAB_UI_KEY, JSON.stringify({
            mode: 'listen',
            listenSubMode: 'shadow',
            sort: 'random',
            filter: 'all',
            source: 'dictionary',
            revealAnswer: false,
        }));
        const card = newTabTestCard({
            spelling: '読む',
            reading: 'よむ',
            sentence: '本を読む。',
            pitchAccent: ['LH'],
            source: 'local',
        });
        const controller = newTabBareController(() => ({
            ...DEFAULT_SETTINGS,
            newTabSource: 'dictionary',
            newTabStudyDisabledSteps: [],
            immersionKitEnabled: false,
        }));
        const root = renderEnabledNewTabRoot(controller);
        const internals = controller as unknown as {
            allWords: JPDBCard[];
            sourceLabel: string;
            applyWords(root: HTMLElement, preferStoredWord: boolean): void;
            persistState(): void;
        };
        internals.allWords = [card];
        internals.sourceLabel = 'Dictionaries';

        internals.applyWords(root, false);

        expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('speaking');
        internals.persistState();
        const persisted = JSON.parse(localStorage.getItem(NEW_TAB_UI_KEY) ?? 'null') as Record<string, unknown>;
        expect(persisted.route).toBe('study');
        expect(persisted).not.toHaveProperty('mode');
        expect(persisted).not.toHaveProperty('listenSubMode');
        root.remove();
        controller.destroy();
    });

    it('restores a persisted legacy Kanji session at its kanji study step', () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        localStorage.setItem(NEW_TAB_UI_KEY, JSON.stringify({
            mode: 'kanji',
            sort: 'random',
            filter: 'all',
            source: 'dictionary',
            revealAnswer: false,
        }));
        const card = newTabTestCard({ spelling: '読む', reading: 'よむ', source: 'local' });
        const controller = newTabBareController(() => ({
            ...DEFAULT_SETTINGS,
            newTabSource: 'dictionary',
            newTabStudyDisabledSteps: [],
            immersionKitEnabled: false,
        }));
        const root = renderEnabledNewTabRoot(controller);
        const internals = controller as unknown as {
            allWords: JPDBCard[];
            sourceLabel: string;
            applyWords(root: HTMLElement, preferStoredWord: boolean): void;
        };
        internals.allWords = [card];
        internals.sourceLabel = 'Dictionaries';

        try {
            internals.applyWords(root, false);

            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('kanji-doodle');
        } finally {
            restoreCanvas();
            root.remove();
            controller.destroy();
        }
    });

    it('restores a persisted legacy Recall session at its cloze study step', () => {
        localStorage.setItem(NEW_TAB_UI_KEY, JSON.stringify({
            mode: 'recall',
            sort: 'random',
            filter: 'all',
            source: 'dictionary',
            revealAnswer: false,
        }));
        const card = newTabTestCard({ spelling: '読む', reading: 'よむ', sentence: '本を読む。', source: 'local' });
        const controller = newTabBareController(() => ({
            ...DEFAULT_SETTINGS,
            newTabSource: 'dictionary',
            newTabStudyDisabledSteps: [],
            immersionKitEnabled: false,
        }));
        const root = renderEnabledNewTabRoot(controller);
        const internals = controller as unknown as {
            allWords: JPDBCard[];
            sourceLabel: string;
            applyWords(root: HTMLElement, preferStoredWord: boolean): void;
        };
        internals.allWords = [card];
        internals.sourceLabel = 'Dictionaries';

        internals.applyWords(root, false);

        expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('recall-cloze');
        root.remove();
        controller.destroy();
    });

    it('keeps the hosted Kanji tab mapped to the kanji step in the unified Study route', () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const card = newTabTestCard({ spelling: '読む', reading: 'よむ', source: 'local' });
        const controller = newTabBareController(() => ({
            ...DEFAULT_SETTINGS,
            newTabSource: 'dictionary',
            newTabStudyDisabledSteps: [],
            immersionKitEnabled: false,
        }));
        const root = renderEnabledNewTabRoot(controller);
        const kanjiButton = document.createElement('button');
        kanjiButton.type = 'button';
        kanjiButton.dataset.newtabAction = 'mode';
        kanjiButton.dataset.mode = 'kanji';
        root.querySelector('[data-newtab-action="mode"]')?.parentElement?.append(kanjiButton);
        const internals = controller as unknown as {
            allWords: JPDBCard[];
            sourceLabel: string;
            applyWords(root: HTMLElement, preferStoredWord: boolean): void;
            bindRootEvents(root: HTMLElement): void;
        };
        internals.allWords = [card];
        internals.sourceLabel = 'Dictionaries';
        try {
            internals.applyWords(root, false);
            internals.bindRootEvents(root);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('word');

            kanjiButton.click();

            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('kanji-doodle');
            expect(root.classList.contains('jpdb-reader-newtab-kanji-mode')).toBe(true);
        } finally {
            restoreCanvas();
            root.remove();
            controller.destroy();
        }
    });

    it('fails closed when a reload or foreign history entry carries an unknown opaque token', () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        window.history.replaceState(null, '', '/study/');
        const card = newTabTestCard({ vid: 1, spelling: '読む', reading: 'よむ', source: 'local' });
        const controller = newTabBareController(() => ({
            ...DEFAULT_SETTINGS,
            newTabSource: 'dictionary',
            immersionKitEnabled: false,
        }));
        const root = renderEnabledNewTabRoot(controller);

        applySeededNewTabWords(controller, root, {
            allWords: [card],
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', sort: 'random', filter: 'all', source: 'dictionary', revealAnswer: false },
        });
        const liveToken = expectOpaqueStudyCardToken(root, card.spelling, card.reading);
        window.history.replaceState(null, '', '/study/#review=study-card-999');

        (controller as unknown as { handleCardPopstate(root: HTMLElement): void }).handleCardPopstate(root);

        expect(root.classList.contains('jpdb-reader-newtab-revealed')).toBe(false);
        expect(new URLSearchParams(location.hash.slice(1)).get('review')).toBe(liveToken);
        expect(decodeURIComponent(location.href)).not.toMatch(/読む|よむ/u);
        root.remove();
        controller.destroy();
    });

    it('shows cached new-tab cards while refreshing live sources', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        const cachedCard = newTabTestCard({ vid: 1, sid: 1, spelling: '読む', reading: 'よむ', source: 'local' });
        const liveCard = newTabTestCard({ vid: 2, sid: 2, spelling: '書く', reading: 'かく', source: 'local' });
        localStorage.setItem('jpdb-reader-newtab-card-cache', JSON.stringify({
            sourceLabel: 'Dictionaries',
            cards: [cachedCard],
        }));
        const liveEntries = deferred<Array<{ expression: string; reading: string; glossary: string[]; score: number; dictionary: string }>>();
        const cacheCards = vi.fn();
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                newTabEnabled: true,
                newTabSource: 'dictionary',
                immersionKitEnabled: false,
            }),
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
                cacheCards,
                localCardFromEntry: vi.fn(() => liveCard),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms: vi.fn(() => liveEntries.promise),
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        try {
            const render = controller.renderPage();

            await waitForExpect(() => {
                expect(newTabPromptText()).toBe('読む');
                expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionary · Offline cache');
            });
            expect(cacheCards).toHaveBeenCalledWith([expect.objectContaining({ spelling: '読む', reading: 'よむ' })]);

            liveEntries.resolve([{
                expression: '書く',
                reading: 'かく',
                glossary: ['to write'],
                score: 1,
                dictionary: 'Local',
            }]);
            await render;

            expect(newTabPromptText()).toBe('書く');
            expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionary');
        } finally {
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-card-cache');
        }
    });

    it('keeps a navigated cached dictionary kanji card selected when refresh completes', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        document.body.replaceChildren();
        localStorage.setItem('jpdb-reader-newtab-ui', JSON.stringify({
            mode: 'kanji',
            sort: 'random',
            filter: 'study',
            source: 'dictionary',
            revealAnswer: false,
        }));
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');

        const cachedRead = newTabTestCard({ vid: 1, sid: 1, spelling: '読む', reading: 'よむ', source: 'local', kanjiKeyword: 'read' });
        const cachedWrite = newTabTestCard({ vid: 2, sid: 2, spelling: '書く', reading: 'かく', source: 'local', kanjiKeyword: 'write' });
        const liveWalk = newTabTestCard({ vid: 3, sid: 3, spelling: '歩く', reading: 'あるく', source: 'local', kanjiKeyword: 'walk' });
        localStorage.setItem('jpdb-reader-newtab-card-cache', JSON.stringify({
            sourceLabel: 'Dictionary',
            cards: [cachedRead, cachedWrite],
        }));

        const liveEntries = deferred<Array<{ expression: string; reading: string; glossary: string[]; score: number; dictionary: string }>>();
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                newTabEnabled: true,
                newTabSource: 'dictionary',
                immersionKitEnabled: false,
                jpdbKanjiEnabled: false,
                rtkEnabled: false,
                uchisenEnabled: false,
                kanjivgEnabled: false,
                kanjiOriginsEnabled: false,
                similarKanjiWords: false,
                localDictionaryShowKanji: false,
                newTabKanjiAutogradeEnabled: false,
            }),
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
                localCardFromEntry: vi.fn(() => liveWalk),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms: vi.fn(() => liveEntries.promise),
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        try {
            const render = controller.renderPage();

            let readToken = '';
            await waitForExpect(() => {
                readToken = expectOpaqueStudyCardToken(document, '読む', 'よむ');
                expect(document.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-word')?.dataset.expression).toBe('読む');
            });

            showNextNewTabWord(controller);
            let writeToken = '';
            await waitForExpect(() => {
                writeToken = expectOpaqueStudyCardToken(document, '書く', 'かく');
                expect(writeToken).not.toBe(readToken);
                expect(document.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-word')?.dataset.expression).toBe('書く');
            });

            liveEntries.resolve([{
                expression: '歩く',
                reading: 'あるく',
                glossary: ['to walk'],
                score: 1,
                dictionary: 'Local',
            }]);
            await render;

            expect(expectOpaqueStudyCardToken(document, '書く', 'かく')).toBe(writeToken);
            expect(document.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-word')?.dataset.expression).toBe('書く');
            expect((controller as unknown as { allWords: JPDBCard[] }).allWords.map(card => card.spelling)).toEqual(['書く', '歩く']);
        } finally {
            restoreCanvas();
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            localStorage.removeItem('jpdb-reader-newtab-card-cache');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
    });

    it('omits popover-style kanji source cards from new-tab kanji details', () => {
        vi.stubGlobal('CSS', { ...(globalThis.CSS ?? {}), escape: (value: string) => value });
        const details = renderTestKanjiDetails({
            settings: {
                similarKanjiWords: false,
                kanjiOriginGraphEnabled: true,
            },
            card: newTabTestCard({ spelling: '休', source: 'jpdb' }),
            kanji: '休',
            info: {
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
            },
        });
        expect(details.querySelector('.jpdb-reader-newtab-kanji-sources')).toBeNull();
        expect(details.querySelector('.jpdb-reader-origin-graph-wrap')).not.toBeNull();
        expect(details.querySelector('.jpdb-reader-component-button')).not.toBeNull();
    });

    it('renders new-tab kanji sources open and in settings order', () => {
        const details = renderTestKanjiDetails({
            settings: {
                kanjiOriginGraphEnabled: true,
                rtkEnabled: true,
            },
            card: newTabTestCard({ spelling: '付', source: 'jpdb' }),
            kanji: '付',
            info: {
                kanji: '付',
                keyword: 'attach',
                frequency: 'Top 1000',
                type: 'Joyo',
                kanken: '',
                heisig: '#1000',
                oldForms: [],
                readings: [
                    { reading: 'つ.く', share: '', common: true },
                    { reading: 'フ', share: '', common: false },
                ],
                components: [{ kanji: '亻', keyword: 'person' }],
                usedInKanji: [],
                mnemonic: '',
                vocabulary: [
                    { expression: '付く', reading: 'つく', meaning: 'to stick', url: 'https://jpdb.io/vocabulary/1' },
                    { expression: '付ける', reading: 'つける', meaning: 'to attach', url: 'https://jpdb.io/vocabulary/2' },
                ],
                actions: [],
                loggedIn: false,
                kanjiReviewsEnabled: false,
            },
            rtk: {
                kanji: '付',
                keyword: 'adhere',
                frameNumber: '1000',
                onYomi: '',
                kunYomi: 'つ.く',
                elements: 'person, inch',
                componentKanji: ['人', '寸'],
                heisigStory: 'Attach the person to the inch.',
                heisigComment: '',
                koohiiStories: [],
            },
        });

        const sourceLabels = Array.from(details.querySelectorAll<HTMLElement>('.jpdb-reader-source-card > .jpdb-reader-local-title'))
            .map(item => item.textContent?.trim() ?? '');
        expect(sourceLabels.slice(0, 3)).toEqual(['JPDB', 'RTK', 'Component graph']);
        expect(details.querySelector('.jpdb-reader-newtab-kanji-info-source')?.hasAttribute('open')).toBe(true);
        const rtkSection = details.querySelector('.jpdb-reader-rtk');
        expect(rtkSection).not.toBeNull();
        expect(rtkSection?.hasAttribute('open')).toBe(true);
        expect(details.querySelector('.jpdb-reader-newtab-origin-graph')?.hasAttribute('open')).toBe(true);
        expect(details.querySelector('.jpdb-reader-newtab-kanji-keywords')?.textContent).toContain('adhere');
        const jpdbFacts = details.querySelector('.jpdb-reader-newtab-kanji-info-source .jpdb-reader-kanji-facts')?.textContent ?? '';
        expect(jpdbFacts).not.toContain('Readings');
        expect(jpdbFacts).not.toContain(['JPDB', 'words'].join(' '));
        expect(jpdbFacts).toContain('HeisigJPDB #1000');
        expect(jpdbFacts).not.toContain('Frame number');
        expect(rtkSection?.textContent).toContain('Attach the person to the inch.');
    });

    it('does not repeat the displayed Jiten kanji meaning as a keyword pill', () => {
        const details = renderTestKanjiDetails({
            settings: {
                apiKey: '',
                jitenApiKey: 'ak_jiten-key',
                rtkEnabled: true,
            },
            card: newTabTestCard({ spelling: '大', source: 'jiten', meanings: [{ glosses: ['large'], partOfSpeech: [] }] }),
            kanji: '大',
            info: null,
            jiten: {
                character: '大',
                onReadings: ['ダイ'],
                kunReadings: ['おお'],
                meanings: ['large', 'big'],
                strokeCount: 3,
                jlptLevel: 5,
                grade: 1,
                frequencyRank: 7,
                groupingTags: { kanken: null, wanikani: null, rtk: null, klc: null, tmw: null },
                topWords: [],
                wordsByReading: [],
            },
            rtk: {
                kanji: '大',
                keyword: 'large',
                frameNumber: '112',
                onYomi: '',
                kunYomi: '',
                elements: '',
                componentKanji: [],
                heisigStory: '',
                heisigComment: '',
                koohiiStories: [],
            },
        });

        expect(details.querySelector('.jpdb-reader-jiten-kanji .jpdb-reader-kanji-facts')?.textContent).toContain('Meaninglarge, big');
        expect(details.querySelector('.jpdb-reader-newtab-kanji-keywords .jpdb-reader-kanji-keyword')).toBeNull();
        expect(details.textContent).not.toContain('Jiten/RTKlarge');
    });

    it('loads additional Jiten kanji words through real show-more pagination', async () => {
        const initialWords = Array.from({ length: 9 }, (_, index) => ({
            wordId: 100 + index,
            readingIndex: index,
            reading: `青${index}`,
            readingFurigana: `青[あお]${index}`,
            mainDefinition: `blue ${index}`,
            frequencyRank: 600 + index,
            matchSurface: `青${index}`,
        }));
        const lookupKanjiWords = vi.fn(async () => ({
            items: [
                { wordId: 200, readingIndex: 0, reading: '青空', readingFurigana: '青空[あおぞら]', mainDefinition: 'blue sky', frequencyRank: 1200, matchSurface: '青空' },
            ],
            total: 10,
            pageSize: 9,
            offset: 9,
        }));
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'ak_jiten-key',
        }, {
            jiten: {
                lookupKanji: vi.fn(async () => null),
                lookupKanjiWords,
                listStudyBatchCards: vi.fn(),
                reviewCard: vi.fn(),
            } as never,
        });
        const root = document.createElement('main');
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as {
            renderKanjiDetails(card: JPDBCard, kanji: string, info: null, jiten: unknown, rtk: null, vg: null, local: [], similar: []): HTMLElement;
        }).renderKanjiDetails(
            newTabTestCard({ spelling: '青', source: 'jiten' }),
            '青',
            null,
            {
                character: '青',
                onReadings: ['セイ'],
                kunReadings: ['あお'],
                meanings: ['blue'],
                strokeCount: 8,
                jlptLevel: 4,
                grade: 1,
                frequencyRank: 549,
                groupingTags: { kanken: null, wanikani: null, rtk: null, klc: null, tmw: null },
                topWords: [],
                wordsByReading: [{ reading: 'あお', totalWords: 17, words: initialWords }],
            },
            null,
            null,
            [],
            [],
        ));
        document.body.append(root);
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

        try {
            const more = root.querySelector<HTMLButtonElement>('[data-action="jiten-kanji-more"]')!;
            more.click();

            await waitForExpect(() => {
                expect(lookupKanjiWords).toHaveBeenCalledWith('青', {
                    reading: 'あお',
                    page: 2,
                    pageSize: Number(more.dataset.jitenKanjiPageSize),
                });
                expect(root.textContent).toContain('青空');
            });
            expect(root.querySelector<HTMLButtonElement>('[data-action="jiten-kanji-more"]')).toBeNull();
        } finally {
            document.body.replaceChildren();
        }
    });
});
