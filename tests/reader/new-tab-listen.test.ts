import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import { NewTabController } from '../../src/reader/newtab/controller';
import { pitchPatternFromPosition } from '../../src/reader/lookup/pitch-accent';
import { pitchItemKey, type PitchSrsItem } from '../../src/reader/newtab/pitch-srs';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

// 箸 = atamadaka (downstep 1) for the 2-mora reading はし.
function pitchCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 10,
        sid: 20,
        rid: 0,
        spelling: '箸',
        reading: 'はし',
        frequencyRank: 800,
        partOfSpeech: ['n'],
        meanings: [{ glosses: ['chopsticks'], partOfSpeech: ['n'] }],
        cardState: ['due'],
        pitchAccent: [pitchPatternFromPosition('はし', 1)],
        wordWithReading: null,
        source: 'jpdb',
        reviewSource: 'jpdb-api',
        ...overrides,
    } as JPDBCard;
}

function listenRoot(): HTMLElement {
    const root = document.createElement('main');
    root.className = 'jpdb-reader-newtab';
    root.dataset.jpdbReaderRoot = 'true';
    root.innerHTML = `
        <section class="jpdb-reader-newtab-study" data-newtab-study>
            <div data-newtab-count></div>
            <h1 data-newtab-prompt></h1>
            <div data-newtab-answer></div>
            <div data-newtab-meaning></div>
            <button data-newtab-status></button>
        </section>
        <nav data-newtab-controls></nav>
    `;
    document.body.replaceChildren(root);
    return root;
}

interface ListenInternals {
    allWords: JPDBCard[];
    visibleWords: JPDBCard[];
    index: number;
    sourceLabel: string;
    reviewCountMode: boolean;
    state: Record<string, unknown>;
    pitchSrs: { item(key: string): PitchSrsItem | undefined; size(): number };
    renderWord(root: HTMLElement, card: JPDBCard): void;
    pickListenPosition(position: number): void;
    advanceListen(root: HTMLElement): void;
    gradeCurrentCard(grade: string): Promise<boolean>;
}

function listenController(cards: JPDBCard[], subMode: 'perceive' | 'recall' | 'shadow', settings: Partial<ReaderSettings> = {}, deps: Record<string, unknown> = {}) {
    const playWordAudio = vi.fn(async () => undefined);
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
        jpdbReviewBridge: { onUpdate: () => () => {}, latestStatus: () => ({ connected: false }), reveal: vi.fn(), grade: vi.fn(), requestCurrent: vi.fn() } as never,
        parser: {} as never,
        dictionaries: {} as never,
        onSettingsChange: vi.fn(),
        applyTheme: vi.fn(),
        showSettings: vi.fn(),
        dismiss: vi.fn(),
        dismissLookup: vi.fn(),
        toast: vi.fn(),
        playWordAudio,
        ...deps,
    } as never);
    const internals = controller as unknown as ListenInternals;
    internals.allWords = cards.slice();
    internals.visibleWords = cards.slice();
    internals.index = 0;
    internals.sourceLabel = 'JPDB';
    internals.reviewCountMode = true;
    internals.state = {
        mode: 'listen',
        listenSubMode: subMode,
        sort: 'random',
        filter: 'study',
        source: 'jpdb',
        revealAnswer: false,
        jpdbDeck: '',
        ankiDeck: '',
        keyHintsDismissed: false,
    };
    return { controller, internals, playWordAudio };
}

afterEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
});

describe('new-tab Listen mode', () => {
    it('renders an N+1 downstep picker and auto-plays the model in Perceive', () => {
        const { controller, internals, playWordAudio } = listenController([pitchCard()], 'perceive');
        const root = listenRoot();
        try {
            internals.renderWord(root, internals.visibleWords[0]);
            // はし is 2 morae -> positions 0,1,2 = three buttons.
            expect(root.querySelectorAll('[data-listen-pos]')).toHaveLength(3);
            expect(root.querySelector('.jpdb-reader-newtab-listen-stats')).toBeNull();
            expect(root.querySelector('.jpdb-reader-newtab-listen-prompt')).toBeNull();
            expect(root.querySelector('[data-newtab-action="listen-play"] svg')).not.toBeNull();
            expect(playWordAudio).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });

    it('grades the pitch SRS item okay on a correct Perceive pick and lapses on a wrong one', () => {
        const { controller, internals } = listenController([pitchCard()], 'perceive');
        const root = listenRoot();
        try {
            internals.renderWord(root, internals.visibleWords[0]);
            internals.pickListenPosition(1); // correct (atamadaka)
            const item = internals.pitchSrs.item(pitchItemKey('はし', 1));
            expect(item?.reps).toBe(1);
            expect(item?.lapses).toBe(0);
            expect(root.querySelector('.jpdb-reader-newtab-listen-verdict-correct')).not.toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('records a lapse and surfaces the contrast block on a wrong Perceive pick', () => {
        // Two same-reading cards with different downstep form a strict minimal pair.
        const hashiAtamadaka = pitchCard();
        const hashiOdaka = pitchCard({ vid: 11, spelling: '橋', pitchAccent: [pitchPatternFromPosition('はし', 2)] });
        const { controller, internals } = listenController([hashiAtamadaka, hashiOdaka], 'perceive');
        const root = listenRoot();
        try {
            internals.renderWord(root, internals.visibleWords[0]);
            internals.pickListenPosition(2); // wrong (真 answer is 1)
            const item = internals.pitchSrs.item(pitchItemKey('はし', 1));
            expect(item?.lapses).toBe(1);
            expect(item?.reps).toBe(0);
            expect(root.querySelector('.jpdb-reader-newtab-listen-verdict-wrong')).not.toBeNull();
            expect(root.querySelector('.jpdb-reader-newtab-listen-contrast')).not.toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('fronts the word + meaning in Recall and defers grading to a self-grade after reveal', () => {
        const { controller, internals } = listenController([pitchCard()], 'recall');
        const root = listenRoot();
        try {
            internals.renderWord(root, internals.visibleWords[0]);
            expect(root.querySelector('.jpdb-reader-newtab-listen-cue')?.textContent).toContain('chopsticks');
            // No picker grading yet — Recall reveals then offers self-grade buttons.
            internals.pickListenPosition(1);
            expect(internals.pitchSrs.item(pitchItemKey('はし', 1))?.reps).toBe(0); // not graded on pick
            expect(root.querySelector('[data-newtab-action="listen-next"]')).not.toBeNull();
            expect(root.querySelector('[data-newtab-action="listen-grade"]')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('resets the in-card interaction state when the sub-mode changes mid-card', () => {
        const { controller, internals } = listenController([pitchCard()], 'perceive');
        const root = listenRoot();
        try {
            internals.renderWord(root, internals.visibleWords[0]);
            internals.pickListenPosition(2); // wrong -> reveals a verdict in Perceive
            expect(root.querySelector('.jpdb-reader-newtab-listen-verdict')).not.toBeNull();
            // Switch sub-mode (as the switcher does) and re-render the same card.
            internals.state.listenSubMode = 'recall';
            internals.renderWord(root, internals.visibleWords[0]);
            // The stale Perceive reveal/verdict must not leak into Recall.
            expect(root.querySelector('.jpdb-reader-newtab-listen-verdict')).toBeNull();
            expect(root.querySelector('.jpdb-reader-newtab-listen-cue')).not.toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('advances through the queue without a null-deref crash and keeps rendering a card', () => {
        const cards = [pitchCard(), pitchCard({ vid: 11, spelling: '橋', pitchAccent: [pitchPatternFromPosition('はし', 2)] })];
        const { controller, internals } = listenController(cards, 'perceive');
        const root = listenRoot();
        try {
            internals.renderWord(root, internals.visibleWords[0]);
            // Advance more times than there are cards: must wrap, never deref undefined.
            expect(() => {
                for (let i = 0; i < 4; i += 1) internals.advanceListen(root);
            }).not.toThrow();
            expect(root.querySelector('.jpdb-reader-newtab-listen-card')).not.toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('auto-seeds the pitch deck from a passing vocab review', async () => {
        const { controller, internals } = listenController([pitchCard()], 'perceive');
        internals.state.mode = 'word'; // grade as a normal vocab review
        const root = listenRoot();
        try {
            internals.renderWord(root, internals.visibleWords[0]);
            expect(internals.pitchSrs.size()).toBe(0);
            await internals.gradeCurrentCard('okay');
            expect(internals.pitchSrs.item(pitchItemKey('はし', 1))).toBeTruthy();
        } finally {
            controller.destroy();
        }
    });
});
