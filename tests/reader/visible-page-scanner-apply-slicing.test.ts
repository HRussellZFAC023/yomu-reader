import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockElementBoundingClientRect } from './helpers/dom-fixtures';
import { mirrorToken } from './helpers/japanese-token-fixtures';
import { testEnSettings } from './helpers/settings-fixture';
import type { CardState, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { VisiblePageScanner } from '../../src/reader/app/visible-page-scanner';
import { refreshContrastForReaderWords } from '../../src/reader/dom/word-contrast';

// A page scan paints its parsed targets in slices that end on a frame budget,
// yielding between them, so a dense batch on a slow device is several short
// tasks instead of one long one. These tests drive the budget clock directly
// (Date.now, as the collection-budget tests do): a "paint-paced" clock spends
// every slice's budget on its first target, a frozen one never spends it.
// Per-slice follow-up work must scale with the slice, not with its root, and a
// yield that costs more than the budget must not be paid once per target.

const SETTINGS: ReaderSettings = { ...testEnSettings(), furiganaMode: 'all' };
// Mixed states so contrast takes both its derived-colour and neutral paths.
const WORDS: Array<[string, string, CardState]> = [['日本語', 'にほんご', 'learning'], ['勉強', 'べんきょう', 'new'], ['本', 'ほん', 'not-in-deck']];

type Deps = ConstructorParameters<typeof VisiblePageScanner>[0];

const scanners = new Set<VisiblePageScanner>();

beforeEach(() => {
    // A loopback root matches the hosted-docs profile; scan an ordinary page.
    window.history.pushState({}, '', '/reading/');
    mockElementBoundingClientRect({ width: 100, height: 20 });
});

afterEach(() => {
    for (const scanner of scanners) scanner.destroy();
    scanners.clear();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    window.history.pushState({}, '', '/');
});

describe('VisiblePageScanner apply slicing', () => {
    it('ends an apply slice once its frame budget is spent and yields before painting the rest', async () => {
        document.body.innerHTML = paragraphs(6);
        let paintedWhenFirstSliceYielded: number | undefined;
        // Queued during slice one, so it runs before slice two only if the
        // scanner really returns to the event loop in between.
        const slices = paintedPerSlice(() => { paintedWhenFirstSliceYielded = paintedWordCount(); });
        const scanner = makeScanner({ pauseMutationObserver: slices.pause });
        paintPacedClock();

        await scanner.scanVisiblePage({ silent: true });

        expect(slices.painted).toEqual([1, 2, 3, 4, 5, 6]);
        expect(paintedWhenFirstSliceYielded).toBe(1);
        expect(readings()).toEqual(Array(6).fill('にほんご'));
    });

    it('paints a whole count-capped chunk in one slice while the budget lasts', async () => {
        document.body.innerHTML = paragraphs(6);
        const slices = countedSlices();
        const scanner = makeScanner({ pauseMutationObserver: slices.pause });
        freezeBudgetClock();

        await scanner.scanVisiblePage({ silent: true });

        expect(slices.count()).toBe(1);
        expect(paintedWordCount()).toBe(6);
    });

    it('paints the same words, readings, classes, order and contrast whether or not slices end early', async () => {
        const fixture = `
            <article style="background: rgb(250, 250, 250); color: rgb(20, 20, 20);">
                <p>日本語を勉強する。<b>本</b>を読む日本語の本。</p>
                <div style="display:flex"><span>勉強</span>の本と日本語</div>
                <a href="/card" style="display:block"><strong>日本語の勉強</strong><span>本を読む</span></a>
                ${paragraphs(8)}
            </article>`;
        const notePaintedWords = (words: HTMLElement[]): void => refreshContrastForReaderWords(words);
        document.body.innerHTML = fixture;
        const unsliced = makeScanner({ notePaintedWords });
        const frozen = freezeBudgetClock();
        await unsliced.scanVisiblePage({ silent: true });
        const unslicedPage = document.body.innerHTML;
        frozen.mockRestore();
        unsliced.destroy();

        document.body.innerHTML = fixture;
        const slices = countedSlices();
        const sliced = makeScanner({ pauseMutationObserver: slices.pause, notePaintedWords });
        paintPacedClock();
        await sliced.scanVisiblePage({ silent: true });

        expect(slices.count(), 'the paint-paced clock must actually split the batch').toBeGreaterThan(1);
        expect(paintedWordCount()).toBe(19);
        expect(document.querySelector<HTMLElement>('.jpdb-reader-word')?.style.getPropertyValue('--jpdb-reader-word-accessible-color'))
            .not.toBe('');
        expect(document.body.innerHTML).toBe(unslicedPage);
    });

    it('hands each slice only the words it painted when every line shares one parent', async () => {
        // An Aozora Bunko main_text block: one parent, <br>-separated lines.
        // Handing over the whole root per slice re-derived 48 lines' words
        // 48 times (2,352 words for 96 painted).
        const lines = Array.from({ length: 48 }, (_, index) => `日本語の本${index}`);
        document.body.innerHTML = `<div class="main_text">${lines.join('<br>')}</div>`;
        const handedOver: HTMLElement[][] = [];
        const slices = countedSlices();
        const scanner = makeScanner({
            pauseMutationObserver: slices.pause,
            notePaintedWords: words => handedOver.push(words),
        });
        paintPacedClock();

        await scanner.scanVisiblePage({ silent: true });

        const painted = [...document.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
        expect(slices.count()).toBe(48);
        expect(painted).toHaveLength(96);
        expect(handedOver).toHaveLength(48);
        expect(handedOver.every(words => words.length === 2)).toBe(true);
        const handed = new Set(handedOver.flat());
        expect(handed.size).toBe(96);
        expect(painted.every(word => handed.has(word))).toBe(true);
    });

    it('lengthens the next slice when a yield costs more than the frame budget', async () => {
        document.body.innerHTML = paragraphs(6);
        const clock = paintPacedClock();
        // A second-long turn lands in slice one's yield: a huge block laid out
        // again for the frame, or a background tab's timer.
        const slices = paintedPerSlice(() => clock.advance(1_000));
        const scanner = makeScanner({ pauseMutationObserver: slices.pause });

        await scanner.scanVisiblePage({ silent: true });

        // A one-target slice per costly yield would pay that second five more
        // times; the rest of the batch paints in the next slice instead.
        expect(slices.painted).toEqual([1, 6]);
    });

    it('stops painting at the next slice once the scan is cancelled', async () => {
        document.body.innerHTML = paragraphs(6);
        let slices = 0;
        const scanner: VisiblePageScanner = makeScanner({
            pauseMutationObserver: <T>(callback: () => T): T => {
                const result = callback();
                slices += 1;
                if (slices === 1) scanner.cancelVisiblePageScan();
                return result;
            },
        });
        paintPacedClock();

        await scanner.scanVisiblePage({ silent: true });

        expect(slices).toBe(1);
        expect(paintedWordCount()).toBe(1);
    });

    it('keeps an asbplayer cue batch in one slice so ruby and colours land in the same paint', async () => {
        document.body.innerHTML = `<div class="asbplayer-subtitles-container-bottom">${
            ['日本語を勉強する', '本を読む', '日本語の本'].map(cue => `<div><span>${cue}</span></div>`).join('')
        }</div>`;
        const slices = countedSlices();
        const scanner = makeScanner({ pauseMutationObserver: slices.pause });
        paintPacedClock();

        await scanner.scanAsbPlayerSubtitles();

        expect(slices.count()).toBe(1);
        expect(paintedWordCount()).toBe(5);
    });
});

function makeScanner(overrides: Partial<Deps> = {}): VisiblePageScanner {
    const scanner = new VisiblePageScanner({
        getSettings: () => SETTINGS,
        parseJapanese: async texts => texts.map(tokensFor),
        pauseMutationObserver: callback => callback(),
        preloadParsedTokens: vi.fn(),
        enrichPitchWords: vi.fn(),
        enrichAnkiWords: vi.fn(),
        toast: vi.fn(),
        ...overrides,
    });
    scanners.add(scanner);
    return scanner;
}

// Records the page's word count as each slice ends, and runs a callback on the
// first turn after slice one, while the scan is yielding.
function paintedPerSlice(duringFirstYield: () => void): { pause: Deps['pauseMutationObserver']; painted: number[] } {
    const painted: number[] = [];
    return {
        pause: <T>(callback: () => T): T => {
            const result = callback();
            painted.push(paintedWordCount());
            if (painted.length === 1) setTimeout(duringFirstYield, 0);
            return result;
        },
        painted,
    };
}

// Apply slices run inside pauseMutationObserver, so its calls count them.
function countedSlices(): { pause: Deps['pauseMutationObserver']; count: () => number } {
    let count = 0;
    return {
        pause: <T>(callback: () => T): T => {
            count += 1;
            return callback();
        },
        count: () => count,
    };
}

// Time passes only while painting: every word on the page adds 20 ms. A slice
// spends its 12 ms budget on its first target even on a fast host, and a yield
// costs nothing unless a test advances the clock during it.
function paintPacedClock(): { advance: (ms: number) => void } {
    const start = Date.now();
    let advanced = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => start + advanced + 20 * paintedWordCount());
    return { advance: ms => { advanced += ms; } };
}

function freezeBudgetClock(): { mockRestore: () => void } {
    return vi.spyOn(Date, 'now').mockReturnValue(Date.now());
}

function paragraphs(count: number): string {
    return Array.from({ length: count }, (_, index) => `<p>日本語の文${index}</p>`).join('');
}

function paintedWordCount(): number {
    return document.querySelectorAll('.jpdb-reader-word').length;
}

function readings(): string[] {
    return [...document.querySelectorAll('.jpdb-reader-word rt')].map(rt => rt.textContent ?? '');
}

function tokensFor(text: string): JPDBToken[] {
    const tokens: JPDBToken[] = [];
    for (let start = 0; start < text.length;) {
        const word = WORDS.find(([spelling]) => text.startsWith(spelling, start));
        if (!word) {
            start += 1;
            continue;
        }
        tokens.push(rubyTokenAt(text, word, start));
        start += word[0].length;
    }
    return tokens;
}

function rubyTokenAt(sentence: string, [spelling, reading, state]: [string, string, CardState], start: number): JPDBToken {
    const end = start + spelling.length;
    const token = mirrorToken(spelling, reading);
    return {
        ...token,
        card: { ...token.card, cardState: [state] },
        start,
        end,
        rubies: [{ text: reading, start, end, length: end - start }],
        sentence,
    };
}
