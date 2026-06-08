import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewTabController } from '../../src/reader/newtab/controller';
import {
    formatNewTabSessionElapsed,
    NewTabSessionProgressTracker,
    sessionProgressSourcesForCard,
} from '../../src/reader/newtab/session-progress';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard } from '../../src/reader/app/types';

function progressCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    const spelling = overrides.spelling ?? '読む';
    return {
        vid: 1,
        sid: 1,
        rid: 1,
        spelling,
        reading: overrides.reading ?? spelling,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
        cardState: ['new'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
        ...overrides,
    };
}

function progressController(overrides: Partial<ConstructorParameters<typeof NewTabController>[0]> = {}): NewTabController {
    return new NewTabController({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            enableReviews: true,
            jpdbMiningEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'auto',
        }),
        anki: { answerCard: vi.fn(async () => {}) } as never,
        jpdb: { reviewCard: vi.fn(async () => {}) } as never,
        jpdbKanji: { lookup: vi.fn(async () => null) } as never,
        kanjiVG: { lookup: vi.fn(async () => null) } as never,
        rtk: { lookup: vi.fn(async () => null) } as never,
        immersionKit: {} as never,
        jpdbReviewBridge: { onUpdate: () => () => {} } as never,
        parser: {} as never,
        dictionaries: {} as never,
        onSettingsChange: vi.fn(),
        applyTheme: vi.fn(),
        showSettings: vi.fn(),
        dismiss: vi.fn(),
        ...overrides,
    });
}

function renderProgressRoot(controller: NewTabController): HTMLElement {
    const root = document.createElement('main');
    root.className = 'jpdb-reader-newtab';
    root.dataset.jpdbReaderRoot = 'true';
    root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
    document.body.append(root);
    return root;
}

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    localStorage.clear();
    sessionStorage.clear();
});

describe('new-tab session progress', () => {
    it('formats elapsed time like a stopwatch', () => {
        expect(formatNewTabSessionElapsed(-500)).toBe('00:00');
        expect(formatNewTabSessionElapsed(5_000)).toBe('00:05');
        expect(formatNewTabSessionElapsed(185_000)).toBe('03:05');
        expect(formatNewTabSessionElapsed(3_723_000)).toBe('1:02:03');
    });

    it('tracks completed reviews, elapsed time, and remaining review cards by source', () => {
        let now = 1_000;
        const tracker = new NewTabSessionProgressTracker({ now: () => now });
        const jpdb = progressCard({ vid: 10, sid: 1, spelling: '復習', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const jiten = progressCard({ vid: -2, sid: 0, spelling: '辞典', source: 'jiten', reviewSource: 'jiten-api', jitenWordId: 20, cardState: ['new'] });
        const anki = progressCard({ vid: -3, sid: 0, rid: 404, spelling: '暗記', source: 'anki', reviewSource: 'anki', ankiCardId: 404, cardState: ['learning'] });
        const dictionary = progressCard({ vid: -4, sid: 0, spelling: '辞書', source: 'local', reviewSource: 'dictionary', cardState: ['known'] });

        tracker.recordReviewCompleted();
        now = 126_000;
        const snapshot = tracker.snapshot([jpdb, jiten, anki, dictionary]);

        expect(snapshot.completedReviews).toBe(1);
        expect(snapshot.elapsedLabel).toBe('02:05');
        expect(snapshot.remainingCards).toBe(3);
        expect(snapshot.remainingDueCards).toBe(2);
        expect(snapshot.sources).toEqual([
            { source: 'jpdb', remainingCards: 1, remainingDueCards: 1, available: true },
            { source: 'jiten', remainingCards: 1, remainingDueCards: 0, available: true },
            { source: 'anki', remainingCards: 1, remainingDueCards: 1, available: true },
        ]);
    });

    it('recognizes dual JPDB and Anki review prompts as both source types', () => {
        const card = progressCard({
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            ankiCardId: 505,
            ankiDeckNames: ['Core'],
        });

        expect(sessionProgressSourcesForCard(card)).toEqual(['jpdb', 'anki']);
    });

    it('renders session progress data for active new-tab review cards', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-06T12:00:00Z'));
        const reviewCard = vi.fn(async () => {});
        const controller = progressController({ jpdb: { reviewCard } as never });
        const root = renderProgressRoot(controller);
        const jpdb = progressCard({ vid: 10, sid: 1, spelling: '復習', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const anki = progressCard({ vid: -3, sid: 0, rid: 404, spelling: '暗記', source: 'anki', reviewSource: 'anki', ankiCardId: 404, cardState: ['learning'] });

        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            reviewCountMode: boolean;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            loadWordsInto(root: HTMLElement, preferStoredWord: boolean, options: unknown): Promise<void>;
        }, {
            allWords: [jpdb, anki],
            visibleWords: [jpdb, anki],
            index: 0,
            reviewCountMode: true,
            sourceLabel: 'JPDB + Anki',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'auto', revealAnswer: false },
            loadWordsInto: vi.fn(async () => {}),
        });

        vi.setSystemTime(new Date('2026-06-06T12:01:05Z'));
        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, jpdb);
        const count = root.querySelector<HTMLElement>('[data-newtab-count]')!;
        expect(count.textContent).toBe('Done 0 · Left 2 · Due 2 · 01:05');
        expect(count.dataset.sessionRemainingCards).toBe('2');
        expect(count.dataset.sessionJpdbRemainingCards).toBe('1');
        expect(count.dataset.sessionAnkiRemainingCards).toBe('1');

        await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

        expect(reviewCard).toHaveBeenCalledWith(jpdb, 'okay');
        expect(count.textContent).toBe('Done 1 · Left 1 · Due 1 · 01:05');
        expect(count.dataset.sessionCompletedReviews).toBe('1');
        expect(count.dataset.sessionRemainingCards).toBe('1');
        expect(count.dataset.sessionJpdbRemainingCards).toBe('0');
        expect(count.dataset.sessionAnkiRemainingCards).toBe('1');
    });
});
