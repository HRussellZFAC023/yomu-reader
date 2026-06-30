import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import { NewTabController } from '../../src/reader/newtab/controller';
import { buildNewTabRecallCloze, evaluateNewTabRecallAnswer, normalizeNewTabRecallAnswer } from '../../src/reader/newtab/recall-practice';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

function recallCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 10,
        sid: 20,
        rid: 0,
        spelling: '弁護士',
        reading: 'べんごし',
        frequencyRank: 1200,
        partOfSpeech: ['n'],
        meanings: [{ glosses: ['lawyer'], partOfSpeech: ['n'] }],
        sentence: '昨日、弁護士に相談した。',
        cardState: ['due'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
        reviewSource: 'jpdb-api',
        ...overrides,
    };
}

function recallRoot(): HTMLElement {
    const root = document.createElement('main');
    root.className = 'jpdb-reader-newtab';
    root.dataset.jpdbReaderRoot = 'true';
    root.innerHTML = `
        <section class="jpdb-reader-newtab-study" data-newtab-study>
            <div data-newtab-count></div>
            <h1 data-newtab-prompt></h1>
            <div data-newtab-answer>
                <div data-newtab-reading></div>
                <div data-newtab-meaning></div>
            </div>
            <button data-newtab-status></button>
        </section>
        <nav data-newtab-controls></nav>
    `;
    document.body.replaceChildren(root);
    return root;
}

function recallController(card: JPDBCard, settings: Partial<ReaderSettings> = {}, deps: Partial<NewTabController['dependencies']> = {}) {
    const mergedSettings: ReaderSettings = {
        ...DEFAULT_SETTINGS,
        interfaceLanguage: 'en',
        enableReviews: true,
        jpdbMiningEnabled: true,
        apiKey: 'jpdb-key',
        ...settings,
    };
    const controller = new NewTabController({
        getSettings: () => mergedSettings,
        anki: {} as never,
        jpdb: { reviewCard: vi.fn(async () => undefined) } as never,
        jiten: {} as never,
        jpdbKanji: { lookup: vi.fn(async () => null) } as never,
        kanjiVG: {} as never,
        rtk: {} as never,
        immersionKit: {} as never,
        jpdbReviewBridge: {
            onUpdate: () => () => {},
            latestStatus: () => ({ connected: false }),
            reveal: vi.fn(),
            grade: vi.fn(),
            requestCurrent: vi.fn(),
        } as never,
        parser: {} as never,
        dictionaries: {} as never,
        onSettingsChange: vi.fn(),
        applyTheme: vi.fn(),
        showSettings: vi.fn(),
        dismiss: vi.fn(),
        dismissLookup: vi.fn(),
        toast: vi.fn(),
        ...deps,
    } as never);
    const internals = controller as unknown as {
        allWords: JPDBCard[];
        visibleWords: JPDBCard[];
        sourceLabel: string;
        reviewCountMode: boolean;
        state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean; jpdbDeck: string; ankiDeck: string; keyHintsDismissed: boolean };
        renderWord(root: HTMLElement, card: JPDBCard): void;
        submitRecallAnswer(root: HTMLElement): void;
        gradeCurrentCard(grade: 'okay'): Promise<boolean>;
    };
    internals.allWords = [card];
    internals.visibleWords = [card];
    internals.sourceLabel = card.source === 'anki' ? 'Anki' : card.source === 'jiten' ? 'Jiten' : 'JPDB';
    internals.reviewCountMode = true;
    internals.state = {
        mode: 'recall',
        sort: 'random',
        filter: 'study',
        source: card.source === 'anki' ? 'anki' : 'jpdb',
        revealAnswer: false,
        jpdbDeck: '',
        ankiDeck: '',
        keyHintsDismissed: false,
    };
    return { controller, internals, settings: mergedSettings };
}

afterEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
});

describe('new-tab recall answer matching', () => {
    it('normalizes typed Japanese answers and accepts spelling or reading', () => {
        const card = recallCard({ fallbackLookupTerms: ['べんごし'] });
        expect(normalizeNewTabRecallAnswer(' 弁 護 士 ')).toBe('弁護士');
        expect(evaluateNewTabRecallAnswer(card, '弁護士').outcome).toBe('correct');
        expect(evaluateNewTabRecallAnswer(card, 'べんごし').outcome).toBe('accepted');
        expect(evaluateNewTabRecallAnswer(card, '医者').outcome).toBe('incorrect');
        expect(evaluateNewTabRecallAnswer(card, '   ').outcome).toBe('empty');
    });

    it('builds a sentence cloze around the target spelling', () => {
        const card = recallCard({ sentence: '昨日、弁護士に相談した。' });
        expect(buildNewTabRecallCloze(card, card.sentence ?? '')).toMatchObject({
            before: '昨日、',
            answer: '弁護士',
            after: 'に相談した。',
            hasCloze: true,
        });
    });
});

describe('new-tab Recall mode', () => {
    it('fronts the meaning, checks the typed answer, and grades JPDB through the existing adapter', async () => {
        const card = recallCard();
        const jpdb = { reviewCard: vi.fn(async () => undefined) };
        const { controller, internals } = recallController(card, {}, { jpdb: jpdb as never });
        const root = recallRoot();
        try {
            internals.renderWord(root, card);
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('lawyer');

            const input = root.querySelector<HTMLInputElement>('[data-newtab-recall-input]');
            expect(input).toBeTruthy();
            input!.value = '弁護士';
            internals.submitRecallAnswer(root);

            expect(root.classList.contains('jpdb-reader-newtab-revealed')).toBe(true);
            expect(root.querySelector('[data-newtab-recall-result]')?.textContent).toContain('Correct');
            expect(root.querySelector('[data-newtab-answer]')?.textContent).toContain('弁護士');

            await internals.gradeCurrentCard('okay');
            expect(jpdb.reviewCard).toHaveBeenCalledWith(card, 'okay');
        } finally {
            controller.destroy();
        }
    });

    it('fronts a Bunpro-style sentence gap when sentence context exists', () => {
        const card = recallCard({ sentence: '昨日、弁護士に相談した。' });
        const { controller, internals } = recallController(card);
        const root = recallRoot();
        try {
            internals.renderWord(root, card);

            const prompt = root.querySelector('[data-newtab-prompt]');
            expect(prompt?.textContent).toContain('昨日、');
            expect(prompt?.textContent).toContain('に相談した。');
            expect(prompt?.textContent).toContain('lawyer');
            expect(prompt?.textContent).not.toContain('弁護士');
            expect(root.querySelector('.jpdb-reader-newtab-recall-gap')).not.toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('grades Jiten recall cards through the Jiten API adapter', async () => {
        const card = recallCard({
            vid: 42,
            sid: 0,
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 0,
        });
        const jiten = { reviewCard: vi.fn(async () => undefined), refreshCardState: vi.fn(async () => undefined) };
        const { controller, internals } = recallController(card, { apiKey: '', jitenApiKey: 'jiten-key' }, { jiten: jiten as never });
        const root = recallRoot();
        try {
            internals.renderWord(root, card);
            root.querySelector<HTMLInputElement>('[data-newtab-recall-input]')!.value = '弁護士';
            internals.submitRecallAnswer(root);
            await internals.gradeCurrentCard('okay');
            expect(jiten.reviewCard).toHaveBeenCalledWith(card, 'okay');
        } finally {
            controller.destroy();
        }
    });

    it('grades Anki recall cards through AnkiConnect when a card id is present', async () => {
        const card = recallCard({
            vid: -404,
            sid: 0,
            rid: 404,
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 404,
            ankiDeckNames: ['Core'],
        });
        const anki = { answerCard: vi.fn(async () => undefined) };
        const { controller, internals } = recallController(card, {
            apiKey: '',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
        }, { anki: anki as never });
        const root = recallRoot();
        try {
            internals.renderWord(root, card);
            root.querySelector<HTMLInputElement>('[data-newtab-recall-input]')!.value = '弁護士';
            internals.submitRecallAnswer(root);
            await internals.gradeCurrentCard('okay');
            expect(anki.answerCard).toHaveBeenCalledWith(404, 'okay');
        } finally {
            controller.destroy();
        }
    });
});
