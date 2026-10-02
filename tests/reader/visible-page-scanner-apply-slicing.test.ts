import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockElementBoundingClientRect } from './helpers/dom-fixtures';
import { mirrorToken } from './helpers/japanese-token-fixtures';
import { testEnSettings } from './helpers/settings-fixture';
import type { JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { VisiblePageScanner } from '../../src/reader/app/visible-page-scanner';

// A page scan paints its parsed targets in slices that end on a frame budget,
// yielding between them, so a dense batch on a slow device is several short
// tasks instead of one long one. These tests drive the budget clock directly
// (Date.now, as the collection-budget tests do): a "racing" clock overspends
// every slice after its first target, a frozen one never spends it.

const SETTINGS: ReaderSettings = { ...testEnSettings(), furiganaMode: 'all' };
const WORDS: Array<[string, string]> = [['日本語', 'にほんご'], ['勉強', 'べんきょう'], ['本', 'ほん']];

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
        const paintedPerSlice: number[] = [];
        let paintedWhenFirstSliceYielded: number | undefined;
        const scanner = makeScanner({
            pauseMutationObserver: <T>(callback: () => T): T => {
                const result = callback();
                paintedPerSlice.push(paintedWordCount());
                // Queued during slice one, so it runs before slice two only if
                // the scanner really returns to the event loop in between.
                if (paintedPerSlice.length === 1) setTimeout(() => { paintedWhenFirstSliceYielded = paintedWordCount(); }, 0);
                return result;
            },
        });
        raceBudgetClock();

        await scanner.scanVisiblePage({ silent: true });

        expect(paintedPerSlice).toEqual([1, 2, 3, 4, 5, 6]);
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

    it('paints the same words, readings, classes and order whether or not slices end early', async () => {
        const fixture = `
            <article>
                <p>日本語を勉強する。<b>本</b>を読む日本語の本。</p>
                <div style="display:flex"><span>勉強</span>の本と日本語</div>
                <a href="/card" style="display:block"><strong>日本語の勉強</strong><span>本を読む</span></a>
                ${paragraphs(8)}
            </article>`;
        document.body.innerHTML = fixture;
        const unsliced = makeScanner();
        const frozen = freezeBudgetClock();
        await unsliced.scanVisiblePage({ silent: true });
        const unslicedPage = document.body.innerHTML;
        frozen.mockRestore();
        unsliced.destroy();

        document.body.innerHTML = fixture;
        const slices = countedSlices();
        const sliced = makeScanner({ pauseMutationObserver: slices.pause });
        raceBudgetClock();
        await sliced.scanVisiblePage({ silent: true });

        expect(slices.count(), 'the racing clock must actually split the batch').toBeGreaterThan(1);
        expect(paintedWordCount()).toBe(19);
        expect(document.body.innerHTML).toBe(unslicedPage);
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
        raceBudgetClock();

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
        raceBudgetClock();

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

// Every budget check reads 20 ms later than the last: the 12 ms slice budget is
// spent as soon as a slice has painted one target, even on a fast host.
function raceBudgetClock(): void {
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now += 20);
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
        tokens.push(rubyTokenAt(text, word[0], word[1], start));
        start += word[0].length;
    }
    return tokens;
}

function rubyTokenAt(sentence: string, spelling: string, reading: string, start: number): JPDBToken {
    const end = start + spelling.length;
    return {
        ...mirrorToken(spelling, reading),
        start,
        end,
        rubies: [{ text: reading, start, end, length: end - start }],
        sentence,
    };
}
