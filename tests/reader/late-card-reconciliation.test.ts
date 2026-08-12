import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnkiLookupResult } from '../../src/reader/anki/index';
import { RenderedWordIndex } from '../../src/reader/app/rendered-word-index';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { ReaderApp } from '../../src/reader/app/main';
import { VisiblePageScanner } from '../../src/reader/app/visible-page-scanner';
import { renderedWordPrivateValue } from '../../src/reader/dom/rendered-word-private-state';
import { setRenderedWordCardIdentity } from '../../src/reader/dom/rendered-word-state';
import type { ImageOcrController } from '../../src/reader/ocr/controller';
import type { OcrResult } from '../../src/reader/ocr/response-shared';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { YomuSrsAdapter, YomuSrsLookupItem, YomuSrsReviewable } from '../../src/reader/srs/types';
import { deferred, registerReaderHelpersCleanup } from './jpdb/fixtures';

registerReaderHelpersCleanup();

afterEach(() => {
    vi.useRealTimers();
});

type AppInternals = {
    settings: ReaderSettings;
    pageScanner: VisiblePageScanner;
    yomuLocalSrs: Pick<YomuSrsAdapter, 'lookupCards'>;
    anki: {
        findCachedStatusBatch(cards: JPDBCard[]): Promise<AnkiLookupResult[]>;
        destroy?(): void;
    };
    bunproCompanion: { effectiveBunproWordState(entry: unknown, now: number): string | null } | null;
    bunproWordStates: { load(): Promise<Map<string, unknown>> } | null;
    shouldRunBunproWordStateWork(): boolean;
    applyBunproWordStatesToRoots(roots: ParentNode[]): Promise<void>;
    applyResolvedPitchCardToToken(token: JPDBToken, fallback: JPDBCard, card: JPDBCard, pitchClass: string): Promise<void>;
    scheduleCachedPublicVocabularyHydration(
        root: ParentNode,
        resolved: { fallback: JPDBCard; card: JPDBCard; span: Pick<JPDBToken, 'start' | 'end'> },
    ): void;
    beginAnkiWordEnrichment(tokens: JPDBToken[]): (roots: ParentNode[]) => void;
    enrichAnkiWords(tokens: JPDBToken[], roots: ParentNode[]): Promise<void>;
    enrichOcrRenderedTokens(tokens: JPDBToken[], root: ParentNode): Promise<void>;
    queueResolvedWordEffects(tokens: JPDBToken[], roots: ParentNode[]): void;
    applyAnkiLookupsToRenderedWords(tokens: JPDBToken[], lookups: AnkiLookupResult[], roots: ParentNode[]): void;
    queueAnkiWordEnrichment(tokens: JPDBToken[], roots: ParentNode[]): void;
    preloadTermAudioForTokens(tokens: JPDBToken[]): void;
    registerRenderedWordsInRoot(root: ParentNode): void;
    renderedWordIndex: Map<string, Set<HTMLElement>>;
    ocr: ImageOcrController;
};

function lookupCard(id: number, spelling: string, overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: id,
        sid: 0,
        rid: 0,
        jitenWordId: id,
        jitenReadingIndex: 0,
        source: 'jiten',
        spelling,
        reading: spelling,
        frequencyRank: null,
        partOfSpeech: ['n'],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        ...overrides,
    };
}

function tokenFor(card: JPDBCard, sentence = card.spelling): JPDBToken {
    const start = Math.max(0, sentence.indexOf(card.spelling));
    return {
        card,
        start,
        end: start + card.spelling.length,
        length: card.spelling.length,
        rubies: [],
        pitchClass: 'unknown',
        sentence,
    };
}

function appendWord(
    card: JPDBCard,
    root: HTMLElement,
    sentence: string,
    wrapperTag: 'span' | 'a' = 'span',
): HTMLElement {
    const wrapper = document.createElement(wrapperTag);
    if (wrapper instanceof HTMLAnchorElement) wrapper.href = '/inline';
    const word = document.createElement('span');
    word.className = 'jpdb-reader-word jpdb-pitch-unknown';
    word.dataset.sentence = sentence;
    word.dataset.surface = card.spelling;
    const tokenStart = Math.max(0, sentence.indexOf(card.spelling));
    word.dataset.tokenStart = String(tokenStart);
    word.dataset.tokenEnd = String(tokenStart + card.spelling.length);
    word.textContent = card.spelling;
    setRenderedWordCardIdentity(word, card);
    wrapper.append(word);
    root.append(wrapper);
    return word;
}

function settings(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
    return {
        ...DEFAULT_SETTINGS,
        ankiEnabled: false,
        audioEnabled: false,
        autoPlayAudio: false,
        yomuLocalSrsEnabled: false,
        ...overrides,
    };
}

function expectKnownWord(word: HTMLElement): void {
    expect(renderedWordPrivateValue(word, 'cardState')).toBe('known');
}

function expectFuriganaHidden(word: HTMLElement, rubySelector = 'rt,.jpdb-reader-furi'): void {
    expect(word.classList.contains('jpdb-reader-has-furi')).toBe(false);
    expect(word.querySelector(rubySelector)).toBeNull();
}

async function resolveKnownLocalWord(
    localLookup: { resolve(value: YomuSrsReviewable[]): void },
    word: HTMLElement,
    expression: string,
    reading: string,
): Promise<void> {
    localLookup.resolve([{
        providerId: 'yomu-local',
        providerCardId: `${expression}\u0000${reading}`,
        kind: 'vocabulary',
        expression,
        reading,
        meanings: [],
        state: ['known'],
    }]);
    await vi.waitFor(() => expect(renderedWordPrivateValue(word, 'srsProvider')).toBe('yomu-local'));
    expectKnownWord(word);
}

function expectKnownLocalOcrWord(word: HTMLElement): void {
    expectKnownWord(word);
    expect(renderedWordPrivateValue(word, 'srsProvider')).toBe('yomu-local');
    expectFuriganaHidden(word, 'rt,.jpdb-ocr-furi');
}

describe('late canonical card reconciliation', () => {
    it('keeps authoritative known-status furigana hidden during provisional detail repaint', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const internals = app as unknown as AppInternals;
        internals.settings = settings({
            showFurigana: true,
            furiganaMode: 'known-status',
        });
        const root = document.createElement('p');
        const authoritative = lookupCard(10, '名古屋城', {
            reading: 'なごやじょう',
            source: 'jpdb',
            cardState: ['known'],
        });
        const word = appendWord(authoritative, root, '名古屋城を見る。');
        word.classList.add('jpdb-reader-has-furi');
        word.innerHTML = '<ruby>名古屋城<rt>なごやじょう</rt></ruby>';
        document.body.append(root);
        const provisional = lookupCard(11, '名古屋城', {
            reading: 'なごやじょう',
            provisionalState: true,
            cardState: ['not-in-deck'],
        });
        const token = tokenFor(authoritative, '名古屋城を見る。');

        try {
            await internals.applyResolvedPitchCardToToken(token, authoritative, provisional, 'heiban');

            expectKnownWord(word);
            expect(renderedWordPrivateValue(word, 'stateProvenance')).toBe('authoritative');
            expect(renderedWordPrivateValue(word, 'cardSource')).toBe('jiten');
            expectFuriganaHidden(word);
        } finally {
            app.destroy();
        }
    });

    it('recomputes a split-inline sentence when late POS reveals a particle', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const internals = app as unknown as AppInternals;
        internals.settings = settings();
        const schedule = vi.spyOn(internals.pageScanner, 'scheduleLateAnnotationRefresh');
        const root = document.createElement('p');
        const sentence = '冒険を始めるまで旅する。';
        const adventure = appendWord(lookupCard(20, '冒険'), root, sentence);
        appendWord(lookupCard(21, '始める', { cardState: ['known'] }), root, sentence);
        appendWord(lookupCard(22, '旅', { cardState: ['known'] }), root, sentence);
        const sparse = lookupCard(23, 'まで', { reading: '', partOfSpeech: [] });
        const until = appendWord(sparse, root, sentence, 'a');
        document.body.append(root);
        const canonical = lookupCard(23, 'まで', { reading: 'まで', partOfSpeech: ['prt'], pitchAccent: ['LHH'] });
        const token = tokenFor(sparse, sentence);

        try {
            await internals.applyResolvedPitchCardToToken(token, sparse, canonical, 'heiban');

            expect(token.pitchClass).toBe('particle');
            expect(until.classList.contains('jpdb-reader-particle')).toBe(true);
            expect(adventure.classList.contains('jpdb-reader-i-plus-one')).toBe(false);
            const [stateRoots] = schedule.mock.calls[0] ?? [];
            expect(stateRoots ? [...stateRoots] : []).toEqual([root]);

            await vi.advanceTimersByTimeAsync(50);

            expect(adventure.classList.contains('jpdb-reader-i-plus-one')).toBe(true);
            expect(adventure.dataset.miningInsight).toBe('i-plus-one');
        } finally {
            app.destroy();
        }
    });

    it('reapplies known-status furigana after canonical local-SRS hydration', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const internals = app as unknown as AppInternals;
        internals.settings = settings({
            showFurigana: true,
            furiganaMode: 'known-status',
            yomuLocalSrsEnabled: true,
        });
        const localLookup = deferred<YomuSrsReviewable[]>();
        const lookupCards = vi.fn<[readonly YomuSrsLookupItem[]], Promise<YomuSrsReviewable[]>>(() => localLookup.promise);
        internals.yomuLocalSrs = { lookupCards };
        const root = document.createElement('p');
        const sparse = lookupCard(30, '名古屋城', { reading: '', partOfSpeech: [], provisionalState: true });
        const word = appendWord(sparse, root, '名古屋城を見る。');
        document.body.append(root);
        const canonical = lookupCard(30, '名古屋城', {
            reading: 'なごやじょう',
            provisionalState: true,
            cardState: ['not-in-deck'],
        });
        const token = tokenFor(sparse, '名古屋城を見る。');

        try {
            await internals.applyResolvedPitchCardToToken(token, sparse, canonical, 'heiban');
            expect(word.classList.contains('jpdb-reader-has-furi')).toBe(true);

            await vi.advanceTimersByTimeAsync(0);
            expect(lookupCards).toHaveBeenCalledTimes(1);
            expect(lookupCards.mock.calls[0]?.[0]).toEqual([
                expect.objectContaining({ expression: '名古屋城', reading: 'なごやじょう' }),
            ]);
            await resolveKnownLocalWord(localLookup, word, '名古屋城', 'なごやじょう');
            expectFuriganaHidden(word);
        } finally {
            app.destroy();
        }
    });

    it('reattaches a pre-render canonical OCR card to its concrete local-SRS root', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const internals = app as unknown as AppInternals;
        internals.settings = settings({
            showFurigana: true,
            furiganaMode: 'known-status',
            yomuLocalSrsEnabled: true,
        });
        const localLookup = deferred<YomuSrsReviewable[]>();
        const lookupCards = vi.fn<[readonly YomuSrsLookupItem[]], Promise<YomuSrsReviewable[]>>(() => localLookup.promise);
        internals.yomuLocalSrs = { lookupCards };
        const sparse = lookupCard(31, '名古屋城', { reading: '', partOfSpeech: [], provisionalState: true });
        const canonical = lookupCard(31, '名古屋城', {
            reading: 'なごやじょう',
            provisionalState: true,
            cardState: ['not-in-deck'],
        });
        const token = tokenFor(sparse, '名古屋城を見る。');

        try {
            // Canonical detail resolves before the OCR controller has inserted
            // its overlay, so the first effects queue has no rendered roots.
            await internals.applyResolvedPitchCardToToken(token, sparse, canonical, 'heiban');
            const root = document.createElement('p');
            const word = appendWord(canonical, root, '名古屋城を見る。');
            document.body.append(root);
            await internals.enrichOcrRenderedTokens([token], root);

            await vi.advanceTimersByTimeAsync(0);
            expect(lookupCards).toHaveBeenCalledTimes(1);
            await resolveKnownLocalWord(localLookup, word, '名古屋城', 'なごやじょう');
            expect(word.classList.contains('jpdb-reader-has-furi')).toBe(false);
        } finally {
            app.destroy();
        }
    });

    it('keeps a normalized separately hydrated local-SRS state through OCR reactivation', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const internals = app as unknown as AppInternals;
        internals.settings = settings({
            showFurigana: true,
            furiganaMode: 'known-status',
            yomuLocalSrsEnabled: true,
        });
        const localLookup = deferred<YomuSrsReviewable[]>();
        const lookupCards = vi.fn<[readonly YomuSrsLookupItem[]], Promise<YomuSrsReviewable[]>>(() => localLookup.promise);
        internals.yomuLocalSrs = { lookupCards };
        const retainedOcrCard = lookupCard(31, '神社', {
            reading: 'じんじゃ',
            provisionalState: true,
            cardState: ['not-in-deck'],
        });
        const retainedOcrToken = tokenFor(retainedOcrCard, '神社');
        // Compatibility ideograph 神 normalizes to 神. Local SRS already
        // treats these as one identity; the interaction registry must do so too.
        const separatelyQueuedCard = lookupCard(32, '神社', {
            reading: 'じんじゃ',
            provisionalState: true,
            cardState: ['not-in-deck'],
        });
        const separatelyQueuedToken = tokenFor(separatelyQueuedCard, '神社');
        const result: OcrResult = {
            width: 300,
            height: 100,
            lines: [{ text: '神社', box: { left: 0, top: 0, width: 120, height: 40 }, vertical: false }],
        };
        const overlay = document.createElement('div');
        const image = document.createElement('img');
        const line = (internals.ocr as unknown as {
            renderOcrLineElement(
                state: { image: HTMLImageElement; overlay: HTMLElement },
                result: OcrResult,
                line: OcrResult['lines'][number],
                tokens: JPDBToken[],
                sentence: string,
                showText: boolean,
                settings: ReaderSettings,
            ): HTMLElement;
        }).renderOcrLineElement(
            { image, overlay },
            result,
            result.lines[0]!,
            [retainedOcrToken],
            '神社',
            true,
            internals.settings,
        );
        overlay.append(line);
        document.body.append(overlay);
        const word = line.querySelector<HTMLElement>('.jpdb-reader-word')!;

        try {
            expect(word.classList.contains('jpdb-reader-has-furi')).toBe(true);
            internals.queueResolvedWordEffects([separatelyQueuedToken], [document]);

            await vi.advanceTimersByTimeAsync(0);
            expect(lookupCards).toHaveBeenCalledTimes(1);
            await resolveKnownLocalWord(localLookup, word, '神社', 'じんじゃ');
            expectKnownLocalOcrWord(word);

            line.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

            expectKnownLocalOcrWord(word);
            expect(line.dataset.hasFuri).toBe('false');
        } finally {
            app.destroy();
        }
    });

    it('batches fallback first-apply consumers with canonical readings', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const internals = app as unknown as AppInternals;
        internals.settings = settings({ yomuLocalSrsEnabled: true, showFurigana: false });
        const lookupCards = vi.fn<[readonly YomuSrsLookupItem[]], Promise<YomuSrsReviewable[]>>(async () => []);
        internals.yomuLocalSrs = { lookupCards };
        const queueAnki = vi.fn();
        const preloadAudio = vi.fn();
        internals.queueAnkiWordEnrichment = queueAnki;
        internals.preloadTermAudioForTokens = preloadAudio;
        const root = document.createElement('p');
        document.body.append(root);
        const canonicalCards: JPDBCard[] = [];
        const resolutions: Array<{ fallback: JPDBCard; card: JPDBCard; span: Pick<JPDBToken, 'start' | 'end'> }> = [];

        try {
            for (let index = 0; index < 12; index += 1) {
                const fallback = lookupCard(-100 - index, `語${index}`, {
                    source: 'fallback',
                    reading: '',
                    partOfSpeech: [],
                    provisionalState: true,
                });
                const canonical = lookupCard(100 + index, `語${index}`, {
                    reading: `ご${index}`,
                    provisionalState: true,
                });
                const sentence = `語${index}を読む。`;
                appendWord(fallback, root, sentence);
                canonicalCards.push(canonical);
                resolutions.push({ fallback, card: canonical, span: tokenFor(fallback, sentence) });
            }
            const querySelectorAll = vi.spyOn(document, 'querySelectorAll');
            const getComputedStyle = vi.spyOn(window, 'getComputedStyle');
            let perCardDocumentWalks = 0;
            try {
                resolutions.forEach(resolved => internals.scheduleCachedPublicVocabularyHydration(document, resolved));
                perCardDocumentWalks = querySelectorAll.mock.calls.filter(([selector]) => (
                    String(selector).startsWith('.jpdb-reader-word[data-vid="')
                )).length;
                expect(getComputedStyle).not.toHaveBeenCalled();
            } finally {
                querySelectorAll.mockRestore();
                getComputedStyle.mockRestore();
            }

            expect(root.querySelectorAll('.jpdb-reader-word[data-reading^="ご"]')).toHaveLength(12);
            expect(perCardDocumentWalks).toBe(0);
            expect(queueAnki).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(0);
            await vi.waitFor(() => expect(lookupCards).toHaveBeenCalledTimes(1));

            expect(queueAnki).toHaveBeenCalledTimes(1);
            expect(queueAnki.mock.calls[0]?.[0]).toHaveLength(12);
            expect(queueAnki.mock.calls[0]?.[0].map((token: JPDBToken) => token.card.reading))
                .toEqual(canonicalCards.map(card => card.reading));
            expect(queueAnki.mock.calls[0]?.[1]).toEqual([root]);
            expect(preloadAudio).toHaveBeenCalledTimes(1);
            expect(preloadAudio.mock.calls[0]?.[0]).toHaveLength(12);
            expect(lookupCards.mock.calls[0]?.[0]).toHaveLength(12);
        } finally {
            app.destroy();
        }
    });

    it('discovers a recycled duplicate after the only old-key word is rekeyed', () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const internals = app as unknown as AppInternals;
        internals.settings = settings();
        const root = document.createElement('p');
        document.body.append(root);
        const fallback = lookupCard(-70, '名古屋城', { reading: '', source: 'fallback', provisionalState: true });
        const firstCanonical = lookupCard(70, '名古屋城', { reading: 'なごやじょう', provisionalState: true });
        const secondCanonical = lookupCard(71, '名古屋城', { reading: 'なごやじょう', provisionalState: true });
        const first = appendWord(fallback, root, '名古屋城を見る。');

        try {
            const span = tokenFor(fallback, '名古屋城を見る。');
            internals.scheduleCachedPublicVocabularyHydration(root, { fallback, card: firstCanonical, span });
            expect(renderedWordPrivateValue(first, 'vid')).toBe('70');

            // A framework recycler paints the old sparse identity later in the
            // same task, after the repaint index has already been primed.
            const recycled = appendWord(fallback, root, '名古屋城を見る。');
            internals.scheduleCachedPublicVocabularyHydration(root, { fallback, card: secondCanonical, span });

            expect(renderedWordPrivateValue(recycled, 'vid')).toBe('71');
            expect(recycled.dataset.reading).toBe('なごやじょう');
        } finally {
            app.destroy();
        }
    });

    it('repaints only the resolved fallback occurrence when identical surfaces have different spans', () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const internals = app as unknown as AppInternals;
        internals.settings = settings();
        const root = document.createElement('p');
        document.body.append(root);
        const sentence = '優しい言葉と優しい言葉';
        const fallback = lookupCard(-72, '優しい言葉', { reading: '', source: 'fallback', provisionalState: true });
        const canonical = lookupCard(72, '優しい', { reading: 'やさしい', provisionalState: true });
        const first = appendWord(fallback, root, sentence);
        const second = appendWord(fallback, root, sentence);
        second.dataset.tokenStart = '6';
        second.dataset.tokenEnd = '11';

        try {
            internals.scheduleCachedPublicVocabularyHydration(root, {
                fallback,
                card: canonical,
                span: { start: 0, end: 5 },
            });

            expect(renderedWordPrivateValue(first, 'vid')).toBe('72');
            expect(renderedWordPrivateValue(second, 'vid')).toBe('-72');
            expect(second.dataset.expression).toBe('優しい言葉');
        } finally {
            app.destroy();
        }
    });

    it('globally prunes disconnected unique-card index entries without key lookups', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const internals = app as unknown as AppInternals;
        const root = document.createElement('section');
        document.body.append(root);
        for (let index = 0; index < 180; index += 1) {
            appendWord(lookupCard(1_000 + index, `語${index}`), root, `語${index}を読む。`);
        }

        try {
            internals.registerRenderedWordsInRoot(root);
            expect(internals.renderedWordIndex.size).toBe(180);
            root.remove();

            await vi.advanceTimersByTimeAsync(30_000);

            expect(internals.renderedWordIndex.size).toBe(0);
        } finally {
            app.destroy();
        }
    });

    it('schedules index pruning from registrations without a perpetual heartbeat', async () => {
        vi.useFakeTimers();
        const index = new RenderedWordIndex({
            isDestroyed: () => false,
            annotationRoots: () => [document],
        });
        const root = document.createElement('p');
        document.body.append(root);
        const word = appendWord(lookupCard(1_500, '静か'), root, '静かなページ。');
        const timeout = vi.spyOn(window, 'setTimeout');

        try {
            index.registerRoot(root);
            expect(timeout.mock.calls.filter(([, delay]) => delay === 30_000)).toHaveLength(1);

            await vi.advanceTimersByTimeAsync(30_000);

            expect(index.entries.size).toBe(1);
            expect(timeout.mock.calls.filter(([, delay]) => delay === 30_000)).toHaveLength(1);

            index.register(word);
            expect(timeout.mock.calls.filter(([, delay]) => delay === 30_000)).toHaveLength(2);
        } finally {
            index.clear();
            timeout.mockRestore();
        }
    });

    it('does not paint a late local-SRS result after the setting is disabled', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const internals = app as unknown as AppInternals;
        internals.settings = settings({ yomuLocalSrsEnabled: true });
        const localLookup = deferred<YomuSrsReviewable[]>();
        const lookupCards = vi.fn<[readonly YomuSrsLookupItem[]], Promise<YomuSrsReviewable[]>>(() => localLookup.promise);
        internals.yomuLocalSrs = { lookupCards };
        const root = document.createElement('p');
        const sparse = lookupCard(72, '名古屋城', { reading: '', provisionalState: true });
        const canonical = lookupCard(72, '名古屋城', { reading: 'なごやじょう', provisionalState: true });
        const word = appendWord(sparse, root, '名古屋城を見る。');
        document.body.append(root);

        try {
            await internals.applyResolvedPitchCardToToken(tokenFor(sparse), sparse, canonical, 'heiban');
            await vi.advanceTimersByTimeAsync(0);
            expect(lookupCards).toHaveBeenCalledTimes(1);
            internals.settings.yomuLocalSrsEnabled = false;
            localLookup.resolve([{
                providerId: 'yomu-local',
                providerCardId: '名古屋城\u0000なごやじょう',
                kind: 'vocabulary',
                expression: '名古屋城',
                reading: 'なごやじょう',
                meanings: [],
                state: ['known'],
            }]);
            await localLookup.promise;
            await Promise.resolve();

            expect(renderedWordPrivateValue(word, 'srsProvider')).toBeUndefined();
            expect(renderedWordPrivateValue(word, 'cardState')).toBe('not-in-deck');
        } finally {
            app.destroy();
        }
    });

    it('drops an in-flight sparse Anki result after token identity becomes canonical', async () => {
        const app = new ReaderApp();
        const internals = app as unknown as AppInternals;
        internals.settings = settings({ ankiEnabled: true });
        const pending = deferred<AnkiLookupResult[]>();
        internals.anki = {
            findCachedStatusBatch: vi.fn(() => pending.promise),
            destroy: vi.fn(),
        };
        const apply = vi.fn();
        internals.applyAnkiLookupsToRenderedWords = apply;
        const sparse = lookupCard(40, '冒険', { reading: '' });
        const canonical = lookupCard(40, '冒険', { reading: 'ぼうけん' });
        const token = tokenFor(sparse);

        try {
            const finish = internals.beginAnkiWordEnrichment([token]);
            finish([document]);
            token.card = canonical;
            pending.resolve([{ state: 'known', notes: [], primary: null }]);
            await pending.promise;
            await Promise.resolve();

            expect(apply).not.toHaveBeenCalled();
        } finally {
            app.destroy();
        }
    });

    it('drops a stale sparse Anki result on the shared post-render path', async () => {
        const app = new ReaderApp();
        const internals = app as unknown as AppInternals;
        internals.settings = settings({ ankiEnabled: true });
        const pending = deferred<AnkiLookupResult[]>();
        internals.anki = {
            findCachedStatusBatch: vi.fn(() => pending.promise),
            destroy: vi.fn(),
        };
        const apply = vi.fn();
        internals.applyAnkiLookupsToRenderedWords = apply;
        const sparse = lookupCard(41, '冒険', { reading: '' });
        const canonical = lookupCard(41, '冒険', { reading: 'ぼうけん' });
        const token = tokenFor(sparse);

        try {
            const finish = internals.enrichAnkiWords([token], [document]);
            token.card = canonical;
            pending.resolve([{ state: 'known', notes: [], primary: null }]);
            await finish;

            expect(apply).not.toHaveBeenCalled();
        } finally {
            app.destroy();
        }
    });

    it('preserves richer same-id pitch evidence before deferred detail reaches the DOM and cache', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const internals = app as unknown as AppInternals;
        internals.settings = settings({ showPitchAccent: true });
        const root = document.createElement('p');
        document.body.append(root);

        const richPitch = lookupCard(60, '名古屋城', {
            reading: 'なごやじょう',
            pitchAccent: ['LHHHHH'],
            cardState: ['known'],
            provisionalState: false,
        });
        const pitchWord = appendWord(richPitch, root, '名古屋城を見る。');
        const poorerPitchDetail = lookupCard(60, '名古屋城', {
            reading: 'なごやじょう',
            pitchAccent: [],
            cardState: ['not-in-deck'],
            provisionalState: true,
            meanings: [{ glosses: ['Nagoya Castle'], partOfSpeech: ['n'] }],
        });
        const pitchToken = tokenFor(richPitch, '名古屋城を見る。');

        const richComponents = lookupCard(61, '王子様', {
            reading: 'おうじさま',
            pitchAccent: [],
            pitchComponents: [
                { spelling: '王子', reading: 'おうじ', pitchAccent: ['HLLL'], wordWithReading: '王[おう]子[じ]' },
                { spelling: '様', reading: 'さま', pitchAccent: ['LHH'], wordWithReading: '様[さま]' },
            ],
            cardState: ['known'],
            provisionalState: false,
        });
        const componentWord = appendWord(richComponents, root, '王子様に会う。');
        const poorerComponentDetail = lookupCard(61, '王子様', {
            reading: 'おうじさま',
            pitchAccent: [],
            pitchComponents: undefined,
            cardState: ['not-in-deck'],
            provisionalState: true,
            meanings: [{ glosses: ['prince'], partOfSpeech: ['n'] }],
        });
        const componentToken = tokenFor(richComponents, '王子様に会う。');

        try {
            await internals.applyResolvedPitchCardToToken(pitchToken, richPitch, poorerPitchDetail, 'unknown');
            await internals.applyResolvedPitchCardToToken(componentToken, richComponents, poorerComponentDetail, 'unknown');

            // The coordinator caches the original incoming objects, so these
            // assertions prove cache evidence was repaired before callback exit.
            expect(pitchToken.card).toBe(poorerPitchDetail);
            expect(poorerPitchDetail.pitchAccent).toEqual(['LHHHHH']);
            expect(poorerPitchDetail.cardState).toEqual(['known']);
            expect(poorerPitchDetail.provisionalState).toBe(false);
            expect(pitchToken.pitchClass).toBe('heiban');
            expect(pitchWord.dataset.pitchAccent).toBe('LHHHHH');
            expect(pitchWord.dataset.pitchClass).toBe('heiban');
            expect(pitchWord.classList.contains('jpdb-pitch-heiban')).toBe(true);
            expect(renderedWordPrivateValue(pitchWord, 'cardState')).toBe('known');

            expect(componentToken.card).toBe(poorerComponentDetail);
            expect(poorerComponentDetail.pitchComponents).toEqual(richComponents.pitchComponents);
            expect(poorerComponentDetail.cardState).toEqual(['known']);
            expect(componentWord.dataset.pitchComponents).toBe('true');
            expect(componentWord.style.getPropertyValue('--jpdb-reader-inline-pitch-gradient'))
                .toContain('--jpdb-reader-pitch-atamadaka');
            expect(componentWord.style.getPropertyValue('--jpdb-reader-inline-pitch-gradient'))
                .toContain('--jpdb-reader-pitch-heiban');
            expect(renderedWordPrivateValue(componentWord, 'cardState')).toBe('known');
        } finally {
            app.destroy();
        }
    });

    it('routes late Bunpro state through the sentence-level i+1 reconciler', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const internals = app as unknown as AppInternals;
        internals.settings = settings();
        internals.shouldRunBunproWordStateWork = () => true;
        internals.bunproCompanion = { effectiveBunproWordState: () => 'known' };
        internals.bunproWordStates = { load: async () => new Map([['読む', {}]]) };
        const root = document.createElement('p');
        const sentence = '冒険の本を読む。';
        const adventure = appendWord(lookupCard(50, '冒険'), root, sentence);
        appendWord(lookupCard(51, '本', { cardState: ['known'] }), root, sentence);
        const reading = appendWord(lookupCard(52, '読む'), root, sentence, 'a');
        document.body.append(root);

        try {
            await internals.applyBunproWordStatesToRoots([root]);
            expect(renderedWordPrivateValue(reading, 'cardState')).toBe('known');
            expect(adventure.classList.contains('jpdb-reader-i-plus-one')).toBe(false);

            await vi.advanceTimersByTimeAsync(50);

            expect(adventure.classList.contains('jpdb-reader-i-plus-one')).toBe(true);
        } finally {
            app.destroy();
        }
    });
});
