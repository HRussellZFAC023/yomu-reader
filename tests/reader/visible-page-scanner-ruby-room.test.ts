import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Isolated file: vi.mock is per-file hoisted, so wrapping the dom module's
// makeRoomForRubyInCroppedRows with a spy here does not affect the other
// scanner tests.
const rubyRoomSpy = vi.fn();
vi.mock('../../src/reader/dom/index', async () => {
    const actual = await vi.importActual<typeof import('../../src/reader/dom/index')>('../../src/reader/dom/index');
    return { ...actual, makeRoomForRubyInCroppedRows: (root: ParentNode = document) => { rubyRoomSpy(root); return 0; } };
});

import { testEnSettings } from './helpers/settings-fixture';
import type { JPDBToken } from '../../src/reader/app/types';
import { VisiblePageScanner } from '../../src/reader/app/visible-page-scanner';

const DEFAULT_SETTINGS = testEnSettings();

type Deps = ConstructorParameters<typeof VisiblePageScanner>[0];

function makeScanner(overrides: Partial<Deps> & Pick<Deps, 'parseJapanese'>, applyLog: string[]): VisiblePageScanner {
    return new VisiblePageScanner({
        getSettings: () => DEFAULT_SETTINGS,
        // Log each apply-batch boundary so we can prove the ruby-room sweep runs
        // AFTER every apply batch, never interleaved with them.
        pauseMutationObserver: <T>(callback: () => T): T => {
            const result = callback();
            applyLog.push(`apply@${rubyRoomSpy.mock.calls.length}`);
            return result;
        },
        preloadParsedTokens: vi.fn(),
        enrichPitchWords: vi.fn(),
        enrichAnkiWords: vi.fn(),
        toast: vi.fn(),
        ...overrides,
    });
}

function mockRects(): () => void {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = () => ({
        x: 0, y: 0, width: 100, height: 20, top: 0, right: 100, bottom: 20, left: 0, toJSON: () => ({}),
    } as DOMRect);
    return () => { HTMLElement.prototype.getBoundingClientRect = original; };
}

function testToken(sentence: string, spelling: string, start: number, end: number): JPDBToken {
    return {
        card: { vid: -start - 1, sid: -start - 1, rid: 0, spelling, reading: '', frequencyRank: null, partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'fallback' },
        start, end, length: end - start, rubies: [], pitchClass: '', sentence,
    };
}

describe('VisiblePageScanner ruby-room sweep cadence', () => {
    // The default jsdom URL (localhost:3000/) now matches the hosted-docs
    // profile, which scans only `.vp-doc` and disables the generic pass. These
    // tests scan bare generic prose, so pin them to an ordinary page.
    beforeEach(() => {
        rubyRoomSpy.mockClear();
        window.history.pushState({}, '', '/reading/');
    });
    afterEach(() => {
        document.body.innerHTML = '';
        window.history.pushState({}, '', '/');
    });

    it('reserves ruby room once per parse batch (after its apply chunks), never per apply chunk', async () => {
        const restoreRects = mockRects();
        // 170 paragraphs => parse batches of 80 => each parse batch splits into
        // TWO 48-wide apply chunks. applyLog records the running sweep count at
        // every apply-chunk boundary. Pre-fix the sweep ran INSIDE each apply
        // chunk, so the count climbed at every boundary (one distinct value per
        // apply chunk). The fix runs the sweep once AFTER a parse batch's apply
        // chunks, so successive chunk boundaries WITHIN a parse batch see the
        // same count — the number of distinct counts collapses to the number of
        // parse batches, not apply chunks.
        document.body.innerHTML = Array.from({ length: 170 }, (_, index) => `<p>日本語の文${index}</p>`).join('');
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [testToken(text, text, 0, text.length)]));
        const applyLog: string[] = [];
        const scanner = makeScanner({ parseJapanese }, applyLog);

        try {
            await scanner.scanVisiblePage({ silent: true });

            // More apply chunks (5: 48+32 per 80-target batch, x3 batches) than
            // parse batches (3), so the two cadences are distinguishable.
            expect(applyLog.length).toBeGreaterThan(3);
            const distinctCounts = new Set(applyLog).size;
            const parseBatches = parseJapanese.mock.calls.length;
            expect(parseBatches).toBe(3);
            // One distinct sweep-count per parse batch (sweep deferred to after
            // each batch's chunks) — NOT one per apply chunk.
            expect(distinctCounts).toBeLessThanOrEqual(parseBatches);
            // Total sweeps still cover every changed root exactly once.
            expect(rubyRoomSpy).toHaveBeenCalledTimes(170);
        } finally {
            scanner.destroy();
            restoreRects();
        }
    }, 15000);

    it('reserves ruby room for a shared root in EVERY parse batch that adds rows (not just the first)', async () => {
        const restoreRects = mockRects();
        // 170 text nodes under ONE parent (a shared container / mirror host)
        // split across multiple parse batches. A per-scan root dedup swept the
        // shared root only in the FIRST batch, so rows annotated in later
        // batches stayed cropped until the delayed document sweep. Each batch
        // adds NEW rows to the same root, so the sweep must run for it once per
        // batch that touches it.
        const lines = Array.from({ length: 170 }, (_, index) => `日本語の文${index}`).join('<br>');
        document.body.innerHTML = `<div id="shared">${lines}</div>`;
        const shared = document.querySelector<HTMLElement>('#shared')!;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [testToken(text, text, 0, text.length)]));
        const applyLog: string[] = [];
        const scanner = makeScanner({ parseJapanese }, applyLog);

        try {
            await scanner.scanVisiblePage({ silent: true });
            const parseBatches = parseJapanese.mock.calls.length;
            expect(parseBatches).toBeGreaterThanOrEqual(2);
            const sharedSweeps = rubyRoomSpy.mock.calls.filter(call => call[0] === shared).length;
            // One sweep of the shared root per parse batch that added rows —
            // never collapsed to a single first-batch sweep.
            expect(sharedSweeps).toBe(parseBatches);
        } finally {
            scanner.destroy();
            restoreRects();
        }
    }, 15000);

    it('still reserves ruby room incrementally: an early clipped root gets room before the scan finishes', async () => {
        const restoreRects = mockRects();
        // First parse batch resolves immediately; the rest stays pending. The
        // early clipped title must already have room (its root swept) while
        // later batches are still in flight — no cropped flash during a long
        // scan.
        document.body.innerHTML = `
            <div id="early">日本語の初回</div>
            ${Array.from({ length: 120 }, (_, index) => `<p>日本語の文${index}</p>`).join('')}
        `;
        const early = document.querySelector<HTMLElement>('#early')!;
        let call = 0;
        const later = { resolve: (_v: JPDBToken[][]) => {}, promise: new Promise<JPDBToken[][]>(() => {}) };
        later.promise = new Promise<JPDBToken[][]>(res => { later.resolve = res; });
        const parseJapanese = vi.fn((paragraphs: string[]): Promise<JPDBToken[][]> => {
            call += 1;
            const tokens = paragraphs.map(text => [testToken(text, '日本語', 0, 3)]);
            return call === 1 ? Promise.resolve(tokens) : later.promise;
        });
        const applyLog: string[] = [];
        const scanner = makeScanner({ parseJapanese }, applyLog);

        try {
            const scan = scanner.scanVisiblePage({ silent: true });
            await vi.waitFor(() => expect(parseJapanese.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 5_000 });
            // The early root was swept while later batches are still pending.
            expect(rubyRoomSpy.mock.calls.some(c => c[0] === early)).toBe(true);
            later.resolve([]);
            await scan;
        } finally {
            scanner.destroy();
            restoreRects();
        }
    }, 15000);
});
