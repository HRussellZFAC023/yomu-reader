import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    AUTO_SCAN_OBSERVER_OPTIONS,
    mutationMayContainJapaneseText,
} from '../../src/reader/app/mutation-scan';
import { AUTO_SCAN_DEBOUNCE_MAX_WAIT_MS, debouncedAutoScanDeadline } from '../../src/reader/app/main-helpers';

// Class E, mechanism 1: menu/sheet reveals happen via style/class flips after
// first construction (YouTube player settings menu, m.youtube bottom sheets
// keep their DOM and toggle display) — the auto-scan observer must see them,
// or the revealed Japanese text stays bare until an unrelated scan.
describe('auto-scan observer style/class reveal detection (class E)', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('observes style and class attribute mutations with old values', () => {
        expect(AUTO_SCAN_OBSERVER_OPTIONS.attributeFilter).toContain('style');
        expect(AUTO_SCAN_OBSERVER_OPTIONS.attributeFilter).toContain('class');
        expect(AUTO_SCAN_OBSERVER_OPTIONS.attributeOldValue).toBe(true);
    });

    it('treats a display:none → shown style flip on a Japanese container as a reveal', () => {
        document.body.innerHTML = '<div id="menu"><span>再生速度</span></div>';
        const menu = document.getElementById('menu')!;
        expect(mutationMayContainJapaneseText(attributeMutation(menu, 'style', 'display: none;'))).toBe(true);
    });

    it('ignores style churn that never hid the element (position/size animation)', () => {
        document.body.innerHTML = '<div id="menu"><span>再生速度</span></div>';
        const menu = document.getElementById('menu')!;
        menu.setAttribute('style', 'top: 20px;');
        expect(mutationMayContainJapaneseText(attributeMutation(menu, 'style', 'top: 10px;'))).toBe(false);
    });

    it('ignores a style flip that HIDES the element', () => {
        document.body.innerHTML = '<div id="menu" style="display: none;"><span>再生速度</span></div>';
        const menu = document.getElementById('menu')!;
        expect(mutationMayContainJapaneseText(attributeMutation(menu, 'style', ''))).toBe(false);
    });

    it('treats a class change on a rendered Japanese container as a potential reveal', () => {
        document.body.innerHTML = '<div id="sheet" class="sheet open"><span>字幕を設定</span></div>';
        const sheet = document.getElementById('sheet')!;
        expect(mutationMayContainJapaneseText(attributeMutation(sheet, 'class', 'sheet'))).toBe(true);
    });

    it('ignores class mutations whose value did not actually change', () => {
        document.body.innerHTML = '<div id="sheet" class="sheet"><span>字幕を設定</span></div>';
        const sheet = document.getElementById('sheet')!;
        expect(mutationMayContainJapaneseText(attributeMutation(sheet, 'class', 'sheet'))).toBe(false);
    });

    it('ignores class flips on containers without Japanese text', () => {
        document.body.innerHTML = '<div id="sheet" class="sheet open"><span>Settings</span></div>';
        const sheet = document.getElementById('sheet')!;
        expect(mutationMayContainJapaneseText(attributeMutation(sheet, 'class', 'sheet'))).toBe(false);
    });

    it('ignores class flips while the element is inside a hidden subtree', () => {
        document.body.innerHTML = '<div hidden><div id="sheet" class="sheet open"><span>字幕を設定</span></div></div>';
        const sheet = document.getElementById('sheet')!;
        expect(mutationMayContainJapaneseText(attributeMutation(sheet, 'class', 'sheet'))).toBe(false);
    });
});

// Class E, mechanism 3: a trailing debounce that is pushed out on every
// mutation postpones the scan indefinitely on busy pages (live chat replay,
// rotating teasers). The deadline must be capped relative to the FIRST
// debounced request so a busy page still scans.
describe('debounced auto-scan max-wait (class E)', () => {
    it('caps a pushed-out debounced deadline at the max wait from the first request', () => {
        const startedAt = 100_000;
        expect(debouncedAutoScanDeadline(startedAt + 5_000, startedAt)).toBe(startedAt + AUTO_SCAN_DEBOUNCE_MAX_WAIT_MS);
    });

    it('keeps deadlines that are already within the max wait', () => {
        const startedAt = 100_000;
        expect(debouncedAutoScanDeadline(startedAt + 200, startedAt)).toBe(startedAt + 200);
    });
});

function attributeMutation(target: Element, attributeName: string, oldValue: string | null): MutationRecord {
    return {
        type: 'attributes',
        target,
        attributeName,
        oldValue,
        addedNodes: emptyNodeList(),
        removedNodes: emptyNodeList(),
        previousSibling: null,
        nextSibling: null,
        attributeNamespace: null,
    } as unknown as MutationRecord;
}

function emptyNodeList(): NodeList {
    return document.createDocumentFragment().childNodes;
}

// Class E, mechanism 2: the shared collection budget starves the tail on
// YouTube — and the continuation gate treated singlePassScan as "never
// continue", so the tail was never scanned at all. A capped collection must
// queue a continuation for silent scans (mirror-skip makes progress), bounded
// so it cannot spin forever.
describe('visible scan continuation after a capped collection (class E)', () => {
    afterEach(() => {
        vi.resetModules();
        vi.doUnmock('../../src/reader/app/site-parsers');
        document.body.innerHTML = '';
    });

    it('continues a silent scan when collection hit the cap even if every target is single-pass', async () => {
        vi.resetModules();
        const collectScanTargets = vi.fn(function* (limit: number) { yield; return makeTargets(limit, { singlePassScan: true }); });
        vi.doMock('../../src/reader/app/site-parsers', async importOriginal => ({
            ...(await importOriginal<Record<string, unknown>>()),
            collectScanTargetsInSteps: collectScanTargets,
        }));
        const { VisiblePageScanner } = await import('../../src/reader/app/visible-page-scanner');
        const { DEFAULT_SETTINGS } = await import('../../src/reader/settings/index');
        const scanner = new VisiblePageScanner({
            getSettings: () => DEFAULT_SETTINGS,
            parseJapanese: async (paragraphs: string[]) => paragraphs.map(() => []),
            pauseMutationObserver: (callback: () => unknown) => callback(),
            preloadParsedTokens: () => undefined,
            enrichPitchWords: () => undefined,
            enrichAnkiWords: () => undefined,
            toast: () => undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        // First-batch tokens mark parsedAnyTokens: return one token per target.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (scanner as any).dependencies.parseJapanese = async (paragraphs: string[]) =>
            paragraphs.map(text => [{
                card: {
                    vid: 1, sid: 1, rid: 0, spelling: text, reading: text, frequencyRank: null,
                    partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
                },
                start: 0, end: text.length, length: text.length, rubies: [], pitchClass: '', sentence: text,
            }]);

        await scanner.scanVisiblePage({ silent: true });
        // A capped single-pass collection must queue a continuation scan
        // (second collection call) instead of dropping the tail forever.
        await vi.waitFor(() => expect(collectScanTargets.mock.calls.length).toBeGreaterThan(1), { timeout: 5000 });
        scanner.destroy();
    });

    it('bounds consecutive continuations so an always-capped collection cannot spin forever', async () => {
        vi.resetModules();
        const collectScanTargets = vi.fn(function* (limit: number) { yield; return makeTargets(limit, { singlePassScan: true }); });
        vi.doMock('../../src/reader/app/site-parsers', async importOriginal => ({
            ...(await importOriginal<Record<string, unknown>>()),
            collectScanTargetsInSteps: collectScanTargets,
        }));
        const { VisiblePageScanner } = await import('../../src/reader/app/visible-page-scanner');
        const { DEFAULT_SETTINGS } = await import('../../src/reader/settings/index');
        const scanner = new VisiblePageScanner({
            getSettings: () => DEFAULT_SETTINGS,
            parseJapanese: async (paragraphs: string[]) => paragraphs.map(text => [{
                card: {
                    vid: 1, sid: 1, rid: 0, spelling: text, reading: text, frequencyRank: null,
                    partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
                },
                start: 0, end: text.length, length: text.length, rubies: [], pitchClass: '', sentence: text,
            }]),
            pauseMutationObserver: (callback: () => unknown) => callback(),
            preloadParsedTokens: () => undefined,
            enrichPitchWords: () => undefined,
            enrichAnkiWords: () => undefined,
            toast: () => undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        await scanner.scanVisiblePage({ silent: true });
        // Let any queued continuations drain fully.
        for (let i = 0; i < 40; i += 1) await new Promise(resolve => setTimeout(resolve, 5));
        const calls = collectScanTargets.mock.calls.length;
        expect(calls).toBeGreaterThan(1);
        expect(calls).toBeLessThanOrEqual(12);
        scanner.destroy();
    });
});

interface FakeTargetOptions {
    singlePassScan?: boolean;
}

function makeTargets(limit: number, options: FakeTargetOptions): unknown[] {
    const count = Number.isFinite(limit) ? Math.min(limit, 300) : 300;
    return Array.from({ length: count }, (_, index) => {
        const parent = document.createElement('p');
        const node = document.createTextNode(`日本語${index}`);
        parent.append(node);
        document.body.append(parent);
        return {
            text: `日本語${index}`,
            parent,
            fragments: [{ node, start: 0, end: `日本語${index}`.length }],
            singlePassScan: options.singlePassScan || undefined,
            nonDestructive: true,
        };
    });
}
