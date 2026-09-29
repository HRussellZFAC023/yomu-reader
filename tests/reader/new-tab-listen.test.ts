import { DEFAULT_NEW_TAB_UI_STATE } from '../../src/reader/newtab/state';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as storage from '../../src/reader/app/storage';

import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import { NewTabController } from '../../src/reader/newtab/controller';
import { pitchPatternFromPosition } from '../../src/reader/lookup/pitch-accent';
import { type PitchSrsItem } from '../../src/reader/newtab/pitch-srs';
import { renderListenCard, type ListenCardView } from '../../src/reader/newtab/listen-render';
import { newTabText } from '../../src/reader/newtab/i18n';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { testEnSettings } from './helpers/settings-fixture';

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
    listenInteractionMode: 'perceive' | 'recall' | 'shadow';
    setStudyStepOverrideForCard(card: JPDBCard, id: string | null): void;
    renderWord(root: HTMLElement, card: JPDBCard): void;
    bindRootEvents(root: HTMLElement): void;
    pickListenPosition(position: number): void;
    gradeCurrentCard(grade: string): Promise<boolean>;
}

function listenController(cards: JPDBCard[], subMode: 'perceive' | 'recall' | 'shadow', settings: Partial<ReaderSettings> = {}, deps: Record<string, unknown> = {}) {
    const playWordAudio = vi.fn(async () => undefined);
    const reviewCard = vi.fn(async () => undefined);
    const mergedSettings: ReaderSettings = {
        ...testEnSettings(),
        enableReviews: true,
        jpdbMiningEnabled: true,
        apiKey: 'jpdb-key',

        ...settings,
    };
    const controller = new NewTabController({
        getSettings: () => mergedSettings,
        anki: {} as never,
        jpdb: { reviewCard } as never,
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
    } as never, { surface: 'academy' });
    const internals = controller as unknown as ListenInternals;
    internals.allWords = cards.slice();
    internals.visibleWords = cards.slice();
    internals.index = 0;
    internals.sourceLabel = 'JPDB';
    internals.reviewCountMode = true;
    internals.state = {
        ...DEFAULT_NEW_TAB_UI_STATE,
        route: 'study',
        sort: 'random',
        filter: 'study',
        source: 'jpdb',
        revealAnswer: false,
        jpdbDeck: '',
        ankiDeck: '',
        keyHintsDismissed: false,
    };
    internals.listenInteractionMode = subMode;
    internals.setStudyStepOverrideForCard(cards[0], subMode === 'shadow' ? 'speaking' : 'listen-pitch');
    return { controller, internals, playWordAudio, reviewCard };
}

function expectNoPitchWrites(write: { mock: { calls: unknown[][] } }): void {
    expect(write.mock.calls.filter(([key]) => String(key).includes('yomu-pitch-'))).toEqual([]);
}

let pitchWriteBoundaries: Array<{ mock: { calls: unknown[][] } }>;
beforeEach(() => {
    pitchWriteBoundaries = [
        vi.spyOn(Storage.prototype, 'setItem'),
        vi.spyOn(storage, 'gmStorageSet'),
        vi.spyOn(storage, 'gmStorageSetSync'),
    ];
});

afterEach(() => {
    pitchWriteBoundaries.forEach(expectNoPitchWrites);
    document.body.replaceChildren();
    vi.restoreAllMocks();
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
            // The pitch-selection step now fronts a clear audio-first prompt.
            expect(root.querySelector('.jpdb-reader-newtab-listen-prompt')?.textContent).toBe('Which pitch did you hear?');
            expect(Array.from(root.querySelectorAll('.jpdb-reader-newtab-listen-pos-name'), element => element.textContent)).toEqual(['平板', '頭高', '尾高']);
            expect(root.querySelector('[data-newtab-action="listen-play"] svg')).not.toBeNull();
            expect(playWordAudio).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });

    it('centers pitch picker graph contents inside each answer tile', () => {
        const item: PitchSrsItem = {
            key: 'じかん#0',
            reading: 'じかん',
            pitchNumber: 0,
            pattern: pitchPatternFromPosition('じかん', 0),
            pitchClass: 'heiban',
            displaySpelling: '時間',
            due: 0,
            intervalDays: 0,
            ease: 2.5,
            reps: 0,
            lapses: 0,
            introducedAt: 0,
        };
        const view: ListenCardView = {
            item,
            meaning: 'time',
            subMode: 'perceive',
            revealed: false,
            selectedPosition: null,
            outcome: null,
            validPositions: [],
            variants: [],
            hasAudio: true,
            recording: false,
            hasRecording: false,
            speakingScore: null,
            speakingScoring: false,
            micEnabled: false,
            micUnavailable: false,
            contrast: null,
        };
        const root = document.createElement('div');
        root.innerHTML = renderListenCard(view, key => newTabText('en', key));

        const svg = root.querySelector<SVGSVGElement>('[data-listen-pos="0"] svg');
        if (!svg) throw new Error('Expected the heiban pitch picker tile to render an SVG');
        const width = Number(svg.getAttribute('width'));
        const labelXs = Array.from(svg.querySelectorAll('text'), label => Number(label.getAttribute('x')));

        expect(labelXs).toEqual([21, 45, 69]);
        expect((Math.min(...labelXs) + Math.max(...labelXs)) / 2).toBe(width / 2);
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
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('listen-pitch');
            expect(internals.state.revealAnswer).toBe(true);
            expect(root.querySelector('[data-newtab-action="grade"]')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('shows instant correct feedback on the picked position without SRS-grading it', () => {
        const { controller, internals, reviewCard } = listenController([pitchCard()], 'perceive');
        const root = listenRoot();
        const write = vi.spyOn(Storage.prototype, 'setItem');
        try {
            internals.renderWord(root, internals.visibleWords[0]);
            internals.pickListenPosition(1); // correct (atamadaka)
            expect(reviewCard).not.toHaveBeenCalled();
            expectNoPitchWrites(write);
            expect(root.querySelector('.jpdb-reader-newtab-listen-verdict')?.textContent).toBe('Correct!');
            expect(root.querySelector('[data-listen-pos="1"]')?.classList.contains('jpdb-reader-newtab-listen-pos-correct')).toBe(true);
            expect(root.querySelector('.jpdb-reader-newtab-listen-pos-wrong')).toBeNull();
            expect(root.querySelector('[data-newtab-action="listen-next"]')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('marks a wrong pick immediately and reveals the valid position', () => {
        // Two same-reading cards with different downstep form a strict minimal pair.
        const hashiAtamadaka = pitchCard();
        const hashiOdaka = pitchCard({ vid: 11, spelling: '橋', pitchAccent: [pitchPatternFromPosition('はし', 2)] });
        const { controller, internals, reviewCard } = listenController([hashiAtamadaka, hashiOdaka], 'perceive');
        const root = listenRoot();
        const write = vi.spyOn(Storage.prototype, 'setItem');
        try {
            internals.renderWord(root, internals.visibleWords[0]);
            expect(root.querySelector('[data-newtab-action="listen-play"]')?.classList.contains('jpdb-reader-newtab-listen-icon-btn')).toBe(true);
            internals.pickListenPosition(2); // wrong (真 answer is 1)
            expect(reviewCard).not.toHaveBeenCalled();
            expectNoPitchWrites(write);
            expect(root.querySelector('.jpdb-reader-newtab-listen-verdict')?.textContent).toBe('Not quite');
            expect(root.querySelector('[data-listen-pos="2"]')?.classList.contains('jpdb-reader-newtab-listen-pos-wrong')).toBe(true);
            expect(root.querySelector('[data-listen-pos="1"]')?.classList.contains('jpdb-reader-newtab-listen-pos-correct')).toBe(true);
            expect(root.querySelector('.jpdb-reader-newtab-listen-contrast')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('accepts any listed accent variant as correct (multi-accent words)', () => {
        // Either dictionary-listed variant must receive correct feedback.
        const twoAccents = pitchCard({
            pitchAccent: [pitchPatternFromPosition('はし', 1), pitchPatternFromPosition('はし', 2)],
        });
        const { controller, internals } = listenController([twoAccents], 'perceive');
        const root = listenRoot();
        try {
            internals.renderWord(root, internals.visibleWords[0]);
            internals.pickListenPosition(2); // secondary variant, not the item key's 1
            expect(root.querySelector('.jpdb-reader-newtab-listen-verdict')?.textContent).toBe('Correct!');
            expect(root.querySelector('[data-listen-pos="1"]')?.classList.contains('jpdb-reader-newtab-listen-pos-correct')).toBe(true);
            expect(root.querySelector('[data-listen-pos="2"]')?.classList.contains('jpdb-reader-newtab-listen-pos-correct')).toBe(true);
            expect(root.querySelector('.jpdb-reader-newtab-listen-pos-wrong')).toBeNull();
            // Both accepted variants render with relative source-order shares.
            const badges = Array.from(root.querySelectorAll('.jpdb-reader-pitch-variant-badge'), badge => badge.textContent);
            expect(badges).toEqual(['67%', '33%']);
        } finally {
            controller.destroy();
        }
    });

    it('records only the first attempt; later picks are exploration', () => {
        const { controller, internals } = listenController([pitchCard()], 'perceive');
        const root = listenRoot();
        const states = (internals as unknown as { studyStepStates: Map<string, { pitch?: { position: number; outcome: string } }> }).studyStepStates;
        try {
            internals.renderWord(root, internals.visibleWords[0]);
            internals.pickListenPosition(2); // wrong first attempt — this is what counts
            const first = [...states.values()][0]?.pitch;
            expect(first).toEqual({ position: 2, outcome: 'wrong' });
            internals.pickListenPosition(1); // exploring the correct tile afterwards
            expect([...states.values()][0]?.pitch).toEqual({ position: 2, outcome: 'wrong' });
            expect(states.size).toBe(1);
            // Visual selection follows the exploration pick; verdict stays wrong.
            expect(root.querySelector('[data-listen-pos="1"]')?.getAttribute('aria-pressed')).toBe('true');
            expect(root.querySelector('.jpdb-reader-newtab-listen-verdict')?.textContent).toBe('Not quite');
        } finally {
            controller.destroy();
        }
    });

    it('fronts the word + meaning in Recall without scheduling or native grading', () => {
        const { controller, internals, reviewCard } = listenController([pitchCard()], 'recall');
        const root = listenRoot();
        const write = vi.spyOn(Storage.prototype, 'setItem');
        try {
            internals.renderWord(root, internals.visibleWords[0]);
            expect(root.querySelector('.jpdb-reader-newtab-listen-cue')?.textContent).toContain('chopsticks');
            // A pitch choice provides feedback without a native review submission.
            internals.pickListenPosition(1);
            expect(reviewCard).not.toHaveBeenCalled();
            expectNoPitchWrites(write);
            expect(root.querySelector('[data-newtab-action="listen-next"]')).toBeNull();
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
            internals.listenInteractionMode = 'recall';
            internals.renderWord(root, internals.visibleWords[0]);
            // The stale Perceive reveal/verdict must not leak into Recall.
            expect(root.querySelector('.jpdb-reader-newtab-listen-verdict')).toBeNull();
            expect(root.querySelector('.jpdb-reader-newtab-listen-cue')).not.toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('navigates from Listen to the next vocabulary card without forcing another exercise', () => {
        const cards = [pitchCard(), pitchCard({ vid: 11, spelling: '橋', pitchAccent: [pitchPatternFromPosition('はし', 2)] })];
        const { controller, internals, reviewCard } = listenController(cards, 'perceive');
        const root = listenRoot();
        try {
            internals.bindRootEvents(root);
            internals.renderWord(root, cards[0]);
            root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
            expect(internals.visibleWords[internals.index]).toBe(cards[1]);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('word');
            expect(internals.state.revealAnswer).toBe(false);
            expect(reviewCard).not.toHaveBeenCalled();
        } finally { controller.destroy(); }
    });

    it('does not re-render forever when enriched pitch cannot match the reading', async () => {
        // Regression: a fetched contour that cannot match the reading (mora
        // mismatch) used to re-render on every cached-promise resolution —
        // an infinite render loop that froze the tab on the Speak step.
        const { controller, internals } = listenController([pitchCard({ pitchAccent: [] })], 'shadow');
        const hacked = controller as unknown as { loadWordPitch(card: JPDBCard): Promise<string[]> };
        hacked.loadWordPitch = () => Promise.resolve(['HLLLLLLL']); // 8 levels cannot match the 2-mora はし
        const originalRender = internals.renderWord.bind(internals);
        let renders = 0;
        internals.renderWord = (root: HTMLElement, card: JPDBCard) => {
            renders += 1;
            if (renders > 10) throw new Error('render loop detected');
            originalRender(root, card);
        };
        const root = listenRoot();
        try {
            internals.renderWord(root, internals.visibleWords[0]);
            for (let index = 0; index < 5; index += 1) await Promise.resolve();
            expect(renders).toBe(1);
        } finally {
            controller.destroy();
        }
    });

    it('submits an explicitly revealed vocabulary grade without creating a pitch deck', async () => {
        const card = pitchCard();
        const { controller, internals, reviewCard } = listenController([card], 'perceive');
        internals.setStudyStepOverrideForCard(card, null);
        const root = listenRoot();
        const write = vi.spyOn(Storage.prototype, 'setItem');
        try {
            internals.bindRootEvents(root);
            internals.renderWord(root, card);
            root.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
            expect(reviewCard).not.toHaveBeenCalled();
            root.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
            expect(root.querySelector('[data-newtab-action="grade"]')).not.toBeNull();
            root.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true, cancelable: true }));
            await vi.waitFor(() => expect(reviewCard).toHaveBeenCalledWith(card, 'hard'));
            expect(reviewCard).toHaveBeenCalledTimes(1);
        } finally { controller.destroy(); }
        expectNoPitchWrites(write);
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
            validPositions: [],
            variants: [],
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
        expect(root.querySelector('.jpdb-reader-newtab-listen-note')).toBeNull();
        expect(root.querySelector('[data-newtab-action="listen-next"]')).toBeNull();
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
            validPositions: [],
            variants: [],
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
