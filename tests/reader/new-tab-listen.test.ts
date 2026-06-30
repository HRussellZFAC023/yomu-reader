import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import { NewTabController } from '../../src/reader/newtab/controller';
import { pitchPatternFromPosition } from '../../src/reader/lookup/pitch-accent';
import { pitchItemKey, type PitchSrsItem } from '../../src/reader/newtab/pitch-srs';
import { renderListenCard, type ListenCardView } from '../../src/reader/newtab/listen-render';
import { newTabText } from '../../src/reader/newtab/i18n';
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
    bindRootEvents(root: HTMLElement): void;
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
            expect(Array.from(root.querySelectorAll('.jpdb-reader-newtab-listen-pos-name'), element => element.textContent)).toEqual(['平板', '頭高', '尾高']);
            expect(root.querySelector('[data-newtab-action="listen-play"] svg')).not.toBeNull();
            expect(playWordAudio).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });

    it('uses configured Study reveal and audio shortcuts in Listen mode', () => {
        const { controller, internals, playWordAudio } = listenController([pitchCard()], 'perceive', {
            shortcuts: {
                ...DEFAULT_SETTINGS.shortcuts,
                studyReveal: 'K',
                studyRevealAlternate: '',
                playAudio: 'Alt+P',
            },
        });
        const root = listenRoot();
        try {
            internals.bindRootEvents(root);
            internals.renderWord(root, internals.visibleWords[0]);
            playWordAudio.mockClear();

            const staleSpace = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
            root.dispatchEvent(staleSpace);
            expect(staleSpace.defaultPrevented).toBe(false);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('listen-pitch');

            const replay = new KeyboardEvent('keydown', { key: 'p', altKey: true, bubbles: true, cancelable: true });
            root.dispatchEvent(replay);
            expect(replay.defaultPrevented).toBe(true);
            expect(playWordAudio).toHaveBeenCalledTimes(1);

            const legacyReplay = new KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true });
            root.dispatchEvent(legacyReplay);
            expect(legacyReplay.defaultPrevented).toBe(false);
            expect(playWordAudio).toHaveBeenCalledTimes(1);

            const reveal = new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true });
            root.dispatchEvent(reveal);
            expect(reveal.defaultPrevented).toBe(true);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('speaking');
        } finally {
            controller.destroy();
        }
    });

    it('shows a correct Perceive outcome without grading the pitch SRS before final review', () => {
        const { controller, internals } = listenController([pitchCard()], 'perceive');
        const root = listenRoot();
        try {
            internals.renderWord(root, internals.visibleWords[0]);
            internals.pickListenPosition(1); // correct (atamadaka)
            const item = internals.pitchSrs.item(pitchItemKey('はし', 1));
            expect(item?.reps).toBe(0);
            expect(item?.lapses).toBe(0);
            expect(root.querySelector('.jpdb-reader-newtab-listen-verdict-correct')).not.toBeNull();
            expect(root.querySelector('[data-newtab-action="listen-next"]')?.textContent).toBe('Continue');
        } finally {
            controller.destroy();
        }
    });

    it('surfaces the contrast block on a wrong Perceive pick without a separate pitch grade', () => {
        // Two same-reading cards with different downstep form a strict minimal pair.
        const hashiAtamadaka = pitchCard();
        const hashiOdaka = pitchCard({ vid: 11, spelling: '橋', pitchAccent: [pitchPatternFromPosition('はし', 2)] });
        const { controller, internals } = listenController([hashiAtamadaka, hashiOdaka], 'perceive');
        const root = listenRoot();
        try {
            internals.renderWord(root, internals.visibleWords[0]);
            expect(root.querySelector('[data-newtab-action="listen-play"]')?.classList.contains('jpdb-reader-newtab-listen-icon-btn')).toBe(true);
            internals.pickListenPosition(2); // wrong (真 answer is 1)
            const item = internals.pitchSrs.item(pitchItemKey('はし', 1));
            expect(item?.lapses).toBe(0);
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

    it('advances listen controls through merged study steps before changing cards', () => {
        const cards = [pitchCard(), pitchCard({ vid: 11, spelling: '橋', pitchAccent: [pitchPatternFromPosition('はし', 2)] })];
        const { controller, internals } = listenController(cards, 'perceive');
        const root = listenRoot();
        try {
            internals.renderWord(root, internals.visibleWords[0]);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('listen-pitch');
            internals.advanceListen(root);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('speaking');
            expect(internals.visibleWords[internals.index]?.spelling).toBe('箸');
            internals.advanceListen(root);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('final-reveal');
            expect(internals.visibleWords[internals.index]?.spelling).toBe('箸');
            expect(root.classList.contains('jpdb-reader-newtab-final-reveal-mode')).toBe(true);
            expect(root.querySelector('.jpdb-reader-newtab-listen-card')).toBeNull();
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

    it('shows local speaking pitch feedback in Shadow without turning it into a grade', () => {
        const item: PitchSrsItem = {
            key: 'はし#1',
            reading: 'はし',
            pitchNumber: 1,
            pattern: 'HL',
            pitchClass: 'atamadaka',
            displaySpelling: '箸',
            due: 0,
            intervalDays: 0,
            ease: 2.5,
            reps: 0,
            lapses: 0,
            introducedAt: 0,
        };
        const view: ListenCardView = {
            item,
            meaning: 'chopsticks',
            subMode: 'shadow',
            revealed: true,
            selectedPosition: null,
            outcome: null,
            hasAudio: true,
            recording: false,
            hasRecording: true,
            speakingScore: {
                score: 88,
                verdict: 'good',
                expectedPattern: 'HL',
                observedPattern: 'HL',
                voicedRatio: 0.84,
                frameCount: 20,
            },
            speakingScoring: false,
            micEnabled: true,
            micUnavailable: false,
            contrast: null,
        };
        const root = document.createElement('div');
        root.innerHTML = renderListenCard(view, key => newTabText('en', key));
        expect(root.querySelector('.jpdb-reader-newtab-listen-score[data-speaking-score-state="good"]')?.textContent).toBe('Good 88%');
        expect(root.querySelector('.jpdb-reader-newtab-listen-score-tip')?.textContent).toBe('Contour matched');
        expect(root.querySelector('.jpdb-reader-newtab-listen-note')?.textContent).toContain('Scored on this device');
        expect(root.querySelector('[data-newtab-action="listen-next"]')?.textContent).toBe('Continue');
    });

    it('turns a speaking mismatch into a short coaching cue and visual contour comparison', () => {
        const item: PitchSrsItem = {
            key: 'よむ#0',
            reading: 'よむ',
            pitchNumber: 0,
            pattern: 'LH',
            pitchClass: 'heiban',
            displaySpelling: '読む',
            due: 0,
            intervalDays: 0,
            ease: 2.5,
            reps: 0,
            lapses: 0,
            introducedAt: 0,
        };
        const view: ListenCardView = {
            item,
            meaning: 'to read',
            subMode: 'shadow',
            revealed: true,
            selectedPosition: null,
            outcome: null,
            hasAudio: true,
            recording: false,
            hasRecording: true,
            speakingScore: {
                score: 28,
                verdict: 'retry',
                expectedPattern: 'LH',
                observedPattern: 'HL',
                voicedRatio: 0.72,
                frameCount: 18,
            },
            speakingScoring: false,
            micEnabled: true,
            micUnavailable: false,
            contrast: null,
        };
        const root = document.createElement('div');
        root.innerHTML = renderListenCard(view, key => newTabText('en', key));
        expect(root.querySelector('.jpdb-reader-newtab-listen-score[data-speaking-score-state="retry"]')?.textContent).toBe('Practice 28%');
        expect(root.querySelector('.jpdb-reader-newtab-listen-score-tip')?.textContent).toBe('Start lower, then rise');
        expect(root.querySelector('.jpdb-reader-newtab-listen-score-contours')?.textContent).toContain('Model');
        expect(root.querySelector('.jpdb-reader-newtab-listen-score-contours')?.textContent).toContain('You');
        expect(root.querySelectorAll('.jpdb-reader-newtab-listen-score-graph svg')).toHaveLength(2);
    });
});
