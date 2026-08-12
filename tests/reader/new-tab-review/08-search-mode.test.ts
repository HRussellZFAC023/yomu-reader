import { describe, expect, it, vi } from 'vitest';
import {
    registerNewTabReviewCleanup,
    DEFAULT_SETTINGS,
    newTabTestCard,
    deferred,
    newTabFallbackCardFromText,
    newTabPromptController,
    createNewTabKanjiFrontFixture,
    newTabBareController,
    newTabEmptyDictionarySummary,
    renderBoundNewTabSearchRoot,
    renderPerformedNewTabSearch,
    newTabPromptText,
    createDictionarySearchModeFixture,
    newTabSearchInput,
    newTabSearchResultsText,
    newTabSearchResultExpression,
    newTabSearchAutocompleteText,
    stubKanjiDoodleBrowserApis,
    cardKey,
    NewTabController,
    renderSearchWordResults,
    searchWordDetailHtml,
    searchWordSummaryMeta,
    KANJI_DOODLE_CLEAR_EVENT,
    waitForExpect,
} from './fixtures';
import type {
    NewTabSearchModeApi,
    ImmersionKitExample,
    NewTabSearchDetailViewContext,
    NewTabSearchWordDetailData,
    JPDBCard,
} from './fixtures';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../../src/reader/languages/active';
import { privateCommandAttributes } from '../../../src/reader/dom/private-command-capabilities';

describe('new tab review — search mode', () => {
    registerNewTabReviewCleanup();


    it('searches words and kanji from the new-tab search mode', async () => {
        const lookupText = vi.fn();
        const showKanjiCard = vi.fn();
        const localEntry = {
            expression: '読む',
            reading: 'よむ',
            glossary: ['to read'],
            score: 10,
            dictionary: 'Local',
        };
        const relatedEntry = {
            expression: '読書',
            reading: 'どくしょ',
            glossary: ['reading books'],
            score: 4,
            dictionary: 'Local',
        };
        const parser = {
            parse: vi.fn(async () => [[{
                card: newTabTestCard({ vid: 2, sid: 2, spelling: '読む', reading: 'よむ', source: 'jpdb', sentence: '読む' }),
                start: 0,
                end: 2,
                length: 2,
                rubies: [],
                pitchClass: '',
                sentence: '読む',
            }]]),
            localCardFromEntry: vi.fn(entry => newTabTestCard({
                vid: entry.expression.charCodeAt(0),
                sid: entry.expression.charCodeAt(0),
                spelling: entry.expression,
                reading: entry.reading,
                meanings: [{ glosses: entry.glossary, partOfSpeech: [] }],
                source: 'local',
            })),
            fallbackCardFromText: vi.fn(text => newTabTestCard({
                vid: text.charCodeAt(0),
                sid: text.charCodeAt(0),
                spelling: text,
                reading: text,
                meanings: [],
                source: 'fallback',
            })),
        };
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {
                lookup: vi.fn(async () => ({
                    kanji: '読',
                    keyword: 'read',
                    meanings: ['read'],
                    readings: [{ reading: 'ドク', type: 'on' }],
                    components: [],
                    vocabulary: [],
                    frequencyRank: null,
                })),
            } as never,
            kanjiVG: { lookup: vi.fn(async () => null) } as never,
            rtk: { lookup: vi.fn(async () => null) } as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: parser as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: [{ title: 'Local', alias: 'Local', enabled: true, priority: 0 }], terms: 2, kanji: 1, termMeta: 0, kanjiMeta: 0 })),
                lookup: vi.fn(async () => [localEntry]),
                findTermMatches: vi.fn(async () => []),
                lookupKanji: vi.fn(async () => [{ character: '読', onyomi: ['ドク'], kunyomi: ['よ.む'], tags: [], meanings: ['read'], dictionary: 'Kanji Local' }]),
                lookupSimilarTermsByKanji: vi.fn(async () => [relatedEntry]),
            } as never,
            lookupText,
            showKanjiCard,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderPerformedNewTabSearch(controller, '読む', 'dictionary');

        await waitForExpect(() => {
            expect(root.querySelector('[data-newtab-search-results]')?.textContent).toContain('Words');
            expect(root.querySelector('[data-newtab-search-results]')?.textContent).toContain('Kanji');
            expect(root.querySelector('[data-newtab-search-results]')?.textContent).toContain('読む');
        });

        root.querySelector<HTMLButtonElement>('[data-newtab-action="search-result-word"]')?.click();
        await waitForExpect(() => {
            const detail = Array.from(root.querySelectorAll<HTMLElement>('[data-newtab-search-detail]'))
                .find(element => !element.hidden)?.textContent ?? '';
            expect(detail).toContain('Local');
            expect(detail).toContain('to read');
            expect(detail).toContain('Kanji Local');
            expect(detail).toContain('read');
        });
        expect(lookupText).not.toHaveBeenCalled();

        root.querySelector<HTMLButtonElement>('[data-newtab-action="search-result-kanji"]')?.click();
        await waitForExpect(() => {
            const details = Array.from(root.querySelectorAll('[data-newtab-search-detail]')).map(node => node.textContent ?? '').join('\n');
            expect(details).toContain('JPDB');
            expect(details).toContain('read');
        });
        expect(showKanjiCard).not.toHaveBeenCalled();
        root.remove();
    });

    it('loads enabled JPDB definitions in keyless search detail', async () => {
        const card = newTabTestCard({
            vid: 1579110,
            sid: 0,
            spelling: '今日',
            reading: 'きょう',
            meanings: [{ glosses: ['today'], partOfSpeech: ['noun'] }],
            source: 'jpdb',
        });
        const lookup = vi.fn(async () => ({
            meanings: ['today; this day'],
            compounds: [],
            usedInVocabulary: [],
            examples: [],
        }));
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: false,
                immersionKitEnabled: false,
                jpdbDefinitionsEnabled: true,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup, search: vi.fn(async () => [card]) },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderPerformedNewTabSearch(controller, '今日');

        try {
            await waitForExpect(() => {
                expect(root.querySelector('[data-newtab-action="search-result-word"]')).not.toBeNull();
            });
            root.querySelector<HTMLButtonElement>('[data-newtab-action="search-result-word"]')?.click();
            await waitForExpect(() => {
                expect(lookup).toHaveBeenCalledWith(1579110, '今日', 'きょう');
                const detail = root.querySelector<HTMLElement>('[data-newtab-search-detail]:not([hidden])')?.textContent ?? '';
                expect(detail).toContain('JPDB');
                expect(detail).toContain('today');
            });
        } finally {
            root.remove();
        }
    });

    it('renders standalone search result terms with ruby from card readings', async () => {
        const publicCards = [
            newTabTestCard({
                vid: 2414420,
                sid: 0,
                spelling: '好',
                reading: 'こう',
                meanings: [{ glosses: ['good'], partOfSpeech: [] }],
                source: 'jpdb',
            }),
            newTabTestCard({
                vid: 1605820,
                sid: 0,
                spelling: '好い',
                reading: 'よい',
                meanings: [{ glosses: ['good; excellent'], partOfSpeech: [] }],
                source: 'jpdb',
            }),
        ];
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: false, immersionKitEnabled: false, furiganaMode: 'all' }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: vi.fn(async () => publicCards) },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderPerformedNewTabSearch(controller, '好', 'dictionary');

        try {
            await waitForExpect(() => {
                const terms = Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-search-term'));
                expect(terms).toHaveLength(2);
                expect(terms[0]?.querySelector('rt')?.textContent).toBe('こう');
                expect(terms[1]?.querySelector('rt')?.textContent).toBe('よ');
                expect(terms[1]?.textContent).toContain('い');
            });
        } finally {
            root.remove();
        }
    });

    it('omits duplicate search result readings already visible as ruby', () => {
        const context = {
            language: 'en' as const,
            settings: { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' as const },
            text: (key: 'words' | 'kanji' | 'dictionary') => key,
        };
        const card = newTabTestCard({
            vid: 32900,
            sid: 0,
            spelling: '学習能力',
            reading: 'がくしゅうのうりょく',
            frequencyRank: 32900,
            meanings: [{ glosses: ['learning ability'], partOfSpeech: ['noun'] }],
            cardState: ['not-in-deck'],
            source: 'jpdb',
        });

        expect(searchWordSummaryMeta(card, context)).toEqual([]);
    });

    it('keeps search result readings in ruby when page furigana is disabled', () => {
        const context = {
            language: 'en' as const,
            settings: { ...DEFAULT_SETTINGS, showFurigana: false, furiganaMode: 'off' as const },
            text: (key: 'words' | 'kanji' | 'dictionary') => key,
        };
        const card = newTabTestCard({
            spelling: '学習能力',
            reading: 'がくしゅうのうりょく',
            frequencyRank: 32900,
            cardState: ['not-in-deck'],
            source: 'jpdb',
        });

        const root = renderSearchWordResults([card], context);
        expect(searchWordSummaryMeta(card, context)).toEqual([]);
        expect(root.querySelector('rt.jpdb-reader-furi')?.textContent).toBe('がくしゅうのうりょく');
    });

    it('hydrates pitch classes for 学習能力 search result cards after public pitch resolves', async () => {
        const searchCard = newTabTestCard({
            vid: 1932050,
            sid: 0,
            spelling: '学習能力',
            reading: 'がくしゅうのうりょく',
            meanings: [{ glosses: ['learning ability'], partOfSpeech: [] }],
            frequencyRank: 32900,
            pitchAccent: [],
            source: 'jpdb',
        });
        const publicSearch = vi.fn(async () => [searchCard]);
        const publicPitch = vi.fn(async () => ['LHHHHHHHH']);
        const parseContent = vi.fn(async () => undefined);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                localDictionariesEnabled: false,
                immersionKitEnabled: false,
                furiganaMode: 'all',
                showPitchAccent: true,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbPublicPitch: { lookup: publicPitch },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {} as never,
            parseContent,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderPerformedNewTabSearch(controller, '学習能力');

        try {
            await waitForExpect(() => {
                const word = root.querySelector<HTMLElement>('[data-newtab-action="search-result-word"] .jpdb-reader-word[data-expression="学習能力"]');
                expect(word).not.toBeNull();
                expect(word?.dataset.pitchClass).toBe('heiban');
                expect(word?.classList.contains('jpdb-pitch-heiban')).toBe(true);
                expect(word?.querySelector('rt')?.textContent).toBe('がくしゅうのうりょく');
            });

            expect(publicPitch).toHaveBeenCalledWith('学習能力', 'がくしゅうのうりょく');
            expect(parseContent).toHaveBeenCalled();
            expect(root.querySelector('.jpdb-reader-newtab-search-suggestion-term.jpdb-reader-parseable')?.textContent).toBe('学習能力');
            expect(Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-search-kanji-card'))
                .map(card => card.querySelector('.jpdb-reader-newtab-search-kanji-char')?.textContent)).toEqual(['学', '習', '能', '力']);
            expect(Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-search-kanji-card .jpdb-reader-newtab-search-meta'))
                .map(meta => meta.textContent ?? '').join('\n')).not.toContain('学習能力');
        } finally {
            root.remove();
        }
    });

    it('preserves parsed Japanese chrome button actions instead of treating inner words as search terms', () => {
        const showSettings = vi.fn();
        const lookupText = vi.fn();
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'ja',
                apiKey: '',
                localDictionariesEnabled: false,
                immersionKitEnabled: false,
                furiganaMode: 'all',
                showPitchAccent: true,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: { fallbackCardFromText: vi.fn(newTabFallbackCardFromText) } as never,
            dictionaries: {} as never,
            lookupText,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings,
            dismiss: vi.fn(),
        });
        const root = renderBoundNewTabSearchRoot(controller);

        try {
            const button = root.querySelector<HTMLButtonElement>('button[data-newtab-action="settings"]')!;
            button.innerHTML = '<span class="jpdb-reader-word jpdb-reader-passive-word jpdb-pitch-heiban" data-jpdb-reader-passive="true" data-expression="統計" data-reading="とうけい">設定</span>';
            button.querySelector<HTMLElement>('.jpdb-reader-word')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(showSettings).toHaveBeenCalledWith('api');
            expect(lookupText).not.toHaveBeenCalled();
            expect(root.querySelector<HTMLInputElement>('[data-newtab-search-input]')?.value).toBe('');
        } finally {
            root.remove();
        }
    });

    it('hydrates Kanji Immersion Kit inside expanded standalone search kanji details', async () => {
        const example: ImmersionKitExample = {
            id: 'ik-like',
            sentence: '好きを集める。',
            sentenceWithFurigana: '',
            translation: 'Collect what you like.',
            sourceTitle: 'Standalone Search',
            titleSlug: 'standalone-search',
            category: 'anime',
            soundFile: '',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        };
        const search = vi.fn(async () => [example]);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: false,
                immersionKitEnabled: true,
                kanjiImmersionKitEnabled: true,
                immersionKitShowImages: false,
                rtkEnabled: false,
                kanjivgEnabled: false,
                kanjiOriginsEnabled: false,
                uchisenEnabled: false,
                similarKanjiWords: false,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: { lookup: vi.fn(async () => null) } as never,
            kanjiVG: { lookup: vi.fn(async () => null) } as never,
            rtk: { lookup: vi.fn(async () => null) } as never,
            immersionKit: {
                search,
                mediaUrls: vi.fn(() => []),
            } as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: vi.fn(async () => []) },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderPerformedNewTabSearch(controller, '好', 'dictionary');

        try {
            await waitForExpect(() => expect(root.querySelector('[data-newtab-action="search-result-kanji"]')).not.toBeNull());
            root.querySelector<HTMLButtonElement>('[data-newtab-action="search-result-kanji"]')?.click();
            await waitForExpect(() => expect(root.querySelector('[data-newtab-kanji-immersion-details]')).not.toBeNull());

            const details = root.querySelector<HTMLDetailsElement>('[data-newtab-kanji-immersion-details]')!;
            details.open = true;
            details.dispatchEvent(new Event('toggle'));

            await waitForExpect(() => {
                const body = root.querySelector<HTMLElement>('[data-newtab-kanji-immersion-body]');
                expect(body?.textContent).toContain('好きを集める。');
                expect(body?.textContent).not.toContain('Loading examples');
            });
            expect(search).toHaveBeenCalledWith('好', expect.anything(), expect.objectContaining({ fastFirst: true }));
        } finally {
            root.remove();
        }
    });

    it('searches parsed words clicked inside search entry details', async () => {
        const publicSearch = vi.fn(async () => []);
        const lookupText = vi.fn();
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, localDictionariesEnabled: false, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {} as never,
            lookupText,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.innerHTML = `
            <input data-newtab-search-input>
            <div data-newtab-search-autocomplete></div>
            <div data-newtab-search-results>
                <div class="jpdb-reader-example-sentence jpdb-reader-parseable">
                    <span class="jpdb-reader-word" data-expression="猫舌" data-reading="ねこじた" data-sentence="猫舌だ。" tabindex="-1">猫舌</span>
                </div>
            </div>
        `;
        document.body.append(root);
        Object.assign(controller as unknown as {
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            state: { mode: 'search', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
        });
        try {
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
            root.querySelector<HTMLElement>('.jpdb-reader-word')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            await waitForExpect(() => {
                expect(root.querySelector<HTMLInputElement>('[data-newtab-search-input]')?.value).toBe('猫舌');
                expect(publicSearch).toHaveBeenCalledWith('猫舌', expect.any(Number));
            });
            expect(lookupText).not.toHaveBeenCalled();
        } finally {
            root.remove();
        }
    });

    it('searches loaded JPDB and Anki review cards even without a local dictionary', async () => {
        const lookupText = vi.fn();
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                localCardFromEntry: vi.fn(),
                fallbackCardFromText: vi.fn(text => newTabTestCard({
                    spelling: text,
                    reading: text,
                    meanings: [],
                    source: 'fallback',
                })),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabEmptyDictionarySummary()),
                lookup: vi.fn(async () => []),
                findTermMatches: vi.fn(async () => []),
                lookupKanji: vi.fn(async () => []),
            } as never,
            lookupText,
            showKanjiCard: vi.fn(),
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        Object.assign(controller as unknown as { allWords: JPDBCard[] }, {
            allWords: [
                newTabTestCard({
                    spelling: '猫',
                    reading: 'ねこ',
                    meanings: [{ glosses: ['cat; feline'], partOfSpeech: ['noun'] }],
                    source: 'jpdb',
                    reviewSource: 'jpdb-live',
                }),
            ],
        });
        const root = renderPerformedNewTabSearch(controller, 'cat');

        await waitForExpect(() => {
            const results = root.querySelector('[data-newtab-search-results]')?.textContent ?? '';
            expect(results).toContain('猫');
            expect(results).toContain('cat');
        });

        const wordButton = root.querySelector<HTMLButtonElement>('[data-newtab-action="search-result-word"]');
        const wordDetail = () => wordButton
            ?.closest<HTMLElement>('[data-newtab-search-card-shell]')
            ?.querySelector<HTMLElement>('[data-newtab-search-detail]');
        wordButton?.click();
        await waitForExpect(() => {
            const detail = wordDetail()?.textContent ?? '';
            expect(detail).toContain('JPDB');
            expect(detail).toContain('cat');
        });
        expect(lookupText).not.toHaveBeenCalled();
        root.remove();
    });

    it('searches public JPDB without a local dictionary or API key', async () => {
        const showLookupCard = vi.fn();
        const publicCard = newTabTestCard({
            vid: 1002650,
            sid: 0,
            spelling: 'お母さん',
            reading: 'おかあさん',
            meanings: [{ glosses: ['mother; mom; mum'], partOfSpeech: ['Noun'] }],
            cardState: ['not-in-deck'],
            source: 'jpdb',
            sentence: 'お母さん',
        });
        const publicSearch = vi.fn(async () => [publicCard]);
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: true, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                fallbackCardFromText: vi.fn(text => newTabTestCard({
                    spelling: text,
                    reading: text,
                    meanings: [],
                    source: 'fallback',
                })),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabEmptyDictionarySummary()),
                lookupKanji: vi.fn(async () => []),
            } as never,
            lookupText: vi.fn(),
            showLookupCard,
            showKanjiCard: vi.fn(),
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderPerformedNewTabSearch(controller, 'mum');

        await waitForExpect(() => {
            const text = root.querySelector('[data-newtab-search-results]')?.textContent ?? '';
            expect(text).toContain('お母さん');
            expect(text).toContain('mother; mom; mum');
            expect(text).not.toContain('Not in deck');
        });
        expect(publicSearch).toHaveBeenCalledWith('mum', expect.any(Number));

        const wordButton = root.querySelector<HTMLButtonElement>('[data-newtab-action="search-result-word"]');
        const wordDetail = () => wordButton
            ?.closest<HTMLElement>('[data-newtab-search-card-shell]')
            ?.querySelector<HTMLElement>('[data-newtab-search-detail]');
        wordButton?.click();
        await waitForExpect(() => {
            const detail = wordDetail()?.textContent ?? '';
            expect(detail).toContain('JPDB');
            expect(detail).toContain('mother');
        });
        expect(showLookupCard).not.toHaveBeenCalled();
        root.remove();
    });

    it('keeps Japanese public search and kanji summaries off while offering target handwriting for Chinese', async () => {
        setActiveLearningTargetLanguage('zh');
        const publicSearch = vi.fn(async () => [newTabTestCard({ spelling: '学', reading: 'がく', source: 'jpdb' })]);
        const jpdbKanjiLookup = vi.fn(async () => null);
        const kanjiVgLookup = vi.fn(async () => null);
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            localDictionariesEnabled: false,
            immersionKitEnabled: false,
        }, {
            jpdbVocabulary: { search: publicSearch } as never,
            jpdbKanji: { lookup: jpdbKanjiLookup } as never,
            kanjiVG: { lookup: kanjiVgLookup } as never,
        });
        const root = renderBoundNewTabSearchRoot(controller, 'dictionary');
        const search = (controller as unknown as { searchController: {
            searchPublicJpdbCards(query: string): Promise<JPDBCard[]>;
            searchKanjiCards(query: string, cards?: JPDBCard[]): Promise<unknown[]>;
        } }).searchController;

        try {
            await expect(search.searchPublicJpdbCards('学习')).resolves.toEqual([]);
            await expect(search.searchKanjiCards('学习')).resolves.toEqual([]);
            const toggle = root.querySelector<HTMLButtonElement>('[data-newtab-action="search-handwriting-toggle"]');
            expect(toggle?.hidden).toBe(false);
            expect(toggle?.disabled).toBe(false);
            expect(root.querySelector('[data-newtab-handwriting]')).not.toBeNull();
            expect(publicSearch).not.toHaveBeenCalled();
            expect(jpdbKanjiLookup).not.toHaveBeenCalled();
            expect(kanjiVgLookup).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
            root.remove();
            resetActiveLearningTargetLanguage();
        }
    });

    it('updates search result status from any Anki deck instead of showing JPDB not-in-deck', async () => {
        const publicCard = newTabTestCard({
            vid: 1002650,
            sid: 0,
            spelling: 'お母さん',
            reading: 'おかあさん',
            meanings: [{ glosses: ['mother; mom; mum'], partOfSpeech: ['Noun'] }],
            cardState: ['not-in-deck'],
            source: 'jpdb',
            sentence: 'お母さん',
        });
        const loadCardRenderData = vi.fn(async () => ({
            ankiLookup: {
                state: 'known',
                notes: [{ noteId: 42, state: 'known', deckNames: ['Other'], fields: {}, cardIds: [9001] }],
                primary: { noteId: 42, state: 'known', deckNames: ['Other'], fields: {}, cardIds: [9001] },
            },
        } as never));
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: false, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: vi.fn(async () => [publicCard]) },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {} as never,
            loadCardRenderData,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderPerformedNewTabSearch(controller, 'mum');

        await waitForExpect(() => {
            const text = root.querySelector('[data-newtab-search-results]')?.textContent ?? '';
            expect(text).toContain('お母さん');
            expect(text).toContain('Anki Known');
            expect(text).not.toContain('Not in deck');
        });
        expect(loadCardRenderData).toHaveBeenCalledWith(publicCard);
        root.remove();
    });

    it('renders no-key Jiten search details from public Jiten info for 復習', async () => {
        const jitenLookup = vi.fn(async () => ({
            wordId: 1500800,
            mainReading: { text: '復習', readingIndex: 0, frequencyRank: 12435, usedInMediaAmount: null },
            alternativeReadings: [],
            partsOfSpeech: ['noun', 'suru verb'],
            definitions: [{
                index: 0,
                meanings: ['review; revision'],
                partsOfSpeech: ['noun'],
                field: [],
                dial: [],
                misc: [],
                restrictedToReadingIndices: [],
            }],
            pitchAccents: [],
            knownStates: ['not-in-deck'],
            composedOf: [{
                wordId: 101,
                readingIndex: 0,
                reading: '復',
                readingFurigana: '復[ふく]',
                mainDefinition: 'again; restore',
                frequencyRank: null,
                matchSurface: '復',
                audioUrls: ['https://audio.example.test/fuku.mp3'],
            }],
            usedIn: [{
                wordId: 102,
                readingIndex: 0,
                reading: '復習会',
                readingFurigana: '復習会[ふくしゅうかい]',
                mainDefinition: 'review session',
                frequencyRank: 32000,
                matchSurface: '復習会',
            }],
            usedInTotal: 1,
            examples: [{
                sentenceId: 99,
                text: '毎日復習する。',
                wordPosition: 2,
                wordLength: 2,
                difficulty: null,
                sourceTitle: 'Jiten examples',
                translation: '',
                audioUrls: ['https://audio.example.test/review-sentence.mp3'],
            }],
        }));
        const publicCard = newTabTestCard({
            vid: 1776400,
            sid: 0,
            spelling: '復習',
            reading: 'ふくしゅう',
            meanings: [{ glosses: ['JPDB review wording'], partOfSpeech: [] }],
            source: 'jpdb',
            sentence: '復習',
        });
        const jitendexEntry = {
            expression: '復習',
            reading: 'ふくしゅう',
            glossary: [
                'review; revision',
                { type: 'structured-content', content: { tag: 'div', content: '毎日復習する。' } },
            ],
            score: 10,
            dictionary: 'Jitendex',
        };
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            jpdbDefinitionsEnabled: false,
            jitenDefinitionsEnabled: true,
            localDictionariesEnabled: true,
            ankiEnabled: false,
            ankiSectionEnabled: false,
            studyTranslationEnabled: false,
            studyGrammarEnabled: false,
            immersionKitEnabled: false,
        }, {
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: vi.fn(async () => [publicCard]) } as never,
            jiten: { lookupVocabularyInfoForCard: jitenLookup } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                localCardFromEntry: vi.fn(entry => newTabTestCard({
                    vid: -42,
                    sid: -42,
                    spelling: entry.expression,
                    reading: entry.reading,
                    meanings: [{ glosses: ['local card fallback'], partOfSpeech: [] }],
                    source: 'local',
                    sentence: entry.expression,
                })),
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({
                    dictionaries: [{ title: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0, type: 'terms' }],
                    terms: 1,
                    kanji: 0,
                    termMeta: 0,
                    kanjiMeta: 0,
                })),
                searchTerms: vi.fn(async () => [jitendexEntry]),
                lookup: vi.fn(async () => [jitendexEntry]),
                lookupKanji: vi.fn(async () => []),
                lookupTermMeta: vi.fn(async () => []),
            } as never,
        });
        const root = renderPerformedNewTabSearch(controller, '復習', 'dictionary');

        try {
            await waitForExpect(() => {
                expect(root.querySelector('[data-newtab-search-results]')?.textContent).toContain('復習');
            });
            const wordButton = root.querySelector<HTMLButtonElement>('[data-newtab-action="search-result-word"]');
            wordButton?.click();
            const detail = () => wordButton
                ?.closest<HTMLElement>('[data-newtab-search-card-shell]')
                ?.querySelector<HTMLElement>('[data-newtab-search-detail]');

            await waitForExpect(() => {
                const jiten = detail()?.querySelector<HTMLElement>('[data-source="jiten"]');
                expect(jiten).not.toBeNull();
                const jitenText = jiten?.textContent ?? '';
                expect(jiten?.textContent).toContain('review; revision');
                expect(jiten?.textContent).toContain('復習会');
                expect(jitenText).toContain('毎日');
                expect(jitenText).toContain('復習');
                expect(jitenText).toContain('する。');
                expect(jiten?.textContent).toContain('ふくしゅう');
                expect(jiten?.querySelector('.jpdb-reader-jiten-example-row.has-audio')).not.toBeNull();
                expect(jiten?.querySelectorAll('.jpdb-reader-jiten-audio')).toHaveLength(3);
                expect(jiten?.querySelector('.jpdb-reader-jiten-local-definitions')).toBeNull();
                expect(jiten?.querySelector('.jpdb-reader-jiten-external-lookup')).toBeNull();
                expect(jiten?.textContent).not.toContain('Jitenで開く');
            });
            expect(jitenLookup).toHaveBeenCalledWith(expect.objectContaining({
                spelling: '復習',
                reading: 'ふくしゅう',
            }));
        } finally {
            root.remove();
        }
    });

    it('dedupes placeholder search words and renders kanji above words', async () => {
        const placeholderCard = newTabTestCard({
            vid: -1,
            sid: -1,
            spelling: '支',
            reading: '支',
            meanings: [],
            cardState: ['not-in-deck'],
            source: 'fallback',
            sentence: '支',
        });
        const publicCard = newTabTestCard({
            vid: 25200,
            sid: 0,
            spelling: '支',
            reading: 'し',
            meanings: [{ glosses: ['China'], partOfSpeech: [] }],
            frequencyRank: 25200,
            cardState: ['not-in-deck'],
            source: 'jpdb',
            sentence: '支',
        });
        const publicSearch = vi.fn(async () => [publicCard]);
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: false, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[{ card: placeholderCard, sentence: '支' }]]),
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderPerformedNewTabSearch(controller, '支');

        await waitForExpect(() => {
            const wordButtons = root.querySelectorAll('[data-newtab-action="search-result-word"]');
            expect(wordButtons).toHaveLength(1);
            expect(wordButtons[0]?.textContent).toContain('し');
            expect(wordButtons[0]?.textContent).toContain('China');
            const headings = Array.from(root.querySelectorAll('.jpdb-reader-newtab-search-section h2')).map(heading => heading.textContent);
            expect(headings).toEqual(['Kanji', 'Words']);
        });
        root.remove();
    });

    it('uses the kanji detail lookup path for handwriting-recognized search kanji', async () => {
        const jpdbKanjiLookup = vi.fn(async () => ({
            kanji: '水',
            keyword: 'water',
            frequency: 'Top 100',
            type: 'Joyo',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [{ reading: 'みず', share: '65%', common: true }],
            components: [],
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }));
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            immersionKitEnabled: false,
            rtkEnabled: false,
            kanjivgEnabled: false,
            kanjiOriginsEnabled: false,
            uchisenEnabled: false,
        }, {
            jpdbKanji: { lookup: jpdbKanjiLookup } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {} as never,
        });
        const root = renderBoundNewTabSearchRoot(controller, 'dictionary');
        try {
            (controller as unknown as { searchController: NewTabSearchModeApi }).searchController.renderSearchHandwritingCandidates(root, ['水'], '');
            root.querySelector<HTMLButtonElement>('[data-newtab-action="handwriting-candidate"]')?.click();

            await waitForExpect(() => {
                const results = root.querySelector('[data-newtab-search-results]')?.textContent ?? '';
                expect(results).toContain('水');
                expect(results).toContain('water');
                expect(results).toContain('みず 65%');
            });
            expect(newTabSearchInput(root).value).toBe('水');
            expect(jpdbKanjiLookup).toHaveBeenCalledWith('水');
        } finally {
            root.remove();
        }
    });

    it('keeps exact composite JPDB search hits ahead of parsed component words', async () => {
        const componentCards = ['自動', '販売', '機', '自', '動', '販', '売', '機械', '自動化', '販売店']
            .map((spelling, index) => newTabTestCard({
                vid: index + 1,
                sid: index + 1,
                spelling,
                reading: spelling,
                meanings: [],
                cardState: ['not-in-deck'],
                source: 'fallback',
                sentence: '自動販売機',
            }));
        const publicCard = newTabTestCard({
            vid: 1318480,
            sid: 0,
            spelling: '自動販売機',
            reading: 'じどうはんばいき',
            meanings: [{ glosses: ['vending machine'], partOfSpeech: [] }],
            frequencyRank: 18900,
            cardState: ['not-in-deck'],
            source: 'jpdb',
            sentence: '自動販売機',
        });
        const publicSearch = vi.fn(async () => [publicCard]);
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: false, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [componentCards.map(card => ({ card, sentence: '自動販売機' }))]),
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderPerformedNewTabSearch(controller, '自動販売機');

        await waitForExpect(() => {
            const wordButtons = root.querySelectorAll('[data-newtab-action="search-result-word"]');
            expect(wordButtons).toHaveLength(10);
            expect(wordButtons[0]?.textContent).toContain('自動販売機');
            expect(wordButtons[0]?.textContent).toContain('vending machine');
            const meta = root.querySelector<HTMLElement>('[data-search-word-meta="1318480:0:自動販売機:じどうはんばいき"]');
            expect(meta?.textContent).not.toContain('#18900');
            const kanjiMeta = root.querySelector<HTMLElement>('[data-newtab-action="search-result-kanji"][data-kanji="自"] .jpdb-reader-newtab-search-meta');
            expect(kanjiMeta?.textContent).not.toContain('自動販売機');
            expect(kanjiMeta?.textContent).toContain('自動');
            expect(kanjiMeta?.textContent).toContain('自動化');
        });
        root.remove();
    });

    it('expands search cards with runtime popup sources, hydrates late Bunpro data, and keeps inline actions in search mode', async () => {
        const catCard = newTabTestCard({
            vid: 1600,
            sid: 1,
            spelling: '猫',
            reading: 'ねこ',
            meanings: [{ glosses: ['cat'], partOfSpeech: ['Noun'] }],
            source: 'jpdb',
            sentence: '猫',
            pitchAccent: ['HL'],
        });
        const blackCatCard = newTabTestCard({
            vid: 1601,
            sid: 1,
            spelling: '黒猫',
            reading: 'くろねこ',
            meanings: [{ glosses: ['black cat'], partOfSpeech: ['Noun'] }],
            source: 'jpdb',
            sentence: '黒猫',
        });
        const publicSearch = vi.fn(async (query: string) => query === '黒猫' ? [blackCatCard] : [catCard]);
        const renderData = deferred<never>();
        const loadCardRenderData = vi.fn(async () => renderData.promise);
        const searchAnkiLookup = { state: 'not-in-deck' as const, notes: [], primary: null };
        const bunproDefinitionInfo = {
            id: 1600,
            kind: 'vocabulary' as const,
            expression: '猫',
            reading: 'ねこ',
            meaning: 'cat',
            nuance: '',
            nuanceTranslation: '',
            acceptedAnswers: [],
            partOfSpeech: ['noun'],
            jlptLevel: 'N5',
            sourceUrl: 'https://bunpro.jp/vocabs/%E7%8C%AB',
            slug: '猫',
            examples: [],
            examplesAvailability: 'empty' as const,
            examplesUnavailableReason: '' as const,
            pitchAccentStress: '',
            frequencies: [],
            relatedWords: [],
            caution: '',
            register: '',
            registerTranslation: '',
            structures: [],
            relatedGrammar: [], coverageVocabIds: [], usedInVocab: [],
        };
        const hydrateBunproDefinitionInfo = vi.fn(async () => bunproDefinitionInfo);
        const cardRenderData = {
            localEntries: [{ expression: '猫', reading: 'ねこ', glossary: ['cat from local dictionary'], score: 20, dictionary: 'Local' }],
            kanjiEntries: [{ character: '猫', onyomi: [], kunyomi: ['ねこ'], tags: [], meanings: ['cat kanji'], dictionary: 'Kanji Local' }],
            metaEntries: [{ expression: '猫', mode: 'freq', data: 1600, dictionary: 'Freq Local' }],
            ankiLookup: searchAnkiLookup,
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: { meanings: ['cat'], compounds: [], usedInVocabulary: [], examples: [] },
            bunproDefinitionInfo: null,
        } as never;
        const renderSearchDefinitionSources = vi.fn(() => `
            <div class="jpdb-reader-definition-stack">
                <details open>
                    <summary>Popup sources</summary>
                    <a class="gloss-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="黒猫" data-dictionary-reading="くろねこ" data-dictionary="Local">黒猫</a>
                    <button type="button" data-action="jpdb-example-audio" data-jpdb-audio="example-audio" data-jpdb-example-sentence="猫が寝る。" ${privateCommandAttributes({
                        kind: 'card-action',
                        action: 'jpdb-example-audio',
                        audioIds: 'example-audio',
                        sentence: '猫が寝る。',
                    })}>audio</button>
                    <button type="button" data-action="jiten-audio" data-study-sentence="猫が鳴く。" data-jiten-audio-urls='["https://audio.example.test/cat.mp3"]' ${privateCommandAttributes({
                        kind: 'card-action',
                        action: 'jiten-audio',
                        audioUrls: ['https://audio.example.test/cat.mp3'],
                        sentence: '猫が鳴く。',
                    })}>jiten audio</button>
                </details>
            </div>
        `);
        const installSearchDetailSources = vi.fn();
        const playJpdbExampleAudio = vi.fn();
        const playWordAudio = vi.fn();
        const performCardAction = vi.fn();
        const renderSearchWordPills = vi.fn(() => `
            <div class="jpdb-reader-word-pills">
                <a class="jpdb-reader-pill jpdb-reader-action-pill" href="https://jisho.org/search/%E7%8C%AB" target="_blank" rel="noopener"><span>Jisho</span></a>
                <button type="button" data-action="copy-word" ${privateCommandAttributes({ kind: 'card-action', action: 'copy-word' })}>Copy</button>
                <button type="button" data-action="anki" ${privateCommandAttributes({ kind: 'card-action', action: 'anki' })}>Anki</button>
                <span>Freq Local 1600</span>
            </div>
        `);
        const lookupDictionaryReference = vi.fn();
        const jpdbKanjiLookup = vi.fn(async () => ({
            kanji: '猫',
            keyword: 'cat radical',
            frequency: '#1600',
            type: 'jouyou',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [{ reading: 'ねこ', share: '100%', common: true }],
            components: [{ kanji: '犭', keyword: 'animal' }],
            usedInKanji: [],
            mnemonic: 'Cat kanji mnemonic',
            vocabulary: [{ expression: '猫舌', reading: 'ねこじた', meaning: 'sensitive tongue', url: 'https://jpdb.io/vocabulary/1/猫舌/ねこじた' }],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }));
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: true,
                immersionKitEnabled: false,
                rtkEnabled: false,
                kanjivgEnabled: false,
                kanjiOriginsEnabled: false,
                uchisenEnabled: false,
                similarKanjiWords: false,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: { lookup: jpdbKanjiLookup } as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {
                lookup: vi.fn(async () => []),
                findTermMatches: vi.fn(async () => []),
                lookupKanji: vi.fn(async () => [{ character: '猫', onyomi: [], kunyomi: ['ねこ'], tags: [], meanings: ['cat kanji'], dictionary: 'Kanji Local' }]),
            } as never,
            loadCardRenderData,
            hydrateBunproDefinitionInfo,
            renderSearchDefinitionSources,
            renderSearchWordPills,
            installSearchDetailSources,
            playWordAudio,
            playJpdbExampleAudio,
            performCardAction,
            lookupDictionaryReference,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderPerformedNewTabSearch(controller, 'neko');
        try {
            await waitForExpect(() => {
                expect(root.querySelector('[data-newtab-search-results]')?.textContent).toContain('猫');
                const kanjiButtons = root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="search-result-kanji"]');
                expect(kanjiButtons).toHaveLength(1);
                expect(kanjiButtons[0]?.dataset.kanji).toBe('猫');
            });
            const wordButton = root.querySelector<HTMLButtonElement>('[data-newtab-action="search-result-word"]');
            const wordDetail = () => wordButton
                ?.closest<HTMLElement>('[data-newtab-search-card-shell]')
                ?.querySelector<HTMLElement>('[data-newtab-search-detail]');
            wordButton?.click();
            await waitForExpect(() => {
                const detail = wordDetail()?.textContent ?? '';
                expect(detail).toContain('猫');
                expect(detail).toContain('ねこ');
                expect(detail).toContain('Loading dictionary details');
            });
            expect(wordDetail()?.querySelector('[data-action="search-word-audio"]')).not.toBeNull();
            expect(wordDetail()?.querySelector('.jpdb-reader-pitch')).not.toBeNull();
            root.querySelector<HTMLButtonElement>('[data-action="search-word-audio"]')?.click();
            expect(playWordAudio).toHaveBeenCalledWith(catCard);
            expect(wordDetail()?.textContent).not.toContain('Popup sources');
            await waitForExpect(() => {
                const detail = wordDetail()?.textContent ?? '';
                expect(detail).toContain('JPDB');
                expect(detail).toContain('cat radical');
                expect(detail).toContain('Cat kanji mnemonic');
                expect(detail).toContain('Loading dictionary details');
                expect(detail).not.toContain('Popup sources');
            });

            renderData.resolve(cardRenderData);
            await waitForExpect(() => {
                const detail = wordDetail()?.textContent ?? '';
                expect(detail).toContain('Popup sources');
                expect(detail).toContain('Kanji Local');
                expect(detail).toContain('cat kanji');
                expect(detail).toContain('JPDB');
                expect(detail).toContain('cat radical');
                expect(detail).toContain('Cat kanji mnemonic');
                expect(detail).toContain('Freq Local 1600');
            });
            const kanjiSource = wordDetail()?.querySelector<HTMLElement>('details.jpdb-reader-newtab-search-inline-kanji');
            expect(kanjiSource?.querySelector(':scope > summary.jpdb-reader-local-title')?.textContent).toContain('Kanji');
            expect(kanjiSource?.querySelector<HTMLElement>('[data-search-word-kanji="猫"] .jpdb-reader-newtab-search-kanji-item-title')?.textContent).toContain('cat radical');
            expect(wordDetail()?.querySelector('.jpdb-reader-definition-stack > details.jpdb-reader-newtab-search-inline-kanji')).toBe(kanjiSource);
            expect(loadCardRenderData).toHaveBeenCalledWith(catCard);
            expect(hydrateBunproDefinitionInfo).toHaveBeenCalledWith(catCard);
            expect(jpdbKanjiLookup).toHaveBeenCalledWith('猫');
            expect(renderSearchDefinitionSources).toHaveBeenCalledWith(
                catCard,
                expect.any(Array),
                '猫',
                expect.any(Object),
                null,
                expect.objectContaining({ expression: '猫', sourceUrl: 'https://bunpro.jp/vocabs/%E7%8C%AB' }),
            );
            expect(renderSearchWordPills).toHaveBeenCalledWith(catCard, expect.any(Array), searchAnkiLookup, undefined);
            expect(installSearchDetailSources).toHaveBeenCalledWith(wordDetail(), catCard, '猫', expect.any(Object));

            root.querySelector<HTMLButtonElement>('[data-action="jpdb-example-audio"]')?.click();
            expect(playJpdbExampleAudio).toHaveBeenCalledWith('example-audio', '猫が寝る。');

            const jitenAudio = root.querySelector<HTMLButtonElement>('[data-action="jiten-audio"]')!;
            jitenAudio.click();
            expect(performCardAction).toHaveBeenCalledWith(jitenAudio, catCard, '猫が鳴く。', jitenAudio, {
                kind: 'card-action',
                action: 'jiten-audio',
                audioUrls: ['https://audio.example.test/cat.mp3'],
                sentence: '猫が鳴く。',
            });

            const openInTab = vi.fn();
            vi.stubGlobal('GM_openInTab', openInTab);
            const actionLinkLabel = root.querySelector<HTMLElement>('a.jpdb-reader-action-pill span')!;
            const actionLinkClick = new MouseEvent('click', { bubbles: true, cancelable: true });
            actionLinkLabel.dispatchEvent(actionLinkClick);
            expect(actionLinkClick.defaultPrevented).toBe(true);
            expect(openInTab).toHaveBeenCalledWith('https://jisho.org/search/%E7%8C%AB', { active: true, insert: true, setParent: false });

            const copyPill = root.querySelector<HTMLButtonElement>('[data-action="copy-word"]')!;
            copyPill.click();
            expect(performCardAction).toHaveBeenCalledWith(copyPill, catCard, '猫', copyPill, {
                kind: 'card-action',
                action: 'copy-word',
            });

            const ankiPill = root.querySelector<HTMLButtonElement>('[data-action="anki"]')!;
            ankiPill.click();
            expect(performCardAction).toHaveBeenCalledWith(ankiPill, catCard, '猫', ankiPill, {
                kind: 'card-action',
                action: 'anki',
            });

            root.querySelector<HTMLAnchorElement>('a.gloss-link[data-dictionary-lookup]')?.click();
            await waitForExpect(() => {
                expect(root.querySelector<HTMLInputElement>('[data-newtab-search-input]')?.value).toBe('黒猫');
                expect(publicSearch).toHaveBeenCalledWith('黒猫', expect.any(Number));
            });
            expect(lookupDictionaryReference).not.toHaveBeenCalled();
        } finally {
            root.remove();
        }
    });

    it('groups each word kanji detail under a compact character heading', () => {
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }, {
            parser: { fallbackCardFromText: vi.fn(newTabFallbackCardFromText) } as never,
        });
        const internals = (controller as unknown as { searchController: unknown }).searchController as {
            renderSearchWordKanjiItem(card: JPDBCard, item: {
                kanji: string;
                details: {
                    jpdb: unknown;
                    jiten: null;
                    rtk: null;
                    vg: null;
                    local: [];
                    sourceInfo?: { kanjiAliveKeyword: string };
                };
            }): HTMLElement;
        };
        const sourceWord = newTabTestCard({
            spelling: '読み取る',
            reading: 'よみとる',
            meanings: [{ glosses: ['to read and take in'], partOfSpeech: [] }],
            kanjiKeyword: 'to read and take in',
        });
        const read = internals.renderSearchWordKanjiItem(sourceWord, {
            kanji: '読',
            details: {
                jpdb: {
                    kanji: '読',
                    keyword: 'read',
                    frequency: '',
                    type: '',
                    kanken: '',
                    heisig: '',
                    oldForms: [],
                    readings: [{ reading: 'よ.む', share: '', common: true }],
                    components: [{ kanji: '言', keyword: 'say' }],
                    usedInKanji: [],
                    mnemonic: '',
                    vocabulary: [],
                    actions: [],
                    loggedIn: false,
                    kanjiReviewsEnabled: false,
                },
                jiten: null,
                rtk: null,
                vg: null,
                local: [],
                sourceInfo: { kanjiAliveKeyword: 'interpret' },
            },
        });
        const take = internals.renderSearchWordKanjiItem(sourceWord, {
            kanji: '取',
            details: {
                jpdb: {
                    kanji: '取',
                    keyword: 'take',
                    frequency: '',
                    type: '',
                    kanken: '',
                    heisig: '',
                    oldForms: [],
                    readings: [{ reading: 'と.る', share: '', common: true }],
                    components: [{ kanji: '耳', keyword: 'ear' }],
                    usedInKanji: [],
                    mnemonic: '',
                    vocabulary: [],
                    actions: [],
                    loggedIn: false,
                    kanjiReviewsEnabled: false,
                },
                jiten: null,
                rtk: null,
                vg: null,
                local: [],
            },
        });

        const mount = document.createElement('div');
        mount.append(read, take);

        expect(Array.from(mount.querySelectorAll<HTMLElement>('[data-search-word-kanji]')).map(item => item.dataset.searchWordKanji))
            .toEqual(['読', '取']);
        expect(read.querySelector('.jpdb-reader-newtab-search-kanji-item-title')?.textContent).toContain('読');
        expect(read.querySelector('.jpdb-reader-newtab-search-kanji-item-title')?.textContent).toContain('read');
        expect(take.querySelector('.jpdb-reader-newtab-search-kanji-item-title')?.textContent).toContain('take');
        expect(read.querySelector('.jpdb-reader-newtab-kanji-details')).not.toBeNull();
        expect(take.querySelector('.jpdb-reader-newtab-kanji-details')).not.toBeNull();
        expect(read.querySelector('.jpdb-reader-kanji-facts')?.textContent).toContain('Keywordread');
        expect(read.querySelector('.jpdb-reader-newtab-kanji-keywords .jpdb-reader-kanji-keyword-text')?.textContent).toBe('interpret');
        expect(read.querySelector('.jpdb-reader-newtab-kanji-keywords .jpdb-reader-kanji-keyword-source')?.textContent).toBe('Kanji Alive');
        expect(mount.textContent).not.toContain('to read and take in');
    });

    it('uses per-kanji search keywords instead of the parent 検索 gloss', async () => {
        const jpdbKanjiInfo = (kanji: string, keyword: string) => ({
            kanji,
            keyword,
            frequency: '',
            type: '',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [],
            components: [],
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        });
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            jpdbKanjiEnabled: true,
            localDictionariesEnabled: true,
            localDictionaryShowKanji: true,
            rtkEnabled: false,
        }, {
            parser: { fallbackCardFromText: vi.fn(newTabFallbackCardFromText) } as never,
            jpdbKanji: {
                lookup: vi.fn(async (kanji: string) => kanji === '検'
                    ? jpdbKanjiInfo('検', 'inspect')
                    : kanji === '索'
                        ? jpdbKanjiInfo('索', 'cord')
                        : null),
            } as never,
            dictionaries: {
                lookupKanji: vi.fn(async (kanji: string) => [{
                    character: kanji,
                    onyomi: [],
                    kunyomi: [],
                    tags: [],
                    meanings: ['search'],
                    dictionary: 'Parent gloss dictionary',
                }]),
            } as never,
        });
        const internals = (controller as unknown as { searchController: unknown }).searchController as {
            searchKanjiCards(query: string, wordCards?: JPDBCard[]): Promise<Array<{ character: string; keyword: string; meanings: string[] }>>;
        };
        const parent = newTabTestCard({
            spelling: '検索',
            reading: 'けんさく',
            meanings: [{ glosses: ['search'], partOfSpeech: [] }],
            kanjiKeyword: 'search',
        });

        const results = await internals.searchKanjiCards('検索', [parent]);
        const keywords = new Map(results.map(result => [result.character, result.keyword]));
        const meanings = new Map(results.map(result => [result.character, result.meanings]));

        expect(keywords.get('検')).toBe('inspect');
        expect(keywords.get('索')).toBe('cord');
        expect(meanings.get('検')).toEqual([]);
        expect(meanings.get('索')).toEqual([]);
    });

    it('keeps the search detail speaker on lookup audio for the rendered card', () => {
        const renderedCard = newTabTestCard({
            vid: 1600,
            sid: 1,
            spelling: '猫',
            reading: 'ねこ',
            source: 'local',
            reviewSource: 'dictionary',
            sentence: '猫が寝る。',
        });
        const staleJpdbCard = newTabTestCard({
            vid: renderedCard.vid,
            sid: renderedCard.sid,
            spelling: renderedCard.spelling,
            reading: renderedCard.reading,
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            sentence: 'JPDB fallback card',
        });
        const playWordAudio = vi.fn();
        const playJpdbExampleAudio = vi.fn();
        const controller = newTabBareController(DEFAULT_SETTINGS, {
            playWordAudio,
            playJpdbExampleAudio,
        });
        const internals = controller as unknown as {
            handleSearchWordAudioAction(actionTarget: HTMLElement, event: MouseEvent): boolean;
        };
        const searchInternals = (controller as unknown as { searchController: {
            searchWordCardCache: Map<string, JPDBCard>;
            renderSearchWordDetail(mount: HTMLElement, card: JPDBCard, detail: never): void;
        } }).searchController;
        searchInternals.searchWordCardCache = new Map([[cardKey(renderedCard), staleJpdbCard]]);
        const mount = document.createElement('div');

        searchInternals.renderSearchWordDetail(mount, renderedCard, {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            jpdbVocabularyInfo: null,
            loading: true,
        } as never);

        const button = mount.querySelector<HTMLButtonElement>('[data-action="search-word-audio"]');
        expect(button).not.toBeNull();
        expect(searchInternals.searchWordCardCache.get(cardKey(renderedCard))).toBe(renderedCard);
        expect(internals.handleSearchWordAudioAction(button as HTMLButtonElement, new MouseEvent('click'))).toBe(true);
        expect(internals.handleSearchWordAudioAction(button as HTMLButtonElement, new MouseEvent('click'))).toBe(true);
        expect(playWordAudio).toHaveBeenCalledTimes(2);
        expect(playWordAudio).toHaveBeenNthCalledWith(1, renderedCard);
        expect(playWordAudio).toHaveBeenNthCalledWith(2, renderedCard);
        expect(playWordAudio).not.toHaveBeenCalledWith(staleJpdbCard);
        expect(playJpdbExampleAudio).not.toHaveBeenCalled();
    });

    it('renders Jiten definitions in expanded search word details and hides empty Jiten panels', () => {
        const card = newTabTestCard({
            source: 'jpdb',
            spelling: '大学',
            reading: 'だいがく',
            meanings: [{ glosses: ['university'], partOfSpeech: [] }],
        });
        const context: NewTabSearchDetailViewContext = {
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                jpdbDefinitionsEnabled: false,
                jitenDefinitionsEnabled: true,
                ankiSectionEnabled: false,
                studyTranslationEnabled: false,
                studyGrammarEnabled: false,
                immersionKitEnabled: false,
            }),
            text: key => key,
            sourceAttributes: (key, initiallyExpanded) => [
                `data-source-state="${key}"`,
                initiallyExpanded === undefined ? '' : `data-source-initial-open="${String(initiallyExpanded)}"`,
            ].filter(Boolean).join(' '),
            dictionaryLabel: name => name,
            kanjiSourceTitle: sourceId => sourceId,
        };
        const detail: NewTabSearchWordDetailData = {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            jpdbVocabularyInfo: null,
            jitenVocabularyInfo: {
                wordId: 321,
                mainReading: { text: '大学', readingIndex: 0, frequencyRank: 475, usedInMediaAmount: null },
                alternativeReadings: [],
                partsOfSpeech: ['noun'],
                definitions: [{
                    index: 0,
                    meanings: ['university; college'],
                    partsOfSpeech: ['noun'],
                    field: [],
                    dial: [],
                    misc: [],
                    restrictedToReadingIndices: [],
                }],
                pitchAccents: [],
                knownStates: [],
                composedOf: [],
                usedIn: [],
                usedInTotal: 0,
                examples: [],
            },
        };
        const html = searchWordDetailHtml(card, detail, context);
        const root = document.createElement('div');
        root.innerHTML = html;

        expect(root.querySelector('[data-source="jiten"]')).not.toBeNull();
        expect(root.textContent).toContain('Jiten');
        expect(root.textContent).toContain('university; college');
        expect(root.textContent).not.toContain('No Jiten definitions.');
        expect(root.querySelector('[data-source="jpdb"]')).toBeNull();

        const emptyRoot = document.createElement('div');
        emptyRoot.innerHTML = searchWordDetailHtml(card, {
            ...detail,
            jitenVocabularyInfo: { ...detail.jitenVocabularyInfo!, definitions: [] },
        }, context);
        expect(emptyRoot.querySelector('[data-source="jiten"]')).toBeNull();
        expect(emptyRoot.textContent).not.toContain('No Jiten definitions.');
    });

    it('keeps handwriting candidates open and clears doodles in search mode', () => {
        const { root, searchApi } = createDictionarySearchModeFixture();

        try {
            const handwriting = root.querySelector<HTMLDetailsElement>('[data-newtab-handwriting]')!;
            const drawToggle = root.querySelector<HTMLButtonElement>('[data-newtab-action="search-handwriting-toggle"]')!;
            expect(handwriting.open).toBe(false);
            expect(drawToggle.getAttribute('aria-expanded')).toBe('false');
            drawToggle.click();
            expect(handwriting.open).toBe(true);
            expect(drawToggle.getAttribute('aria-expanded')).toBe('true');
            expect(handwriting.querySelector('[data-doodle-clear]')).toBeNull();

            let doodleClearCount = 0;
            handwriting.addEventListener(KANJI_DOODLE_CLEAR_EVENT, () => { doodleClearCount += 1; });
            searchApi.renderSearchHandwritingCandidates(root, ['日'], '');
            root.querySelector<HTMLButtonElement>('[data-newtab-action="handwriting-candidate"]')?.click();
            expect(doodleClearCount).toBe(1);
            expect(newTabSearchInput(root).value).toBe('日');
            expect(handwriting.open).toBe(true);
            expect(root.querySelector<HTMLElement>('[data-newtab-handwriting-candidates]')?.hidden).toBe(true);

            searchApi.renderSearchHandwritingCandidates(root, ['本'], '');
            root.querySelector<HTMLButtonElement>('[data-newtab-action="handwriting-candidate"]')?.click();
            expect(doodleClearCount).toBe(2);
            expect(newTabSearchInput(root).value).toBe('日本');
            expect(handwriting.open).toBe(true);

            root.querySelector<HTMLButtonElement>('[data-newtab-action="search-clear"]')?.click();
            expect(doodleClearCount).toBe(3);
            expect(root.querySelector<HTMLElement>('[data-newtab-handwriting-candidates]')?.hidden).toBe(true);
            drawToggle.click();
            expect(handwriting.open).toBe(false);
        } finally {
            root.remove();
        }
    });

    it('keeps search handwriting Pencil strokes after Safari drops pointer capture', () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const { root, controller } = createDictionarySearchModeFixture();

        try {
            const handwriting = root.querySelector<HTMLElement>('[data-newtab-handwriting]')!;
            const stage = handwriting.querySelector<HTMLElement>('.jpdb-reader-doodle-stage')!;
            const canvas = handwriting.querySelector<HTMLCanvasElement>('.jpdb-reader-doodle-canvas')!;
            stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
            canvas.getBoundingClientRect = stage.getBoundingClientRect;

            canvas.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), {
                clientX: 12,
                clientY: 12,
                pointerId: 17,
                pointerType: 'pen',
                pressure: 0.4,
            }));
            canvas.dispatchEvent(Object.assign(new Event('lostpointercapture'), {
                pointerId: 17,
                pointerType: 'pen',
            }));
            document.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), {
                clientX: 54,
                clientY: 58,
                pointerId: 17,
                pointerType: 'pen',
                pressure: 0.65,
            }));
            document.dispatchEvent(Object.assign(new Event('pointerup', { bubbles: true, cancelable: true }), {
                clientX: 88,
                clientY: 92,
                pointerId: 17,
                pointerType: 'pen',
                pressure: 0,
            }));

            const internals = (controller as unknown as { searchController: {
                searchHandwritingStrokes: Array<Array<{ x: number; y: number }>>;
                clearSearchHandwritingDebounce(): void;
            } }).searchController;
            expect(internals.searchHandwritingStrokes).toHaveLength(1);
            expect(internals.searchHandwritingStrokes[0]).toEqual(expect.arrayContaining([
                expect.objectContaining({ x: 0.12, y: 0.12 }),
                expect.objectContaining({ x: 0.54, y: 0.58 }),
                expect.objectContaining({ x: 0.88, y: 0.92 }),
            ]));
            internals.clearSearchHandwritingDebounce();
            (handwriting as HTMLElement & { __yomuKanjiDoodleCleanup?: () => void }).__yomuKanjiDoodleCleanup?.();
        } finally {
            root.remove();
            restoreCanvas();
        }
    });

    it('starts search mode from new-tab query params', () => {
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html?q=mum',
        });
        const controller = newTabBareController(DEFAULT_SETTINGS);
        const internals = controller as unknown as { state: { route: string } };

        expect(internals.state.route).toBe('search');
        expect((controller as unknown as { searchController: { query: string } }).searchController.query).toBe('mum');
    });

    it('syncs search query params and restores browser history searches', async () => {
        window.history.replaceState(null, '', '/newtab/index.html');
        const { root, searchApi } = createDictionarySearchModeFixture();

        try {
            searchApi.performSearch(root, 'cat');
            await waitForExpect(() => expect(newTabSearchResultsText(root)).toContain('猫'));
            expect(new URL(window.location.href).searchParams.get('q')).toBe('cat');

            searchApi.performSearch(root, 'おもし');
            await waitForExpect(() => expect(newTabSearchResultExpression(root, '面白い')).not.toBeNull());
            expect(new URL(window.location.href).searchParams.get('q')).toBe('おもし');

            window.history.back();
            await waitForExpect(() => {
                expect(newTabSearchInput(root).value).toBe('cat');
                expect(newTabSearchResultsText(root)).toContain('猫');
            });

            window.history.forward();
            await waitForExpect(() => {
                expect(newTabSearchInput(root).value).toBe('おもし');
                expect(newTabSearchResultExpression(root, '面白い')).not.toBeNull();
            });

            root.querySelector<HTMLButtonElement>('[data-newtab-action="search-clear"]')?.click();
            expect(new URL(window.location.href).searchParams.has('q')).toBe(false);
        } finally {
            root.remove();
            window.history.replaceState(null, '', '/');
        }
    });

    it('searches English glossary text without redundant global lookup links in search mode', async () => {
        const { settings, searchTerms, root, searchApi } = createDictionarySearchModeFixture();

        try {
            searchApi.performSearch(root, 'cat');

            await waitForExpect(() => {
                expect(newTabSearchResultsText(root)).toContain('猫');
                expect(newTabSearchAutocompleteText(root)).toContain('猫');
            });
            const input = newTabSearchInput(root);
            const suggestion = root.querySelector<HTMLButtonElement>('[data-newtab-action="search-suggestion"]')!;
            expect(input.getAttribute('aria-activedescendant')).toBeNull();
            expect(suggestion.dataset.active).toBeUndefined();
            expect(root.querySelector('.jpdb-reader-newtab-search-links')).toBeNull();
            expect(newTabSearchResultsText(root)).not.toContain('Takoboto');
            expect(newTabSearchResultsText(root)).not.toContain('Copy');
            expect(newTabSearchResultsText(root)).not.toContain('JPDB');
            expect(newTabSearchResultsText(root)).not.toContain('Jisho');
            expect(newTabSearchResultsText(root)).not.toContain('Yomu');

            const submitEnterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
            input.dispatchEvent(submitEnterEvent);
            expect(submitEnterEvent.defaultPrevented).toBe(false);
            expect(input.value).toBe('cat');

            const arrowEvent = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
            input.dispatchEvent(arrowEvent);
            expect(arrowEvent.defaultPrevented).toBe(true);
            expect(input.getAttribute('aria-activedescendant')).toBe(suggestion.id);
            expect(suggestion.dataset.active).toBe('true');

            const suggestionEnterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
            input.dispatchEvent(suggestionEnterEvent);
            expect(suggestionEnterEvent.defaultPrevented).toBe(true);
            expect(input.value).toBe('猫');
            expect(searchTerms).toHaveBeenCalledWith('cat', expect.any(Number), settings.dictionaryPreferences, expect.any(Object));

            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            expect(input.value).toBe('');
            expect(root.querySelector<HTMLElement>('[data-newtab-controls]')?.hidden).toBe(true);
        } finally {
            root.remove();
        }
    });

    it('does not repeat the same reading next to a furigana search result headword', () => {
        const settings = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' as const };
        const card = newTabTestCard({
            spelling: '学習能力',
            reading: 'がくしゅうのうりょく',
            frequencyRank: 32900,
            cardState: ['new'],
        });
        const root = renderSearchWordResults([card], {
            language: 'en',
            settings,
            text: key => ({ words: 'Words', kanji: 'Kanji', dictionary: 'Dictionary' })[key],
        });

        try {
            document.body.append(root);
            const term = root.querySelector<HTMLElement>('.jpdb-reader-newtab-search-term')!;
            const meta = root.querySelector<HTMLElement>('.jpdb-reader-newtab-search-meta')!;

            expect(term.querySelector('rt')?.textContent).toContain('がくしゅうのうりょく');
            expect(meta.textContent).not.toContain('#32900');
            expect(meta.textContent).not.toContain('がくしゅうのうりょく');
        } finally {
            root.remove();
        }
    });

    it('does not repeat the same reading in expanded search detail headers when furigana is enabled', () => {
        const settings = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' as const };
        const card = newTabTestCard({
            spelling: '学習能力',
            reading: 'がくしゅうのうりょく',
            frequencyRank: 32900,
            cardState: ['new'],
        });
        const context: NewTabSearchDetailViewContext = {
            getSettings: () => settings,
            text: key => ({ noLocalResults: 'No local results', kanji: 'Kanji' })[key],
            sourceAttributes: () => '',
            dictionaryLabel: name => name,
            kanjiSourceTitle: sourceId => sourceId,
        };

        document.body.innerHTML = searchWordDetailHtml(card, {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            jpdbVocabularyInfo: null,
        }, context);

        expect(document.querySelector('.jpdb-reader-reading')).toBeNull();
        expect(document.querySelector('.jpdb-reader-meta-reading')).toBeNull();
        expect(document.querySelector('.jpdb-reader-meta')?.textContent ?? '').not.toContain('#32900');
    });

    it('renders search-row ruby under selective furigana modes instead of dropping the reading entirely', () => {
        // difficult-kanji mode + all-easy kanji: the page renderer would skip
        // ruby, but the redundancy gate assumes headword ruby is visible. The
        // row renderer must share the forced headword settings or 人間 shows
        // neither ruby nor fallback reading.
        const settings = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'difficult-kanji' as const };
        const card = newTabTestCard({
            spelling: '人間',
            reading: 'にんげん',
            frequencyRank: 500,
            cardState: ['new'],
        });
        const root = renderSearchWordResults([card], {
            language: 'en',
            settings,
            text: key => ({ words: 'Words', kanji: 'Kanji', dictionary: 'Dictionary' })[key],
        });

        try {
            document.body.append(root);
            const term = root.querySelector<HTMLElement>('.jpdb-reader-newtab-search-term')!;
            expect(term.dataset.yomuHeadword).toBe('true');
            expect(term.querySelector('rt')?.textContent).toContain('にんげん');
        } finally {
            root.remove();
        }
    });

    it('renders detail-header ruby under selective furigana modes and keeps the headword parseable', () => {
        const settings = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'difficult-kanji' as const };
        const card = newTabTestCard({
            spelling: '人間',
            reading: 'にんげん',
            frequencyRank: 500,
            cardState: ['new'],
        });
        const context: NewTabSearchDetailViewContext = {
            getSettings: () => settings,
            text: key => ({ noLocalResults: 'No local results', kanji: 'Kanji' })[key],
            sourceAttributes: () => '',
            dictionaryLabel: name => name,
            kanjiSourceTitle: sourceId => sourceId,
        };

        document.body.innerHTML = searchWordDetailHtml(card, {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            jpdbVocabularyInfo: null,
        }, context);

        const spelling = document.querySelector<HTMLElement>('.jpdb-reader-spelling')!;
        expect(spelling.classList.contains('jpdb-reader-parseable')).toBe(true);
        expect(spelling.hasAttribute('data-yomu-headword')).toBe(true);
        // No kanji-nav host on the header: the async nested-parse pass treats
        // its presence as enabled and wraps each kanji in a button, which then
        // swallows whole-word taps before parseable lookup. Kanji drilldown
        // lives in the popover's composed-of chips instead.
        expect(spelling.hasAttribute('data-jpdb-reader-kanji-nav')).toBe(false);
        expect(spelling.querySelector('rt.jpdb-reader-furi')?.textContent).toBe('にんげん');
        expect(document.querySelector('.jpdb-reader-reading')).toBeNull();
        expect(document.querySelector('.jpdb-reader-meta-reading')).toBeNull();
    });

    it('does not append loose hiragana after a katakana detail headword', () => {
        const settings = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' as const };
        const card = newTabTestCard({
            spelling: 'カメラ',
            reading: 'かめら',
            frequencyRank: 900,
            cardState: ['new'],
        });
        const context: NewTabSearchDetailViewContext = {
            getSettings: () => settings,
            text: key => ({ noLocalResults: 'No local results', kanji: 'Kanji' })[key],
            sourceAttributes: () => '',
            dictionaryLabel: name => name,
            kanjiSourceTitle: sourceId => sourceId,
        };

        document.body.innerHTML = searchWordDetailHtml(card, {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            jpdbVocabularyInfo: null,
        }, context);

        expect(document.querySelector('rt.jpdb-reader-furi')).toBeNull();
        expect(document.querySelector('.jpdb-reader-reading')).toBeNull();
        expect(document.querySelector('.jpdb-reader-meta-reading')).toBeNull();
    });

    it('searches kana prefixes in search mode autocomplete', async () => {
        const { settings, searchTerms, root, searchApi } = createDictionarySearchModeFixture();

        try {
            searchApi.performSearch(root, 'おもし');
            await waitForExpect(() => {
                expect(newTabSearchAutocompleteText(root)).toContain('面白い');
            });
            expect(searchTerms).toHaveBeenCalledWith('おもし', expect.any(Number), settings.dictionaryPreferences, expect.any(Object));
        } finally {
            root.remove();
        }
    });

    it('re-runs a completed search after an away-and-back target switch', async () => {
        const { searchTerms, root, searchApi } = createDictionarySearchModeFixture();

        try {
            searchApi.performSearch(root, 'cat');
            await waitForExpect(() => expect(newTabSearchResultsText(root)).toContain('猫'));
            searchTerms.mockImplementation(async () => []);

            setActiveLearningTargetLanguage('ko');
            setActiveLearningTargetLanguage('ja');
            searchApi.renderSearch(root);

            await waitForExpect(() => {
                expect(searchTerms.mock.calls.length).toBeGreaterThanOrEqual(2);
                expect(newTabSearchResultsText(root)).not.toContain('猫');
            });
        } finally {
            resetActiveLearningTargetLanguage();
            root.remove();
        }
    });

    it('drops a kanji summary resolved after an away-and-back target switch', async () => {
        const { controller, root } = createDictionarySearchModeFixture();
        const lookup = deferred<{
            jpdb: null;
            jiten: null;
            rtk: null;
            vg: null;
            local: [];
            sourceInfo: null;
            sourceStates: {
                jpdb: 'unavailable';
                jiten: 'unavailable';
                rtk: 'unavailable';
                vg: 'unavailable';
                local: 'unavailable';
                origin: 'unavailable';
            };
        }>();
        const internals = controller as unknown as {
            loadKanjiDetails(character: string): typeof lookup.promise;
            searchController: {
                searchKanjiResult(character: string): Promise<unknown>;
            };
        };
        internals.loadKanjiDetails = vi.fn(() => lookup.promise);

        try {
            const pending = internals.searchController.searchKanjiResult('日');
            setActiveLearningTargetLanguage('ko');
            setActiveLearningTargetLanguage('ja');
            lookup.resolve({
                jpdb: null,
                jiten: null,
                rtk: null,
                vg: null,
                local: [],
                sourceInfo: null,
                sourceStates: {
                    jpdb: 'unavailable',
                    jiten: 'unavailable',
                    rtk: 'unavailable',
                    vg: 'unavailable',
                    local: 'unavailable',
                    origin: 'unavailable',
                },
            });

            await expect(pending).resolves.toBeNull();
        } finally {
            resetActiveLearningTargetLanguage();
            root.remove();
        }
    });

    it('does not search local dictionaries when the hosted store is empty', async () => {
        const { searchTerms, root, searchApi, controller } = createDictionarySearchModeFixture();
        (controller as unknown as { dependencies: { dictionaries: { hasDictionaries: () => Promise<boolean> } } })
            .dependencies.dictionaries.hasDictionaries = vi.fn(async () => false);

        try {
            searchApi.performSearch(root, 'cat');

            await waitForExpect(() => {
                expect(root.querySelector('[data-newtab-search-results]')?.textContent ?? '').not.toContain('猫');
            });
            expect(searchTerms).not.toHaveBeenCalled();
        } finally {
            root.remove();
        }
    });

    it('ignores stale kanji detail lookups after switching back to word mode', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const lookup = deferred<{ kanji: string; keyword: string; meanings: string[]; readings: []; components: []; vocabulary: []; frequencyRank: null }>();
        const card = newTabTestCard({ vid: 12, sid: 12, spelling: '返す', reading: 'かえす', kanjiKeyword: 'return' });
        try {
            const { controller, root } = createNewTabKanjiFrontFixture(card, {
                jpdbKanji: { lookup: vi.fn(() => lookup.promise) } as never,
                dictionaries: { lookupKanji: vi.fn(async () => []), lookup: vi.fn(async () => []) } as never,
            });

            (controller as unknown as { state: { mode: string; revealAnswer: boolean } }).state = { mode: 'word', revealAnswer: false };
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);
            lookup.resolve({ kanji: '返', keyword: 'stale keyword', meanings: ['stale keyword'], readings: [], components: [], vocabulary: [], frequencyRank: null });
            await Promise.resolve();
            await Promise.resolve();

            expect(newTabPromptText(root)).toContain('return');
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).not.toContain('stale keyword');
        } finally {
            restoreCanvas();
        }
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
        const card = newTabTestCard({ spelling: '読む', reading: 'よむ' });
        Object.assign(controller as unknown as {
            visibleWords: JPDBCard[];
            index: number;
            sourceLabel: string;
            state: { mode: string; revealAnswer: boolean };
        }, {
            visibleWords: [card],
            index: 0,
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', revealAnswer: true },
        });
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
});
