import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    registerNewTabReviewCleanup,
    DEFAULT_SETTINGS,
    newTabTestCard,
    deferred,
    mountStackedNewTabLookup,
    newTabLookupRenderData,
    setupNewTabLookupRuntime,
    newTabAutoReviewWordFixture,
    jpdbAnkiDuplicateReviewCard,
    ankiLookupNote,
    ankiLookupResult,
    stubKanjiDoodleBrowserApis,
    NewTabController,
    searchWordMetaItems,
    NewTabRuntime,
    createReaderPopover,
    expectSettingsDialogStillMounted,
    expectStackedLookupOverSettings,
    waitForExpect,
} from './fixtures';
import type {
    NewTabLookupRuntimeInternals,
    AnkiLookupResult,
    JPDBCard,
    JPDBToken,
} from './fixtures';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../../src/reader/languages/active';
import { primaryCardState } from '../../../src/reader/cards/state';
import { bindPrivateCommandCapability } from '../../../src/reader/dom/private-command-capabilities';
import {
    registerRenderedWordPrivateState,
    renderedWordPrivateStateForCard,
    renderedWordPrivateValue,
} from '../../../src/reader/dom/rendered-word-private-state';

describe('new tab review — hosted segmented fallback & lookup grade statuses', () => {
    registerNewTabReviewCleanup();
    beforeEach(() => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
    });

    it('blocks stale hosted kanji actions and Japanese public providers after a target switch', async () => {
        setActiveLearningTargetLanguage('zh');
        const runtime = new NewTabRuntime();
        const lookupKanji = vi.fn(async () => null);
        const performKanjiAction = vi.fn(async () => undefined);
        const publicSearch = vi.fn(async () => []);
        const jitenParse = vi.fn(async () => []);
        const jitenLookupMany = vi.fn(async () => new Map());
        const card = newTabTestCard({ spelling: '学习', reading: 'xuéxí', language: 'zh', source: 'fallback' });
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbKanji: { lookup: typeof lookupKanji; performAction: typeof performKanjiAction };
            jpdbVocabulary: { search: typeof publicSearch };
            jiten: { parse: typeof jitenParse };
            jitenPublicVocabulary: { lookupMany: typeof jitenLookupMany };
            kanjiLookupDetailPromises(kanji: string): {
                jpdbInfo: Promise<unknown>;
                jitenInfo: Promise<unknown>;
                kanjiEntries: Promise<unknown[]>;
                rtkInfo: Promise<unknown>;
                kanjiVGInfo: Promise<unknown>;
                kanjiSourceInfo: Promise<unknown>;
            };
            performJpdbKanjiAction(actionId: string, card: JPDBCard, kanji: string): Promise<void>;
            targetLookup: { publicCard(term: string): Promise<JPDBCard | undefined> };
            publicLookupFallbackCards(cards: JPDBCard[]): Promise<Map<string, JPDBCard>>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            jpdbKanjiEnabled: true,
            jpdbDefinitionsEnabled: true,
            showPitchAccent: true,
            localDictionariesEnabled: true,
            localDictionaryShowKanji: true,
            rtkEnabled: true,
            kanjivgEnabled: true,
            kanjiOriginsEnabled: true,
        };
        internals.jpdbKanji = { lookup: lookupKanji, performAction: performKanjiAction };
        internals.jpdbVocabulary = { search: publicSearch };
        internals.jiten = { parse: jitenParse };
        internals.jitenPublicVocabulary = { lookupMany: jitenLookupMany };

        try {
            const details = internals.kanjiLookupDetailPromises('学');
            await expect(Promise.all(Object.values(details))).resolves.toEqual([null, null, [], null, null, null]);
            await internals.performJpdbKanjiAction('add', card, '学');
            await expect(internals.targetLookup.publicCard('学习')).resolves.toBeUndefined();
            await expect(internals.publicLookupFallbackCards([card])).resolves.toEqual(new Map());

            expect(lookupKanji).not.toHaveBeenCalled();
            expect(performKanjiAction).not.toHaveBeenCalled();
            expect(publicSearch).not.toHaveBeenCalled();
            expect(jitenParse).not.toHaveBeenCalled();
            expect(jitenLookupMany).not.toHaveBeenCalled();
        } finally {
            runtime.destroy();
            resetActiveLearningTargetLanguage();
        }
    });


    it('omits study grammar and translation sources from hosted search expansions', () => {
        const runtime = new NewTabRuntime();
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            createNewTabController(): NewTabController;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            studyGrammarEnabled: true,
            studyTranslationEnabled: true,
            immersionKitEnabled: false,
        };
        try {
            const controller = internals.createNewTabController() as unknown as {
                dependencies: {
                    renderSearchDefinitionSources(
                        card: JPDBCard,
                        entries: Array<{ expression: string; reading: string; glossary: string[]; score: number; dictionary: string }>,
                        sentence: string,
                        jpdbVocabularyInfo: null,
                    ): string;
                };
            };
            const html = controller.dependencies.renderSearchDefinitionSources(
                newTabTestCard({ spelling: '猫', reading: 'ねこ', sentence: '猫です。' }),
                [{ expression: '猫', reading: 'ねこ', glossary: ['cat'], score: 20, dictionary: 'Local' }],
                '猫です。',
                null,
            );

            expect(html).toContain('Local');
            expect(html).not.toContain('data-study-grammar');
            expect(html).not.toContain('data-study-translation');
        } finally {
            runtime.destroy();
        }
    });

    it('replaces no-key segmented fallback words with public Jiten cards', async () => {
        const runtime = new NewTabRuntime();
        const fallbackCard = newTabTestCard({ vid: -3924751230, sid: -3924751230, spelling: '会話', reading: '会話', source: 'fallback', meanings: [] });
        const publicCard = newTabTestCard({ vid: 1234, sid: 0, spelling: '会話', reading: 'かいわ', source: 'jiten', pitchAccent: ['LHH'] });
        const parse = vi.fn(async (): Promise<JPDBToken[][]> => [[{
            card: fallbackCard,
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
            sentence: '会話',
        }]]);
        const search = vi.fn(async () => []);
        const pitch = vi.fn(async () => ['LHH']);
        const jitenLookupMany = vi.fn(async () => new Map<string, JPDBCard>([['会話', publicCard]]));
        const cacheCards = vi.fn();
        const root = document.createElement('div');
        root.innerHTML = '<span class="jpdb-reader-parseable">会話</span>';
        document.body.append(root);
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parser: { canParse(): boolean; parse: typeof parse; cacheCards: typeof cacheCards };
            jitenPublicVocabulary: { lookup(term: string): Promise<JPDBCard | null>; lookupMany(terms: string[]): Promise<Map<string, JPDBCard>> };
            jpdbVocabulary: { search: typeof search };
            jpdbPublicPitch: { lookup: typeof pitch };
            parseNewTabContent(root: HTMLElement): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            showFurigana: true,
            furiganaMode: 'all',
            showPitchAccent: true,
        };
        internals.parser = { canParse: () => true, parse, cacheCards };
        internals.jitenPublicVocabulary = {
            lookup: vi.fn(async () => null),
            lookupMany: jitenLookupMany,
        };
        internals.jpdbVocabulary = { search };
        internals.jpdbPublicPitch = { lookup: pitch };

        try {
            await internals.parseNewTabContent(root);

            await waitForExpect(() => {
                const word = root.querySelector<HTMLElement>('.jpdb-reader-word');
                expect(word?.dataset.expression).toBe('会話');
                expect(word && renderedWordPrivateValue(word, 'vid')).toBe('1234');
                expect(word?.dataset.reading).toBe('かいわ');
                expect(word?.dataset.pitchClass).toBe('heiban');
                expect(word?.querySelector('rt')?.textContent).toBe('かいわ');
            });
            expect(jitenLookupMany).toHaveBeenCalledWith(['会話']);
            expect(search).not.toHaveBeenCalled();
            // Keyless public pitch is now allowed; the Jiten card still supplies the
            // displayed heiban accent, so the public-pitch result is not what renders.
            expect(pitch).toHaveBeenCalled();
            expect(cacheCards).toHaveBeenCalledWith([publicCard]);
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('unwraps no-key segmented fallback words when public Jiten has no card', async () => {
        const runtime = new NewTabRuntime();
        const fallbackCard = newTabTestCard({ vid: -1, sid: -1, spelling: 'した', reading: 'した', source: 'fallback', meanings: [] });
        const jitenLookupMany = vi.fn(async () => new Map<string, JPDBCard>());
        const search = vi.fn(async () => []);
        const parse = vi.fn(async (): Promise<JPDBToken[][]> => [[{
            card: fallbackCard,
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
            sentence: 'した',
        }]]);
        const root = document.createElement('div');
        root.innerHTML = '<span class="jpdb-reader-parseable">した</span>';
        document.body.append(root);
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parser: { canParse(): boolean; parse: typeof parse; cacheCards(cards: JPDBCard[]): void };
            jitenPublicVocabulary: { lookup(term: string): Promise<JPDBCard | null>; lookupMany(terms: string[]): Promise<Map<string, JPDBCard>> };
            jpdbVocabulary: { search(query: string, limit?: number): Promise<JPDBCard[]> };
            parseNewTabContent(root: HTMLElement): Promise<void>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: false };
        internals.parser = { canParse: () => true, parse, cacheCards: vi.fn() };
        internals.jitenPublicVocabulary = {
            lookup: vi.fn(async () => null),
            lookupMany: jitenLookupMany,
        };
        internals.jpdbVocabulary = { search };

        try {
            await internals.parseNewTabContent(root);

            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-word')).toBeNull();
                expect(root.textContent).toBe('した');
            });

            await internals.parseNewTabContent(root);

            expect(parse).toHaveBeenCalledTimes(1);
            expect(jitenLookupMany).toHaveBeenCalledTimes(1);
            expect(search).not.toHaveBeenCalled();
            expect(root.querySelector('.jpdb-reader-word')).toBeNull();
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps hosted sticky bottom-sheet lookup assistively modal without a visual backdrop', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({ spelling: '大切', reading: 'たいせつ', sentence: '大切です。' });
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            showKanjiLookupCard(card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): Promise<void>;
        };

        try {
            internals.settings = {
                ...DEFAULT_SETTINGS,
                popupMode: 'sheet',
                stickyBottomSheet: true,
                jpdbKanjiEnabled: false,
                localDictionariesEnabled: false,
                localDictionaryShowKanji: false,
                rtkEnabled: false,
                kanjivgEnabled: false,
                kanjiOriginsEnabled: false,
                uchisenEnabled: false,
            };

            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.textContent = '切';
            document.body.append(trigger);
            trigger.focus();

            await internals.showKanjiLookupCard(card, '切', '大切です。', trigger);
            const popover = document.querySelector<HTMLElement>('.jpdb-reader-popover')!;
            const closeButton = popover.querySelector<HTMLButtonElement>('[data-jpdb-reader-sheet-close="true"]');

            expect(document.querySelector('.jpdb-reader-backdrop')).toBeNull();
            expect(popover.getAttribute('aria-modal')).toBe('true');
            expect(popover.getAttribute('role')).toBe('dialog');
            expect(document.activeElement).toBe(popover);
            expect(trigger.getAttribute('aria-hidden')).toBe('true');
            expect(popover.classList.contains('jpdb-reader-sheet-sticky')).toBe(true);
            expect(closeButton?.title).toBe('Close drawer');

            closeButton?.click();

            expect(document.querySelector('.jpdb-reader-popover')).toBeNull();
            expect(trigger.getAttribute('aria-hidden')).toBeNull();
            expect(document.activeElement).toBe(trigger);
        } finally {
            runtime.destroy();
            restoreCanvas();
            document.body.replaceChildren();
        }
    });

    it('copies the visible kanji from hosted new-tab kanji popups', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const runtime = new NewTabRuntime();
        const writeText = vi.fn(async () => undefined);
        const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
        const card = newTabTestCard({ spelling: '難波', reading: 'なんば', sentence: '難波です。' });
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            showKanjiLookupCard(card: JPDBCard, kanji: string, sentence?: string): Promise<void>;
        };

        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        });

        try {
            internals.settings = {
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'en',
                popupMode: 'popover',
                jpdbKanjiEnabled: false,
                localDictionariesEnabled: false,
                localDictionaryShowKanji: false,
                rtkEnabled: false,
                kanjivgEnabled: false,
                kanjiOriginsEnabled: false,
                uchisenEnabled: false,
            };

            await internals.showKanjiLookupCard(card, '波', '難波です。');
            document.querySelector<HTMLButtonElement>('[data-action="copy-word"]')?.click();

            await waitForExpect(() => {
                expect(writeText).toHaveBeenCalledWith('波');
                const toast = document.querySelector<HTMLElement>('.jpdb-reader-toast');
                expect(toast?.textContent).toBe('Copied word.');
                expect(toast?.getAttribute('role')).toBe('status');
                expect(toast?.getAttribute('aria-live')).toBe('polite');
            });
        } finally {
            runtime.destroy();
            restoreCanvas();
            if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
            else Reflect.deleteProperty(navigator, 'clipboard');
            document.body.replaceChildren();
        }
    });

    it('dives into hosted popup related vocabulary links and parsed example words', () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({ spelling: '甘言', reading: 'かんげん', sentence: '甘言です。' });
        const related = newTabTestCard({ vid: 77, sid: 88, spelling: '甘言蜜語', reading: 'かんげんみつご', sentence: '甘言蜜語だ。' });
        const lookupText = vi.fn(async () => undefined);
        const showLookupCard = vi.fn(async () => undefined);
        const internals = runtime as unknown as {
            navigation: { updateWord(card: JPDBCard, sentence: string | undefined, trigger: 'modal' | 'hover', mode: 'reset' | 'preserve' | 'push-current'): void };
            parser: { cacheCards(cards: JPDBCard[]): void };
            lookupText: typeof lookupText;
            showLookupCard: typeof showLookupCard;
            installLookupPopoverHandlers(popover: HTMLElement, card: JPDBCard, sentence?: string, anchor?: HTMLElement): void;
        };
        internals.lookupText = lookupText;
        internals.showLookupCard = showLookupCard;
        internals.parser.cacheCards([related]);
        internals.navigation.updateWord(card, card.sentence, 'modal', 'reset');
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = `
            <a class="gloss-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="国家" data-dictionary-reading="こっか" data-dictionary="JPDB">
                <span class="jpdb-reader-word" data-vid="11" data-sid="12" tabindex="-1">国家</span>
            </a>
            <div class="jpdb-reader-example-sentence">
                <span class="jpdb-reader-word" data-vid="${related.vid}" data-sid="${related.sid}" data-sentence="甘言蜜語だ。" tabindex="-1">甘言蜜語</span>
            </div>
            <div class="jpdb-reader-example-sentence">
                <span class="jpdb-reader-word" data-vid="991" data-sid="992" data-sentence="未登録語だ。" tabindex="-1">未登録語</span>
            </div>
        `;
        document.body.append(popover);
        const [dictionaryWord, relatedWord, unknownWord] = Array.from(popover.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        registerRenderedWordPrivateState(dictionaryWord!, { vid: '11', sid: '12' });
        registerRenderedWordPrivateState(
            relatedWord!,
            renderedWordPrivateStateForCard(related, primaryCardState(related.cardState)),
        );
        registerRenderedWordPrivateState(unknownWord!, { vid: '991', sid: '992' });

        try {
            internals.installLookupPopoverHandlers(popover, card, card.sentence);
            popover.querySelector<HTMLElement>('a .jpdb-reader-word')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            popover.querySelector<HTMLElement>('.jpdb-reader-example-sentence .jpdb-reader-word')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            popover.querySelectorAll<HTMLElement>('.jpdb-reader-example-sentence .jpdb-reader-word')[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(lookupText).toHaveBeenCalledWith('国家', 'こっか', popover.querySelector('a'), expect.objectContaining({
                navigation: 'push-current',
                reuseActivePopover: true,
                userGesture: true,
            }));
            expect(showLookupCard).toHaveBeenCalledWith(related, '甘言蜜語だ。', popover.querySelector('.jpdb-reader-example-sentence .jpdb-reader-word'), expect.objectContaining({
                navigation: 'push-current',
                previousNavigationEntry: expect.objectContaining({ kind: 'word', card }),
                reuseActivePopover: true,
                userGesture: true,
            }));
            expect(lookupText).toHaveBeenCalledWith('未登録語', '未登録語', popover.querySelectorAll('.jpdb-reader-example-sentence .jpdb-reader-word')[1], expect.objectContaining({
                navigation: 'push-current',
                previousNavigationEntry: expect.objectContaining({ kind: 'word', card }),
                reuseActivePopover: true,
                userGesture: true,
            }));
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('stacks hosted new-tab lookups over settings without adding a second modal backdrop', () => {
        const runtime = new NewTabRuntime();
        const { lookup, settingsForm, settingsBackdrop, anchor, internals } = mountStackedNewTabLookup(runtime);

        try {
            expectStackedLookupOverSettings({
                lookup,
                settingsForm,
                settingsBackdrop,
                activeLookup: internals.activeLookupPopover,
                activeBackdrop: internals.activeLookupBackdrop,
            });
            expect(settingsForm.getAttribute('aria-hidden')).toBe('true');
            expect(settingsBackdrop.getAttribute('aria-hidden')).toBe('true');
            expect(document.activeElement).toBe(lookup);

            internals.dismissLookupPopover();

            expect(lookup.isConnected).toBe(false);
            expect(settingsForm.getAttribute('aria-hidden')).toBeNull();
            expect(settingsBackdrop.getAttribute('aria-hidden')).toBeNull();
            expect(document.activeElement).toBe(anchor);
            expectSettingsDialogStillMounted({
                settingsForm,
                settingsBackdrop,
                activeDialog: internals.activeDialog,
                activeBackdrop: internals.activeBackdrop,
            });
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('closes a stacked hosted new-tab lookup when tapping outside the popover', async () => {
        const runtime = new NewTabRuntime();
        const { lookup, settingsForm, settingsBackdrop, anchor, internals } = mountStackedNewTabLookup(runtime);

        try {
            internals.installLookupPopoverHandlers(lookup, newTabTestCard({ spelling: '設定', reading: 'せってい' }), undefined, anchor);
            await new Promise(resolve => window.setTimeout(resolve, 0));

            settingsForm.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));

            expect(lookup.isConnected).toBe(false);
            expect(settingsForm.isConnected).toBe(true);
            expect(settingsBackdrop.isConnected).toBe(true);
            expect(internals.activeLookupPopover).toBeUndefined();
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('closes a stacked hosted new-tab lookup from a plain outside click', async () => {
        const runtime = new NewTabRuntime();
        const { lookup, settingsForm, settingsBackdrop, anchor, internals } = mountStackedNewTabLookup(runtime);

        try {
            internals.installLookupPopoverHandlers(lookup, newTabTestCard({ spelling: '設定', reading: 'せってい' }), undefined, anchor);
            await new Promise(resolve => window.setTimeout(resolve, 0));

            settingsForm.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(lookup.isConnected).toBe(false);
            expect(settingsForm.isConnected).toBe(true);
            expect(settingsBackdrop.isConnected).toBe(true);
            expect(internals.activeLookupPopover).toBeUndefined();
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps hosted new-tab lookup controls interactive while outside dismissal is armed', async () => {
        const runtime = new NewTabRuntime();
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'popover' as const };
        const anchor = document.createElement('span');
        anchor.textContent = '設定';
        document.body.append(anchor);
        const showKanjiLookupCard = vi.fn(async () => undefined);
        const internals = runtime as unknown as {
            settings: typeof settings;
            activeLookupPopover?: HTMLElement;
            showKanjiLookupCard: typeof showKanjiLookupCard;
            mountLookupPopover(popover: HTMLElement, anchor?: HTMLElement): void;
            installLookupPopoverHandlers(popover: HTMLElement, card: JPDBCard, sentence?: string, anchor?: HTMLElement): void;
        };
        internals.settings = settings;
        internals.showKanjiLookupCard = showKanjiLookupCard;

        try {
            const lookup = createReaderPopover('よむ', settings);
            lookup.innerHTML = `
                <div class="jpdb-reader-popover-body">
                    <button type="button" data-action="kanji" data-kanji="設">設</button>
                </div>
            `;
            const card = newTabTestCard({ spelling: '設定', reading: 'せってい' });
            const button = lookup.querySelector<HTMLButtonElement>('[data-action="kanji"]')!;
            bindPrivateCommandCapability(button, { kind: 'kanji-lookup', kanji: '設' });
            internals.mountLookupPopover(lookup, anchor);
            internals.installLookupPopoverHandlers(lookup, card, '設定する。', anchor);
            await new Promise(resolve => window.setTimeout(resolve, 0));

            button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
            button.click();

            expect(lookup.isConnected).toBe(true);
            expect(internals.activeLookupPopover).toBe(lookup);
            expect(showKanjiLookupCard).toHaveBeenCalledWith(card, '設', '設定する。', button, expect.objectContaining({
                reuseActivePopover: true,
            }));
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('opens hosted new-tab lookup action pill links through userscript tabs', async () => {
        const runtime = new NewTabRuntime();
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'popover' as const };
        const anchor = document.createElement('span');
        anchor.textContent = '辞書';
        document.body.append(anchor);
        const openInTab = vi.fn();
        vi.stubGlobal('GM_openInTab', openInTab);
        const internals = runtime as unknown as {
            settings: typeof settings;
            mountLookupPopover(popover: HTMLElement, anchor?: HTMLElement): void;
            installLookupPopoverHandlers(popover: HTMLElement, card: JPDBCard, sentence?: string, anchor?: HTMLElement): void;
        };
        internals.settings = settings;

        try {
            const lookup = createReaderPopover('よむ', settings);
            lookup.innerHTML = `
                <div class="jpdb-reader-popover-body">
                    <a class="jpdb-reader-pill jpdb-reader-action-pill" href="https://jiten.moe/search?query=%E8%BE%9E%E6%9B%B8" target="_blank" rel="noopener"><span>Jiten</span></a>
                </div>
            `;
            internals.mountLookupPopover(lookup, anchor);
            internals.installLookupPopoverHandlers(lookup, newTabTestCard({ spelling: '辞書', reading: 'じしょ' }), '辞書を引く。', anchor);

            const label = lookup.querySelector<HTMLElement>('a.jpdb-reader-action-pill span')!;
            const click = new MouseEvent('click', { bubbles: true, cancelable: true });
            label.dispatchEvent(click);

            expect(click.defaultPrevented).toBe(true);
            expect(openInTab).toHaveBeenCalledWith('https://jiten.moe/search?query=%E8%BE%9E%E6%9B%B8', { active: true, insert: true, setParent: false });
            expect(lookup.isConnected).toBe(true);
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('autoplays term audio when a hosted new-tab dictionary word opens', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({ spelling: '月光', reading: 'げっこう', sentence: '月光を見る。' });
        const playTermAudio = vi.fn(async () => undefined);
        const renderData = newTabLookupRenderData();
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                audioEnabled: true,
                autoPlayAudio: true,
                audioAutoPlayMode: 'tap',
            },
        }) as NewTabLookupRuntimeInternals<typeof renderData> & {
            audioActions: { playTermAudio: typeof playTermAudio };
        };

        try {
            internals.audioActions = { playTermAudio };

            await internals.showLookupCard(card, '月光を見る。');

            expect(playTermAudio).toHaveBeenCalledTimes(1);
            expect(playTermAudio).toHaveBeenCalledWith(card);
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('routes the hosted lookup speaker through configured term audio', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({ spelling: '発音', reading: 'はつおん', sentence: '発音を聞く。' });
        const playTermAudio = vi.fn(async () => undefined);
        const playJpdbExampleAudio = vi.fn(async () => undefined);
        const renderData = newTabLookupRenderData();
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                audioEnabled: true,
                autoPlayAudio: false,
            },
        }) as NewTabLookupRuntimeInternals<typeof renderData> & {
            activeLookupPopover?: HTMLElement;
            audioActions: {
                playTermAudio: typeof playTermAudio;
                playJpdbExampleAudio: typeof playJpdbExampleAudio;
            };
            showLookupCard(card: JPDBCard, sentence?: string): Promise<void>;
        };

        try {
            internals.audioActions = { playTermAudio, playJpdbExampleAudio };

            await internals.showLookupCard(card, '発音を聞く。');
            const button = internals.activeLookupPopover?.querySelector<HTMLButtonElement>('[data-action="audio"]');
            expect(button).not.toBeNull();
            button?.click();

            await waitForExpect(() => {
                expect(playTermAudio).toHaveBeenCalledWith(card, { userGesture: true });
            });
            expect(playJpdbExampleAudio).not.toHaveBeenCalled();
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('hides the redundant kana reading in the new-tab lookup header statuses', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({
            spelling: 'よむ',
            reading: 'よむ',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            cardState: ['redundant'],
            frequencyRank: 20200,
        });
        const ankiLookup: AnkiLookupResult = {
            state: 'known',
            notes: [],
            primary: {
                noteId: 88,
                primaryCardId: 8801,
                cardIds: [8801],
                state: 'known',
                deckNames: ['Mining'],
                modelName: 'Yomu',
                fields: {},
                tags: [],
                reps: 12,
                lapses: 0,
            },
        };
        const renderData = newTabLookupRenderData({ ankiLookup });
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                apiKey: 'jpdb-key',
                ankiEnabled: true,
                jpdbMiningEnabled: true,
            },
        });

        try {
            await internals.showLookupCard(card, 'よむ。');

            await vi.waitFor(() => {
                const labels = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-meta > span')).map(item => item.textContent);
                expect(labels).toEqual(['JPDB Redundant', 'Anki Known']);
            });
            expect(document.querySelector<HTMLElement>('[data-newtab-lookup-reading]')).toBeNull();
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('hides new-tab lookup Anki status when Anki mining is disabled', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({
            spelling: 'よむ',
            reading: 'よむ',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            cardState: ['redundant'],
            frequencyRank: 20200,
        });
        const ankiLookup: AnkiLookupResult = {
            state: 'known',
            notes: [],
            primary: {
                noteId: 88,
                primaryCardId: 8801,
                cardIds: [8801],
                state: 'known',
                deckNames: ['Mining'],
                modelName: 'Yomu',
                fields: {},
                tags: [],
                reps: 12,
                lapses: 0,
            },
        };
        const renderData = newTabLookupRenderData({ ankiLookup });
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                apiKey: 'jpdb-key',
                ankiEnabled: false,
                ankiSectionEnabled: true,
                jpdbMiningEnabled: true,
            },
        });

        try {
            await internals.showLookupCard(card, 'よむ。');

            await vi.waitFor(() => {
                const labels = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-meta > span')).map(item => item.textContent);
                expect(labels).toEqual(['JPDB Redundant']);
            });
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('hides new-tab lookup grade controls when there is no real review target', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({
            spelling: '辞書',
            reading: 'じしょ',
            source: 'local',
            reviewSource: 'dictionary',
        });
        const renderData = newTabLookupRenderData({
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null } satisfies AnkiLookupResult,
        });
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                enableReviews: true,
                twoButtonReviews: true,
                jpdbMiningEnabled: true,
                ankiEnabled: false,
                yomuLocalSrsEnabled: false,
            },
            isJpdbBackedCard: () => false,
        }) as NewTabLookupRuntimeInternals<typeof renderData> & {
            newTab: {
                lookupGradeOptions(card: JPDBCard): Array<['fail' | 'pass', string]>;
                lookupReviewTargets(card: JPDBCard): [];
                destroy(): void;
            };
        };

        try {
            internals.newTab = {
                lookupGradeOptions: () => [['fail', 'Fail'], ['pass', 'Pass']],
                lookupReviewTargets: () => [],
                destroy: vi.fn(),
            };

            await internals.showLookupCard(card, '辞書を引く。');

            expect(document.querySelector('[data-grade]')).toBeNull();
            expect(document.querySelector('[data-newtab-grade-target-text]')).toBeNull();
            expect(document.querySelector('[data-review-target-gutter]')).toBeNull();
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('labels new-tab lookup grade buttons with the active review target', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({
            spelling: '復習',
            reading: 'ふくしゅう',
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 404,
        });
        const renderData = newTabLookupRenderData({
            ankiLookup: ankiLookupResult('due', [ankiLookupNote({
                cardIds: [404],
                primaryCardId: 404,
                state: 'due',
                renderedCards: [{ cardId: 404, deckName: 'Core', question: '復習', answer: 'review' }],
            })]),
        });
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                enableReviews: true,
                twoButtonReviews: true,
                ankiEnabled: true,
                ankiSectionEnabled: true,
                yomuLocalSrsEnabled: false,
            },
            isJpdbBackedCard: () => false,
        }) as NewTabLookupRuntimeInternals<typeof renderData> & {
            newTab: {
                lookupGradeOptions(card: JPDBCard): Array<['fail' | 'pass', string]>;
                lookupReviewTargets(card: JPDBCard): Array<{ id: string; kind: 'jpdb' | 'anki'; label: string; shortLabel: string; ankiCardId?: number }>;
                destroy(): void;
            };
        };

        try {
            internals.newTab = {
                lookupGradeOptions: () => [['fail', 'Fail'], ['pass', 'Pass']],
                lookupReviewTargets: () => [{ id: 'anki:404', kind: 'anki', label: 'Grades Anki card: Core #404', shortLabel: 'Anki #404', ankiCardId: 404 }],
                destroy: vi.fn(),
            };

            await internals.showLookupCard(card, '復習します。');

            await vi.waitFor(() => {
                const pass = document.querySelector<HTMLButtonElement>('[data-grade="pass"]');
                expect(document.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades Anki card: Core #404');
                expect(document.querySelector('[data-newtab-grade-target-chip]')).toBeNull();
                expect(pass?.dataset.newtabReviewTarget).toBe('anki');
                expect(pass?.dataset.ankiCardId).toBe('404');
                expect(pass?.getAttribute('aria-label')).toBe('Pass: Grades Anki card: Core #404');
                expect(pass?.title).toBe('Grades Anki card: Core #404');
            });
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('closes hosted lookup popovers after a successful new-tab grade', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({
            spelling: '復習',
            reading: 'ふくしゅう',
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 404,
        });
        const gradeFromLookup = vi.fn(async () => ({ preserveLookup: false }));
        const renderData = newTabLookupRenderData({
            ankiLookup: ankiLookupResult('due', [ankiLookupNote({
                cardIds: [404],
                primaryCardId: 404,
                state: 'due',
                renderedCards: [{ cardId: 404, deckName: 'Core', question: '復習', answer: 'review' }],
            })]),
        });
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                enableReviews: true,
                twoButtonReviews: true,
                ankiEnabled: true,
                ankiSectionEnabled: true,
                yomuLocalSrsEnabled: false,
            },
            isJpdbBackedCard: () => false,
        }) as NewTabLookupRuntimeInternals<typeof renderData> & {
            activeLookupPopover?: HTMLElement;
            newTab: {
                lookupGradeOptions(card: JPDBCard): Array<['fail' | 'pass', string]>;
                lookupReviewTargets(card: JPDBCard): Array<{ id: string; kind: 'jpdb' | 'anki'; label: string; shortLabel: string; ankiCardId?: number }>;
                gradeFromLookup: typeof gradeFromLookup;
                destroy(): void;
            };
        };

        try {
            internals.newTab = {
                lookupGradeOptions: () => [['fail', 'Fail'], ['pass', 'Pass']],
                lookupReviewTargets: () => [{ id: 'anki:404', kind: 'anki', label: 'Grades Anki card: Core #404', shortLabel: 'Anki #404', ankiCardId: 404 }],
                gradeFromLookup,
                destroy: vi.fn(),
            };

            await internals.showLookupCard(card, '復習します。');
            const pass = document.querySelector<HTMLButtonElement>('[data-grade="pass"]')!;
            pass.click();

            await waitForExpect(() => {
                expect(gradeFromLookup).toHaveBeenCalledWith('pass', { kind: 'anki', ankiCardId: 404 }, card);
                expect(document.querySelector('.jpdb-reader-popover')).toBeNull();
                expect(internals.activeLookupPopover).toBeUndefined();
            });
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('renders separate lookup grade targets for JPDB and multiple Anki cards', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            ankiCardId: 404,
            ankiDeckNames: ['Core'],
            ankiRenderedCards: [
                { cardId: 404, deckName: 'Core', question: '日本語', answer: 'Japanese' },
                { cardId: 405, deckName: 'Core', question: 'Japanese', answer: '日本語' },
            ],
        });
        const renderData = newTabLookupRenderData({
            ankiLookup: ankiLookupResult('due', [ankiLookupNote({
                cardIds: [404, 405],
                primaryCardId: 404,
                state: 'due',
                renderedCards: [
                    { cardId: 404, deckName: 'Core', question: '日本語', answer: 'Japanese' },
                    { cardId: 405, deckName: 'Core', question: 'Japanese', answer: '日本語' },
                ],
            })]),
        });
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                apiKey: 'jpdb-key',
                enableReviews: true,
                twoButtonReviews: true,
                ankiEnabled: true,
                ankiSectionEnabled: true,
                jpdbMiningEnabled: true,
                yomuLocalSrsEnabled: false,
            },
        }) as NewTabLookupRuntimeInternals<typeof renderData> & {
            newTab: {
                lookupGradeOptions(card: JPDBCard): Array<['fail' | 'pass', string]>;
                lookupReviewTargets(card: JPDBCard): Array<{ id: string; kind: 'jpdb' | 'anki'; label: string; shortLabel: string; ankiCardId?: number }>;
                destroy(): void;
            };
        };

        try {
            internals.newTab = {
                lookupGradeOptions: () => [['fail', 'Fail'], ['pass', 'Pass']],
                lookupReviewTargets: () => [
                    { id: 'jpdb', kind: 'jpdb', label: 'Grades JPDB', shortLabel: 'JPDB' },
                    { id: 'anki:404', kind: 'anki', label: 'Grades Anki card: Core #404', shortLabel: 'Anki #404', ankiCardId: 404 },
                    { id: 'anki:405', kind: 'anki', label: 'Grades Anki card: Core #405', shortLabel: 'Core #405', ankiCardId: 405 },
                ],
                destroy: vi.fn(),
            };

            await internals.showLookupCard(card, '日本語を読みます。');

            await vi.waitFor(() => {
                const popover = document.querySelector<HTMLElement>('.jpdb-reader-popover')!;
                expect(document.querySelector('[data-review-target-gutter]')).not.toBeNull();
                expect(document.querySelector('[data-review-target-current]')?.textContent).toBe('Both');
                expect(document.querySelector<HTMLSelectElement>('[data-review-target-select]')?.selectedOptions[0]?.textContent).toBe('Both');
                expect(Array.from(popover.querySelectorAll('[data-newtab-grade-target-text]'), element => element.textContent)).toEqual(['Grades JPDB + Anki card: Core #404']);
                expect(document.querySelectorAll('[data-newtab-grade-target-chip]')).toHaveLength(0);
            });

            const select = document.querySelector<HTMLSelectElement>('[data-review-target-select]')!;
            expect(Array.from(select.options, option => option.textContent)).toEqual(['Both', 'JPDB', 'Core #404', 'Core #405']);
            expect(document.querySelectorAll<HTMLButtonElement>('[data-action="grade"][data-grade]')).toHaveLength(2);
            expect(Array.from(document.querySelectorAll<HTMLButtonElement>('[data-newtab-review-target="both"][data-grade]')).map(button => button.textContent)).toEqual(['Fail', 'Pass']);

            select.value = 'anki:405';
            select.dispatchEvent(new Event('change', { bubbles: true }));

            const pass = document.querySelector<HTMLButtonElement>('[data-grade="pass"]')!;
            expect(document.querySelector('[data-review-target-current]')?.textContent).toBe('Core #405');
            expect(document.querySelector('.jpdb-reader-popover [data-newtab-grade-target-text]')?.textContent).toBe('Grades Anki card: Core #405');
            expect(pass.dataset.newtabReviewTarget).toBe('anki');
            expect(pass.dataset.ankiCardId).toBe('405');
            expect(pass.getAttribute('aria-label')).toBe('Pass: Grades Anki card: Core #405');
            expect(pass.title).toBe('Grades Anki card: Core #405');
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('submits a lookup-selected Anki target without grading the merged JPDB card', async () => {
        const card = jpdbAnkiDuplicateReviewCard();
        const reviewCard = vi.fn(async () => {});
        const answerCard = vi.fn(async () => {});
        const onAnkiStatusChanged = vi.fn();
        const refreshedLookup = ankiLookupResult('known', [
            ankiLookupNote({
                noteId: 777,
                cardIds: [404, 405],
                primaryCardId: 405,
                renderedCards: [{ cardId: 405, deckName: 'Core', question: 'Japanese', answer: '日本語' }],
            }),
        ]);
        const findExistingCards = vi.fn(async () => refreshedLookup);
        const { controller, root } = newTabAutoReviewWordFixture({
            card,
            answerCard,
            reviewCard,
            findExistingCards,
            onAnkiStatusChanged,
        });

        try {
            const result = await controller.gradeFromLookup('okay', { kind: 'anki', ankiCardId: 405 });

            expect(result).toEqual({ preserveLookup: false });
            expect(answerCard).toHaveBeenCalledWith(405, 'okay');
            expect(findExistingCards).toHaveBeenCalledWith(card);
            expect(onAnkiStatusChanged).toHaveBeenCalledWith(card);
            expect(reviewCard).not.toHaveBeenCalled();
            expect(card.cardState).toEqual(['known']);
            expect(card.ankiCardId).toBe(405);
            expect(card.ankiNoteId).toBe(777);
            expect(card.ankiReps).toBe(3);
            expect(card.ankiRenderedCards).toEqual([{ cardId: 405, deckName: 'Core', question: 'Japanese', answer: '日本語' }]);
        } finally {
            root.remove();
        }
    });

    it('closes new-tab lookup popovers after shared card-action review buttons grade successfully', async () => {
        const runtime = new NewTabRuntime();
        const card = jpdbAnkiDuplicateReviewCard();
        const popover = document.createElement('div');
        const backdrop = document.createElement('div');
        const button = document.createElement('button');
        const perform = vi.fn(async () => true);
        const showLookupCard = vi.fn();
        const internals = runtime as unknown as {
            activeLookupPopover?: HTMLElement;
            activeLookupBackdrop?: HTMLElement;
            cardActions: { perform: typeof perform };
            showLookupCard: typeof showLookupCard;
            handleCardAction(button: HTMLButtonElement, card: JPDBCard, sentence?: string, anchor?: HTMLElement): Promise<void>;
        };
        button.dataset.action = 'grade';
        button.dataset.grade = 'easy';
        const command = { kind: 'card-action', action: 'grade', grade: 'easy' } as const;
        bindPrivateCommandCapability(button, command);
        document.body.append(backdrop, popover);
        internals.activeLookupPopover = popover;
        internals.activeLookupBackdrop = backdrop;
        internals.cardActions = { perform };
        internals.showLookupCard = showLookupCard;

        try {
            await internals.handleCardAction(button, card, '日本語を読む。');

            expect(perform).toHaveBeenCalledWith(command, button, card, '日本語を読む。');
            expect(showLookupCard).not.toHaveBeenCalled();
            expect(popover.isConnected).toBe(false);
            expect(backdrop.isConnected).toBe(false);
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps the explicitly graded duplicate Anki card after refreshed details choose another primary', async () => {
        const card = jpdbAnkiDuplicateReviewCard({
            ankiRenderedCards: [
                { cardId: 404, deckName: 'Core', question: '日本語', answer: 'Japanese' },
                { cardId: 405, deckName: 'Reverse', question: 'Japanese', answer: '日本語' },
            ],
        });
        const reviewCard = vi.fn(async () => {});
        const answerCard = vi.fn(async () => {});
        const refreshedLookup = ankiLookupResult('due', [
            ankiLookupNote({
                cardIds: [404],
                primaryCardId: 404,
                state: 'due',
            }),
            ankiLookupNote({
                noteId: 888,
                modelName: 'Reverse',
                deckNames: ['Reverse'],
                cardIds: [405],
                primaryCardId: 405,
                state: 'known',
                fields: { Expression: '日本語', Meaning: 'Japanese language', Audio: '[sound:reverse-front.mp3]' },
                renderedCards: [{
                    cardId: 405,
                    deckName: 'Reverse',
                    question: '<img src="front.png" alt="">Japanese [anki:play:q:0]',
                    answer: '日本語',
                    mediaDataUrls: { 'front.png': 'data:image/png;base64,front-data' },
                }],
                reps: 9,
                lapses: 1,
            }),
        ]);
        const findExistingCards = vi.fn(async () => refreshedLookup);
        const { controller, root } = newTabAutoReviewWordFixture({
            card,
            answerCard,
            reviewCard,
            findExistingCards,
        });

        try {
            const result = await controller.gradeFromLookup('okay', { kind: 'anki', ankiCardId: 405 });

            expect(result).toEqual({ preserveLookup: false });
            expect(answerCard).toHaveBeenCalledWith(405, 'okay');
            expect(reviewCard).not.toHaveBeenCalled();
            expect(card.cardState).toEqual(['known']);
            expect(card.ankiCardId).toBe(405);
            expect(card.ankiNoteId).toBe(888);
            expect(card.ankiDeckNames).toEqual(['Reverse']);
            expect(card.ankiReps).toBe(9);
            expect(card.ankiLapses).toBe(1);
            expect(card.ankiRenderedCards?.map(rendered => rendered.cardId)).toEqual([405]);
            expect((card.ankiRenderedCards?.[0] as { mediaDataUrls?: Record<string, string> } | undefined)?.mediaDataUrls)
                .toEqual({ 'front.png': 'data:image/png;base64,front-data' });
            expect(card.ankiAudioFilenames).toEqual(['reverse-front.mp3']);
        } finally {
            root.remove();
        }
    });

    it('rejects a lookup-selected Anki target that is not one of the rendered review targets', async () => {
        const card = newTabTestCard({
            vid: 251,
            sid: 1,
            rid: 2,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            ankiCardId: 404,
            ankiDeckNames: ['Core'],
        });
        const reviewCard = vi.fn(async () => {});
        const answerCard = vi.fn(async () => {});
        const { controller, root } = newTabAutoReviewWordFixture({
            card,
            answerCard,
            reviewCard,
        });

        try {
            const result = await controller.gradeFromLookup('okay', { kind: 'anki', ankiCardId: 405 });

            expect(result).toEqual({ preserveLookup: true });
            expect(answerCard).not.toHaveBeenCalled();
            expect(reviewCard).not.toHaveBeenCalled();
            await waitForExpect(() => {
                expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('Could not submit grade.');
            });
        } finally {
            root.remove();
        }
    });

    it('shows new-tab word detail JPDB status only when a JPDB API key exists', () => {
        let apiKey = '';
        const detail = {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: {
                state: 'due',
                notes: [],
                primary: {
                    noteId: 55,
                    primaryCardId: 5501,
                    cardIds: [5501],
                    state: 'due',
                    deckNames: ['Mining'],
                    modelName: 'Yomu',
                    fields: {},
                    tags: [],
                    reps: 2,
                    lapses: 0,
                },
            } satisfies AnkiLookupResult,
            jpdbVocabularyInfo: null,
        };
        const card = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            cardState: ['not-in-deck'],
            frequencyRank: 250,
        });
        const metaItems = () => searchWordMetaItems(card, 'not-in-deck', detail, {
            ...DEFAULT_SETTINGS,
            apiKey,
            ankiEnabled: true,
            immersionKitEnabled: false,
        }).map(item => {
            const element = document.createElement('div');
            element.innerHTML = item;
            return element.textContent ?? '';
        });

        expect(metaItems()).toEqual(['Anki Due']);

        apiKey = 'jpdb-key';
        expect(metaItems()).toEqual(['JPDB Not in deck', 'Anki Due']);
    });

    it('does not show Add to Anki while a new-tab lookup Anki miss is untrusted', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({
            spelling: '未確認',
            reading: 'みかくにん',
            source: 'jpdb',
            cardState: ['not-in-deck'],
        });
        const untrustedLookup: AnkiLookupResult = {
            state: 'not-in-deck',
            notes: [],
            primary: null,
            trusted: false,
        };
        const renderData = newTabLookupRenderData({ ankiLookup: untrustedLookup });
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: { ankiEnabled: true },
        });

        try {
            await internals.showLookupCard(card, '未確認。');

            await vi.waitFor(() => expect(document.querySelector('.jpdb-reader-popover')).not.toBeNull());
            expect(document.querySelector('[data-action="anki"]')).toBeNull();
            expect(Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-meta > span')).map(item => item.textContent)).not.toContain('Checking Anki...');
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('hides new-tab lookup JPDB status without a JPDB API key even for JPDB review cards', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({
            spelling: '復習',
            reading: 'ふくしゅう',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            cardState: ['due'],
            frequencyRank: 640,
        });
        const renderData = newTabLookupRenderData({
            ankiLookup: { state: 'due', notes: [], primary: null } satisfies AnkiLookupResult,
        });
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                apiKey: '',
                ankiEnabled: true,
                ankiSectionEnabled: true,
            },
        });

        try {
            await internals.showLookupCard(card, '復習します。');

            await vi.waitFor(() => expect(document.querySelector('.jpdb-reader-popover')).not.toBeNull());
            const labels = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-meta > span')).map(item => item.textContent);
            expect(labels).toEqual(['Anki Due']);
            expect(document.querySelector('.jpdb-reader-meta .jpdb-reader-state-dot.jpdb-due')).toBeNull();
            expect(document.querySelector('.jpdb-reader-meta .jpdb-reader-state-dot.anki-due')).not.toBeNull();
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('renders fast Anki status in new-tab lookup popovers before detailed hydration finishes', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({
            spelling: '動画',
            reading: 'どうが',
            source: 'jpdb',
            cardState: ['not-in-deck'],
        });
        const fastStatus = deferred<AnkiLookupResult>();
        const all = deferred<{
            localEntries: [];
            kanjiEntries: [];
            metaEntries: [];
            ankiLookup: AnkiLookupResult;
            jpdbDecks: [];
            ankiDecks: [];
            jpdbVocabularyInfo: null;
        }>();
        const cachedLookup: AnkiLookupResult = {
            state: 'known',
            notes: [],
            primary: {
                noteId: 55,
                primaryCardId: 7701,
                cardIds: [7701],
                state: 'known',
                deckNames: ['Anime::Mining'],
                modelName: 'Imported Core',
                fields: {},
                tags: [],
                reps: 14,
                lapses: 1,
            },
        };
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            cardRenderData: {
                load(): {
                    localEntries: Promise<[]>;
                    localMetaEntries: Promise<[]>;
                    ankiLookup: Promise<AnkiLookupResult>;
                    hydrateAnkiLookup: () => Promise<AnkiLookupResult>;
                    all: typeof all.promise;
                };
            };
            parser: { canParse(): boolean; isJpdbBackedCard(card: JPDBCard): boolean };
            showLookupCard(card: JPDBCard, sentence?: string): Promise<void>;
        };

        try {
            internals.settings = {
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                jpdbMiningEnabled: true,
                popupMode: 'popover',
                localDictionariesEnabled: false,
                immersionKitEnabled: false,
            };
            internals.cardRenderData = {
                load: () => ({
                    localEntries: Promise.resolve([]),
                    localMetaEntries: Promise.resolve([]),
                    ankiLookup: fastStatus.promise,
                    hydrateAnkiLookup: () => Promise.resolve(cachedLookup),
                    all: all.promise,
                }),
            };
            internals.parser = {
                canParse: () => false,
                isJpdbBackedCard: () => true,
            };

            await internals.showLookupCard(card, '動画を見る。');

            fastStatus.resolve(cachedLookup);
            await vi.waitFor(() => expect(document.querySelector('.jpdb-reader-meta')?.textContent).toContain('Anki Known'));

            expect(document.querySelector('[data-action="anki"]')).toBeNull();
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps the user gesture attached to hosted new-tab dictionary autoplay', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({ spelling: '月光', reading: 'げっこう', sentence: '月光を見る。' });
        const playTermAudio = vi.fn(async () => undefined);
        const renderData = newTabLookupRenderData();
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                audioEnabled: true,
                autoPlayAudio: true,
                audioAutoPlayMode: 'tap',
            },
        }) as NewTabLookupRuntimeInternals<typeof renderData> & {
            audioActions: { playTermAudio: typeof playTermAudio };
            showLookupCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options?: { userGesture?: boolean }): Promise<void>;
        };

        try {
            internals.audioActions = { playTermAudio };

            await internals.showLookupCard(card, '月光を見る。', undefined, { userGesture: true });

            expect(playTermAudio).toHaveBeenCalledTimes(1);
            expect(playTermAudio).toHaveBeenCalledWith(card, { userGesture: true });
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('preloads the current hosted new-tab dictionary word even when autoplay is off', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({ spelling: '静寂', reading: 'せいじゃく', sentence: '静寂が好き。' });
        const preload = vi.fn();
        const renderData = newTabLookupRenderData();
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                audioEnabled: true,
                autoPlayAudio: false,
            },
        }) as NewTabLookupRuntimeInternals<typeof renderData> & {
            audio: { preload: typeof preload };
            showLookupCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options?: { autoPlay?: boolean }): Promise<void>;
        };

        try {
            internals.audio = { preload };

            await internals.showLookupCard(card, '静寂が好き。', undefined, { autoPlay: false });

            expect(preload).toHaveBeenCalledWith(card, { sourceLimit: 1, candidateLimit: 1, prepareAudio: true });
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('falls back to text lookup for nested kanji buttons without a kanji-card handler', () => {
        const lookupText = vi.fn();
        const card = newTabTestCard({ spelling: '付', reading: 'つく', sentence: '付く。' });
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
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.innerHTML = '<section data-newtab-study><button type="button" data-action="kanji" data-kanji="寸">寸</button></section>';
        Object.assign(controller as unknown as { visibleWords: JPDBCard[]; index: number }, {
            visibleWords: [card],
            index: 0,
        });
        const button = root.querySelector<HTMLButtonElement>('button')!;
        bindPrivateCommandCapability(button, { kind: 'kanji-lookup', kanji: '寸' });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(lookupText).toHaveBeenCalledWith('寸', '寸', button, expect.objectContaining({
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        }));
    });
});
