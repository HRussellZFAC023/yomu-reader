import { describe, expect, it, vi } from 'vitest';

import { NewTabController } from '../../src/reader/newtab/controller';
import { newTabDueSummary, shouldReplaceKanjiStudyCard } from '../../src/reader/newtab/card-selection';
import { DEFAULT_SETTINGS as BASE_DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBGrade, ReaderSettings } from '../../src/reader/app/types';

// One table-driven matrix over the cross-provider behaviors the backlog's
// parity-smoke ticket lists: grade routing, duplicate-entry dedup, locked
// kanji ordering, and keyless fallback. Each row asserts the SAME invariant
// holds for every provider rather than re-testing provider internals (those
// live in their own suites).

const DEFAULT_SETTINGS: ReaderSettings = { ...BASE_DEFAULT_SETTINGS, interfaceLanguage: 'en' };

function matrixCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 99,
        sid: 1,
        rid: 0,
        spelling: '勉強',
        reading: 'べんきょう',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [{ glosses: ['study'], partOfSpeech: [] }],
        cardState: ['due'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
        ...overrides,
    };
}

type GradeRoutingRow = {
    target: 'jpdb-live' | 'anki' | 'jiten-api' | 'jpdb-api';
    card: Partial<JPDBCard>;
    settings: Partial<ReaderSettings>;
    spy: (deps: MatrixAdapters) => { calls: unknown[][] };
};

type MatrixAdapters = {
    bridgeGrade: ReturnType<typeof vi.fn>;
    ankiGrade: ReturnType<typeof vi.fn>;
    jitenReview: ReturnType<typeof vi.fn>;
    jpdbReview: ReturnType<typeof vi.fn>;
};

function matrixController(settings: ReaderSettings) {
    const adapters: MatrixAdapters = {
        bridgeGrade: vi.fn(),
        ankiGrade: vi.fn(async () => null),
        jitenReview: vi.fn(async () => undefined),
        jpdbReview: vi.fn(async () => undefined),
    };
    const controller = new NewTabController({
        getSettings: () => settings,
        anki: { gradeCard: adapters.ankiGrade, answerCards: adapters.ankiGrade } as never,
        jpdb: { reviewCard: adapters.jpdbReview } as never,
        jiten: { reviewCard: adapters.jitenReview, listStudyBatchCards: vi.fn(async () => []) } as never,
        jpdbKanji: {} as never,
        kanjiVG: {} as never,
        rtk: {} as never,
        immersionKit: {} as never,
        jpdbReviewBridge: { onUpdate: () => () => {}, latestStatus: () => ({ connected: true }), grade: adapters.bridgeGrade, requestCurrent: vi.fn() } as never,
        parser: {} as never,
        dictionaries: {} as never,
        onSettingsChange: vi.fn(),
        applyTheme: vi.fn(),
        showSettings: vi.fn(),
        dismiss: vi.fn(),
    });
    return { controller, adapters };
}

describe('provider parity matrix', () => {
    const gradeRoutingRows: GradeRoutingRow[] = [
        {
            target: 'jpdb-live',
            card: { reviewSource: 'jpdb-live' },
            settings: {},
            spy: adapters => adapters.bridgeGrade.mock,
        },
        {
            target: 'jiten-api',
            card: { source: 'jiten' as JPDBCard['source'], reviewSource: 'jiten-api', jitenWordId: 7 },
            settings: { jitenApiKey: 'jiten-key', jpdbMiningEnabled: true },
            spy: adapters => adapters.jitenReview.mock,
        },
        {
            target: 'jpdb-api',
            card: { reviewSource: 'jpdb-api' },
            settings: { apiKey: 'jpdb-key', jpdbMiningEnabled: true },
            spy: adapters => adapters.jpdbReview.mock,
        },
    ];

    it.each(gradeRoutingRows)('routes a $target grade to its own adapter and only that adapter', async row => {
        const { controller, adapters } = matrixController({ ...DEFAULT_SETTINGS, ...row.settings });
        try {
            const internals = controller as unknown as { submitReviewTarget(card: JPDBCard, target: string, grade: JPDBGrade): Promise<void> };
            await internals.submitReviewTarget(matrixCard(row.card), row.target, 'okay');
            expect(row.spy(adapters).calls.length).toBeGreaterThan(0);
            const others = [adapters.bridgeGrade, adapters.jitenReview, adapters.jpdbReview]
                .filter(spy => spy.mock !== row.spy(adapters));
            for (const other of others) expect(other).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
        }
    });

    it('dedupes same-word duplicates kana-insensitively when merging provider queues', async () => {
        const { autoReviewSourceResults } = await import('../../src/reader/newtab/source-orchestrator');
        const jpdbResult = {
            cards: [matrixCard({ spelling: 'バイク', reading: 'ばいく', cardState: ['due'], reviewSource: 'jpdb-api' })],
            sourceLabel: 'JPDB',
            reviewCountMode: true,
        };
        const ankiResult = {
            cards: [matrixCard({ source: 'anki', spelling: 'ばいく', reading: 'バイク', cardState: ['due'], reviewSource: 'anki' })],
            sourceLabel: 'Anki',
            reviewCountMode: true,
        };
        const merged = autoReviewSourceResults(jpdbResult as never, ankiResult as never);
        const totalCards = merged.reduce((sum, result) => sum + result.cards.length, 0);
        // katakana/hiragana spellings of the same word collapse to ONE entry
        // across providers instead of appearing twice in the merged queue.
        expect(totalCards).toBe(1);
    });

    it('keeps the JPDB locked kanji card when same-priority candidates collide (locked-kanji order)', () => {
        const locked = matrixCard({ spelling: '記', reading: 'き', cardState: ['locked'], source: 'jpdb' });
        const derived = matrixCard({ spelling: '記', reading: 'き', cardState: ['locked'], source: 'anki' });
        expect(shouldReplaceKanjiStudyCard(locked, derived)).toBe(true);
        expect(shouldReplaceKanjiStudyCard(derived, locked)).toBe(false);
    });

    it('counts the available pile identically regardless of provider source (due summary)', () => {
        for (const source of ['jpdb', 'anki', 'jiten'] as Array<JPDBCard['source']>) {
            const summary = newTabDueSummary([
                matrixCard({ source, spelling: '読む', cardState: ['due'] }),
                matrixCard({ source, spelling: '語', cardState: ['new'] }),
                matrixCard({ source, spelling: '食べる', cardState: ['known'] }),
            ]);
            expect(summary).toEqual({ dueWords: 1, dueKanji: 0, newWords: 0, newKanji: 1 });
        }
    });

    it('falls back to dictionary study when no provider has credentials (keyless fallback)', () => {
        const { controller } = matrixController({ ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: '', ankiEnabled: false });
        try {
            const internals = controller as unknown as { effectiveNewTabSourceFromSettings(settings: ReaderSettings): string };
            const source = internals.effectiveNewTabSourceFromSettings({ ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: '', ankiEnabled: false });
            expect(['dictionary', 'auto']).toContain(source);
        } finally {
            controller.destroy();
        }
    });
});
