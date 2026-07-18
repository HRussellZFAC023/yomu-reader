import { describe, expect, it, vi } from 'vitest';
import {
    registerReaderHelpersCleanup,
    DEFAULT_SETTINGS,
    JITEN_BACKGROUND_DETAIL_TIMEOUT_MS,
    READER_WORD_CSS,
    ReaderApp,
    applyTokensToScanTarget,
    applyTokensToTextNode,
    card,
    collectFragmentTextTargetsIn,
    collectScanTargets,
    collectSiteScanTargets,
    collectTextTargetsIn,
    createFallbackShowCardBoundaryFixture,
    domRectList,
    expectRenderedPitchWord,
    mockElementBoundingClientRect,
    nearestReadableSentenceForElement,
    readerWordAtPointInScope,
    readerWordSurfaceText,
    testSynchronousReaderApp,
    waitForExpect,
} from './fixtures';
import type {
    JPDBCard,
    JPDBToken,
} from './fixtures';

registerReaderHelpersCleanup();

describe('reader helpers', () => {
    it('renders fallback lookup cards promptly when public JPDB resolution is slow', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const resolveLookupCard = vi.fn(() => new Promise<JPDBCard>(() => undefined));
        const { fallbackCard, internals, load, mountInitialCardShell, updateWord } = createFallbackShowCardBoundaryFixture(app, resolveLookupCard);

        try {
            const show = internals.showCard(fallbackCard);
            await vi.advanceTimersByTimeAsync(181);
            await show;

            expect(resolveLookupCard).toHaveBeenCalledWith(fallbackCard);
            expect(updateWord).toHaveBeenCalledWith(fallbackCard, undefined, 'modal', 'reset', undefined);
            expect(load).toHaveBeenCalledWith(fallbackCard);
            expect(mountInitialCardShell).toHaveBeenCalledWith(expect.any(HTMLElement), fallbackCard, undefined, undefined, expect.any(Object));
        } finally {
            app.destroy();
            vi.useRealTimers();
        }
    });

    it('resolves segmented fallback lookup cards through public Jiten before JPDB search', async () => {
        const app = new ReaderApp();
        const fallbackCard: JPDBCard = {
            ...card,
            vid: -1,
            sid: -1,
            rid: 0,
            spelling: '青空',
            reading: '青空',
            source: 'fallback',
            pitchAccent: [],
        };
        const publicCard: JPDBCard = {
            ...card,
            vid: 1381470,
            sid: 0,
            rid: 0,
            spelling: '青空',
            reading: 'あおぞら',
            frequencyRank: 6100,
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 1381470,
            jitenReadingIndex: 0,
            pitchAccent: ['LHHL'],
        };
        const search = vi.fn(async () => [publicCard]);
        const jitenLookup = vi.fn(async () => null);
        const jitenLookupMany = vi.fn(async (terms: readonly string[]) => new Map(
            terms.includes('青空') ? [['青空', publicCard]] : [],
        ));
        const cacheCards = vi.fn();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbVocabulary: { search: typeof search };
            jitenPublicVocabulary: { lookup: typeof jitenLookup; lookupMany: typeof jitenLookupMany };
            parser: { cacheCards: typeof cacheCards };
            resolveLookupCard(card: JPDBCard): Promise<JPDBCard>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, jpdbDefinitionsEnabled: false, showPitchAccent: true };
        internals.jpdbVocabulary = { search };
        internals.jitenPublicVocabulary = { lookup: jitenLookup, lookupMany: jitenLookupMany };
        internals.parser = { cacheCards };

        try {
            await expect(internals.resolveLookupCard(fallbackCard)).resolves.toBe(publicCard);
            expect(jitenLookupMany).toHaveBeenCalledWith(['青空'], { detailLimit: 1, detailTimeoutMs: JITEN_BACKGROUND_DETAIL_TIMEOUT_MS });
            expect(jitenLookup).not.toHaveBeenCalled();
            expect(search).not.toHaveBeenCalled();
            expect(cacheCards).toHaveBeenCalledWith([publicCard]);
        } finally {
            app.destroy();
        }
    });

    it('resolves segmented fallback lookup cards through Jiten parse when Jiten is the active API', async () => {
        const app = new ReaderApp();
        const fallbackCard: JPDBCard = {
            ...card,
            vid: -1,
            sid: -1,
            rid: 0,
            spelling: 'よむ',
            reading: '',
            source: 'fallback',
            pitchAccent: [],
        };
        const jitenCard: JPDBCard = {
            ...card,
            vid: 1456360,
            sid: 3,
            rid: 0,
            spelling: 'よむ',
            reading: 'よむ',
            frequencyRank: 20215,
            source: 'jiten',
            cardState: ['mature'],
            pitchAccent: ['HL'],
        };
        const parse = vi.fn(async (paragraphs: string[]): Promise<JPDBToken[][]> => paragraphs.map(text => [{
            card: jitenCard,
            start: 0,
            end: text.length,
            length: text.length,
            rubies: [],
            pitchClass: 'atamadaka',
            sentence: text,
        }]));
        const cacheCards = vi.fn();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jiten: { parse: typeof parse };
            parser: { cacheCards: typeof cacheCards };
            resolveLookupCard(card: JPDBCard): Promise<JPDBCard>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: 'ak_jiten-key', jpdbDefinitionsEnabled: false, showPitchAccent: true };
        internals.jiten = { parse };
        internals.parser = { cacheCards };

        try {
            await expect(internals.resolveLookupCard(fallbackCard)).resolves.toBe(jitenCard);
            expect(parse).toHaveBeenCalledWith(['よむ']);
            expect(cacheCards).toHaveBeenCalledWith([jitenCard]);
        } finally {
            app.destroy();
        }
    });

    it('falls back to text lookup for uncached parsed words inside the popup', async () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = `
            <div class="jpdb-reader-example-sentence">
                <span class="jpdb-reader-word jpdb-known" data-vid="91" data-sid="92" data-sentence="甘言蜜語だ。" tabindex="-1">甘言蜜語</span>
            </div>
        `;
        document.body.append(popover);
        const word = popover.querySelector<HTMLElement>('.jpdb-reader-word')!;

        const getCachedCard = vi.fn(() => undefined);
        const reparseVisiblePage = vi.fn(async () => undefined);
        const lookupText = vi.fn(async () => undefined);
        const internals = app as unknown as {
            getCachedCard: typeof getCachedCard;
            reparseVisiblePage: typeof reparseVisiblePage;
            lookupText: typeof lookupText;
            showWord(word: HTMLElement, options: { trigger?: 'click' | 'hover' }): Promise<void>;
        };
        internals.getCachedCard = getCachedCard;
        internals.reparseVisiblePage = reparseVisiblePage;
        internals.lookupText = lookupText;

        try {
            await internals.showWord(word, { trigger: 'click' });

            expect(lookupText).toHaveBeenCalledWith('甘言蜜語', '甘言蜜語だ。', expect.objectContaining({
                navigation: 'push-current',
                preservePosition: true,
            }));
            expect(reparseVisiblePage).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('ignores clicks on the current Immersion Kit example target inside the popup', async () => {
        const { app, restoreAnimationFrame } = testSynchronousReaderApp();

        try {
            const sourceCard: JPDBCard = { ...card, spelling: '腕', reading: 'うで' };
            const internals = app as unknown as {
                activePopover?: HTMLElement;
                settings: typeof DEFAULT_SETTINGS;
                parsePopoverJapanese(popover: HTMLElement): Promise<void>;
                showCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options?: { trigger?: 'modal' | 'hover'; navigation?: 'reset' | 'preserve' | 'push-current'; autoPlay?: boolean }): Promise<void>;
                showWord(word: HTMLElement, options: { trigger?: 'click' | 'hover' }): Promise<void>;
            };
            internals.settings = {
                ...DEFAULT_SETTINGS,
                audioEnabled: false,
                ankiEnabled: false,
                localDictionariesEnabled: false,
                localDictionaryShowKanji: false,
                jpdbDefinitionsEnabled: false,
                jpdbMiningEnabled: false,
                showPitchAccent: false,
                immersionKitEnabled: false,
                studyGrammarEnabled: false,
                studyTranslationEnabled: false,
            };
            internals.parsePopoverJapanese = vi.fn(async () => undefined);

            await internals.showCard(sourceCard, '腕が痛むんで？', undefined, { trigger: 'modal', navigation: 'reset', autoPlay: false });
            const popover = internals.activePopover ?? document.querySelector<HTMLElement>('.jpdb-reader-popover')!;
            const immersion = document.createElement('div');
            immersion.setAttribute('data-immersion-kit', '');
            const exampleCard = document.createElement('div');
            exampleCard.className = 'jpdb-reader-example-card';
            exampleCard.dataset.immersionSentence = '腕が痛むんで？';
            const exampleSentence = document.createElement('div');
            exampleSentence.className = 'jpdb-reader-example-sentence jpdb-reader-parseable';
            const target = document.createElement('span');
            target.className = 'jpdb-reader-word jpdb-reader-example-target';
            target.dataset.expression = '腕';
            target.dataset.reading = 'うで';
            target.tabIndex = -1;
            target.textContent = '腕';
            exampleSentence.append(target, document.createTextNode('が痛むんで？'));
            exampleCard.append(exampleSentence);
            immersion.append(exampleCard);
            popover.querySelector<HTMLElement>('.jpdb-reader-popover-body')?.append(immersion);
            const showCard = vi.spyOn(internals, 'showCard');

            await internals.showWord(target, { trigger: 'click' });

            expect(showCard).not.toHaveBeenCalled();
            expect(document.querySelector<HTMLButtonElement>('[data-action="word-history-back"]')).toBeNull();
            expect(document.querySelector<HTMLElement>('.jpdb-reader-spelling')?.textContent?.replace(/\s+/g, '')).toContain('腕');
        } finally {
            restoreAnimationFrame();
            vi.unstubAllGlobals();
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps a back arrow when clicking study-source words inside a popup', async () => {
        const { app, restoreAnimationFrame } = testSynchronousReaderApp();

        try {
            const sourceCard: JPDBCard = { ...card, spelling: '印刷', reading: 'いんさつ' };
            const nestedCard: JPDBCard = { ...card, vid: -91, sid: -92, spelling: '技術', reading: 'ぎじゅつ', source: 'fallback' };
            const internals = app as unknown as {
                activePopover?: HTMLElement;
                settings: typeof DEFAULT_SETTINGS;
                parser: { cacheCards(cards: JPDBCard[]): void };
                parsePopoverJapanese(popover: HTMLElement): Promise<void>;
                showCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options?: { trigger?: 'modal' | 'hover'; navigation?: 'reset' | 'preserve' | 'push-current'; autoPlay?: boolean; skipInitialCardResolution?: boolean }): Promise<void>;
                showWord(word: HTMLElement, options: { trigger?: 'click' | 'hover' }): Promise<void>;
            };
            internals.settings = {
                ...DEFAULT_SETTINGS,
                audioEnabled: false,
                ankiEnabled: false,
                localDictionariesEnabled: false,
                localDictionaryShowKanji: false,
                jpdbDefinitionsEnabled: false,
                jpdbMiningEnabled: false,
                showPitchAccent: false,
                immersionKitEnabled: false,
                studyGrammarEnabled: false,
                studyTranslationEnabled: false,
                hoverCloseDelayMs: 10_000,
            };
            internals.parsePopoverJapanese = vi.fn(async () => undefined);
            internals.parser.cacheCards([nestedCard]);

            const hoverAnchor = document.createElement('span');
            hoverAnchor.className = 'jpdb-reader-word';
            hoverAnchor.dataset.vid = String(sourceCard.vid);
            hoverAnchor.dataset.sid = String(sourceCard.sid);
            hoverAnchor.dataset.expression = sourceCard.spelling;
            hoverAnchor.dataset.reading = sourceCard.reading;
            hoverAnchor.dataset.sentence = '印刷技術です。';
            hoverAnchor.textContent = sourceCard.spelling;
            document.body.append(hoverAnchor);

            await internals.showCard(sourceCard, '印刷技術です。', hoverAnchor, { trigger: 'hover', navigation: 'reset', autoPlay: false, skipInitialCardResolution: true });
            const hoverPopover = internals.activePopover ?? document.querySelector<HTMLElement>('.jpdb-reader-popover')!;
            hoverPopover.querySelector<HTMLElement>('.jpdb-reader-popover-body')?.insertAdjacentHTML('beforeend', `
                <div class="jpdb-reader-study-original jpdb-reader-parseable" data-study-original-render>
                    Grammar また、PDFファイルをダウンロードしたり、印刷して本にすることもできます。
                    <span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-heiban" data-vid="${nestedCard.vid}" data-sid="${nestedCard.sid}" data-sentence="Grammar また、PDFファイルをダウンロードしたり、印刷して本にすることもできます。" tabindex="-1">技術</span>
                </div>
            `);

            await internals.showWord(hoverPopover.querySelector<HTMLElement>('.jpdb-reader-study-original .jpdb-reader-word')!, { trigger: 'click' });

            await waitForExpect(() => {
                expect(document.querySelector<HTMLElement>('.jpdb-reader-popover')?.getAttribute('aria-modal')).toBe('true');
                expect(document.querySelector<HTMLButtonElement>('[data-action="word-history-back"]')?.title).toBe('Back to word: 印刷');
            });
        } finally {
            restoreAnimationFrame();
            vi.unstubAllGlobals();
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('scans native ruby bases without adding duplicate furigana', () => {
        document.body.innerHTML = '<p><ruby>事故<rt>じこ</rt></ruby>がありました。</p>';
        const targets = collectTextTargetsIn(document.body, 10, false);
        expect(targets.map(target => target.text)).toEqual(['事故', 'がありました。']);
        expect(targets[0].hasNativeRuby).toBe(true);

        applyTokensToTextNode(targets[0], [{
            card: { ...card, cardState: ['known'], spelling: '事故', reading: 'じこ' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'じこ', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '事故がありました。',
        }], DEFAULT_SETTINGS);

        expect(document.querySelector('ruby .jpdb-reader-word.jpdb-known')?.textContent).toBe('事故');
        expect(document.querySelectorAll('ruby .jpdb-reader-word rt')).toHaveLength(0);
    });

    it('highlights headings with furigana when the page title is not clipped', () => {
        document.body.innerHTML = `
            <main>
                <article>
                    <h1>新卒エンジニア、仕事終わりに勉強する</h1>
                </article>
            </main>
        `;
        const [target] = collectTextTargetsIn(document.body, 10, false);

        applyTokensToTextNode(target, [{
            card: { ...card, cardState: ['known'], spelling: '新卒', reading: 'しんそつ' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'しんそつ', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '新卒エンジニア、仕事終わりに勉強する',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        expect(readerWordSurfaceText(document.querySelector('h1 .jpdb-reader-word.jpdb-known')!)).toBe('新卒');
        expect(document.querySelector('h1 rt')?.textContent).toBe('しんそつ');
    });

    it('keeps clipped prose boxes lookupable with ruby annotations', () => {
        document.body.innerHTML = `
            <div style="overflow:hidden;max-height:48px;line-height:24px">
                今日は新卒エンジニアとして仕事終わりに勉強する。
            </div>
        `;
        const [target] = collectTextTargetsIn(document.body, 10, false);
        expect(target.layoutSensitive).toBe(true);

        applyTokensToTextNode(target, [{
            card: { ...card, cardState: ['known'], spelling: '新卒', reading: 'しんそつ' },
            start: 3,
            end: 5,
            length: 2,
            rubies: [{ text: 'しんそつ', start: 3, end: 5, length: 2 }],
            pitchClass: '',
            sentence: '今日は新卒エンジニアとして仕事終わりに勉強する。',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        expect(readerWordSurfaceText(document.querySelector('.jpdb-reader-word.jpdb-known')!)).toBe('新卒');
        expect(document.querySelector('rt')?.textContent).toBe('しんそつ');
    });

    it('keeps line-clamped card titles lookupable with ruby annotations', () => {
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            right: 240,
            top: 0,
            bottom: 40,
            width: 240,
            height: 40,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = `
            <main>
                <div class="volume-card" onclick="window.openVolume?.()">
                    <div class="volume-card__cover"></div>
                    <div class="volume-card__info">
                        <div class="volume-card__title" style="display:-webkit-box;-webkit-line-clamp:2;overflow:hidden;max-height:34px;line-height:17px">
                            終わりのセラフ
                        </div>
                    </div>
                </div>
            </main>
        `;

        const targets = collectScanTargets(10, 'https://mokuro.moe/catalog/');
        rectSpy.mockRestore();
        const target = targets.find(candidate => candidate.text === '終わりのセラフ');
        expect(target).toBeTruthy();
        expect(target && 'layoutSensitive' in target ? target.layoutSensitive : false).toBe(true);

        applyTokensToScanTarget(target!, [{
            card: { ...card, cardState: ['known'], spelling: '終わり', reading: 'おわり' },
            start: 0,
            end: 3,
            length: 3,
            rubies: [{ text: 'おわり', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '終わりのセラフ',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('.volume-card__title .jpdb-reader-word')!;
        expect(readerWordSurfaceText(word)).toBe('終わり');
        expect(word.classList.contains('jpdb-reader-scan-word')).toBe(true);
        expect(document.querySelector('.volume-card__title ruby rt')).toBeNull();
        expect(document.querySelector('.volume-card__title .jpdb-reader-detached-furi')?.textContent).toBe('おわり');
        expect(document.querySelector('.volume-card__title [data-yomu-ruby-room]')).toBeNull();
    });

    it('keeps single-line ellipsis rows lookupable and paint-invariant at rest', () => {
        // Paint-invariant design: a clipped single-line row renders IN PLACE
        // with the reading suppressed (no mirror, host text painting); the
        // word stays lookupable via the hover/long-press popover.
        document.body.innerHTML = `
            <main>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                    新卒エンジニア、仕事終わりに勉強する
                </span>
            </main>
        `;
        const [target] = collectTextTargetsIn(document.body, 10, false);
        expect(target.layoutSensitive).toBe(true);

        applyTokensToScanTarget(target, [{
            card: { ...card, cardState: ['known'], spelling: '新卒', reading: 'しんそつ' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'しんそつ', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '新卒エンジニア、仕事終わりに勉強する',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        expect(readerWordSurfaceText(document.querySelector('.jpdb-reader-word.jpdb-known')!)).toBe('新卒');
        expect(document.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(document.querySelector('rt')).toBeNull();
    });

    it('keeps furigana on wrapping prose where text-overflow is declared but inert', () => {
        document.body.innerHTML = `
            <main>
                <div style="overflow:hidden;text-overflow:ellipsis">
                    新卒エンジニア、仕事終わりに勉強する
                </div>
            </main>
        `;
        const [target] = collectTextTargetsIn(document.body, 10, false);
        expect(target.layoutSensitive).toBe(false);

        applyTokensToTextNode(target, [{
            card: { ...card, cardState: ['known'], spelling: '新卒', reading: 'しんそつ' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'しんそつ', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '新卒エンジニア、仕事終わりに勉強する',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        expect(document.querySelector('rt')?.textContent).toBe('しんそつ');
    });

    it('collects each Mokuro text box as one automatic scan target', () => {
        document.body.innerHTML = `
            <div id="manga-panel">
                <div class="textBox" data-testid="mokuro-box" style="position:absolute;width:120px;height:80px">
                    <p>ぴっ</p>
                    <p>たりよね</p>
                </div>
            </div>
        `;
        document.querySelector<HTMLElement>('[data-testid="mokuro-box"]')!.getBoundingClientRect = () => new DOMRect(24, 80, 120, 80);

        const targets = collectScanTargets(10, 'https://reader.mokuro.app/reader/example');
        expect(targets.map(target => target.text)).toEqual(['ぴったりよね']);
        const target = targets[0];
        expect(target && 'layoutSensitive' in target ? target.layoutSensitive : false).toBe(true);
    });

    it('prioritizes viewport-near Mokuro text boxes instead of old offscreen pages', () => {
        const panel = document.createElement('div');
        panel.id = 'manga-panel';
        document.body.replaceChildren(panel);
        const boxes: HTMLElement[] = [];
        for (let index = 0; index < 220; index++) {
            const box = document.createElement('div');
            box.className = 'textBox';
            box.textContent = index === 120 ? '今ここを読む' : `古いページ${index}`;
            box.getBoundingClientRect = () => index === 120
                ? new DOMRect(32, 80, 160, 72)
                : new DOMRect(-20000 - index * 180, 80, 160, 72);
            boxes.push(box);
            panel.append(box);
        }

        const targets = collectScanTargets(120, 'https://reader.mokuro.app/reader/example');

        expect(targets.map(target => target.text)).toContain('今ここを読む');
        expect(targets.some(target => target.text.startsWith('古いページ'))).toBe(false);
    });

    it('keeps Mokuro words clickable when JPDB tokens cross OCR line fragments', () => {
        document.body.innerHTML = `
            <div id="manga-panel">
                <div class="textBox" data-testid="mokuro-box" style="position:absolute;width:120px;height:80px">
                    <p>ぴっ</p>
                    <p>たりよね</p>
                </div>
            </div>
        `;
        document.querySelector<HTMLElement>('[data-testid="mokuro-box"]')!.getBoundingClientRect = () => new DOMRect(24, 80, 120, 80);
        const [target] = collectScanTargets(10, 'https://reader.mokuro.app/reader/example');

        applyTokensToScanTarget(target!, [
            {
                card: { ...card, cardState: ['known'], spelling: 'ぴったり', reading: 'ぴったり' },
                start: 0,
                end: 4,
                length: 4,
                rubies: [],
                pitchClass: 'heiban',
                sentence: 'ぴったりよね',
            },
            {
                card: { ...card, cardState: ['known'], spelling: 'よね', reading: 'よね' },
                start: 4,
                end: 6,
                length: 2,
                rubies: [],
                pitchClass: '',
                sentence: 'ぴったりよね',
            },
        ], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });

        const words = Array.from(document.querySelectorAll<HTMLElement>('.textBox .jpdb-reader-word'));
        expect(words.map(word => readerWordSurfaceText(word))).toEqual(['ぴっ', 'たり', 'よね']);
        expect(words.slice(0, 2).map(word => word.dataset.expression)).toEqual(['ぴったり', 'ぴったり']);
        expect(document.querySelector('.textBox rt')).toBeNull();
    });

    it('resolves Mokuro vertical text clicks from rendered word geometry', () => {
        document.body.innerHTML = `
            <div class="textBox" style="writing-mode:vertical-rl">
                <span class="jpdb-reader-word" data-expression="びったり">びったり</span>
                <span class="jpdb-reader-word" data-expression="よね">よね</span>
            </div>
        `;
        const box = document.querySelector<HTMLElement>('.textBox')!;
        const [bittari, yone] = Array.from(box.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        bittari.getClientRects = () => domRectList([
            { left: 724, top: 892, width: 74, height: 169 },
            { left: 668, top: 723, width: 74, height: 56 },
        ]);
        yone.getClientRects = () => domRectList([
            { left: 668, top: 780, width: 74, height: 112 },
        ]);

        expect(readerWordAtPointInScope(box, 761, 976)?.dataset.expression).toBe('びったり');
        expect(readerWordAtPointInScope(box, 705, 836)?.dataset.expression).toBe('よね');
    });

    it('marks scanned page words with wrapping CSS so furigana cannot create a page-wide line', () => {
        expect(READER_WORD_CSS).toContain('.jpdb-reader-word.jpdb-reader-scan-word');
        expect(READER_WORD_CSS).toContain('overflow-wrap: break-word !important');
        document.body.innerHTML = '<p>検索履歴から検索語句を削除することができます。</p>';
        const [target] = collectTextTargetsIn(document.body, 10, false);

        applyTokensToTextNode(target, [{
            card: { ...card, cardState: ['known'], spelling: '検索履歴', reading: 'けんさくりれき' },
            start: 0,
            end: 4,
            length: 4,
            rubies: [{ text: 'けんさくりれき', start: 0, end: 4, length: 4 }],
            pitchClass: '',
            sentence: '検索履歴から検索語句を削除することができます。',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(word.classList.contains('jpdb-reader-scan-word')).toBe(true);
        expect(word.querySelector('rt')?.textContent).toBe('けんさくりれき');
    });

    it('parses compact related vocabulary for status colors and furigana', () => {
        document.body.innerHTML = `
            <div data-jpdb-reader-root="true" class="jpdb-reader-word-text-status">
                <span class="jpdb-reader-jpdb-compound-term jpdb-reader-parseable">甘言</span>
            </div>
        `;
        const root = document.querySelector<HTMLElement>('.jpdb-reader-parseable')!;
        const targets = collectFragmentTextTargetsIn(root, 10, false, '', { includeReaderRoot: true, allowUiText: true, minLength: 1 });
        expect(targets.map(target => target.text)).toEqual(['甘言']);

        applyTokensToScanTarget(targets[0], [{
            card: { ...card, spelling: '甘言', reading: 'かんげん', cardState: ['known'] },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'かんげん', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '甘言',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(word.classList.contains('jpdb-known')).toBe(true);
        expect(word.classList.contains('jpdb-pitch-heiban')).toBe(true);
        expect(readerWordSurfaceText(word)).toBe('甘言');
        expect(word.querySelector('rt')?.textContent).toBe('かんげん');
    });

    it('can parse Japanese example fragments inside reader popup roots', () => {
        document.body.innerHTML = `
            <div data-jpdb-reader-root="true">
                <div class="jpdb-reader-local-glossary jpdb-reader-parseable">
                    <span>今日は、<ruby>雲<rt>くも</rt></ruby>ひとつない<ruby>青<rt>あお</rt></ruby><ruby>空<rt>ぞら</rt></ruby>だ。</span>
                </div>
            </div>
        `;
        const root = document.querySelector('.jpdb-reader-parseable')!;
        const targets = collectFragmentTextTargetsIn(root, 10, false, '', { includeReaderRoot: true, allowUiText: true, minLength: 1 });
        expect(targets.map(target => target.text)).toEqual(['今日は、雲ひとつない青空だ。']);

        applyTokensToScanTarget(targets[0], [{
            card: { ...card, spelling: '青空', reading: 'あおぞら', cardState: ['known'] },
            start: 10,
            end: 12,
            length: 2,
            rubies: [{ text: 'あおぞら', start: 10, end: 12, length: 2 }],
            pitchClass: '',
            sentence: '今日は、雲ひとつない青空だ。',
        }], DEFAULT_SETTINGS);

        expect(Array.from(document.querySelectorAll('.jpdb-reader-word')).map(word => readerWordSurfaceText(word))).toEqual(['青空']);
    });

    it('renders mixed single-fragment and cross-fragment words in one pass', () => {
        document.body.innerHTML = '<p>言語は文法<span>的</span>です。</p>';
        const [target] = collectFragmentTextTargetsIn(document.body, 10, false, '', { allowUiText: true, minLength: 1 });
        expect(target.text).toBe('言語は文法的です。');

        applyTokensToScanTarget(target, [
            {
                card: { ...card, spelling: '言語', reading: 'げんご', cardState: ['known'] },
                start: 0,
                end: 2,
                length: 2,
                rubies: [{ text: 'げんご', start: 0, end: 2, length: 2 }],
                pitchClass: '',
                sentence: target.text,
            },
            {
                card: { ...card, spelling: '文法的', reading: 'ぶんぽうてき', cardState: ['known'] },
                start: 3,
                end: 6,
                length: 3,
                rubies: [{ text: 'ぶんぽうてき', start: 3, end: 6, length: 3 }],
                pitchClass: '',
                sentence: target.text,
            },
        ], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const words = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        expect(words.map(word => readerWordSurfaceText(word))).toEqual(['言語', '文法的']);
        expect(words.map(word => word.querySelector('rt')?.textContent ?? '')).toEqual(['げんご', 'ぶんぽうてき']);
    });

    it('does not leave cross-fragment tokens raw in a partially rendered block', () => {
        document.body.innerHTML = '<p>言語は文法<span>的</span>です。</p>';
        const [target] = collectFragmentTextTargetsIn(document.body, 10, false, '', { allowUiText: true, minLength: 1 });
        applyTokensToScanTarget(target, [
            {
                card: { ...card, spelling: '言語', reading: 'げんご', cardState: ['known'] },
                start: 0,
                end: 2,
                length: 2,
                rubies: [],
                pitchClass: '',
                sentence: target.text,
            },
            {
                card: { ...card, spelling: '文法的', reading: 'ぶんぽうてき', cardState: ['known'] },
                start: 3,
                end: 6,
                length: 3,
                rubies: [],
                pitchClass: '',
                sentence: target.text,
            },
        ], DEFAULT_SETTINGS);

        expect(Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word')).map(word => readerWordSurfaceText(word))).toEqual(['言語', '文法的']);
        const remainingTargets = collectFragmentTextTargetsIn(document.body, 10, false, '', { allowUiText: true, minLength: 1 });
        expect(remainingTargets.map(item => item.text).join('\n')).not.toContain('文法的');
    });

    it('does not re-ingest an existing text mirror on the passive-interaction scan path (no caption-strip duplication)', () => {
        // Post-apply DOM of YouTube's dynamic caption/translation strip: the
        // host keeps its (hidden) original text and carries a reader mirror
        // whose bare gap text nodes (the parenthetical) previously got
        // re-collected ALONGSIDE the original, doubling target.text into
        // "原文を見る（Googleによる翻訳）原文を見る（Googleによる翻訳）".
        document.body.innerHTML = `
            <button type="button">
                <span class="host" style="visibility:hidden">原文を見る（Googleによる翻訳）<span class="jpdb-reader-text-mirror" data-jpdb-reader-text-mirror="true" data-source-text="原文を見る（Googleによる翻訳）" style="visibility:visible">原文を<span class="jpdb-reader-word jpdb-reader-passive-word" data-jpdb-reader-passive="true">見る</span>（Googleによる翻訳）</span></span>
            </button>
        `;
        const collected = collectFragmentTextTargetsIn(document.body, 10, false, '', {
            includePassiveInteractions: true,
            allowUiText: true,
            minLength: 1,
        }).map(target => target.text).join('\n');
        // The mirror subtree must be skipped, so the parenthetical appears once.
        expect(collected.split('（Googleによる翻訳）').length - 1).toBeLessThanOrEqual(1);
        expect(collected).not.toContain('原文を見る（Googleによる翻訳）原文');
    });

    it('keeps parsed dictionary hyperlink text passive so link clicks can pass through', () => {
        document.body.innerHTML = `
            <div data-jpdb-reader-root="true">
                <div class="jpdb-reader-popover">
                    <div class="jpdb-reader-local-glossary jpdb-reader-parseable">
                        <a class="gloss-link" href="#dict-entry"><span class="gloss-link-text">青空</span></a>を読む
                    </div>
                </div>
            </div>
        `;
        const root = document.querySelector('.jpdb-reader-parseable')!;
        const targets = collectFragmentTextTargetsIn(root, 10, false, '', {
            includeReaderRoot: true,
            allowUiText: true,
            minLength: 1,
            readerRootPassiveInteractions: true,
        });
        expect(targets.map(target => target.text)).toEqual(['青空を読む']);

        applyTokensToScanTarget(targets[0], [
            {
                card: { ...card, spelling: '青空', reading: 'あおぞら', cardState: ['known'] },
                start: 0,
                end: 2,
                length: 2,
                rubies: [{ text: 'あおぞら', start: 0, end: 2, length: 2 }],
                pitchClass: '',
                sentence: '青空を読む',
            },
            {
                card: { ...card, spelling: '読む', reading: 'よむ', cardState: ['known'] },
                start: 3,
                end: 5,
                length: 2,
                rubies: [{ text: 'よむ', start: 3, end: 5, length: 2 }],
                pitchClass: '',
                sentence: '青空を読む',
            },
        ], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });

        const linkWord = document.querySelector<HTMLElement>('a.gloss-link .jpdb-reader-word')!;
        const proseWord = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'))
            .find(word => readerWordSurfaceText(word) === '読む')!;
        expect(linkWord.dataset.jpdbReaderPassive).toBe('true');
        expect(linkWord.tabIndex).toBe(-1);
        expect(linkWord.querySelector('rt')?.textContent).toBe('あおぞら');
        expect(proseWord.dataset.jpdbReaderPassive).toBeUndefined();
        expect(proseWord.classList.contains('jpdb-reader-passive-word')).toBe(false);
        expect(proseWord.querySelector('rt')?.textContent).toBe('よ');

        const app = new ReaderApp();
        try {
            const event = new MouseEvent('click', { bubbles: true, cancelable: true });
            expect(linkWord.dispatchEvent(event)).toBe(true);
            expect(event.defaultPrevented).toBe(false);
        } finally {
            app.destroy();
        }
    });

    it('keeps Yomu furigana off JPDB review prompt words', () => {
        vi.stubGlobal('location', {
            href: 'https://jpdb.io/review?c=v%2C1391940%2C864903531&r=1#a',
            origin: 'https://jpdb.io',
            hostname: 'jpdb.io',
            pathname: '/review',
            search: '?c=v%2C1391940%2C864903531&r=1',
        });
        const rectSpy = mockElementBoundingClientRect({ width: 320, height: 64 });
        document.body.innerHTML = `
            <main>
                <div class="review-card">
                    <div class="answer-box">
                        <div class="spelling">時間</div>
                    </div>
                </div>
            </main>
        `;

        try {
            const targets = collectScanTargets(10, 'https://jpdb.io/review?c=v%2C1391940%2C864903531&r=1#a');
            const target = targets.find(candidate => candidate.text === '時間')!;
            expect(target).toMatchObject({ parserId: 'jpdb-parser', suppressRuby: true });

            applyTokensToScanTarget(target, [{
                card: { ...card, cardState: ['known'], spelling: '時間', reading: 'じかん' },
                start: 0,
                end: 2,
                length: 2,
                rubies: [{ text: 'じかん', start: 0, end: 2, length: 2 }],
                pitchClass: 'heiban',
                sentence: '時間',
            }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

            const word = document.querySelector<HTMLElement>('.review-card .jpdb-reader-word')!;
            expect(readerWordSurfaceText(word)).toBe('時間');
            expect(word.querySelector('rt')).toBeNull();
        } finally {
            rectSpy.mockRestore();
            vi.unstubAllGlobals();
        }
    });

    it('keeps Yomu furigana off Jiten study prompt words while preserving passive lookup', () => {
        vi.stubGlobal('location', {
            href: 'https://jiten.moe/srs/study',
            origin: 'https://jiten.moe',
            hostname: 'jiten.moe',
            pathname: '/srs/study',
            search: '',
        });
        const rectSpy = mockElementBoundingClientRect({ width: 420, height: 72 });
        document.body.innerHTML = `
            <main>
                <div class="flex items-center justify-center gap-3 mb-2">
                    <div class="text-4xl md:text-5xl text-center font-noto-sans" lang="ja">時間</div>
                    <button type="button" title="Play audio"><i class="pi pi-volume-up text-base"></i></button>
                </div>
            </main>
        `;

        try {
            const targets = collectScanTargets(10, 'https://jiten.moe/srs/study');
            const target = targets.find(candidate => candidate.text === '時間')!;
            expect(target).toMatchObject({ parserId: 'jiten-parser', passiveInteraction: true, suppressRuby: true });

            applyTokensToScanTarget(target, [{
                card: { ...card, cardState: ['known'], spelling: '時間', reading: 'じかん', source: 'jiten' },
                start: 0,
                end: 2,
                length: 2,
                rubies: [{ text: 'じかん', start: 0, end: 2, length: 2 }],
                pitchClass: 'heiban',
                sentence: '時間',
            }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

            const word = document.querySelector<HTMLElement>('[lang="ja"] .jpdb-reader-word')!;
            expect(readerWordSurfaceText(word)).toBe('時間');
            expect(word.dataset.jpdbReaderPassive).toBe('true');
            expect(word.querySelector('rt')).toBeNull();
        } finally {
            rectSpy.mockRestore();
            vi.unstubAllGlobals();
        }
    });

    it('uses NHK-style ruby-aware site parsing without duplicating native furigana', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.body.innerHTML = '<main><p><ruby>東京<rt>とうきょう</rt></ruby>で高校生が本を読みました。</p></main>';
        const targets = collectSiteScanTargets(10, 'https://news.web.nhk/news/easy/ne2026050812537/ne2026050812537.html') ?? [];
        rectSpy.mockRestore();
        expect(targets.map(target => target.text)).toEqual(['東京で高校生が本を読みました。']);

        const token: JPDBToken = {
            card: { ...card, cardState: ['known'], spelling: '東京', reading: 'とうきょう' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ start: 0, end: 2, length: 2, text: 'とうきょう' }],
            pitchClass: '',
            sentence: '東京で高校生が本を読みました。',
        };

        applyTokensToScanTarget(targets[0], [token], DEFAULT_SETTINGS);

        expect(document.querySelector('rt')?.textContent).toBe('とうきょう');
        expect(document.querySelectorAll('.jpdb-reader-word.jpdb-known')).toHaveLength(1);
        expect(document.querySelector('.jpdb-reader-word')?.textContent).toBe('東京');
    });

    it('includes short Wikipedia infobox article labels', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.body.innerHTML = `
            <main>
                <h1 id="firstHeading">日本語</h1>
                <div id="mw-content-text">
                    <table><tbody><tr><th><b>日本語</b></th></tr></tbody></table>
                    <p>文法を学ぶ。</p>
                </div>
            </main>
        `;
        const targets = collectSiteScanTargets(10, 'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E') ?? [];
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining(['日本語', '文法を学ぶ。']));
    });

    it('keeps Tadoku ruby-base words together with trailing kana', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.body.innerHTML = `
            <main id="main" role="main">
                <section>
                    <div class="bd-title"><h1><ruby>鏡<rt>かがみ</rt></ruby>のない<ruby>村<rt>むら</rt></ruby></h1></div>
                    <div class="bd-desc-jp">
                        <p><ruby>親思<rt>おやおも</rt></ruby>いの<ruby>正助<rt>しょうすけ</rt></ruby>は、<ruby>殿様<rt>とのさま</rt></ruby>にほしいものを<ruby>聞<rt>き</rt></ruby>かれます。</p>
                    </div>
                </section>
            </main>
        `;
        const targets = collectSiteScanTargets(10, 'https://tadoku.org/japanese/book/61371/') ?? [];
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toContain('親思いの正助は、殿様にほしいものを聞かれます。');

        const target = targets.find(item => item.text.startsWith('親思い'))!;
        applyTokensToScanTarget(target, [{
            card: { ...card, cardState: ['known'], spelling: '親思い', reading: 'おやおもい' },
            start: 0,
            end: 3,
            length: 3,
            rubies: [{ text: 'おやおも', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: target.text,
        }], DEFAULT_SETTINGS);

        const words = Array.from(document.querySelectorAll<HTMLElement>('.bd-desc-jp .jpdb-reader-word'));
        expect(words).toHaveLength(1);
        expect(readerWordSurfaceText(words[0])).toBe('親思い');
        expect(words[0]?.querySelector('rt')?.textContent).toBe('おやおも');
    });

    it('uses Comprehensible Japanese transcript parsing across native ruby and cue controls', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.body.innerHTML = `
            <div class="transcript">
                <p>
                    <button class="cue-button">play</button>
                    <span><ruby>小人<rt class="kanji">こびと</rt></ruby>は<ruby>帽子<rt class="kanji">ぼうし</rt></ruby>を<ruby>被<rt class="kanji">かぶ</rt></ruby>っています。</span>
                </p>
            </div>
        `;
        const targets = collectSiteScanTargets(10, 'https://cijapanese.com/video/560') ?? [];
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(['小人は帽子を被っています。']);

        applyTokensToScanTarget(targets[0], [{
            card: { ...card, cardState: ['known'], spelling: '被る', reading: 'かぶる' },
            start: 6,
            end: 9,
            length: 3,
            rubies: [{ text: 'かぶ', start: 6, end: 7, length: 1 }],
            pitchClass: '',
            sentence: '小人は帽子を被っています。',
        }], DEFAULT_SETTINGS);

        const words = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        expect(words.map(word => readerWordSurfaceText(word))).toEqual(['被って']);
        expect(words.every(word => word.dataset.sentence === '小人は帽子を被っています。')).toBe(true);
        expect(document.querySelectorAll('.jpdb-reader-word rt.jpdb-reader-furi')).toHaveLength(0);
        expect(document.querySelector('.jpdb-reader-word rt.kanji')?.textContent).toBe('かぶ');
    });

    it('collects visible Satori Reader article text and passive compact controls', () => {
        const rectSpy = mockElementBoundingClientRect({ height: 240 });
        document.body.innerHTML = `
            <main class="japanese-classic">
                <div class="content-with-control-panel">
                    <div id="article-content" class="article-standard">
                        <span class="paragraph body">
                            <span class="sentence">
                                <span class="play-button-container">再</span>
                                <span class="word kanji-knowledge-none">
                                    <span class="wp hf">
                                        <span class="fg">しごと</span><span class="wpt">仕事</span><span class="wpr">しごと</span>
                                    </span>
                                </span>
                                <span class="word kanji-knowledge-na"><span class="wp nf"><span class="wpt">を</span><span class="wpr">を</span></span></span>
                                <span class="word kanji-knowledge-na"><span class="wp nf"><span class="wpt">している</span><span class="wpr">している</span></span></span>
                                <span class="notes-button-container">訳</span>
                            </span>
                        </span>
                    </div>
                </div>
            </main>
        `;

        const targets = collectSiteScanTargets(10, 'https://www.satorireader.com/articles/bartender-episode-1-edition-n') ?? [];
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(['再', '仕事', 'を', 'している', '訳']);
        expect(targets.map(target => target.text)).not.toContain('しごと');
        expect(targets.find(target => target.text === '再')).toMatchObject({ passiveInteraction: true });
        expect(targets.find(target => target.text === '訳')).toMatchObject({ passiveInteraction: true });
    });

    it('recovers full mining sentences around old partial transcript highlights', () => {
        document.body.innerHTML = `
            <p>
                <span><ruby>花<rt>はな</rt></ruby>を<ruby>持<rt>も</rt></ruby><span class="jpdb-reader-word jpdb-known" data-sentence="っています。">って</span>います。</span>
            </p>
        `;

        expect(nearestReadableSentenceForElement(document.querySelector<HTMLElement>('.jpdb-reader-word')!, 'っています。'))
            .toBe('花を持っています。');
    });

    it('keeps product-page translation context near the looked-up word', () => {
        document.body.innerHTML = `
            <div class="product-detail">
                <span class="jpdb-reader-word jpdb-known" data-sentence="仏花">仏花</span>
                ・お供え・お悔やみ花特集 自宅用にも、送る用にも。贈るシーンや予算、お花のカテゴリ別にさまざまなお供え・お悔やみ花をご用意しています。
                価格帯で探す 3,000円〜 5,000円〜 お花のカテゴリで探す アレンジメント プリザーブドフラワー 胡蝶蘭
            </div>
        `;

        expect(nearestReadableSentenceForElement(document.querySelector<HTMLElement>('.jpdb-reader-word')!, '仏花'))
            .toBe('仏花・お供え・お悔やみ花特集');
    });

    it('clamps long lookup context when no sentence boundary is nearby', () => {
        const longText = `価格帯で探す 3,000円〜 5,000円〜 ${'お供え花 '.repeat(80)}`;
        document.body.innerHTML = `<div>${longText}<span class="jpdb-reader-word jpdb-known" data-sentence="仏花">仏花</span>${' アレンジメント'.repeat(80)}</div>`;

        const sentence = nearestReadableSentenceForElement(document.querySelector<HTMLElement>('.jpdb-reader-word')!, '仏花');
        expect(sentence).toContain('仏花');
        expect(sentence.length).toBeLessThanOrEqual(180);
    });

    it('scans article titles as readable page text', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.body.innerHTML = `
            <main>
                <article>
                    <h1>青空の下で日本語を読む</h1>
                    <p>今日は静かな喫茶店で新しい本を読みました。</p>
                </article>
            </main>
        `;

        const targets = collectScanTargets(10, 'http://127.0.0.1:5174/article/');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual([
            '青空の下で日本語を読む',
            '今日は静かな喫茶店で新しい本を読みました。',
        ]);
        expect(targets.some(target => target.nonDestructive === true)).toBe(false);
    });

    it('uses the generic render path on managed app shells', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 640, height: 48 });
        document.body.innerHTML = `
            <script src="/_next/static/chunks/app-router.js"></script>
            <main>
                <article>
                    <h1>日本語ツール一覧</h1>
                    <p>今日は便利なスキルを探します。</p>
                </article>
                <nav><a href="/ja">戻る</a></nav>
                <button type="button">保存</button>
            </main>
        `;

        const targets = collectScanTargets(10, 'https://mcpmarket.com/ja/tools/skills');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '日本語ツール一覧',
            '今日は便利なスキルを探します。',
            '戻る',
            '保存',
        ]));
        expect(targets.find(target => target.text === '日本語ツール一覧')).toMatchObject({
            parserId: 'generic-prose-parser',
        });
        expect(targets.find(target => target.text === '日本語ツール一覧')?.nonDestructive).not.toBe(true);
        expect(targets.find(target => target.text === '保存')).toMatchObject({
            parserId: 'safe-ui-chrome-parser',
        });
        expect(targets.every(target => target.nonDestructive !== true)).toBe(true);

        applyTokensToScanTarget(targets.find(target => target.text === '日本語ツール一覧')!, [{
            card: { ...card, cardState: ['known'], spelling: '日本語', reading: 'にほんご' },
            start: 0,
            end: 3,
            length: 3,
            rubies: [{ text: 'にほんご', start: 0, end: 3, length: 3 }],
            pitchClass: 'heiban',
            sentence: '日本語ツール一覧',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const title = document.querySelector<HTMLElement>('h1')!;
        const titleWord = title.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(readerWordSurfaceText(titleWord)).toBe('日本語');
        expect(titleWord.querySelector('rt')?.textContent).toBe('にほんご');
        expect(title.querySelector('.jpdb-reader-text-mirror')).toBeNull();
    });

    it('uses the generic render path on Vite-style app shells', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 640, height: 48 });
        document.body.innerHTML = `
            <div id="root">
                <main>
                    <h1>日本語の配信ページ</h1>
                    <p>今日は字幕を探します。</p>
                    <button type="button">保存</button>
                </main>
            </div>
            <script type="module" src="/assets/index-abcd1234.js"></script>
        `;

        const targets = collectScanTargets(10, 'https://example.com/watch/episode-1');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '日本語の配信ページ',
            '今日は字幕を探します。',
            '保存',
        ]));
        expect(targets.find(target => target.text === '日本語の配信ページ')).toMatchObject({
            parserId: 'residual-visible-japanese-parser',
        });
        expect(targets.find(target => target.text === '日本語の配信ページ')?.nonDestructive).not.toBe(true);
        expect(targets.find(target => target.text === '保存')).toMatchObject({
            parserId: 'safe-ui-chrome-parser',
        });
        expect(targets.every(target => target.nonDestructive !== true)).toBe(true);
    });

    it('uses the generic render path on web-component app shells', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 640, height: 64 });
        document.body.innerHTML = `
            <shreddit-app>
                <main>
                    <shreddit-feed>
                        <shreddit-post>
                            <article>
                                <h2>日本語ニュースを読む</h2>
                                <p>今日はコメントを確認します。</p>
                            </article>
                        </shreddit-post>
                    </shreddit-feed>
                </main>
                <reddit-sidebar-nav>
                    <button type="button">詳細</button>
                </reddit-sidebar-nav>
            </shreddit-app>
        `;

        const targets = collectScanTargets(10, 'https://www.reddit.com/r/newsokur/');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '日本語ニュースを読む',
            '今日はコメントを確認します。',
            '詳細',
        ]));
        expect(targets.find(target => target.text === '日本語ニュースを読む')).toMatchObject({
            parserId: 'generic-prose-parser',
        });
        expect(targets.find(target => target.text === '日本語ニュースを読む')?.nonDestructive).not.toBe(true);
        expect(targets.find(target => target.text === '詳細')).toMatchObject({
            parserId: 'safe-ui-chrome-parser',
        });
        expect(targets.every(target => target.nonDestructive !== true)).toBe(true);

        applyTokensToScanTarget(targets.find(target => target.text === '日本語ニュースを読む')!, [{
            card: { ...card, cardState: ['known'], spelling: '日本語', reading: 'にほんご' },
            start: 0,
            end: 3,
            length: 3,
            rubies: [{ text: 'にほんご', start: 0, end: 3, length: 3 }],
            pitchClass: 'heiban',
            sentence: '日本語ニュースを読む',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const title = document.querySelector<HTMLElement>('h2')!;
        const titleWord = title.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(readerWordSurfaceText(titleWord)).toBe('日本語');
        expect(titleWord.querySelector('rt')?.textContent).toBe('にほんご');
        expect(title.querySelector('.jpdb-reader-text-mirror')).toBeNull();
    });

    it('sweeps visible Japanese comments controls and nav after generic prose', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.body.innerHTML = `
            <main>
                <article>
                    <h1>青空の下で日本語を読む</h1>
                    <p>今日は静かな喫茶店で新しい本を読みました。</p>
                </article>
            </main>
            <nav><a href="/back">戻る</a></nav>
            <aside>
                <button type="button">保存する</button>
                <div class="comment">短いコメントです</div>
            </aside>
        `;

        const targets = collectScanTargets(20, 'https://example.com/article');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '青空の下で日本語を読む',
            '今日は静かな喫茶店で新しい本を読みました。',
            '戻る',
            '保存する',
            '短いコメントです',
        ]));
        expect(targets.find(target => target.text === '短いコメントです')).toMatchObject({
            parserId: 'residual-visible-japanese-parser',
        });
    });

    it('keeps residual visible Japanese from starving on already-seen prose', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.body.innerHTML = `
            <main>
                <article>
                    <h1>青空の下で日本語を読む</h1>
                    <p>今日は静かな喫茶店で新しい本を読みました。</p>
                </article>
            </main>
            <nav><a href="/back">戻る</a></nav>
            <aside>
                <button type="button">保存する</button>
                <div class="comment">短いコメントです</div>
            </aside>
        `;

        const targets = collectScanTargets(5, 'https://example.com/article');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual([
            '青空の下で日本語を読む',
            '今日は静かな喫茶店で新しい本を読みました。',
            '戻る',
            '保存する',
            '短いコメントです',
        ]);
        expect(targets.at(-1)).toMatchObject({
            parserId: 'residual-visible-japanese-parser',
        });
    });

    it('still parses visible Japanese on parser-disabled storefront pages', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.body.innerHTML = `
            <header>
                <nav><a href="/ranking/">ランキング</a></nav>
            </header>
            <main>
                <button type="button">購入する</button>
                <p>セール情報を読む</p>
            </main>
            <aside class="sidebar">おすすめ</aside>
        `;

        const targets = collectScanTargets(10, 'https://bookwalker.jp/');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            'ランキング',
            '購入する',
            'セール情報を読む',
            'おすすめ',
        ]));
        expect(targets.every(target => 'parserId' in target && target.parserId === 'residual-visible-japanese-parser')).toBe(true);
    });

    it('keeps split inline kana as one automatic scan target', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.body.innerHTML = `
            <main>
                <article>
                    <p><span>に</span><span>ほ</span><span>ん</span><span>ご</span><span>の</span><span>じ</span><span>か</span><span>ん</span></p>
                </article>
            </main>
        `;

        const targets = collectScanTargets(10, 'https://example.com/article');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(['にほんごのじかん']);
    });

    it('keeps generic chat prose furigana even when an avatar makes the row look media-like', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 420, height: 42 });
        document.body.innerHTML = `
            <main>
                <div role="article" class="messageListItem" style="display:flex;overflow:hidden;max-height:44px">
                    <img class="avatar" alt="" src="/avatar.png">
                    <div class="messageContent" style="overflow:hidden;text-overflow:ellipsis;white-space:normal">
                        <span class="markup messageContent_hash">今日は故郷を守るために戦います。</span>
                    </div>
                </div>
            </main>
        `;

        const targets = collectScanTargets(10, 'https://chat.example/channels/1/2');
        rectSpy.mockRestore();
        const target = targets.find(candidate => candidate.text === '今日は故郷を守るために戦います。')!;
        expect(target).toBeTruthy();
        expect(target).not.toMatchObject({ suppressRuby: true });

        applyTokensToScanTarget(target, [{
            card: { ...card, cardState: ['known'], spelling: '故郷', reading: 'こきょう' },
            start: 3,
            end: 5,
            length: 2,
            rubies: [{ text: 'こきょう', start: 3, end: 5, length: 2 }],
            pitchClass: 'heiban',
            sentence: '今日は故郷を守るために戦います。',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('.messageContent .jpdb-reader-word')!;
        expect(readerWordSurfaceText(word)).toBe('故郷');
        expect(word.querySelector('rt')?.textContent).toBe('こきょう');
    });

    it('keeps compact chat author names passive while preserving message prose ruby', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 420, height: 48 });
        document.body.innerHTML = `
            <main>
                <div role="article" class="messageListItem" style="display:grid;grid-template-columns:44px 1fr;gap:10px">
                    <img class="avatar" alt="" src="/avatar.png">
                    <div>
                        <h3 class="messageHeader" style="display:flex;align-items:baseline;gap:8px;min-width:0">
                            <span class="username" style="color:rgb(242,243,245);font-weight:700;white-space:nowrap">Canna波蘭</span>
                            <time style="color:rgb(148,155,164)">10:50</time>
                        </h3>
                        <div class="messageContent" style="color:rgb(219,222,225);white-space:normal">
                            今日は故郷を守るために戦います。
                        </div>
                    </div>
                </div>
            </main>
        `;

        const targets = collectScanTargets(10, 'https://chat.example/channels/1/2');
        rectSpy.mockRestore();
        const authorTarget = targets.find(candidate => candidate.text.includes('Canna波蘭'))!;
        const messageTarget = targets.find(candidate => candidate.text === '今日は故郷を守るために戦います。')!;
        expect(authorTarget).toMatchObject({ passiveInteraction: true });
        expect(messageTarget).toBeTruthy();
        expect(messageTarget).not.toMatchObject({ passiveInteraction: true });
        expect(messageTarget).not.toMatchObject({ suppressRuby: true });

        applyTokensToScanTarget(authorTarget, [{
            card: { ...card, cardState: ['known'], spelling: '波蘭', reading: 'ぽーらん' },
            start: 5,
            end: 7,
            length: 2,
            rubies: [{ text: 'ぽーらん', start: 5, end: 7, length: 2 }],
            pitchClass: '',
            sentence: authorTarget.text,
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        applyTokensToScanTarget(messageTarget, [{
            card: { ...card, cardState: ['known'], spelling: '故郷', reading: 'こきょう' },
            start: 3,
            end: 5,
            length: 2,
            rubies: [{ text: 'こきょう', start: 3, end: 5, length: 2 }],
            pitchClass: 'heiban',
            sentence: '今日は故郷を守るために戦います。',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const authorWord = document.querySelector<HTMLElement>('.username .jpdb-reader-word')!;
        const messageWord = document.querySelector<HTMLElement>('.messageContent .jpdb-reader-word')!;
        expect(readerWordSurfaceText(authorWord)).toBe('波蘭');
        expect(authorWord.dataset.jpdbReaderPassive).toBe('true');
        expect(authorWord.classList.contains('jpdb-reader-passive-word')).toBe(true);
        expect(messageWord.dataset.jpdbReaderPassive).toBeUndefined();
        expect(messageWord.querySelector('rt.jpdb-reader-furi')?.textContent).toBe('こきょう');
    });

    it('scans generic chatbot markdown messages with furigana and pitch styling', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 720, height: 160 });
        document.body.innerHTML = `
            <main>
                <div data-testid="conversation-turn-2">
                    <div data-message-author-role="assistant">
                        <div class="markdown message-content">
                            <p>今日は日本語を少し勉強しました。</p>
                        </div>
                    </div>
                </div>
            </main>
        `;

        const targets = collectScanTargets(10, 'https://chatgpt.com/c/test');
        rectSpy.mockRestore();
        const target = targets.find(candidate => candidate.text === '今日は日本語を少し勉強しました。')!;
        expect(target).toBeTruthy();
        expect((target as { parserId?: string }).parserId).toBe('generic-prose-parser');
        expect(target).not.toMatchObject({ suppressRuby: true });

        applyTokensToScanTarget(target, [{
            card: { ...card, cardState: ['known'], spelling: '日本語', reading: 'にほんご' },
            start: 3,
            end: 6,
            length: 3,
            rubies: [{ text: 'にほんご', start: 3, end: 6, length: 3 }],
            pitchClass: 'heiban',
            sentence: '今日は日本語を少し勉強しました。',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('[data-message-author-role] .jpdb-reader-word')!;
        expect(readerWordSurfaceText(word)).toBe('日本語');
        expect(word.querySelector('rt.jpdb-reader-furi')?.textContent).toBe('にほんご');
        expectRenderedPitchWord(word, 'heiban');
    });

    it('does not cap default page scans at two thousand targets', () => {
        const rectSpy = mockElementBoundingClientRect();
        const paragraphs = Array.from({ length: 2005 }, (_, index) => `<p>日本語の文章${index}</p>`).join('');
        document.body.innerHTML = `<main><article>${paragraphs}</article></main>`;

        const targets = collectScanTargets(undefined, 'https://example.com/article');
        rectSpy.mockRestore();

        expect(targets).toHaveLength(2005);
        expect(targets.at(-1)?.text).toBe('日本語の文章2004');
    });

    it('adds safe UI chrome labels after prose as passive ruby scan targets', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.body.innerHTML = `
            <header><nav><a href="/help">ヘルプセンター</a></nav></header>
            <main>
                <article><p>今日は静かな喫茶店で新しい本を読みました。</p></article>
                <a href="/history">検索履歴を管理する</a>
                <button type="button">設定を保存する</button>
                <details><summary>続きを読む</summary><p>追加本文</p></details>
            </main>
            <form><button type="submit">登録する</button></form>
        `;
        document.querySelectorAll<HTMLElement>('button, summary')
            .forEach(control => { control.getBoundingClientRect = () => ({
                left: 0,
                right: 160,
                top: 0,
                bottom: 40,
                width: 160,
                height: 40,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            } as DOMRect); });

        const targets = collectScanTargets(10, 'https://support.google.com/youtube/answer/6342839');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual([
            '今日は静かな喫茶店で新しい本を読みました。',
            'ヘルプセンター',
            '検索履歴を管理する',
            '設定を保存する',
            '続きを読む',
            '登録する',
        ]);
        const uiTarget = targets.find(target => target.text === '検索履歴を管理する')!;
        const buttonTarget = targets.find(target => target.text === '設定を保存する')!;
        const summaryTarget = targets.find(target => target.text === '続きを読む')!;
        const submitTarget = targets.find(target => target.text === '登録する')!;
        expect(uiTarget).toMatchObject({ passiveInteraction: true });
        expect(buttonTarget).toMatchObject({ passiveInteraction: true });
        expect(summaryTarget).toMatchObject({ passiveInteraction: true });
        expect(submitTarget).toMatchObject({ passiveInteraction: true });

        applyTokensToScanTarget(uiTarget, [{
            card: { ...card, cardState: ['known'], spelling: '検索履歴', reading: 'けんさくりれき' },
            start: 0,
            end: 4,
            length: 4,
            rubies: [{ text: 'けんさくりれき', start: 0, end: 4, length: 4 }],
            pitchClass: '',
            sentence: '検索履歴を管理する',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        applyTokensToScanTarget(buttonTarget, [{
            card: { ...card, cardState: ['known'], spelling: '設定', reading: 'せってい' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'せってい', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '設定を保存する',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        applyTokensToScanTarget(summaryTarget, [{
            card: { ...card, cardState: ['not-in-deck'], spelling: '続き', reading: 'つづき' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'つづき', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '続きを読む',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        applyTokensToScanTarget(submitTarget, [{
            card: { ...card, cardState: ['known'], spelling: '登録', reading: 'とうろく' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'とうろく', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '登録する',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('a[href="/history"] .jpdb-reader-word')!;
        const buttonWord = document.querySelector<HTMLElement>('button[type="button"] .jpdb-reader-word')!;
        const summaryWord = document.querySelector<HTMLElement>('summary .jpdb-reader-word')!;
        const submitWord = document.querySelector<HTMLElement>('button[type="submit"] .jpdb-reader-word')!;
        expect(word.classList.contains('jpdb-reader-passive-word')).toBe(true);
        expect(word.classList.contains('jpdb-reader-scan-word')).toBe(true);
        expect(word.tabIndex).toBe(-1);
        expect(word.querySelector('rt')?.textContent).toBe('けんさくりれき');
        expect(buttonWord.dataset.jpdbReaderPassive).toBe('true');
        expect(buttonWord.classList.contains('jpdb-reader-passive-word')).toBe(true);
        expect(buttonWord.classList.contains('jpdb-reader-scan-word')).toBe(true);
        expect(buttonWord.tabIndex).toBe(-1);
        expect(summaryWord.dataset.jpdbReaderPassive).toBe('true');
        expect(summaryWord.classList.contains('jpdb-reader-passive-word')).toBe(true);
        expect(summaryWord.classList.contains('jpdb-reader-scan-word')).toBe(true);
        expect(summaryWord.tabIndex).toBe(-1);
        expect(buttonWord.querySelector('ruby rt')).toBeNull();
        expect(buttonWord.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('せってい');
        expect(summaryWord.querySelector('ruby rt')).toBeNull();
        expect(summaryWord.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('つづ');
        expect(submitWord.dataset.jpdbReaderPassive).toBe('true');
        expect(submitWord.querySelector('ruby rt')).toBeNull();
        expect(submitWord.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('とうろく');
        const app = new ReaderApp();
        const readerWordAccess = app as unknown as {
            canLookupReaderWord: (word: HTMLElement) => boolean;
            canHoverLookupReaderWord: (word: HTMLElement) => boolean;
        };
        try {
            expect(readerWordAccess.canLookupReaderWord(buttonWord)).toBe(false);
            expect(readerWordAccess.canHoverLookupReaderWord(buttonWord)).toBe(true);
        } finally {
            app.destroy();
        }
    });

    it('adds host role-tab and checkbox chrome labels as passive ruby scan targets', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 240, height: 40 });
        document.body.innerHTML = `
            <main><article><p>今日は静かな喫茶店で新しい本を読みました。</p></article></main>
            <div role="tablist" class="site-tabs">
                <button type="button" role="tab" title="外観">外観</button>
                <button type="button" role="tab">API</button>
            </div>
            <div role="checkbox" aria-checked="true" tabindex="0">検索後もシートを開いたままにする</div>
        `;

        const targets = collectScanTargets(10, 'https://discourse.julialang.org/t/llms-and-uuids/115217/5');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '今日は静かな喫茶店で新しい本を読みました。',
            '外観',
            '検索後もシートを開いたままにする',
        ]));
        const tabTarget = targets.find(target => target.text === '外観')!;
        const checkboxTarget = targets.find(target => target.text === '検索後もシートを開いたままにする')!;
        expect('passiveInteraction' in tabTarget && tabTarget.passiveInteraction).toBe(true);
        expect('passiveInteraction' in checkboxTarget && checkboxTarget.passiveInteraction).toBe(true);

        applyTokensToScanTarget(tabTarget, [{
            card: { ...card, cardState: ['known'], spelling: '外観', reading: 'がいかん' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'がいかん', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '外観',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        applyTokensToScanTarget(checkboxTarget, [{
            card: { ...card, cardState: ['known'], spelling: '検索', reading: 'けんさく' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'けんさく', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '検索後もシートを開いたままにする',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const tabWord = document.querySelector<HTMLElement>('[role="tab"] .jpdb-reader-word')!;
        const checkboxWord = document.querySelector<HTMLElement>('[role="checkbox"] .jpdb-reader-word')!;
        expect(tabWord.dataset.jpdbReaderPassive).toBe('true');
        expect(tabWord.querySelector('ruby rt')).toBeNull();
        expect(tabWord.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('がいかん');
        expect(checkboxWord.dataset.jpdbReaderPassive).toBe('true');
        expect(checkboxWord.querySelector('ruby rt')).toBeNull();
        expect(checkboxWord.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('けんさく');
    });

    it('adds compact parser-page chrome labels after site text as passive ruby scan targets', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.body.innerHTML = `
            <header class="vector-header">
                <nav class="vector-main-menu-landmark" aria-label="サイト">
                    <div id="vector-main-menu" class="vector-main-menu vector-pinnable-element">
                        <div class="vector-pinnable-header">
                            <div class="vector-pinnable-header-label">メインメニュー</div>
                            <button class="vector-pinnable-header-pin-button">サイドバーに移動</button>
                            <button class="vector-pinnable-header-unpin-button">非表示</button>
                        </div>
                        <div id="p-navigation" class="vector-menu mw-portlet">
                            <div class="vector-menu-heading">案内</div>
                            <ul><li><a href="/wiki/main"><span>メインページ</span></a></li></ul>
                        </div>
                    </div>
                </nav>
            </header>
            <main>
                <h1 id="firstHeading">原子量</h1>
                <nav aria-label="表示">
                    <div id="p-views" class="vector-menu vector-menu-tabs mw-portlet mw-portlet-views">
                        <ul>
                            <li id="ca-view"><a href="/wiki/原子量"><span>閲覧</span></a></li>
                            <li id="ca-edit"><a href="/w/index.php?action=edit"><span>編集</span></a></li>
                            <li id="ca-history"><a href="/w/index.php?action=history"><span>履歴を表示</span></a></li>
                        </ul>
                    </div>
                    <div id="siteSub" class="noprint">出典: フリー百科事典『ウィキペディア（Wikipedia）』</div>
                </nav>
                <div id="mw-content-text"><p>原子の質量を表す。</p></div>
            </main>
            <div id="vector-toc" class="vector-toc vector-pinnable-element">
                <div class="vector-pinnable-header">
                    <h2 class="vector-pinnable-header-label">目次</h2>
                    <button>サイドバーに移動</button>
                    <button>非表示</button>
                </div>
                <ul class="vector-toc-contents">
                    <li><a href="#" class="vector-toc-link"><div class="vector-toc-text">ページ先頭</div></a></li>
                    <li><a href="#参考文献" class="vector-toc-link"><div class="vector-toc-text"><span>1</span><span>参考文献</span></div></a></li>
                    <li><a href="#関連項目" class="vector-toc-link"><div class="vector-toc-text"><span>2</span><span>関連項目</span></div></a></li>
                </ul>
            </div>
            <div id="vector-appearance-pinned-container" class="vector-pinned-container">
                <div id="vector-appearance" class="vector-appearance vector-pinnable-element">
                    <div class="vector-pinnable-header">
                        <div class="vector-pinnable-header-label">表示</div>
                        <button>サイドバーに移動</button>
                        <button>非表示</button>
                    </div>
                    <div class="vector-menu" id="skin-client-prefs-vector-feature-custom-font-size">
                        <div class="vector-menu-heading">テキスト</div>
                        <form>
                            <label><span class="cdx-label__label__text">小</span></label>
                            <label><span class="cdx-label__label__text">標準</span></label>
                            <label><span class="cdx-label__label__text">大</span></label>
                        </form>
                    </div>
                    <div class="vector-menu" id="skin-client-prefs-skin-theme">
                        <div class="vector-menu-heading">色 <span><span>(ベータ)</span></span></div>
                        <form>
                            <label><span class="cdx-label__label__text">自動</span></label>
                            <label><span class="cdx-label__label__text">ライト</span></label>
                            <label><span class="cdx-label__label__text">ダーク</span></label>
                        </form>
                    </div>
                </div>
            </div>
        `;

        const targets = collectScanTargets(60, 'https://ja.wikipedia.org/wiki/%E5%8E%9F%E5%AD%90%E9%87%8F');
        rectSpy.mockRestore();

        const texts = targets.map(target => target.text);
        expect(texts).toEqual(expect.arrayContaining([
            '原子量',
            '原子の質量を表す。',
            '閲覧',
            '編集',
            '履歴を表示',
            '目次',
            'ページ先頭',
            '表示',
            'サイドバーに移動',
            '非表示',
            'テキスト',
            '標準',
            'ライト',
        ]));
        expect(texts.some(text => text.includes('参考文献'))).toBe(true);
        expect(texts.some(text => text.includes('関連項目'))).toBe(true);

        const article = targets.find(target => target.text === '原子の質量を表す。')!;
        const edit = targets.find(target => target.text === '編集')!;
        const light = targets.find(target => target.text === 'ライト')!;
        const pinButton = targets.find(target => target.text === 'サイドバーに移動'
            && target.parent.closest('.vector-pinnable-header-pin-button'))!;
        expect('parserId' in article && article.parserId).toBe('wikipedia-parser');
        expect('parserId' in edit && edit.parserId).toBe('wikipedia-parser');
        expect('parserId' in pinButton && pinButton.parserId).toBe('wikipedia-parser');
        expect('passiveInteraction' in edit && edit.passiveInteraction).toBe(true);
        expect('passiveInteraction' in light && light.passiveInteraction).toBe(true);
        expect('passiveInteraction' in pinButton && pinButton.passiveInteraction).toBe(true);

        applyTokensToScanTarget(edit, [{
            card: { ...card, cardState: ['known'], spelling: '編集', reading: 'へんしゅう' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'へんしゅう', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '編集',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        applyTokensToScanTarget(light, [{
            card: { ...card, cardState: ['known'], spelling: 'ライト', reading: 'ライト' },
            start: 0,
            end: 3,
            length: 3,
            rubies: [],
            pitchClass: '',
            sentence: 'ライト',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        applyTokensToScanTarget(pinButton, [{
            card: { ...card, cardState: ['known'], spelling: 'サイドバー', reading: 'サイドバー' },
            start: 0,
            end: 5,
            length: 5,
            rubies: [],
            pitchClass: '',
            sentence: 'サイドバーに移動',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const editWord = document.querySelector<HTMLElement>('#ca-edit .jpdb-reader-word')!;
        const lightWord = Array.from(document.querySelectorAll<HTMLElement>('#vector-appearance label .jpdb-reader-word'))
            .find(word => readerWordSurfaceText(word) === 'ライト')!;
        const pinWord = document.querySelector<HTMLElement>('.vector-pinnable-header-pin-button .jpdb-reader-word')!;
        expect(editWord.dataset.jpdbReaderPassive).toBe('true');
        expect(editWord.querySelector('ruby rt')).toBeNull();
        expect(editWord.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('へんしゅう');
        expect(lightWord.dataset.jpdbReaderPassive).toBe('true');
        expect(readerWordSurfaceText(lightWord)).toBe('ライト');
        expect(pinWord.dataset.jpdbReaderPassive).toBe('true');
        expect(readerWordSurfaceText(pinWord)).toBe('サイドバー');
    });

});
