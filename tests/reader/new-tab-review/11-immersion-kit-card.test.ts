import { describe, expect, it, vi } from 'vitest';
import {
    registerNewTabReviewCleanup,
    WORD_ONLY_STUDY_DISABLED_STEPS,
    DEFAULT_SETTINGS,
    newTabTestCard,
    deferred,
    newTabImmersionExample,
    stubNewTabAudioPlayback,
    newTabAudioImmersionExample,
    newTabImmersionAudioRevealFixture,
    newTabFallbackCardFromText,
    newTabSentenceToken,
    dispatchPenControlTap,
    newTabPromptController,
    newTabBareController,
    renderSeededNewTabRoot,
    revealNewTabStudyCard,
    showNextNewTabWord,
    newTabVisibleWordFixture,
    NewTabController,
    installKanjiDoodle,
    waitForExpect,
} from './fixtures';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../../src/reader/languages/target-runtime';
import type {
    ImmersionKitExample,
    JPDBCard,
    JPDBToken,
} from './fixtures';

interface RevealedStudyInternals {
    visibleWords: JPDBCard[];
    index: number;
    state: { route: string; sort: string; filter: string; source: string; revealAnswer: boolean };
}

interface ImmersionStudyInternals extends RevealedStudyInternals {
    bindRootEvents(root: HTMLElement): void;
    renderNewTabImmersionCard(card: JPDBCard, examples: ImmersionKitExample[], index: number): HTMLElement;
    performNewTabImmersionAction(root: HTMLElement, surface: HTMLElement, action: string): void;
    playCurrentImmersionAudio(card: JPDBCard): Promise<void>;
    immersionCacheKey(card: JPDBCard): string;
    immersionCache: Map<string, Promise<ImmersionKitExample[]>>;
}

function seedRevealedStudyState(internals: RevealedStudyInternals, card: JPDBCard, source = 'dictionary'): void {
    internals.visibleWords = [card];
    internals.index = 0;
    internals.state = {
        route: 'study',
        sort: 'random',
        filter: 'study',
        source,
        revealAnswer: true,
    };
}

function mountImmersionStudy(controller: NewTabController, card: JPDBCard, examples: ImmersionKitExample[]) {
    const root = document.createElement('main');
    const meaning = document.createElement('div');
    meaning.dataset.newtabMeaning = 'true';
    root.append(meaning);
    document.body.append(root);
    const internals = controller as unknown as ImmersionStudyInternals;
    seedRevealedStudyState(internals, card);
    internals.immersionCache.set(internals.immersionCacheKey(card), Promise.resolve(examples));
    meaning.append(internals.renderNewTabImmersionCard(card, examples, 0));
    return { root, meaning, internals };
}

function newImmersionStudyController(options: {
    settings?: Partial<typeof DEFAULT_SETTINGS>;
    immersionKit: unknown;
    parser?: unknown;
    parseContent?: ConstructorParameters<typeof NewTabController>[0]['parseContent'];
}): NewTabController {
    return new NewTabController({
        getSettings: () => ({ ...DEFAULT_SETTINGS, ...options.settings }),
        anki: {} as never,
        jpdb: {} as never,
        jpdbKanji: {} as never,
        kanjiVG: {} as never,
        rtk: {} as never,
        immersionKit: options.immersionKit as never,
        jpdbReviewBridge: { onUpdate: () => () => {} } as never,
        parser: (options.parser ?? {}) as never,
        dictionaries: {} as never,
        onSettingsChange: vi.fn(),
        parseContent: options.parseContent ?? vi.fn(),
        applyTheme: vi.fn(),
        showSettings: vi.fn(),
        dismiss: vi.fn(),
    });
}

async function navigateToNextImmersion(internals: ImmersionStudyInternals, root: HTMLElement): Promise<void> {
    internals.performNewTabImmersionAction(root, root, 'next');
    await Promise.resolve();
    await Promise.resolve();
}

describe('new tab review — Immersion Kit card & doodle strokes', () => {
    registerNewTabReviewCleanup();


    it('toggles blurred Immersion Kit translations on the new tab card', () => {
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
                    <div class="jpdb-reader-example-translation" data-yomu-immersion-translation-blurred="true" role="button" tabindex="0" aria-label="Reveal translation">Either way, there wouldn't have been a peaceful alternative.</div>
                </div>
            </section>
        `;
        let toggles = 0;
        (controller as unknown as { toggleReveal(root: HTMLElement): void }).toggleReveal = () => {
            toggles += 1;
        };
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
        // Keyboard shortcuts listen at document level (0.6.151), so the root
        // must be in the document for keydown to reach the handler.
        document.body.append(root);

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

        setImmersionTranslationBlurred.mockClear();
        onSettingsChange.mockClear();

        const keyWasNotCanceled = translation.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));

        expect(keyWasNotCanceled).toBe(false);
        expect(settings.immersionKitRevealTranslationOnClick).toBe(true);
        expect(setImmersionTranslationBlurred).toHaveBeenCalledWith(true);
        expect(onSettingsChange).not.toHaveBeenCalled();
        expect(translation.dataset.yomuImmersionTranslationBlurred).toBe('true');
        expect(translation.getAttribute('role')).toBe('button');
        expect(translation.getAttribute('tabindex')).toBe('0');
        expect(translation.getAttribute('aria-label')).toBe('Reveal translation');
        expect(toggles).toBe(0);
        root.remove();
        controller.destroy();
    });

    it('renders new-tab Immersion Kit source metadata once and only available controls', () => {
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const examples: ImmersionKitExample[] = [
            {
                id: 'ik-1',
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
            },
            {
                id: 'ik-2',
                sentence: '中学生です。',
                sentenceWithFurigana: '',
                translation: 'I am a junior high school student.',
                sourceTitle: 'Mahou Shoujo Madoka Magica',
                titleSlug: 'mahou-shoujo-madoka-magica',
                category: 'anime',
                soundFile: '',
                imageFile: '',
                soundUrl: '',
                imageUrl: '',
            },
        ];
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS, immersionKitShowImages: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {
                mediaUrls: vi.fn(() => []),
            } as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const node = (controller as unknown as {
            renderNewTabImmersionCard(card: JPDBCard, examples: ImmersionKitExample[], index: number): HTMLElement;
        }).renderNewTabImmersionCard(card, examples, 0);

        expect(node.querySelector('.jpdb-reader-example-title')?.textContent).toBe('Mahou Shoujo Madoka Magica');
        expect(node.querySelector('.jpdb-reader-example-count')?.textContent).toBe('1/2');
        expect(node.querySelectorAll('.jpdb-reader-example-title')).toHaveLength(1);
        expect(node.querySelector('.jpdb-reader-example-inline-source')).toBeNull();
        const searchLinks = Array.from(node.querySelectorAll<HTMLAnchorElement>('.jpdb-reader-immersion-search-link'));
        expect(searchLinks.map(link => link.textContent?.trim())).toEqual([
            expect.stringContaining('View on Immersion Kit'),
            expect.stringContaining('View on Nadeshiko'),
        ]);
        expect(searchLinks.map(link => link.getAttribute('href'))).toEqual([
            'https://www.immersionkit.com/dictionary?keyword=%E4%B8%AD%E5%AD%A6%E7%94%9F&sort=sentence_length:asc&page=1',
            'https://nadeshiko.co/search/%E4%B8%AD%E5%AD%A6%E7%94%9F',
        ]);
        const sentence = node.querySelector<HTMLElement>('.jpdb-reader-example-sentence');
        expect(sentence?.classList.contains('jpdb-reader-parseable')).toBe(true);
        expect(sentence?.getAttribute('data-immersion-sentence-render')).toBe('');
        expect(sentence?.querySelector('.jpdb-reader-example-target')?.textContent).toBe('中学生');
        const translation = node.querySelector<HTMLElement>('.jpdb-reader-example-translation');
        expect(translation?.dataset.yomuImmersionTranslationBlurred).toBe('true');
        expect(node.querySelector('[data-immersion-action="audio"]')).toBeNull();
        expect(node.querySelector('[data-immersion-action="previous"]')).not.toBeNull();
        expect(node.querySelector('[data-immersion-action="next"]')).not.toBeNull();
    });

    it('filters single-kanji new-tab Immersion Kit hits to examples containing that kanji', async () => {
        const card = newTabTestCard({ spelling: '多', reading: 'た', source: 'fallback', meanings: [] });
        const badExample: ImmersionKitExample = {
            id: 'anime_the_cat_returns_000000759',
            sentence: 'ああ！ たぶんな！',
            sentenceWithFurigana: '',
            translation: 'Yes! Probably...',
            sourceTitle: 'The Cat Returns',
            titleSlug: 'the-cat-returns',
            category: 'anime',
            soundFile: '',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        };
        const goodExample: ImmersionKitExample = {
            id: 'anime_kakegurui_000006996',
            sentence: 'この塔には謎が多すぎる',
            sentenceWithFurigana: '',
            translation: 'There are too many mysteries in this tower.',
            sourceTitle: 'Kakegurui',
            titleSlug: 'kakegurui',
            category: 'anime',
            soundFile: '',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        };
        const search = vi.fn(async () => [badExample, goodExample]);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitShowImages: false }, {
            immersionKit: {
                search,
                mediaUrls: vi.fn(() => []),
            } as never,
        });

        await expect((controller as unknown as {
            loadImmersionExamples(card: JPDBCard): Promise<ImmersionKitExample[]>;
        }).loadImmersionExamples(card)).resolves.toEqual([goodExample]);

        expect(search).toHaveBeenCalledWith(
            '多',
            expect.anything(),
            expect.objectContaining({ requestLimit: 10, resultLimit: DEFAULT_SETTINGS.immersionKitLimit }),
        );
    });

    it('renders kanji new-tab Immersion Kit examples with source, count, and navigation controls', () => {
        const card = newTabTestCard({ spelling: '多', reading: 'た', source: 'fallback', meanings: [] });
        const example: ImmersionKitExample = {
            id: 'anime_kakegurui_000006996',
            sentence: 'この塔には謎が多すぎる',
            sentenceWithFurigana: '',
            translation: 'There are too many mysteries in this tower.',
            sourceTitle: 'Kakegurui',
            titleSlug: 'kakegurui',
            category: 'anime',
            soundFile: 'line.mp3',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        };
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitShowImages: false }, {
            immersionKit: {
                mediaUrls: vi.fn((_: ImmersionKitExample, kind: 'image' | 'sound') => kind === 'sound' ? ['https://media.test/kakegurui.mp3'] : []),
            } as never,
        });

        const node = (controller as unknown as {
            renderNewTabKanjiImmersionCard(card: JPDBCard, example: ImmersionKitExample, index: number, total: number): HTMLElement;
        }).renderNewTabKanjiImmersionCard(card, example, 0, 3);

        expect(node.classList.contains('jpdb-reader-newtab-kanji-immersion')).toBe(true);
        expect(node.dataset.newtabKanji).toBe('多');
        expect(node.querySelector('.jpdb-reader-example-source')?.textContent).toBe('Immersion Kit');
        expect(node.querySelector('.jpdb-reader-example-title')?.textContent).toBe('Kakegurui');
        expect(node.querySelector('.jpdb-reader-example-count')?.textContent).toBe('1/3');
        expect(node.querySelector('[data-immersion-action="previous"]')).not.toBeNull();
        expect(node.querySelector('[data-immersion-action="audio"]')).not.toBeNull();
        expect(node.querySelector('[data-immersion-action="next"]')).not.toBeNull();
    });

    it('does not render a delayed kanji example after an away-and-back target switch', async () => {
        const pending = deferred<ImmersionKitExample[]>();
        const example = newTabImmersionExample('多');
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: true, kanjiImmersionKitEnabled: true }, {
            parser: { fallbackCardFromText: vi.fn(newTabFallbackCardFromText) } as never,
        });
        const root = document.createElement('main');
        root.innerHTML = `
            <div data-newtab-kanji-immersion-mount>
                <details data-newtab-kanji-immersion-details open>
                    <div data-newtab-kanji-immersion-body>Loading</div>
                </details>
            </div>
        `;
        document.body.append(root);
        const internals = controller as unknown as {
            loadImmersionExamples(card: JPDBCard): Promise<ImmersionKitExample[]>;
            renderNewTabKanjiImmersion(root: HTMLElement, kanji: string): void;
        };
        internals.loadImmersionExamples = vi.fn(() => pending.promise);

        try {
            internals.renderNewTabKanjiImmersion(root, '多');
            expect(internals.loadImmersionExamples).toHaveBeenCalledOnce();
            expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
            expect(setActiveLearningTargetLanguage('ja')).not.toBeNull();
            pending.resolve([example]);
            await Promise.resolve();
            await Promise.resolve();

            expect(root.querySelector('[data-newtab-kanji-immersion]')).toBeNull();
            expect(root.querySelector('[data-newtab-kanji-immersion-body]')?.textContent).toBe('Loading');
        } finally {
            resetActiveLearningTargetLanguage();
            root.remove();
        }
    });

    it('navigates kanji new-tab Immersion Kit examples with the shared controls', async () => {
        const card = newTabTestCard({ spelling: '多', reading: 'た', source: 'fallback', meanings: [] });
        const examples: ImmersionKitExample[] = [
            {
                id: 'ik-1',
                sentence: '多くの人が来た。',
                sentenceWithFurigana: '',
                translation: 'Many people came.',
                sourceTitle: 'First Source',
                titleSlug: 'first-source',
                category: 'anime',
                soundFile: '',
                imageFile: '',
                soundUrl: '',
                imageUrl: '',
            },
            {
                id: 'ik-2',
                sentence: 'この塔には謎が多すぎる',
                sentenceWithFurigana: '',
                translation: 'There are too many mysteries in this tower.',
                sourceTitle: 'Kakegurui',
                titleSlug: 'kakegurui',
                category: 'anime',
                soundFile: '',
                imageFile: '',
                soundUrl: '',
                imageUrl: '',
            },
        ];
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitShowImages: false, newTabStudyDisabledSteps: [] }, {
            immersionKit: {
                search: vi.fn(async () => examples),
                mediaUrls: vi.fn(() => []),
            } as never,
            parser: {
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            parseContent: vi.fn(),
        });
        const root = document.createElement('main');
        const body = document.createElement('div');
        body.dataset.newtabKanjiImmersionBody = 'true';
        root.append(body);
        document.body.append(root);
        const privateController = controller as unknown as RevealedStudyInternals & {
            renderNewTabKanjiImmersionCard(card: JPDBCard, example: ImmersionKitExample, index: number, total: number): HTMLElement;
            performNewTabKanjiImmersionAction(root: HTMLElement, surface: HTMLElement, action: string): void;
            setStudyStepOverrideForCurrentCard(id: string | null): void;
        };
        seedRevealedStudyState(privateController, card);
        privateController.setStudyStepOverrideForCurrentCard('kanji-doodle:0');
        body.append(privateController.renderNewTabKanjiImmersionCard(card, examples[0]!, 0, examples.length));

        try {
            privateController.performNewTabKanjiImmersionAction(root, body.querySelector<HTMLElement>('[data-newtab-kanji-immersion]')!, 'next');

            await waitForExpect(() => {
                expect(body.textContent).toContain('この塔には謎が多すぎる');
                expect(body.querySelector('.jpdb-reader-example-count')?.textContent).toBe('2/2');
            });
        } finally {
            root.remove();
        }
    });

    it('updates new-tab Immersion Kit card state immediately while media hydrates', async () => {
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const played = stubNewTabAudioPlayback();
        const examples: ImmersionKitExample[] = [
            {
                id: 'ik-1',
                sentence: 'お母ちゃん中学生？',
                sentenceWithFurigana: '',
                translation: 'Are you a middle schooler, kid?',
                sourceTitle: 'First Source',
                titleSlug: 'first-source',
                category: 'anime',
                soundFile: 'first.mp3',
                imageFile: 'first.jpg',
                soundUrl: '',
                imageUrl: '',
            },
            {
                id: 'ik-2',
                sentence: '中学生です。',
                sentenceWithFurigana: '',
                translation: 'I am a junior high school student.',
                sourceTitle: 'Second Source',
                titleSlug: 'second-source',
                category: 'anime',
                soundFile: 'second.mp3',
                imageFile: 'second.jpg',
                soundUrl: '',
                imageUrl: '',
            },
        ];
        let resolveSecondImage!: (src: string) => void;
        const fetchBlobUrl = vi.fn((urls: string | string[]) => {
            const list = Array.isArray(urls) ? urls : [urls];
            if (list[0]?.includes('second.jpg')) {
                return new Promise<string>(resolve => {
                    resolveSecondImage = resolve;
                });
            }
            return Promise.resolve(`blob:http://localhost/${list[0]?.split('/').pop() ?? 'media'}`);
        });
        const parse = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [newTabSentenceToken(card, text)]));
        const controller = newImmersionStudyController({
            settings: { immersionKitShowImages: true },
            immersionKit: {
                mediaUrls: vi.fn((example: ImmersionKitExample, kind: 'image' | 'sound') => (
                    kind === 'image' ? [`https://media.test/${example.imageFile}`] : [`https://media.test/${example.soundFile}`]
                )),
                fetchBlobUrl,
            },
            parser: {
                canParse: () => true,
                parse,
            },
        });
        const { root, meaning, internals: privateController } = mountImmersionStudy(controller, card, examples);

        try {
            await navigateToNextImmersion(privateController, root);

            await waitForExpect(() => {
                // Readings on every parsed word is the shipped default, so the
                // annotated sentence carries its ruby text inline.
                expect(meaning.textContent).toContain('中学生(ちゅうがくせい)です。');
                expect(meaning.querySelector('.jpdb-reader-example-count')?.textContent).toBe('2/2');
                expect(meaning.querySelector<HTMLElement>('.jpdb-reader-example-card')?.dataset.immersionSentence).toBe('中学生です。');
                expect(meaning.querySelector<HTMLElement>('.jpdb-reader-example-card')?.dataset.immersionAudioUrls).toBe(JSON.stringify(['https://media.test/second.mp3']));
                expect(meaning.querySelector('.jpdb-reader-example-translation')?.textContent).toBe('I am a junior high school student.');
                expect(meaning.querySelector<HTMLElement>('.jpdb-reader-word')?.dataset.expression).toBe('中学生');
            });
            expect(meaning.querySelector<HTMLImageElement>('.jpdb-reader-example-image')?.getAttribute('src')).toBe('https://media.test/second.jpg');
            expect(fetchBlobUrl).toHaveBeenCalledWith(['https://media.test/second.jpg'], DEFAULT_SETTINGS.audioTimeoutMs, DEFAULT_SETTINGS.corsProxyUrl, DEFAULT_SETTINGS.interfaceLanguage);

            played.splice(0);
            await privateController.playCurrentImmersionAudio(card);
            expect(played).toEqual(['https://media.test/second.mp3']);
            expect(fetchBlobUrl).not.toHaveBeenCalledWith(['https://media.test/second.mp3'], DEFAULT_SETTINGS.audioTimeoutMs, DEFAULT_SETTINGS.corsProxyUrl, DEFAULT_SETTINGS.interfaceLanguage);
            await privateController.playCurrentImmersionAudio(card);
            expect(played).toEqual(['https://media.test/second.mp3', 'https://media.test/second.mp3']);

            resolveSecondImage('blob:http://localhost/second.jpg');

            await waitForExpect(() => {
                expect(meaning.querySelector<HTMLImageElement>('.jpdb-reader-example-image')?.getAttribute('src')).toBe('blob:http://localhost/second.jpg');
            });
        } finally {
            root.remove();
            vi.unstubAllGlobals();
        }
    });

    it('handles study-card Immersion next, previous, and audio through shared DOM controls', async () => {
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const played = stubNewTabAudioPlayback();
        const examples: ImmersionKitExample[] = [
            {
                id: 'ik-1',
                sentence: 'お母ちゃん中学生？',
                sentenceWithFurigana: '',
                translation: 'Are you a middle schooler, kid?',
                sourceTitle: 'First Source',
                titleSlug: 'first-source',
                category: 'anime',
                soundFile: 'first.mp3',
                imageFile: '',
                soundUrl: '',
                imageUrl: '',
            },
            {
                id: 'ik-2',
                sentence: '中学生です。',
                sentenceWithFurigana: '',
                translation: 'I am a junior high school student.',
                sourceTitle: 'Second Source',
                titleSlug: 'second-source',
                category: 'anime',
                soundFile: 'second.mp3',
                imageFile: '',
                soundUrl: '',
                imageUrl: '',
            },
        ];
        const controller = newImmersionStudyController({
            settings: { immersionKitShowImages: false, immersionKitAutoPlayAudio: false },
            immersionKit: {
                mediaUrls: vi.fn((example: ImmersionKitExample, kind: 'image' | 'sound') => (
                    kind === 'image' ? [] : [`https://media.test/${example.soundFile}`]
                )),
                fetchBlobUrl: vi.fn(),
            },
        });
        const { root, meaning, internals: privateController } = mountImmersionStudy(controller, card, examples);
        privateController.bindRootEvents(root);

        try {
            const activeSentence = () => meaning.querySelector<HTMLElement>('.jpdb-reader-example-card')?.dataset.immersionSentence;
            expect(activeSentence()).toBe('お母ちゃん中学生？');

            meaning.querySelector<HTMLButtonElement>('[data-immersion-action="next"]')?.click();
            await waitForExpect(() => expect(activeSentence()).toBe('中学生です。'));
            expect(meaning.querySelector('.jpdb-reader-example-count')?.textContent).toBe('2/2');

            meaning.querySelector<HTMLButtonElement>('[data-immersion-action="audio"]')?.click();
            await waitForExpect(() => expect(played).toEqual(['https://media.test/second.mp3']));
            meaning.querySelector<HTMLButtonElement>('[data-immersion-action="audio"]')?.click();
            await waitForExpect(() => expect(played).toEqual(['https://media.test/second.mp3', 'https://media.test/second.mp3']));

            meaning.querySelector<HTMLButtonElement>('[data-immersion-action="previous"]')?.click();
            await waitForExpect(() => expect(activeSentence()).toBe('お母ちゃん中学生？'));
            expect(meaning.querySelector('.jpdb-reader-example-count')?.textContent).toBe('1/2');
        } finally {
            root.remove();
            vi.unstubAllGlobals();
        }
    });

    it('does not block new-tab Immersion Kit navigation on sentence parsing', async () => {
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const examples: ImmersionKitExample[] = [
            {
                id: 'ik-1',
                sentence: 'お母ちゃん中学生？',
                sentenceWithFurigana: '',
                translation: 'Are you a middle schooler, kid?',
                sourceTitle: 'First Source',
                titleSlug: 'first-source',
                category: 'anime',
                soundFile: '',
                imageFile: '',
                soundUrl: '',
                imageUrl: '',
            },
            {
                id: 'ik-2',
                sentence: '中学生です。',
                sentenceWithFurigana: '',
                translation: 'I am a junior high school student.',
                sourceTitle: 'Second Source',
                titleSlug: 'second-source',
                category: 'anime',
                soundFile: '',
                imageFile: '',
                soundUrl: '',
                imageUrl: '',
            },
        ];
        let resolveParse!: (tokens: JPDBToken[][]) => void;
        const parse = vi.fn(() => new Promise<JPDBToken[][]>(resolve => {
            resolveParse = resolve;
        }));
        const parseContent = vi.fn();
        const controller = newImmersionStudyController({
            settings: { immersionKitShowImages: false },
            immersionKit: {
                mediaUrls: vi.fn(() => []),
                fetchBlobUrl: vi.fn(),
            },
            parser: {
                canParse: () => true,
                parse,
            },
            parseContent,
        });
        const { root, meaning, internals: privateController } = mountImmersionStudy(controller, card, examples);

        try {
            await navigateToNextImmersion(privateController, root);

            expect(meaning.textContent).toContain('中学生です。');
            expect(meaning.querySelector('.jpdb-reader-example-count')?.textContent).toBe('2/2');
            expect(parse).toHaveBeenCalledWith(['中学生です。'], expect.anything());
            expect(parseContent).not.toHaveBeenCalled();

            await privateController.playCurrentImmersionAudio(card);
            expect(parse).toHaveBeenCalledTimes(1);
            expect(parseContent).not.toHaveBeenCalled();

            resolveParse([[newTabSentenceToken(card, '中学生です。')]]);

            await waitForExpect(() => {
                expect(meaning.querySelector<HTMLElement>('.jpdb-reader-word')?.dataset.expression).toBe('中学生');
            });
        } finally {
            root.remove();
        }
    });

    it('times out hung new-tab Immersion Kit example loads', async () => {
        vi.useFakeTimers();
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, audioTimeoutMs: 1000 }, {
            immersionKit: {
                search: vi.fn(() => new Promise<ImmersionKitExample[]>(() => undefined)),
                mediaUrls: vi.fn(() => []),
            } as never,
        });

        try {
            const load = (controller as unknown as { loadImmersionExamples(card: JPDBCard): Promise<ImmersionKitExample[]> })
                .loadImmersionExamples(card);
            await vi.advanceTimersByTimeAsync(2000);

            await expect(load).resolves.toEqual([]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('uses JPDB related vocabulary queries when new-tab Immersion Kit reveal has no direct examples', async () => {
        const card = newTabTestCard({ vid: 44, sid: 44, spelling: '甘言', reading: 'かんげん' });
        const example: ImmersionKitExample = {
            id: 'ik-related',
            sentence: '甘言蜜語に乗せられた。',
            sentenceWithFurigana: '',
            translation: 'I was taken in by sweet words.',
            sourceTitle: 'Test Source',
            titleSlug: 'test-source',
            category: 'anime',
            soundFile: '',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        };
        const search = vi.fn(async (query: string): Promise<ImmersionKitExample[]> => (
            query === '甘言蜜語' ? [example] : []
        ));
        const lookup = vi.fn(async () => ({
            meanings: [],
            compounds: [{ term: '甘言蜜語', reading: 'かんげんみつご', meaning: 'honeyed words', url: 'https://jpdb.io/vocabulary/1' }],
            examples: [],
        }));
        const { controller, root } = newTabVisibleWordFixture(
            () => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', immersionKitShowImages: false }),
            {
                card,
                index: 0,
                sourceLabel: 'JPDB',
                source: 'jpdb',
                revealAnswer: true,
                controllerOverrides: {
                    immersionKit: {
                        search,
                        mediaUrls: vi.fn(() => []),
                    } as never,
                    jpdbVocabulary: { lookup },
                },
            },
        );

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-newtab-immersion')?.textContent).toContain('甘言蜜語に乗せられた。');
            });
            expect(lookup).toHaveBeenCalledWith(44, '甘言', 'かんげん');
            expect(search.mock.calls.map(([query]) => query)).toEqual(['甘言', 'かんげん', '甘言蜜語']);
        } finally {
            root.remove();
        }
    });

    it('prefetches new-tab Immersion Kit examples before reveal but renders them only on reveal', async () => {
        const read = newTabTestCard({ vid: 1, sid: 1, spelling: '読む', reading: 'よむ', sentence: '本を読む。' });
        const write = newTabTestCard({ vid: 2, sid: 2, spelling: '書く', reading: 'かく', sentence: '名前を書く。' });
        const walk = newTabTestCard({ vid: 3, sid: 3, spelling: '歩く', reading: 'あるく', sentence: '道を歩く。' });
        const example = (id: string, sentence: string, translation: string, sourceTitle: string): ImmersionKitExample => ({
            id,
            sentence,
            sentenceWithFurigana: '',
            translation,
            sourceTitle,
            titleSlug: sourceTitle.toLowerCase().replace(/\s+/g, '-'),
            category: 'anime',
            soundFile: '',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        });
        const examplesByQuery = new Map<string, ImmersionKitExample[]>([
            ['読む', [example('ik-read', '本を読む。', 'Read a book.', 'Read Source')]],
            ['書く', [example('ik-write', '名前を書く。', 'Write a name.', 'Write Source')]],
            ['歩く', [example('ik-walk', '道を歩く。', 'Walk the path.', 'Walk Source')]],
        ]);
        const search = vi.fn(async (query: string, _settings?: unknown, _options?: unknown) => examplesByQuery.get(query) ?? []);
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitShowImages: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {
                search,
                mediaUrls: vi.fn(() => []),
            } as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderSeededNewTabRoot(controller, {
            allWords: [read, write, walk],
            visibleWords: [read, write, walk],
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'dictionary', revealAnswer: false },
            appendToDocument: true,
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, read);
            await waitForExpect(() => {
                expect(search.mock.calls.map(([query]) => query)).toContain('読む');
            });
            expect(root.querySelector('.jpdb-reader-newtab-immersion')).toBeNull();
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

            showNextNewTabWord(controller);
            await waitForExpect(() => {
                expect(search.mock.calls.map(([query]) => query)).toContain('書く');
            });
            const writeSearchesBeforeReveal = search.mock.calls.map(([query]) => query).filter(query => query === '書く').length;
            expect(root.querySelector('.jpdb-reader-newtab-immersion')).toBeNull();

            revealNewTabStudyCard(root);

            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-newtab-immersion')?.textContent).toContain('名前を書く。');
            });
            expect(search).toHaveBeenCalledWith(
                '書く',
                expect.anything(),
                expect.objectContaining({ requestLimit: 10, resultLimit: DEFAULT_SETTINGS.immersionKitLimit }),
            );
            expect(search.mock.calls.map(([query]) => query).filter(query => query === '書く')).toHaveLength(writeSearchesBeforeReveal);
        } finally {
            root.remove();
        }
    });

    it('renders prefetched new-tab Immersion Kit reveal sentence tokens before a raw parse pass', async () => {
        const card = newTabTestCard({ vid: 88, sid: 44, spelling: '中学生', reading: 'ちゅうがくせい' });
        const sentence = 'お母ちゃん中学生？';
        const example = { ...newTabImmersionExample('中学生'), sentence };
        const parse = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [newTabSentenceToken(card, text)]));
        const search = vi.fn(async () => [example]);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS, immersionKitShowImages: false, ankiEnabled: false }, {
            immersionKit: {
                search,
                mediaUrls: vi.fn(() => []),
            } as never,
            parser: {
                canParse: () => true,
                parse,
                getCachedCard: vi.fn(() => card),
            } as never,
        });
        const root = renderSeededNewTabRoot(controller, {
            allWords: [card],
            visibleWords: [card],
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'dictionary', revealAnswer: false },
            appendToDocument: true,
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);
            await waitForExpect(() => expect(parse).toHaveBeenCalledWith([sentence], expect.objectContaining({ includeLocalPitch: true })));
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

            revealNewTabStudyCard(root);

            await waitForExpect(() => {
                const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-immersion .jpdb-reader-word');
                expect(word?.dataset.expression).toBe('中学生');
                expect(word?.classList.contains('jpdb-reader-example-target')).toBe(true);
            });
            expect(parse).toHaveBeenCalledTimes(1);
            expect(root.querySelector('.jpdb-reader-newtab-immersion mark.jpdb-reader-example-target')).toBeNull();
        } finally {
            root.remove();
        }
    });

    it('retries new-tab sentence parsing after an all-fallback timeout result', async () => {
        const fallbackCard = newTabTestCard({ vid: -1, sid: -1, spelling: '分', reading: '', source: 'fallback' });
        const parsedCard = newTabTestCard({ vid: 1502860, sid: 0, spelling: '分かりません', reading: 'わかりません', source: 'jpdb' });
        const parse = vi.fn()
            .mockResolvedValueOnce([[newTabSentenceToken(fallbackCard, '日本語は分かりません。')]])
            .mockResolvedValueOnce([[newTabSentenceToken(parsedCard, '日本語は分かりません。')]]);
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            parser: {
                canParse: () => true,
                parse,
            } as never,
        });
        const internals = controller as unknown as { parsedNewTabSentenceTokens(sentence: string): Promise<JPDBToken[]> };

        await expect(internals.parsedNewTabSentenceTokens('日本語は分かりません。'))
            .resolves.toEqual([expect.objectContaining({ card: expect.objectContaining({ source: 'fallback' }) })]);
        await expect(internals.parsedNewTabSentenceTokens('日本語は分かりません。'))
            .resolves.toEqual([expect.objectContaining({ card: expect.objectContaining({ spelling: '分かりません' }) })]);

        expect(parse).toHaveBeenCalledTimes(2);
    });

    it('renders prefetched next-word front sentence tokens without waiting for parseContent', async () => {
        const first = newTabTestCard({ vid: 1, sid: 1, spelling: '読む', reading: 'よむ', sentence: '本を読む。' });
        const second = newTabTestCard({ vid: 2, sid: 2, spelling: '書く', reading: 'かく', sentence: '名前を書く。' });
        const examplesByQuery = new Map<string, ImmersionKitExample[]>([
            ['読む', [{ ...newTabImmersionExample('読む'), sentence: '本を読む。' }]],
            ['書く', [{ ...newTabImmersionExample('書く'), sentence: '名前を書く。' }]],
        ]);
        const parseContent = vi.fn();
        const parse = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [
            newTabSentenceToken(text.includes('書く') ? second : first, text),
        ]));
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS, immersionKitShowImages: false, ankiEnabled: false }, {
            immersionKit: {
                search: vi.fn(async (query: string) => examplesByQuery.get(query) ?? []),
                mediaUrls: vi.fn(() => []),
            } as never,
            parser: {
                canParse: () => true,
                parse,
            } as never,
            parseContent,
        });
        const root = renderSeededNewTabRoot(controller, {
            allWords: [first, second],
            visibleWords: [first, second],
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'dictionary', revealAnswer: false },
            appendToDocument: true,
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, first);
            await waitForExpect(() => expect(parse).toHaveBeenCalledWith(['名前を書く。'], expect.anything()));
            parseContent.mockClear();
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

            showNextNewTabWord(controller);

            await waitForExpect(() => {
                const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-sentence .jpdb-reader-word');
                expect(word?.dataset.expression).toBe('書く');
                expect(word?.classList.contains('jpdb-reader-example-target')).toBe(true);
            });
            expect(parseContent).not.toHaveBeenCalled();
        } finally {
            root.remove();
        }
    });

    it('stops new-tab Immersion Kit fallback searches after rate limiting', async () => {
        const card = newTabTestCard({ spelling: '日本語', reading: 'にほんご' });
        const search = vi.fn(async (_query: string) => {
            throw new Error('Immersion Kit request failed (429).');
        });
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            immersionKit: {
                search,
                mediaUrls: vi.fn(() => []),
            } as never,
        });

        await expect((controller as unknown as {
            loadImmersionExamples(card: JPDBCard): Promise<ImmersionKitExample[]>;
        }).loadImmersionExamples(card)).resolves.toEqual([]);

        expect(search.mock.calls.map(([query]) => query)).toEqual(['日本語']);
    });

    it('plays Immersion Kit audio by default when revealing a new-tab word card', async () => {
        const example = newTabAudioImmersionExample('ik-1');
        const search = vi.fn(async () => [example]);
        const { root, played, reveal } = newTabImmersionAudioRevealFixture(search);

        try {
            reveal();

            await waitForExpect(() => expect(played).toEqual(['https://media.test/line.mp3']));
            expect(search).toHaveBeenCalledWith(
                '発音',
                expect.objectContaining({ immersionKitAutoPlayAudio: true }),
                expect.objectContaining({ requestLimit: 10, resultLimit: DEFAULT_SETTINGS.immersionKitLimit }),
            );
        } finally {
            root.remove();
        }
    });

    it('plays direct new-tab Immersion Kit audio while blob hydration is still pending', async () => {
        const example = newTabAudioImmersionExample('ik-direct');
        const search = vi.fn(async () => [example]);
        const fetchBlobUrl = vi.fn(() => new Promise<string>(() => undefined));
        const { root, played, reveal } = newTabImmersionAudioRevealFixture(search, { fetchBlobUrl });

        try {
            reveal();

            await waitForExpect(() => expect(played).toEqual(['https://media.test/line.mp3']));
        } finally {
            root.remove();
        }
    });

    it('falls back to blob-hydrated new-tab Immersion Kit audio when direct playback fails', async () => {
        const example = newTabAudioImmersionExample('ik-blob-fallback');
        const search = vi.fn(async () => [example]);
        const fetchBlobUrl = vi.fn(async () => 'blob:http://localhost/line.mp3');
        const { root, played, reveal } = newTabImmersionAudioRevealFixture(search, { fetchBlobUrl });
        class DirectBlockedAudio {
            playbackRate = 1;
            ended = false;
            constructor(public src: string) {}
            addEventListener(): void {}
            play(): Promise<void> {
                played.push(this.src);
                return this.src.startsWith('blob:')
                    ? Promise.resolve()
                    : Promise.reject(new Error('direct media blocked'));
            }
            pause(): void {}
        }
        vi.stubGlobal('Audio', DirectBlockedAudio);

        try {
            reveal();

            await waitForExpect(() => expect(played).toEqual(['https://media.test/line.mp3', 'blob:http://localhost/line.mp3']));
            expect(fetchBlobUrl).toHaveBeenCalledWith(['https://media.test/line.mp3'], DEFAULT_SETTINGS.audioTimeoutMs, DEFAULT_SETTINGS.corsProxyUrl, DEFAULT_SETTINGS.interfaceLanguage);
        } finally {
            root.remove();
            vi.unstubAllGlobals();
        }
    });

    it('does not append or autoplay delayed Immersion Kit reveal content after hiding the card', async () => {
        const example = newTabAudioImmersionExample('ik-delayed');
        let resolveSearch!: (examples: ImmersionKitExample[]) => void;
        const search = vi.fn(() => new Promise<ImmersionKitExample[]>(resolve => {
            resolveSearch = resolve;
        }));
        const { root, played, fetchBlobUrl, reveal } = newTabImmersionAudioRevealFixture(search);

        try {
            reveal();
            reveal();
            resolveSearch([example]);
            await Promise.resolve();
            await Promise.resolve();

            expect(root.querySelector('.jpdb-reader-newtab-immersion')).toBeNull();
            expect(fetchBlobUrl).not.toHaveBeenCalled();
            expect(played).toEqual([]);
        } finally {
            root.remove();
            vi.unstubAllGlobals();
        }
    });

    it('highlights parsed new-tab Immersion Kit targets and opens lookups from example words', async () => {
        const card = newTabTestCard({ vid: 88, sid: 44, spelling: '中学生', reading: 'ちゅうがくせい' });
        const lookupText = vi.fn();
        const showLookupCard = vi.fn();
        const parseContent = vi.fn((root: HTMLElement) => {
            const sentence = root.querySelector<HTMLElement>('[data-immersion-sentence-render]');
            sentence!.innerHTML = 'お母ちゃん<span class="jpdb-reader-word" data-vid="88" data-sid="44" data-sentence="お母ちゃん中学生？" tabindex="-1">中学生</span>？';
        });
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitShowImages: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {
                mediaUrls: vi.fn(() => []),
            } as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: { getCachedCard: vi.fn(() => card) } as never,
            dictionaries: {} as never,
            parseContent,
            lookupText,
            showLookupCard,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        seedRevealedStudyState(controller as unknown as RevealedStudyInternals, card, 'auto');
        const root = document.createElement('main');
        const node = (controller as unknown as {
            renderNewTabImmersionCard(card: JPDBCard, examples: ImmersionKitExample[], index: number): HTMLElement;
            parseNewTabImmersionExample(root: HTMLElement, card: JPDBCard, key: string): Promise<void>;
            bindRootEvents(root: HTMLElement): void;
        }).renderNewTabImmersionCard(card, [{
            id: 'ik-1',
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
        }], 0);
        root.append(node);
        document.body.append(root);
        try {
            await (controller as unknown as {
                parseNewTabImmersionExample(root: HTMLElement, card: JPDBCard, key: string): Promise<void>;
            }).parseNewTabImmersionExample(node, card, `${card.vid}:${card.sid}:${card.spelling}:${card.reading}`);
            const word = root.querySelector<HTMLElement>('.jpdb-reader-word')!;
            expect(parseContent).toHaveBeenCalledWith(
                node,
                expect.objectContaining({ jpdbTimeoutMs: 1_200 }),
            );
            expect(word.classList.contains('jpdb-reader-example-target')).toBe(true);

            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
            const clickWasNotCanceled = word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(clickWasNotCanceled).toBe(false);
            expect(showLookupCard).toHaveBeenCalledWith(card, 'お母ちゃん中学生？', word, expect.objectContaining({
                navigation: 'push-current',
                reuseActivePopover: true,
                userGesture: true,
            }));
            expect(lookupText).not.toHaveBeenCalled();
        } finally {
            root.remove();
        }
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
            <div data-selection-target>Readings and components</div>
        `;
        document.body.append(root);
        const stage = root.querySelector<HTMLElement>('.jpdb-reader-doodle-stage')!;
        const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
        const trace = root.querySelector<HTMLButtonElement>('[data-doodle-trace]')!;
        const selectionTarget = root.querySelector<HTMLElement>('[data-selection-target]')!;
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
        canvas.dispatchEvent(Object.assign(new Event('lostpointercapture'), {
            pointerId: 9,
            pointerType: 'pen',
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
        expect(document.documentElement.classList.contains('jpdb-reader-doodle-active')).toBe(true);

        const outsideRange = document.createRange();
        outsideRange.selectNodeContents(selectionTarget);
        document.getSelection()?.removeAllRanges();
        document.getSelection()?.addRange(outsideRange);
        document.dispatchEvent(new Event('selectionchange'));
        expect(document.getSelection()?.isCollapsed).toBe(true);

        const contextMenu = new Event('contextmenu', { bubbles: true, cancelable: true });
        selectionTarget.dispatchEvent(contextMenu);
        expect(contextMenu.defaultPrevented).toBe(true);

        const range = document.createRange();
        range.selectNodeContents(trace);
        document.getSelection()?.removeAllRanges();
        document.getSelection()?.addRange(range);
        const selectStart = new Event('selectstart', { bubbles: true, cancelable: true });
        trace.dispatchEvent(selectStart);
        expect(selectStart.defaultPrevented).toBe(true);
        expect(document.getSelection()?.isCollapsed).toBe(true);

        (root as HTMLElement & { __yomuKanjiDoodleCleanup?: () => void }).__yomuKanjiDoodleCleanup?.();
        root.remove();
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: originalGetContext,
        });
    });

    it('activates new-tab doodle controls from Apple Pencil pointer taps without duplicate clicks', () => {
        const controller = newTabBareController();
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.innerHTML = '<button type="button" data-doodle-trace>Show trace</button>';
        document.body.append(root);
        const trace = root.querySelector<HTMLButtonElement>('[data-doodle-trace]')!;
        const clicks = vi.fn(() => {
            trace.textContent = 'Hide trace';
        });
        trace.addEventListener('click', clicks);

        try {
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

            const up = dispatchPenControlTap(trace);
            expect(up.defaultPrevented).toBe(true);
            expect(clicks).toHaveBeenCalledTimes(1);
            expect(trace.textContent).toBe('Hide trace');

            const duplicateClick = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: 25,
                clientY: 18,
                detail: 1,
            });
            trace.dispatchEvent(duplicateClick);
            expect(duplicateClick.defaultPrevented).toBe(true);
            expect(clicks).toHaveBeenCalledTimes(1);
        } finally {
            root.remove();
        }
    });
});
