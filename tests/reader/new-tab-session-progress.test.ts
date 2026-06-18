import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewTabController } from '../../src/reader/newtab/controller';
import {
    formatNewTabSessionElapsed,
    NewTabSessionProgressTracker,
    sessionProgressSourcesForCard,
} from '../../src/reader/newtab/session-progress';
import { DEFAULT_SETTINGS as BASE_DEFAULT_SETTINGS } from '../../src/reader/settings/index';

// These tests assert English UI copy; pin the interface language since the
// shipped default is now 'ja'.
const DEFAULT_SETTINGS: typeof BASE_DEFAULT_SETTINGS = { ...BASE_DEFAULT_SETTINGS, interfaceLanguage: 'en' };
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
            { source: 'jiten', remainingCards: 1, remainingDueCards: 0, available: true },
            { source: 'jpdb', remainingCards: 1, remainingDueCards: 1, available: true },
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
        expect(count.textContent).toBe('Done 0 · Left 2 · Due 2 · 01:05 · 0/60 min');
        expect(count.dataset.sessionRemainingCards).toBe('2');
        expect(count.dataset.sessionJpdbRemainingCards).toBe('1');
        expect(count.dataset.sessionAnkiRemainingCards).toBe('1');

        await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

        expect(reviewCard).toHaveBeenCalledWith(jpdb, 'okay');
        expect(count.textContent).toBe('Done 1 · Left 1 · Due 1 · 01:05 · 0/60 min');
        expect(count.dataset.sessionCompletedReviews).toBe('1');
        expect(count.dataset.sessionRemainingCards).toBe('1');
        expect(count.dataset.sessionJpdbRemainingCards).toBe('0');
        expect(count.dataset.sessionAnkiRemainingCards).toBe('1');
    });
});

describe('daily study goal (user-requested, default 1h)', () => {
    it('formats goal progress and the reached state', async () => {
        const { formatNewTabDailyGoalLabel } = await import('../../src/reader/newtab/session-progress');
        const labels = { unit: 'min', reached: 'Goal reached' };
        expect(formatNewTabDailyGoalLabel(0, 0, labels)).toBe('');
        expect(formatNewTabDailyGoalLabel(5 * 60000, 60, labels)).toBe('5/60 min');
        expect(formatNewTabDailyGoalLabel(61 * 60000, 60, labels)).toBe('61/60 min ✓ Goal reached');
    });

    it('accumulates per local day and resets on rollover', async () => {
        const { addNewTabDailyStudyTimeMs, newTabDailyStudyTimeMs } = await import('../../src/reader/newtab/session-progress');
        localStorage.removeItem('jpdb-reader-newtab-daily-study-time');
        expect(newTabDailyStudyTimeMs('2026-06-12')).toBe(0);
        addNewTabDailyStudyTimeMs(90000, '2026-06-12');
        expect(newTabDailyStudyTimeMs('2026-06-12')).toBe(90000);
        // A new day starts from zero.
        expect(newTabDailyStudyTimeMs('2026-06-13')).toBe(0);
        addNewTabDailyStudyTimeMs(1000, '2026-06-13');
        expect(newTabDailyStudyTimeMs('2026-06-13')).toBe(1000);
        localStorage.removeItem('jpdb-reader-newtab-daily-study-time');
    });
});

describe('undo last review (community ask, Jiten undo endpoint)', () => {
    it('tracks the last Jiten grade and reverses it through srs/undo-review', async () => {
        const reviewCard = vi.fn(async () => undefined);
        const undoReview = vi.fn(async () => undefined);
        const refreshCardState = vi.fn(async () => undefined);
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, jitenApiKey: 'jiten-key', jpdbMiningEnabled: true, interfaceLanguage: 'en' }),
            anki: {} as never,
            jpdb: {} as never,
            jiten: { reviewCard, undoReview, refreshCardState, listStudyBatchCards: vi.fn(async () => []) } as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {}, latestStatus: () => ({ connected: false }), grade: vi.fn(), requestCurrent: vi.fn() } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
            toast: vi.fn(),
        } as never);
        try {
            const internals = controller as unknown as {
                submitJitenApiGrade(card: JPDBCard, grade: 'okay'): Promise<void>;
                canUndoLastReview(): boolean;
                undoLastReview(root: HTMLElement): Promise<void>;
                visibleWords: JPDBCard[];
                renderWord(root: HTMLElement, card: JPDBCard): void;
            };
            const card = {
                vid: 42, sid: 0, rid: 0, spelling: '辞典', reading: 'じてん',
                frequencyRank: null, partOfSpeech: [], meanings: [], cardState: ['due'],
                pitchAccent: [], wordWithReading: null, source: 'jiten', reviewSource: 'jiten-api',
                jitenWordId: 42, jitenReadingIndex: 0,
            } as unknown as JPDBCard;
            expect(internals.canUndoLastReview()).toBe(false);

            await internals.submitJitenApiGrade(card, 'okay');
            expect(internals.canUndoLastReview()).toBe(true);

            internals.visibleWords = [card];
            internals.renderWord = vi.fn();
            const root = document.createElement('main');
            await internals.undoLastReview(root);

            expect(undoReview).toHaveBeenCalledWith(card);
            // Undo is one-shot: the button disappears until the next grade.
            expect(internals.canUndoLastReview()).toBe(false);
        } finally {
            controller.destroy();
        }
    });
});

describe('stop at end of batch (community ask)', () => {
    it('shows the batch-complete state instead of auto-fetching when enabled', async () => {
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, newTabStopAtBatchEnd: true, interfaceLanguage: 'en' }),
            anki: {} as never,
            jpdb: {} as never,
            jiten: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {}, latestStatus: () => ({ connected: false }), grade: vi.fn(), requestCurrent: vi.fn() } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        } as never);
        try {
            const internals = controller as unknown as {
                reviewCountMode: boolean;
                renderBatchComplete(root: HTMLElement): void;
                studySlots(root: HTMLElement): { prompt: HTMLElement | null; meaning: HTMLElement | null; controls: HTMLElement | null };
            };
            internals.reviewCountMode = true;
            const root = document.createElement('main');
            root.className = 'jpdb-reader-newtab';
            root.innerHTML = `
                <h1 data-newtab-prompt></h1>
                <div data-newtab-answer></div>
                <div data-newtab-meaning></div>
                <div data-newtab-count></div>
                <button data-newtab-status></button>
                <nav data-newtab-controls></nav>
            `;
            document.body.append(root);

            internals.renderBatchComplete(root);

            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toBe('Batch complete');
            expect(root.querySelector('[data-newtab-meaning]')?.textContent).toMatch(/^Done 0 · /);
            expect(root.querySelector('[data-newtab-action="continue-batch"]')?.textContent).toBe('Continue');
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });
});

describe('failed-card session loop (community ask)', () => {
    it('requeues a failed card at the back of the session instead of dropping it', () => {
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en' }),
            anki: {} as never,
            jpdb: {} as never,
            jiten: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {}, latestStatus: () => ({ connected: false }), grade: vi.fn(), requestCurrent: vi.fn() } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        } as never);
        try {
            const card = (spelling: string, vid: number) => ({
                vid, sid: 0, rid: 0, spelling, reading: spelling,
                frequencyRank: null, partOfSpeech: [], meanings: [], cardState: ['due'],
                pitchAccent: [], wordWithReading: null, source: 'jpdb', reviewSource: 'jpdb-api',
            } as unknown as JPDBCard);
            const failedCard = card('落第', 1);
            const nextCard = card('次', 2);
            const internals = controller as unknown as {
                reviewCountMode: boolean;
                visibleWords: JPDBCard[];
                allWords: JPDBCard[];
                index: number;
                renderWord(root: HTMLElement, card: JPDBCard): void;
                rememberReviewHistoryCard(card: JPDBCard): void;
                advanceAfterGrade(root: HTMLElement, card: JPDBCard, grade?: string): void;
            };
            internals.reviewCountMode = true;
            internals.visibleWords = [failedCard, nextCard];
            internals.allWords = [failedCard, nextCard];
            internals.index = 0;
            internals.renderWord = vi.fn();
            internals.rememberReviewHistoryCard = vi.fn();
            const root = document.createElement('main');

            internals.advanceAfterGrade(root, failedCard, 'nothing');

            expect(internals.visibleWords.map(item => item.spelling)).toEqual(['次', '落第']);
            expect(internals.allWords.map(item => item.spelling)).toEqual(['落第', '次']);
            expect(internals.renderWord).toHaveBeenCalledWith(root, nextCard);

            // A passing grade still removes the card.
            internals.index = 0;
            internals.advanceAfterGrade(root, nextCard, 'okay');
            expect(internals.allWords.map(item => item.spelling)).toEqual(['落第']);
        } finally {
            controller.destroy();
        }
    });
});
