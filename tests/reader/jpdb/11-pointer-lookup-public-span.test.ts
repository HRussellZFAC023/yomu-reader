import { describe, expect, it, vi } from 'vitest';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../../src/reader/languages/active';
import {
    registerReaderHelpersCleanup,
    DEFAULT_SETTINGS,
    ReaderApp,
    appendRenderedReaderWord,
    card,
    configureRenderedWordTest,
    createPointerEvent,
    currentJapaneseLookupScopeMatcher,
    defaultDictionaryLookupLinks,
    jitenTestCard,
    japaneseLearningTargetMatcher,
    lookupCandidateFromPoint,
    pointerTextCandidate,
    pointerTextLookupFromTextNode,
    renderTokensToHtml,
    readTokenChoiceCommandCapability,
    setInnerHtml,
    testFallbackCard,
    testPublicCard,
    waitForExpect,
    withElementsFromPointMock,
    withPointerTextLookupMock,
} from './fixtures';
import type {
    JPDBCard,
    JPDBToken,
    TestPointerTextCandidate,
    TestPointerTextOptions,
    TestPointerTextTrigger,
    TestRenderedWordOptions,
} from './fixtures';

registerReaderHelpersCleanup();

type ParserOwnedPointerInternals = {
    settings: typeof DEFAULT_SETTINGS;
    parser: {
        lookupTokenAt(
            text: string,
            offset: number,
            range: { start: number; end: number },
            options?: unknown,
        ): Promise<JPDBToken | undefined>;
    };
    showPointerTextCard(
        lookupCard: JPDBCard,
        sentence: string,
        candidate: TestPointerTextCandidate,
        range: { start: number; end: number },
        trigger: TestPointerTextTrigger,
        options: TestPointerTextOptions,
    ): Promise<void>;
    showFirstPointerTextCandidate(
        candidate: TestPointerTextCandidate,
        sentence: string,
        trigger: TestPointerTextTrigger,
        options: TestPointerTextOptions,
    ): Promise<void>;
};

function parserOwnedPointerInternals(app: ReaderApp): ParserOwnedPointerInternals {
    return app as unknown as ParserOwnedPointerInternals;
}

function parserOwnedPointerToken(
    lookupCard: JPDBCard,
    sentence: string,
    start: number,
    end: number,
): JPDBToken {
    return {
        card: lookupCard,
        start,
        end,
        length: end - start,
        rubies: [],
        pitchClass: '',
        sentence,
    };
}

describe('reader helpers', () => {
    it('builds pointer lookup context across split inline kana text', () => {
        document.body.innerHTML = '<p><span>に</span><span>ほ</span><span>ん</span><span>ご</span><span>の</span><span>じ</span><span>か</span><span>ん</span></p>';
        const nodes = Array.from(document.querySelectorAll('span'), span => span.firstChild as Text);

        const first = pointerTextLookupFromTextNode(nodes[0], 0);
        const middle = pointerTextLookupFromTextNode(nodes[1], 0);
        const last = pointerTextLookupFromTextNode(nodes[3], 0);

        expect(first).toMatchObject({ text: 'にほんごのじかん', offset: 0, start: 0, end: 8 });
        expect(middle).toMatchObject({ text: 'にほんごのじかん', offset: 1, start: 0, end: 8 });
        expect(last).toMatchObject({ text: 'にほんごのじかん', offset: 3, start: 0, end: 8 });
    });

    it('passes the full all-kana geometry run to the parser-owned span resolver', async () => {
        const app = new ReaderApp();
        document.body.innerHTML = '<p>にほんごのじかん</p>';
        const paragraph = document.querySelector<HTMLElement>('p')!;
        const sentence = paragraph.textContent!;
        const jpdbCard: JPDBCard = {
            ...card,
            vid: 1464530,
            sid: 0,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            cardState: ['not-in-deck'],
            pitchAccent: ['LHHH'],
        };
        const token = parserOwnedPointerToken(jpdbCard, sentence, 0, 4);
        const lookupTokenAt = vi.fn(async () => token);
        const showPointerTextCard = vi.fn(async () => undefined);
        const candidate = pointerTextCandidate(sentence, paragraph, 1);
        const internals = parserOwnedPointerInternals(app);
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jpdbDefinitionsEnabled: true,
            localDictionariesEnabled: true,
        };
        internals.parser = { lookupTokenAt };
        internals.showPointerTextCard = showPointerTextCard;

        try {
            await internals.showFirstPointerTextCandidate(candidate, sentence, 'modal', { userGesture: true });

            expect(lookupTokenAt).toHaveBeenCalledOnce();
            expect(lookupTokenAt).toHaveBeenCalledWith(
                sentence,
                1,
                { start: 0, end: sentence.length },
                expect.objectContaining({ includeLocalPitch: false, requireApi: true, requireJpdb: true }),
            );
            expect(showPointerTextCard).toHaveBeenCalledWith(
                jpdbCard,
                sentence,
                candidate,
                token,
                'modal',
                { userGesture: true },
            );
        } finally {
            app.destroy();
        }
    });

    it('delegates non-Japanese pointer text to the same parser-owned resolver', async () => {
        const app = new ReaderApp();
        document.body.innerHTML = '<p>我去市場</p>';
        const paragraph = document.querySelector<HTMLElement>('p')!;
        const sentence = paragraph.textContent!;
        const lookupCard: JPDBCard = {
            ...card,
            vid: -501,
            sid: 0,
            spelling: '去',
            reading: '去',
            source: 'local',
        };
        const token = parserOwnedPointerToken(lookupCard, sentence, 1, 2);
        const lookupTokenAt = vi.fn(async () => token);
        const showPointerTextCard = vi.fn(async () => undefined);
        const candidate = pointerTextCandidate(sentence, paragraph, 1);
        const internals = parserOwnedPointerInternals(app);
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jpdbDefinitionsEnabled: true,
            localDictionariesEnabled: true,
        };
        internals.parser = { lookupTokenAt };
        internals.showPointerTextCard = showPointerTextCard;
        setActiveLearningTargetLanguage('zh');

        try {
            await internals.showFirstPointerTextCandidate(
                candidate,
                sentence,
                'modal',
                { userGesture: true },
            );

            expect(lookupTokenAt).toHaveBeenCalledWith(
                sentence,
                1,
                { start: 0, end: sentence.length },
                expect.any(Object),
            );
            expect(showPointerTextCard).toHaveBeenCalledWith(
                lookupCard,
                sentence,
                candidate,
                token,
                'modal',
                { userGesture: true },
            );
        } finally {
            resetActiveLearningTargetLanguage();
            app.destroy();
        }
    });

    it('uses the deinflected span returned by the parser-owned resolver', async () => {
        const app = new ReaderApp();
        document.body.innerHTML = '<p>異世界転生疑ってたわけじゃないけどこれは実際に</p>';
        const paragraph = document.querySelector<HTMLElement>('p')!;
        const sentence = paragraph.textContent!;
        const lookupCard = testPublicCard({
            vid: 1495000,
            spelling: '疑う',
            reading: 'うたがう',
            pitchAccent: ['LHLL'],
        });
        const token = parserOwnedPointerToken(lookupCard, sentence, 5, 9);
        const lookupTokenAt = vi.fn(async () => token);
        const showPointerTextCard = vi.fn(async () => undefined);
        const candidate = pointerTextCandidate(sentence, paragraph, sentence.indexOf('疑'));
        const internals = parserOwnedPointerInternals(app);
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jpdbDefinitionsEnabled: true,
            localDictionariesEnabled: true,
        };
        internals.parser = { lookupTokenAt };
        internals.showPointerTextCard = showPointerTextCard;

        try {
            await internals.showFirstPointerTextCandidate(candidate, sentence, 'modal', { userGesture: true });

            expect(lookupTokenAt).toHaveBeenCalledWith(
                sentence,
                sentence.indexOf('疑'),
                { start: 0, end: sentence.length },
                expect.any(Object),
            );
            expect(showPointerTextCard).toHaveBeenCalledWith(
                lookupCard,
                sentence,
                candidate,
                token,
                'modal',
                { userGesture: true },
            );
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('resolves an uncached rendered word through the shared text lookup', async () => {
        const app = new ReaderApp();
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-pitch-unknown';
        word.dataset.vid = '-101';
        word.dataset.sid = '-101';
        word.dataset.expression = 'で';
        word.dataset.sentence = 'ここで読む';
        word.textContent = 'で';
        document.body.append(word);
        const fallbackCard = testFallbackCard({ vid: -101, sid: -101, spelling: 'で' });
        const showCard = vi.fn(async () => undefined);
        const fallbackCardFromText = vi.fn(() => fallbackCard);
        const parseJapanese = vi.fn(async () => []);
        const publicLookupCard = vi.fn(async () => undefined);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parser: {
                getCachedCard(vid: number, sid: number): JPDBCard | undefined;
                fallbackCardFromText(text: string): JPDBCard;
            };
            parseJapanese: typeof parseJapanese;
            publicLookupCard: typeof publicLookupCard;
            jitenPublicVocabulary: { lookupMany(terms: readonly string[]): Promise<Map<string, JPDBCard>> };
            showCard: typeof showCard;
            showWord(word: HTMLElement, options?: TestRenderedWordOptions): Promise<void>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, apiKey: 'jpdb-key' };
        internals.parser = {
            getCachedCard: vi.fn(() => undefined),
            fallbackCardFromText,
        };
        internals.parseJapanese = parseJapanese;
        internals.publicLookupCard = publicLookupCard;
        internals.jitenPublicVocabulary = { lookupMany: vi.fn(async () => new Map<string, JPDBCard>()) };
        internals.showCard = showCard;

        try {
            await internals.showWord(word, { trigger: 'click', userGesture: true, fastInitialRender: true });

            expect(parseJapanese).not.toHaveBeenCalled();
            expect(publicLookupCard).not.toHaveBeenCalled();
            expect(fallbackCardFromText).toHaveBeenCalledWith('で', japaneseLearningTargetMatcher());
            expect(showCard).toHaveBeenCalledWith(
                fallbackCard,
                'ここで読む',
                word,
                expect.objectContaining({
                    trigger: 'modal',
                    navigation: 'reset',
                    userGesture: true,
                }),
            );
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('renders token offsets onto reader words for contextual fragment lookup', () => {
        const text = '先ににほんごのじかん';
        const token: JPDBToken = {
            card: testFallbackCard({ vid: -21, sid: -21, spelling: 'に' }),
            start: 2,
            end: 3,
            length: 1,
            rubies: [],
            pitchClass: '',
            sentence: text,
        };

        setInnerHtml(document.body, renderTokensToHtml(text, [token], DEFAULT_SETTINGS));

        try {
            const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
            expect(word.dataset.tokenStart).toBe('2');
            expect(word.dataset.tokenEnd).toBe('3');
        } finally {
            document.body.replaceChildren();
        }
    });

    it('shows wrapped ruby-rendered docs words such as 下 when clicked', async () => {
        const app = new ReaderApp();
        const sentence = '青空の下で本を読む';
        const belowCard = testPublicCard({
            vid: 1300,
            sid: 0,
            spelling: '下',
            reading: 'した',
            meanings: [{ glosses: ['below; under'], partOfSpeech: ['n'] }],
        });
        const token: JPDBToken = {
            card: belowCard,
            start: 3,
            end: 4,
            length: 1,
            rubies: [{ text: 'した', start: 3, end: 4, length: 1 }],
            pitchClass: 'heiban',
            sentence,
        };
        setInnerHtml(document.body, `<main><article>${renderTokensToHtml(sentence, [token], { ...DEFAULT_SETTINGS, furiganaMode: 'all' })}</article></main>`);
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const showRenderedWordCard = vi.fn(async () => undefined);
        const scheduleVisiblePageReparse = vi.fn();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parser: { cacheCards(cards: JPDBCard[]): void };
            showRenderedWordCard: typeof showRenderedWordCard;
            scheduleVisiblePageReparse: typeof scheduleVisiblePageReparse;
            showWord(word: HTMLElement, options?: { trigger?: 'click'; userGesture?: boolean }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jpdbDefinitionsEnabled: false,
            showPitchAccent: true,
        };
        internals.parser.cacheCards([belowCard]);
        internals.showRenderedWordCard = showRenderedWordCard;
        internals.scheduleVisiblePageReparse = scheduleVisiblePageReparse;

        try {
            await internals.showWord(word, { trigger: 'click', userGesture: true });

            expect(word.dataset.expression).toBe('下');
            expect(word.dataset.reading).toBe('した');
            expect(word.dataset.tokenStart).toBe('3');
            expect(word.querySelector('rt')?.textContent).toBe('した');
            expect(scheduleVisiblePageReparse).not.toHaveBeenCalled();
            expect(showRenderedWordCard).toHaveBeenCalledWith(
                belowCard,
                expect.objectContaining({ sentence, anchor: word }),
                expect.objectContaining({ trigger: 'click', userGesture: true }),
                false,
                currentJapaneseLookupScopeMatcher(),
            );
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('preserves rendered reading and pitch metadata when opening a cached rendered word', async () => {
        const app = new ReaderApp();
        const lookupCard = jitenTestCard({
            vid: 1381470,
            sid: 0,
            jitenWordId: 1381470,
            jitenReadingIndex: 0,
            spelling: '青空',
            reading: 'あおぞら',
            pitchAccent: [],
            wordWithReading: null,
        });
        const word = appendRenderedReaderWord(lookupCard, {
            className: 'jpdb-reader-word jpdb-not-in-deck jpdb-pitch-nakadaka jpdb-reader-has-furi',
        });
        word.dataset.cardSource = 'jiten';
        word.dataset.cardId = '1381470';
        word.dataset.readingIndex = '0';
        word.dataset.cardState = 'not-in-deck';
        word.dataset.expression = '青空';
        word.dataset.reading = 'あおぞら';
        word.dataset.pitchClass = 'nakadaka';
        word.dataset.pitchAccent = 'LHHL';
        word.dataset.sentence = '青空を見る。';
        word.innerHTML = '<ruby><span class="jpdb-reader-ruby-base">青空</span><rt class="jpdb-reader-furi">あおぞら</rt></ruby>';

        const { internals, showRenderedWordCard } = configureRenderedWordTest(app, {
            cachedCards: [lookupCard],
        });

        try {
            await internals.showWord(word, { trigger: 'click', userGesture: true });

            expect(showRenderedWordCard).toHaveBeenCalledWith(
                expect.objectContaining({
                    spelling: '青空',
                    reading: 'あおぞら',
                    pitchAccent: ['LHHL'],
                }),
                expect.objectContaining({ sentence: '青空を見る。', anchor: word }),
                expect.objectContaining({ trigger: 'click', userGesture: true }),
                false,
                currentJapaneseLookupScopeMatcher(),
            );
            expect(lookupCard.pitchAccent).toEqual(['LHHL']);
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps genuine standalone rendered kana lookups on the cached card', async () => {
        const app = new ReaderApp();
        const kanaCard = testPublicCard({
            vid: 1001,
            spelling: 'ほん',
            reading: 'ほん',
        });
        const word = appendRenderedReaderWord(kanaCard, { text: 'ほん' });
        word.dataset.sentence = 'ほん';
        const { internals, publicLookupCard, showRenderedWordCard } = configureRenderedWordTest(app, {
            cachedCards: [kanaCard],
        });

        try {
            await internals.showWord(word, { trigger: 'click', userGesture: true });

            expect(publicLookupCard).not.toHaveBeenCalled();
            expect(showRenderedWordCard).toHaveBeenCalledWith(
                kanaCard,
                expect.objectContaining({ sentence: 'ほん', anchor: word }),
                expect.objectContaining({ trigger: 'click', userGesture: true }),
                false,
                currentJapaneseLookupScopeMatcher(),
            );
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps normal rendered kanji lookups off the kana-fragment expansion path', async () => {
        const app = new ReaderApp();
        const jpdbCard = testPublicCard({
            vid: 1464530,
            spelling: '日本語',
            reading: 'にほんご',
        });
        const word = appendRenderedReaderWord(jpdbCard, { text: '日本語' });
        word.dataset.sentence = '日本語の本';
        const parseJapanese = vi.fn(async () => [[]]);
        const { internals, publicLookupCard, showRenderedWordCard } = configureRenderedWordTest(app, {
            cachedCards: [jpdbCard],
            parseJapanese,
            settings: { apiKey: 'jpdb-key' },
        });

        try {
            await internals.showWord(word, { trigger: 'click', userGesture: true });

            expect(parseJapanese).not.toHaveBeenCalled();
            expect(publicLookupCard).not.toHaveBeenCalled();
            expect(showRenderedWordCard).toHaveBeenCalledWith(
                jpdbCard,
                expect.objectContaining({ sentence: '日本語の本', anchor: word }),
                expect.objectContaining({ trigger: 'click', userGesture: true }),
                false,
                currentJapaneseLookupScopeMatcher(),
            );
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('does not invent a UI span when the parser finds no token at a kanji boundary', async () => {
        const app = new ReaderApp();
        const sentence = '好きなものを読んで日本語を学ぶ';
        const anchor = document.createElement('p');
        anchor.textContent = sentence;
        document.body.append(anchor);
        const candidate = pointerTextCandidate(sentence, anchor, 6);
        const lookupTokenAt = vi.fn(async () => undefined);
        const showPointerTextCard = vi.fn(async () => undefined);
        const internals = parserOwnedPointerInternals(app);
        internals.settings = { ...DEFAULT_SETTINGS, localDictionariesEnabled: true };
        internals.parser = { lookupTokenAt };
        internals.showPointerTextCard = showPointerTextCard;

        try {
            await internals.showFirstPointerTextCandidate(candidate, sentence, 'modal', { userGesture: true });

            expect(lookupTokenAt).toHaveBeenCalledWith(
                sentence,
                6,
                { start: 0, end: sentence.length },
                expect.any(Object),
            );
            expect(showPointerTextCard).not.toHaveBeenCalled();
        } finally {
            app.destroy();
        }
    });

    it('renders the target parser span for a raw Spanish pointer lookup', async () => {
        const app = new ReaderApp();
        const sentence = 'Paellas';
        const anchor = document.createElement('p');
        anchor.textContent = sentence;
        document.body.append(anchor);
        const lookupCard: JPDBCard = {
            ...card,
            vid: -601,
            sid: 0,
            spelling: 'paella',
            reading: 'paella',
            source: 'local',
            partOfSpeech: ['n'],
        };
        const token = parserOwnedPointerToken(lookupCard, sentence, 0, sentence.length);
        const lookupTokenAt = vi.fn(async () => token);
        const showPointerTextCard = vi.fn(async () => undefined);
        const candidate = pointerTextCandidate(sentence, anchor, 2);
        const internals = parserOwnedPointerInternals(app);
        internals.settings = { ...DEFAULT_SETTINGS, localDictionariesEnabled: true };
        internals.parser = { lookupTokenAt };
        internals.showPointerTextCard = showPointerTextCard;
        setActiveLearningTargetLanguage('es');

        try {
            await internals.showFirstPointerTextCandidate(candidate, sentence, 'modal', { userGesture: true });

            expect(lookupTokenAt).toHaveBeenCalledWith(
                sentence,
                2,
                { start: 0, end: sentence.length },
                expect.any(Object),
            );
            expect(showPointerTextCard).toHaveBeenCalledWith(
                lookupCard,
                sentence,
                candidate,
                token,
                'modal',
                { userGesture: true },
            );
        } finally {
            resetActiveLearningTargetLanguage();
            app.destroy();
        }
    });

    it('renders a short parser-owned Han span from a long geometry run', async () => {
        const app = new ReaderApp();
        const sentence = '天地玄黃宇宙洪荒日月盈昃辰宿列張寒來';
        const anchor = document.createElement('p');
        anchor.textContent = sentence;
        document.body.append(anchor);
        const lookupCard: JPDBCard = {
            ...card,
            vid: -701,
            sid: 0,
            spelling: '地玄',
            reading: '地玄',
            source: 'local',
        };
        const token = parserOwnedPointerToken(lookupCard, sentence, 1, 3);
        const lookupTokenAt = vi.fn(async () => token);
        const showPointerTextCard = vi.fn(async () => undefined);
        const candidate = pointerTextCandidate(sentence, anchor, 1);
        const internals = parserOwnedPointerInternals(app);
        internals.settings = { ...DEFAULT_SETTINGS, localDictionariesEnabled: true };
        internals.parser = { lookupTokenAt };
        internals.showPointerTextCard = showPointerTextCard;
        setActiveLearningTargetLanguage('zh');

        try {
            await internals.showFirstPointerTextCandidate(candidate, sentence, 'modal', { userGesture: true });

            expect(lookupTokenAt).toHaveBeenCalledWith(
                sentence,
                1,
                { start: 0, end: sentence.length },
                expect.any(Object),
            );
            expect(showPointerTextCard).toHaveBeenCalledWith(
                lookupCard,
                sentence,
                candidate,
                token,
                'modal',
                { userGesture: true },
            );
        } finally {
            resetActiveLearningTargetLanguage();
            app.destroy();
        }
    });

    it('renders the parser-selected inflected fallback span without narrowing it in the UI', async () => {
        const app = new ReaderApp();
        document.body.innerHTML = '<p>好きなものを読んで日本語を学ぶ</p>';
        const paragraph = document.querySelector<HTMLElement>('p')!;
        const sentence = paragraph.textContent!;
        const fallbackCard: JPDBCard = {
            ...card,
            vid: -900,
            sid: -900,
            spelling: '読んで',
            reading: '',
            source: 'fallback',
            fallbackLookupTerms: ['読む'],
        };
        const token = parserOwnedPointerToken(fallbackCard, sentence, 6, 9);
        const lookupTokenAt = vi.fn(async () => token);
        const showPointerTextCard = vi.fn(async () => undefined);
        const candidate = pointerTextCandidate(sentence, paragraph, 6);
        const internals = parserOwnedPointerInternals(app);
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'api-key',
            localDictionariesEnabled: false,
        };
        internals.parser = { lookupTokenAt };
        internals.showPointerTextCard = showPointerTextCard;

        try {
            await internals.showFirstPointerTextCandidate(candidate, sentence, 'modal', { userGesture: true });

            expect(lookupTokenAt).toHaveBeenCalledWith(
                sentence,
                6,
                { start: 0, end: sentence.length },
                expect.objectContaining({
                    includeLocalPitch: false,
                    requireApi: false,
                    requireJpdb: false,
                    allowJpdbTimeoutFallback: true,
                }),
            );
            expect(showPointerTextCard).toHaveBeenCalledWith(
                fallbackCard,
                sentence,
                candidate,
                token,
                'modal',
                { userGesture: true },
            );
        } finally {
            app.destroy();
        }
    });

    it('parses selected inflected text with JPDB before trying local lookup cards', async () => {
        const app = new ReaderApp();
        const sentence = '好きなものを読んで日本語を学ぶ';
        const lookupCard: JPDBCard = {
            ...card,
            vid: 1554390,
            sid: 0,
            spelling: '読む',
            reading: 'よむ',
            source: 'jpdb',
            pitchAccent: ['HLL'],
        };
        const token: JPDBToken = {
            card: lookupCard,
            start: 6,
            end: 9,
            length: 3,
            rubies: [{ text: 'よむ', start: 6, end: 9, length: 3 }],
            pitchClass: 'atamadaka',
            sentence,
        };
        const parse = vi.fn(async () => [[token]]);
        const showLocalLookupCard = vi.fn(async () => true);
        const showTokenList = vi.fn();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parser: { parse: typeof parse; isJpdbBackedCard(card: JPDBCard): boolean };
            showLocalLookupCard: typeof showLocalLookupCard;
            showTokenList: typeof showTokenList;
            lookupText(text: string, sentence?: string, options?: { userGesture?: boolean }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'api-key',
            localDictionariesEnabled: true,
            showPitchAccent: true,
        };
        internals.parser = { parse, isJpdbBackedCard: parsedCard => parsedCard.source === 'jpdb' && parsedCard.vid > 0 };
        internals.showLocalLookupCard = showLocalLookupCard;
        internals.showTokenList = showTokenList;

        try {
            await internals.lookupText('読んで', sentence, { userGesture: true });

            expect(parse).toHaveBeenCalledWith([sentence], expect.objectContaining({
                allowJpdbTimeoutFallback: true,
                allowSegmentedFallback: true,
                includeLocalPitch: false,
                jpdbTimeoutMs: 650,
                requireJpdb: false,
            }));
            expect(showLocalLookupCard).not.toHaveBeenCalled();
            expect(showTokenList).toHaveBeenCalledWith(
                [token],
                '読んで',
                undefined,
                expect.objectContaining({ userGesture: true }),
            );
        } finally {
            app.destroy();
        }
    });

    it('shows parsed fallback token choices for multi-word selected text without an API key', async () => {
        const app = new ReaderApp();
        const sentence = '今日は静かな喫茶店で新しい本を読みました。';
        const fallbackTokens: JPDBToken[] = [
            {
                card: { ...card, vid: -101, sid: -101, spelling: '新しい', reading: '', cardState: ['not-in-deck'], source: 'fallback' },
                start: 10,
                end: 13,
                length: 3,
                rubies: [],
                pitchClass: '',
                sentence,
            },
            {
                card: { ...card, vid: -102, sid: -102, spelling: '本', reading: '', cardState: ['not-in-deck'], source: 'fallback' },
                start: 13,
                end: 14,
                length: 1,
                rubies: [],
                pitchClass: '',
                sentence,
            },
            {
                card: { ...card, vid: -103, sid: -103, spelling: '読み', reading: '', cardState: ['not-in-deck'], source: 'fallback' },
                start: 15,
                end: 17,
                length: 2,
                rubies: [],
                pitchClass: '',
                sentence,
            },
        ];
        const parse = vi.fn(async () => [fallbackTokens]);
        const showLocalLookupCard = vi.fn(async () => true);
        const showTokenList = vi.fn();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parser: { parse: typeof parse; isJpdbBackedCard(card: JPDBCard): boolean };
            showLocalLookupCard: typeof showLocalLookupCard;
            showTokenList: typeof showTokenList;
            lookupText(text: string, sentence?: string, options?: { userGesture?: boolean }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
        };
        internals.parser = { parse, isJpdbBackedCard: parsedCard => parsedCard.source === 'jpdb' && parsedCard.vid > 0 };
        internals.showLocalLookupCard = showLocalLookupCard;
        internals.showTokenList = showTokenList;

        try {
            await internals.lookupText('新しい本を読みました', sentence, { userGesture: true });

            expect(parse).toHaveBeenCalledWith([sentence], {
                allowSegmentedFallback: true,
                includeLocalPitch: false,
                requireApi: true,
                requireJpdb: true,
            });
            expect(showLocalLookupCard).not.toHaveBeenCalled();
            expect(showTokenList).toHaveBeenCalledWith(
                fallbackTokens,
                '新しい本を読みました',
                undefined,
                expect.objectContaining({ userGesture: true }),
            );
        } finally {
            app.destroy();
        }
    });

    it('uses segmented fallback for selected text even when local dictionaries are enabled without an API key', async () => {
        const app = new ReaderApp();
        const sentence = '今日は静かな喫茶店で新しい本を読みました。';
        const fallbackTokens: JPDBToken[] = [{
            card: { ...card, vid: -102, sid: -102, spelling: '本', reading: '', cardState: ['not-in-deck'], source: 'fallback' },
            start: 13,
            end: 14,
            length: 1,
            rubies: [],
            pitchClass: '',
            sentence,
        }];
        const parse = vi.fn(async () => [fallbackTokens]);
        const showTokenList = vi.fn();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parser: { parse: typeof parse; isJpdbBackedCard(card: JPDBCard): boolean };
            showTokenList: typeof showTokenList;
            lookupText(text: string, sentence?: string, options?: { userGesture?: boolean }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: true,
        };
        internals.parser = { parse, isJpdbBackedCard: parsedCard => parsedCard.source === 'jpdb' && parsedCard.vid > 0 };
        internals.showTokenList = showTokenList;

        try {
            await internals.lookupText('本', sentence, { userGesture: true });

            expect(parse).toHaveBeenCalledWith([sentence], {
                allowSegmentedFallback: true,
                includeLocalPitch: false,
                requireApi: true,
                requireJpdb: true,
            });
        } finally {
            app.destroy();
        }
    });

    it('labels hover fallback token choices as lookup results instead of a selection', async () => {
        const app = new ReaderApp();
        const sentence = '百科事典';
        const fallbackTokens: JPDBToken[] = [
            {
                card: { ...card, vid: -201, sid: -201, spelling: '百科', reading: '', cardState: ['not-in-deck'], source: 'fallback' },
                start: 0,
                end: 2,
                length: 2,
                rubies: [],
                pitchClass: '',
                sentence,
            },
            {
                card: { ...card, vid: -202, sid: -202, spelling: '事典', reading: '', cardState: ['not-in-deck'], source: 'fallback' },
                start: 2,
                end: 4,
                length: 2,
                rubies: [],
                pitchClass: '',
                sentence,
            },
        ];
        const parse = vi.fn(async () => [fallbackTokens]);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parser: { parse: typeof parse; isJpdbBackedCard(card: JPDBCard): boolean };
            lookupText(text: string, sentence?: string, options?: { trigger?: 'hover' }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: true,
        };
        internals.parser = { parse, isJpdbBackedCard: parsedCard => parsedCard.source === 'jpdb' && parsedCard.vid > 0 };

        try {
            await internals.lookupText('百科事典', sentence, { trigger: 'hover' });

            expect(document.querySelector('.jpdb-reader-popover .jpdb-reader-pos')?.textContent).toBe('Search');
            expect(document.querySelector('.jpdb-reader-popover')?.textContent).not.toContain('Selection');
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('shows a back arrow on token choice popovers opened from another card', () => {
        const app = new ReaderApp();
        const previousCard: JPDBCard = { ...card, spelling: '訳', reading: 'やく', source: 'jpdb' };
        const tokenCard: JPDBCard = { ...card, vid: 20, sid: 30, spelling: '日本語', reading: 'にほんご', source: 'jpdb' };
        const token: JPDBToken = {
            card: tokenCard,
            start: 0,
            end: 3,
            length: 3,
            rubies: [],
            pitchClass: '',
            sentence: '日本語訳',
        };
        type TestPreviousNavigationEntry = { kind: 'word'; card: JPDBCard; sentence?: string };
        const previousNavigationEntry: TestPreviousNavigationEntry = { kind: 'word', card: previousCard, sentence: '訳です。' };
        const anchor = document.createElement('button');
        const popover = document.createElement('div');
        document.body.append(anchor, popover);
        const showCard = vi.fn(async () => undefined);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            renderTokenListHtml(
                tokens: JPDBToken[],
                selected: string,
                previousNavigationEntry?: TestPreviousNavigationEntry,
            ): string;
            installTokenListHandlers(
                popover: HTMLElement,
                tokens: JPDBToken[],
                anchor: HTMLElement | undefined,
                context: { trigger: 'modal' | 'hover'; navigation: 'reset' | 'preserve' | 'push-current'; previousNavigationEntry?: TestPreviousNavigationEntry },
            ): void;
            showCard: typeof showCard;
        };
        internals.settings = { ...DEFAULT_SETTINGS };
        internals.showCard = showCard;
        popover.innerHTML = internals.renderTokenListHtml([token], '日本語訳', previousNavigationEntry);
        internals.installTokenListHandlers(popover, [token], anchor, {
            trigger: 'modal',
            navigation: 'push-current',
            previousNavigationEntry,
        });

        try {
            const backButton = popover.querySelector<HTMLButtonElement>('[data-action="token-list-back"]')!;
            expect(backButton).toBeTruthy();
            expect(backButton.title).toBe('Back to word: 訳');

            backButton.click();

            expect(showCard).toHaveBeenCalledWith(previousCard, '訳です。', anchor, {
                autoPlay: false,
                trigger: 'modal',
                navigation: 'preserve',
                preservePosition: true,
            });
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('renders configured selection action pills on token choice popovers', () => {
        const app = new ReaderApp();
        const tokenCard: JPDBCard = { ...card, vid: 20, sid: 30, spelling: '日本語', reading: 'にほんご', source: 'jpdb', meanings: [{ glosses: ['Japanese language'], partOfSpeech: ['noun'] }] };
        const token: JPDBToken = {
            card: tokenCard,
            start: 0,
            end: 3,
            length: 3,
            rubies: [],
            pitchClass: '',
            sentence: '日本語訳',
        };
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            renderTokenListHtml(tokens: JPDBToken[], selected: string): string;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            dictionaryLookupLinks: defaultDictionaryLookupLinks('local'),
        };

        try {
            const wrapper = document.createElement('div');
            setInnerHtml(wrapper, internals.renderTokenListHtml([token], '日本語訳'));
            const tokenChoice = wrapper.querySelector<HTMLButtonElement>('button[data-token-choice]')!;

            expect(wrapper.querySelector('.jpdb-reader-selection-pills')).not.toBeNull();
            expect([...wrapper.querySelectorAll<HTMLAnchorElement>('.jpdb-reader-selection-pills a')].map(link => link.textContent?.trim())).toEqual(expect.arrayContaining(['Yomu', 'Jiten', 'JPDB']));
            expect(wrapper.querySelector<HTMLButtonElement>('.jpdb-reader-selection-pills [data-action="copy-selection"]')).not.toBeNull();
            expect(readTokenChoiceCommandCapability(tokenChoice)).toEqual({
                kind: 'token-choice',
                vid: 20,
                sid: 30,
            });
            expect(tokenChoice.dataset.vid).toBeUndefined();
            expect(tokenChoice.dataset.sid).toBeUndefined();
            // Pills sit above the parsed word list so the actions are reachable
            // without scrolling past a long selection's tokens.
            const pills = wrapper.querySelector('.jpdb-reader-selection-pills')!;
            const meanings = wrapper.querySelector('.jpdb-reader-meanings')!;
            expect(pills.compareDocumentPosition(meanings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
            expect(wrapper.textContent).not.toContain('Parsed from');
            expect(wrapper.textContent).not.toContain('解析元');
        } finally {
            app.destroy();
        }
    });

    it('copies the whole selected text from token choice popovers', async () => {
        const app = new ReaderApp();
        const tokenCard: JPDBCard = { ...card, vid: 20, sid: 30, spelling: '日本語', reading: 'にほんご', source: 'jpdb' };
        const token: JPDBToken = {
            card: tokenCard,
            start: 0,
            end: 3,
            length: 3,
            rubies: [],
            pitchClass: '',
            sentence: '日本語訳',
        };
        const writeText = vi.fn(async () => undefined);
        const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        });
        const popover = document.createElement('div');
        document.body.append(popover);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            renderTokenListHtml(tokens: JPDBToken[], selected: string): string;
            installTokenListHandlers(
                popover: HTMLElement,
                tokens: JPDBToken[],
                anchor: HTMLElement | undefined,
                context: { trigger: 'modal' | 'hover'; navigation: 'reset' | 'preserve' | 'push-current' },
            ): void;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            dictionaryLookupLinks: defaultDictionaryLookupLinks('local'),
        };
        setInnerHtml(popover, internals.renderTokenListHtml([token], '日本語訳'));
        internals.installTokenListHandlers(popover, [token], undefined, { trigger: 'modal', navigation: 'reset' });

        try {
            popover.querySelector<HTMLButtonElement>('[data-action="copy-selection"]')!.click();

            await waitForExpect(() => expect(writeText).toHaveBeenCalledWith('日本語訳'));
        } finally {
            if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
            else Reflect.deleteProperty(navigator, 'clipboard');
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('uses fallback pointer lookup on unparsed dictionary hyperlink text inside popovers', () => {
        document.body.innerHTML = `
            <div data-jpdb-reader-root="true">
                <div class="jpdb-reader-popover">
                    <div class="jpdb-reader-local-glossary">
                        <a class="gloss-link" href="#dict-entry"><span>青空</span></a>
                    </div>
                    <div class="jpdb-reader-help"><span>日本語</span></div>
                </div>
            </div>
        `;
        const linkText = document.querySelector<HTMLElement>('a.gloss-link span')!;
        const helpText = document.querySelector<HTMLElement>('.jpdb-reader-help span')!;
        const app = new ReaderApp();

        try {
            withPointerTextLookupMock(linkText.firstChild as Text, 0, [{ left: 20, top: 20, width: 48, height: 28 }], () => {
                expect(lookupCandidateFromPoint(app, 28, 30, linkText)).toMatchObject({
                    text: '青空',
                    offset: 0,
                    start: 0,
                    end: 2,
                    anchor: linkText,
                });
            });
            withPointerTextLookupMock(helpText.firstChild as Text, 0, [{ left: 20, top: 60, width: 64, height: 28 }], () => {
                expect(lookupCandidateFromPoint(app, 28, 70, helpText)).toBeNull();
            });
        } finally {
            app.destroy();
        }
    });

    it('allows unparsed modal popover text clicks when page click lookup is disabled', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = '<span class="jpdb-reader-parseable">青空です。</span>';
        document.body.append(popover);
        const target = popover.querySelector<HTMLElement>('.jpdb-reader-parseable')!;
        const candidate = {
            text: '青空です。',
            offset: 0,
            start: 0,
            end: 2,
            anchor: target,
        };
        const lookupCandidateFromPoint = vi.fn(() => candidate);
        const showLookupCandidate = vi.fn(async () => undefined);
        const prepareModalLookupFromPointer = vi.fn();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            activePopover: HTMLElement;
            activePopoverMode: 'modal';
            lookupCandidateFromPoint: typeof lookupCandidateFromPoint;
            showLookupCandidate: typeof showLookupCandidate;
            prepareModalLookupFromPointer: typeof prepareModalLookupFromPointer;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnClick: false,
        };
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';
        internals.lookupCandidateFromPoint = lookupCandidateFromPoint;
        internals.showLookupCandidate = showLookupCandidate;
        internals.prepareModalLookupFromPointer = prepareModalLookupFromPointer;
        (internals as unknown as { bindEvents(): void }).bindEvents();

        try {
            const event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 48, clientY: 24 });
            target.dispatchEvent(event);

            expect(event.defaultPrevented).toBe(true);
            expect(lookupCandidateFromPoint).toHaveBeenCalledWith(48, 24, target);
            expect(prepareModalLookupFromPointer).toHaveBeenCalledWith(event);
            expect(showLookupCandidate).toHaveBeenCalledWith(candidate, 'modal', {
                navigation: 'push-current',
                preservePosition: true,
                userGesture: true,
            });
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps an active hover popover pinned while a clicked word lookup renders', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        word.dataset.vid = '501';
        word.dataset.sid = '501';
        word.dataset.sentence = '日本語を読む';
        word.dataset.tokenStart = '0';
        word.dataset.tokenEnd = '3';
        word.textContent = '日本語';
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        popover.innerHTML = '<div class="jpdb-reader-popover-body">日本語</div>';
        document.body.append(word, popover);
        const showLookupCandidate = vi.fn(async () => undefined);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            activePopover: HTMLElement;
            activePopoverMode: 'hover' | 'modal';
            activePopoverAnchor?: HTMLElement;
            activeHoverWord?: HTMLElement;
            activeHoverLookupKey: string;
            showLookupCandidate: typeof showLookupCandidate;
            bindEvents(): void;
        };
        internals.settings = { ...DEFAULT_SETTINGS, lookupOnClick: true };
        internals.activePopover = popover;
        internals.activePopoverMode = 'hover';
        internals.activePopoverAnchor = word;
        internals.activeHoverWord = word;
        internals.activeHoverLookupKey = 'word:501:501';
        internals.showLookupCandidate = showLookupCandidate;
        internals.bindEvents();

        try {
            const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 40, clientY: 24 });
            withPointerTextLookupMock(word.firstChild as Text, 1, [{ left: 20, top: 10, width: 64, height: 28 }], () => {
                word.dispatchEvent(click);
            });

            expect(click.defaultPrevented).toBe(true);
            expect(internals.activePopoverMode).toBe('modal');
            expect(internals.activeHoverWord).toBeUndefined();
            expect(internals.activeHoverLookupKey).toBe('');
            expect(showLookupCandidate).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: '日本語を読む',
                    offset: 1,
                    start: 0,
                    end: 6,
                    anchor: word,
                }),
                'modal',
                expect.objectContaining({ userGesture: true }),
            );

            const out = createPointerEvent('pointerout', { clientX: 240, clientY: 240 });
            Object.defineProperty(out, 'relatedTarget', { configurable: true, value: document.body });
            word.dispatchEvent(out);
            await vi.advanceTimersByTimeAsync(DEFAULT_SETTINGS.hoverCloseDelayMs + 20);

            expect(popover.isConnected).toBe(true);
        } finally {
            app.destroy();
            vi.useRealTimers();
            document.body.replaceChildren();
        }
    });

    it('does not let popover action controls hit-test page words underneath', () => {
        const app = new ReaderApp();
        const pageWord = document.createElement('span');
        pageWord.className = 'jpdb-reader-word';
        pageWord.dataset.vid = '501';
        pageWord.dataset.sid = '501';
        pageWord.dataset.sentence = '下の言葉';
        pageWord.textContent = '下';
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        popover.innerHTML = '<button class="jpdb-reader-pill jpdb-reader-action-pill" type="button" data-action="copy-word">Copy</button>';
        document.body.append(pageWord, popover);
        const button = popover.querySelector<HTMLButtonElement>('button')!;
        const showWord = vi.fn().mockResolvedValue(undefined);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            activePopover: HTMLElement;
            activePopoverMode: 'modal';
            showWord: typeof showWord;
            bindEvents(): void;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnClick: true,
        };
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';
        internals.showWord = showWord;
        internals.bindEvents();

        try {
            withElementsFromPointMock([button, popover, pageWord], () => {
                const event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 40, clientY: 24 });
                button.dispatchEvent(event);

                expect(event.defaultPrevented).toBe(false);
                expect(showWord).not.toHaveBeenCalled();
            });
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('does not hit-test page words under a selection token-list button', () => {
        const app = new ReaderApp();
        const pageWord = document.createElement('span');
        pageWord.className = 'jpdb-reader-word';
        pageWord.dataset.vid = '501';
        pageWord.dataset.sid = '501';
        pageWord.dataset.sentence = '下の言葉';
        pageWord.textContent = '下';
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        // A selection/token-list popover's parsed-word button sits over page text.
        popover.innerHTML = '<button class="jpdb-reader-btn" type="button" data-token-choice="true" data-vid="700" data-sid="700">語</button>';
        document.body.append(pageWord, popover);
        const button = popover.querySelector<HTMLButtonElement>('button')!;
        const showWord = vi.fn().mockResolvedValue(undefined);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            activePopover: HTMLElement;
            activePopoverMode: 'modal';
            showWord: typeof showWord;
            bindEvents(): void;
        };
        internals.settings = { ...DEFAULT_SETTINGS, lookupOnClick: true };
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';
        internals.showWord = showWord;
        internals.bindEvents();

        try {
            withElementsFromPointMock([button, popover, pageWord], () => {
                const event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 40, clientY: 24 });
                button.dispatchEvent(event);

                // The token-list popover's own handler owns this click; the page
                // word underneath must not be looked up at its (wrong) location.
                expect(event.defaultPrevented).toBe(false);
                expect(showWord).not.toHaveBeenCalled();
            });
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('does not start press lookup on passive words inside native buttons', () => {
        const app = new ReaderApp();
        document.body.innerHTML = `
            <button type="button" id="native-button">
                <span class="jpdb-reader-word jpdb-reader-passive-word" data-jpdb-reader-passive="true" data-vid="501" data-sid="501" data-sentence="設定">設定</span>
            </button>
        `;
        const button = document.querySelector<HTMLButtonElement>('#native-button')!;
        const word = button.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const buttonClick = vi.fn();
        const showWord = vi.fn().mockResolvedValue(undefined);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            showWord: typeof showWord;
            bindEvents(): void;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnClick: true,
            lookupOnHover: true,
        };
        internals.showWord = showWord;
        internals.bindEvents();
        button.addEventListener('click', buttonClick);

        try {
            const down = createPointerEvent('pointerdown', { clientX: 24, clientY: 24, button: 0 });
            const up = createPointerEvent('pointerup', { clientX: 24, clientY: 24, button: 0 });
            word.dispatchEvent(down);
            word.dispatchEvent(up);
            word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 24, clientY: 24 }));

            expect(down.defaultPrevented).toBe(false);
            expect(up.defaultPrevented).toBe(false);
            expect(buttonClick).toHaveBeenCalledTimes(1);
            expect(showWord).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('opens page words on touch pointerup and consumes the synthetic click', () => {
        const app = new ReaderApp();
        document.body.innerHTML = `
            <p><span class="jpdb-reader-word" data-vid="501" data-sid="501" data-token-start="0" data-token-end="3" data-sentence="日本語">日本語</span></p>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const showLookupCandidate = vi.fn().mockResolvedValue(undefined);
        const pinLineForElement = vi.fn();
        const destroyOcr = vi.fn();
        const prepareModalLookupFromPointer = vi.fn();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            ocr: { pinLineForElement: typeof pinLineForElement; destroy: typeof destroyOcr };
            prepareModalLookupFromPointer: typeof prepareModalLookupFromPointer;
            showLookupCandidate: typeof showLookupCandidate;
            bindEvents(): void;
        };
        internals.settings = { ...DEFAULT_SETTINGS, lookupOnClick: true };
        internals.ocr = { pinLineForElement, destroy: destroyOcr };
        internals.prepareModalLookupFromPointer = prepareModalLookupFromPointer;
        internals.showLookupCandidate = showLookupCandidate;
        internals.bindEvents();

        try {
            const down = createPointerEvent('pointerdown', { pointerType: 'touch', pointerId: 41, clientX: 24, clientY: 24, button: 0 });
            const up = createPointerEvent('pointerup', { pointerType: 'touch', pointerId: 41, clientX: 25, clientY: 25, button: 0 });
            withPointerTextLookupMock(word.firstChild as Text, 1, [{ left: 10, top: 10, width: 48, height: 28 }], () => {
                word.dispatchEvent(down);
                word.dispatchEvent(up);
            });

            expect(down.defaultPrevented).toBe(false);
            expect(up.defaultPrevented).toBe(true);
            expect(pinLineForElement).not.toHaveBeenCalled();
            expect(prepareModalLookupFromPointer).toHaveBeenCalledWith(up);
            expect(showLookupCandidate).toHaveBeenCalledWith(
                expect.objectContaining({ text: '日本語', offset: 1, start: 0, end: 3, anchor: word }),
                'modal',
                expect.objectContaining({ userGesture: true }),
            );

            const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 25, clientY: 25 });
            word.dispatchEvent(click);

            expect(click.defaultPrevented).toBe(true);
            expect(showLookupCandidate).toHaveBeenCalledTimes(1);
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('does not suppress a second real touch tap while consuming the previous synthetic click', () => {
        const app = new ReaderApp();
        document.body.innerHTML = `
            <p>
                <span class="jpdb-reader-word" data-vid="501" data-sid="501" data-token-start="0" data-token-end="3" data-sentence="日本語">日本語</span>
                <span class="jpdb-reader-word" data-vid="502" data-sid="502" data-token-start="0" data-token-end="2" data-sentence="読む">読む</span>
            </p>
        `;
        const [first, second] = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        const showLookupCandidate = vi.fn().mockResolvedValue(undefined);
        const pinLineForElement = vi.fn();
        const destroyOcr = vi.fn();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            ocr: { pinLineForElement: typeof pinLineForElement; destroy: typeof destroyOcr };
            showLookupCandidate: typeof showLookupCandidate;
            bindEvents(): void;
        };
        internals.settings = { ...DEFAULT_SETTINGS, lookupOnClick: true };
        internals.ocr = { pinLineForElement, destroy: destroyOcr };
        internals.showLookupCandidate = showLookupCandidate;
        internals.bindEvents();

        try {
            const syntheticClick = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 24, clientY: 24 });
            const secondUp = createPointerEvent('pointerup', { pointerType: 'touch', pointerId: 42, clientX: 72, clientY: 24, button: 0 });
            withPointerTextLookupMock(first.firstChild as Text, 1, [{ left: 10, top: 10, width: 48, height: 28 }], () => {
                first.dispatchEvent(createPointerEvent('pointerdown', { pointerType: 'touch', pointerId: 41, clientX: 24, clientY: 24, button: 0 }));
                first.dispatchEvent(createPointerEvent('pointerup', { pointerType: 'touch', pointerId: 41, clientX: 24, clientY: 24, button: 0 }));
                first.dispatchEvent(syntheticClick);
            });
            withPointerTextLookupMock(second.firstChild as Text, 0, [{ left: 56, top: 10, width: 48, height: 28 }], () => {
                second.dispatchEvent(createPointerEvent('pointerdown', { pointerType: 'touch', pointerId: 42, clientX: 72, clientY: 24, button: 0 }));
                second.dispatchEvent(secondUp);
            });

            expect(syntheticClick.defaultPrevented).toBe(true);
            expect(secondUp.defaultPrevented).toBe(true);
            expect(showLookupCandidate).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({ text: '日本語', offset: 1, start: 0, end: 3, anchor: first }),
                'modal',
                expect.objectContaining({ userGesture: true }),
            );
            expect(showLookupCandidate).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({ text: '読む', offset: 0, start: 0, end: 2, anchor: second }),
                'modal',
                expect.objectContaining({ userGesture: true }),
            );
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('does not open the touch fast path after a scroll-distance drag', () => {
        const app = new ReaderApp();
        document.body.innerHTML = `
            <p><span class="jpdb-reader-word" data-vid="501" data-sid="501" data-sentence="日本語">日本語</span></p>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const showWord = vi.fn().mockResolvedValue(undefined);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            showWord: typeof showWord;
            bindEvents(): void;
        };
        internals.settings = { ...DEFAULT_SETTINGS, lookupOnClick: true };
        internals.showWord = showWord;
        internals.bindEvents();

        try {
            const down = createPointerEvent('pointerdown', { pointerType: 'touch', pointerId: 42, clientX: 24, clientY: 24, button: 0 });
            const move = createPointerEvent('pointermove', { pointerType: 'touch', pointerId: 42, clientX: 24, clientY: 48, button: 0 });
            const up = createPointerEvent('pointerup', { pointerType: 'touch', pointerId: 42, clientX: 24, clientY: 48, button: 0 });
            word.dispatchEvent(down);
            document.dispatchEvent(move);
            document.dispatchEvent(up);

            expect(up.defaultPrevented).toBe(false);
            expect(showWord).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('recovers a near-miss tap by resolving the word at pointerup, not the late synthetic click', () => {
        // The reported "press twice, nothing happens, then it opens late": a
        // pointerdown that just misses the word recorded nothing, so the only
        // opener was the browser's ~300ms synthetic click — by then the cue had
        // moved on. Seeding the tap on pointerdown (word may be undefined) and
        // resolving at pointerup recovers it instantly with the fast-render path.
        const app = new ReaderApp();
        document.body.innerHTML = `
            <p><span class="jpdb-reader-word" data-vid="601" data-sid="601" data-token-start="0" data-token-end="3" data-sentence="日本語">日本語</span></p>
        `;
        const para = document.querySelector<HTMLElement>('p')!;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const showLookupCandidate = vi.fn().mockResolvedValue(undefined);
        const pinLineForElement = vi.fn();
        const destroyOcr = vi.fn();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            ocr: { pinLineForElement: typeof pinLineForElement; destroy: typeof destroyOcr };
            showLookupCandidate: typeof showLookupCandidate;
            bindEvents(): void;
        };
        internals.settings = { ...DEFAULT_SETTINGS, lookupOnClick: true };
        internals.ocr = { pinLineForElement, destroy: destroyOcr };
        internals.showLookupCandidate = showLookupCandidate;
        internals.bindEvents();

        try {
            // pointerdown misses (lands on the paragraph gap, no word resolved) ...
            withPointerTextLookupMock(word.firstChild as Text, 1, [{ left: 8, top: 8, width: 48, height: 28 }], () => {
                para.dispatchEvent(createPointerEvent('pointerdown', { pointerType: 'touch', pointerId: 51, clientX: 10, clientY: 10, button: 0 }));
                // ... but pointerup lands on the word — its geometry is authoritative.
                word.dispatchEvent(createPointerEvent('pointerup', { pointerType: 'touch', pointerId: 51, clientX: 12, clientY: 12, button: 0 }));
            });

            expect(showLookupCandidate).toHaveBeenCalledTimes(1);
            expect(showLookupCandidate).toHaveBeenCalledWith(
                expect.objectContaining({ text: '日本語', offset: 1, start: 0, end: 3, anchor: word }),
                'modal',
                expect.objectContaining({ userGesture: true }),
            );
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('opens OCR words on touch pointerdown and consumes the synthetic click', () => {
        const app = new ReaderApp();
        document.body.innerHTML = `
            <div class="jpdb-ocr-line">
                <span class="jpdb-reader-word" data-vid="501" data-sid="501" data-expression="秘密" data-surface="秘密" data-token-start="3" data-token-end="5" data-sentence="ずっと秘密にしていた">秘密</span>
            </div>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const showLookupCandidate = vi.fn().mockResolvedValue(undefined);
        const pinLineForElement = vi.fn();
        const destroyOcr = vi.fn();
        const prepareModalLookupFromPointer = vi.fn();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            ocr: { pinLineForElement: typeof pinLineForElement; destroy: typeof destroyOcr };
            prepareModalLookupFromPointer: typeof prepareModalLookupFromPointer;
            showLookupCandidate: typeof showLookupCandidate;
            bindEvents(): void;
        };
        internals.settings = { ...DEFAULT_SETTINGS, lookupOnClick: true };
        internals.ocr = { pinLineForElement, destroy: destroyOcr };
        internals.prepareModalLookupFromPointer = prepareModalLookupFromPointer;
        internals.showLookupCandidate = showLookupCandidate;
        internals.bindEvents();

        try {
            const down = createPointerEvent('pointerdown', { pointerType: 'touch', clientX: 24, clientY: 24, button: 0 });
            withPointerTextLookupMock(word.firstChild as Text, 0, [{ left: 10, top: 10, width: 48, height: 28 }], () => {
                word.dispatchEvent(down);
            });

            expect(down.defaultPrevented).toBe(true);
            expect(pinLineForElement).toHaveBeenCalledWith(word);
            expect(prepareModalLookupFromPointer).toHaveBeenCalledWith(down);
            expect(showLookupCandidate).toHaveBeenCalledWith(
                expect.objectContaining({ text: 'ずっと秘密にしていた', offset: 3, start: 0, end: 10, anchor: word }),
                'modal',
                expect.objectContaining({ userGesture: true }),
            );

            const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 24, clientY: 24 });
            word.dispatchEvent(click);

            expect(click.defaultPrevented).toBe(true);
            expect(showLookupCandidate).toHaveBeenCalledTimes(1);
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

});
