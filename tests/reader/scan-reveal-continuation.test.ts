import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    AUTO_SCAN_OBSERVER_OPTIONS,
    clickMayRevealDynamicUiText,
    clickMayRevealReviewAnswer,
    mutationMayContainJapaneseText,
} from '../../src/reader/app/mutation-scan';
import { AUTO_SCAN_DEBOUNCE_MAX_WAIT_MS, debouncedAutoScanDeadline } from '../../src/reader/app/main-helpers';
import { collectScanTargets } from '../../src/reader/app/site-parsers';
import { HAS_JAPANESE, HAS_JAPANESE_LETTER } from '../../src/reader/dom/constants';
import { mutationContainsOnlyReaderPaint } from '../../src/reader/dom/mutation';

describe('shared Japanese script gates', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('include half-width kana, the prolonged mark, and dakuten', () => {
        expect(HAS_JAPANESE.test('ｶ')).toBe(true);
        expect(HAS_JAPANESE.test('ｰ')).toBe(true);
        expect(HAS_JAPANESE.test('ﾞ')).toBe(true);
        expect(HAS_JAPANESE.test('ﾟ')).toBe(true);
        expect(HAS_JAPANESE_LETTER.test('ｶ')).toBe(true);
        expect(HAS_JAPANESE_LETTER.test('ﾞ')).toBe(false);
    });

    it('admits half-width katakana controls through the generic safe-UI parser', () => {
        document.body.innerHTML = '<button id="feed">ﾌｨｰﾄﾞ</button>';
        const feed = document.getElementById('feed')!;
        vi.spyOn(feed, 'getBoundingClientRect').mockReturnValue({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 120,
            bottom: 40,
            width: 120,
            height: 40,
            toJSON: () => ({}),
        } as DOMRect);

        expect(collectScanTargets(40, 'https://example.com/').map(target => target.text))
            .toContain('ﾌｨｰﾄﾞ');
    });
});

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

    it('schedules a scan when the bounded mutation sample is exhausted before late Japanese', () => {
        const insertion = document.createElement('section');
        insertion.innerHTML = `${'<span>English only</span>'.repeat(80)}<span>最後の日本語</span>`;

        expect(mutationMayContainJapaneseText(childListMutation(document.body, insertion))).toBe(true);
    });

    it('still ignores a fully inspected small insertion without Japanese', () => {
        const insertion = document.createElement('section');
        insertion.innerHTML = '<span>Settings</span><span>Playback speed</span>';

        expect(mutationMayContainJapaneseText(childListMutation(document.body, insertion))).toBe(false);
    });

    it('treats half-width katakana text changes as Japanese', () => {
        const text = document.createTextNode('ﾌｨｰﾄﾞ');

        expect(mutationMayContainJapaneseText(characterDataMutation(text))).toBe(true);
    });

    it('finds half-width katakana inside an inserted subtree', () => {
        const insertion = document.createElement('section');
        insertion.innerHTML = '<span>Playback</span><span>ｶﾀｶﾅ</span>';

        expect(mutationMayContainJapaneseText(childListMutation(document.body, insertion))).toBe(true);
    });
});

describe('reader paint mutation boundary', () => {
    it('rejects a projected layer appended through a page root', () => {
        const layer = document.createElement('div');
        layer.className = 'jpdb-reader-detached-reading-overlay';

        expect(mutationContainsOnlyReaderPaint(childListMutation(document.body, layer))).toBe(true);
    });

    it('rejects updates within existing reader paint', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';

        expect(mutationContainsOnlyReaderPaint(attributeMutation(word, 'style', null))).toBe(true);
    });

    it('keeps structural damage to a destructively painted page word observable', () => {
        const page = document.createElement('p');
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        page.append(word);
        document.body.append(page);

        expect(mutationContainsOnlyReaderPaint(childListMutation(word, document.createTextNode('先生')))).toBe(false);

        const mirror = document.createElement('span');
        mirror.className = 'jpdb-reader-text-mirror';
        mirror.append(word);
        expect(mutationContainsOnlyReaderPaint(childListMutation(word, document.createTextNode('せんせい')))).toBe(true);
    });

    it('keeps page and mixed replacements observable', () => {
        const japanese = document.createTextNode('先生');
        const reading = document.createElement('span');
        reading.dataset.yomuProjectedReading = 'true';

        expect(mutationContainsOnlyReaderPaint(childListMutation(document.body, japanese))).toBe(false);
        expect(mutationContainsOnlyReaderPaint(childListMutation(document.body, reading, japanese))).toBe(false);
    });
});

describe('post-click dynamic UI reveal detection', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('recognizes menu items, disclosures and tabs', () => {
        document.body.innerHTML = `
            <div role="menuitem"><span id="menu-label">再生速度</span></div>
            <button id="disclosure" aria-expanded="false">詳細</button>
            <button id="tab" role="tab">字幕</button>
        `;
        expect(clickMayRevealDynamicUiText(document.querySelector('#menu-label'))).toBe(true);
        expect(clickMayRevealDynamicUiText(document.querySelector('#disclosure'))).toBe(true);
        expect(clickMayRevealDynamicUiText(document.querySelector('#tab'))).toBe(true);
    });

    it('recognizes a disclosure inside an open shadow tree from its composed click path', () => {
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = '<button id="disclosure" aria-haspopup="menu">並べ替え</button>';
        document.body.append(host);

        let mayReveal = false;
        document.addEventListener('click', event => {
            mayReveal = clickMayRevealDynamicUiText(event);
        }, { capture: true, once: true });
        shadow.querySelector<HTMLButtonElement>('#disclosure')!.click();

        expect(mayReveal).toBe(true);
        expect(clickMayRevealDynamicUiText(host), 'the retargeted outer host alone carries no disclosure semantics').toBe(false);
    });

    it('ignores ordinary content clicks and reader-owned controls', () => {
        document.body.innerHTML = `
            <article><a id="story" href="/story">記事を読む</a></article>
            <div data-jpdb-reader-root><button id="reader" aria-haspopup="menu">辞書</button></div>
        `;
        expect(clickMayRevealDynamicUiText(document.querySelector('#story'))).toBe(false);
        expect(clickMayRevealDynamicUiText(document.querySelector('#reader'))).toBe(false);
    });
});

describe('review answer reveal detection', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('recognizes JPDB and Jiten answer controls, including input values', () => {
        document.body.innerHTML = `
            <input id="jpdb" type="submit" value="Show answer">
            <button id="jiten"><span>Reveal answer</span></button>
        `;

        expect(clickMayRevealReviewAnswer(document.querySelector('#jpdb'))).toBe(true);
        expect(clickMayRevealReviewAnswer(document.querySelector('#jiten span'))).toBe(true);
    });

    it('ignores ordinary buttons and reader-owned controls', () => {
        document.body.innerHTML = `
            <button id="save">Save changes</button>
            <button id="examples">Show examples</button>
            <div data-jpdb-reader-root><button id="reader">Show answer</button></div>
        `;

        expect(clickMayRevealReviewAnswer(document.querySelector('#save'))).toBe(false);
        expect(clickMayRevealReviewAnswer(document.querySelector('#examples'))).toBe(false);
        expect(clickMayRevealReviewAnswer(document.querySelector('#reader'))).toBe(false);
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

function childListMutation(target: Node, ...addedNodes: Node[]): MutationRecord {
    return {
        type: 'childList',
        target,
        attributeName: null,
        oldValue: null,
        addedNodes: addedNodes as unknown as NodeList,
        removedNodes: emptyNodeList(),
        previousSibling: null,
        nextSibling: null,
        attributeNamespace: null,
    } as unknown as MutationRecord;
}

function characterDataMutation(target: Node): MutationRecord {
    return {
        type: 'characterData',
        target,
        attributeName: null,
        oldValue: null,
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
    // These tests exercise the continuation state machine, not the production
    // 200-target throughput limit (covered by the scanner suite). Keep the
    // synthetic cap small so renderer/portal cost cannot turn seven bounded
    // transitions into a machine-speed-dependent timeout under Node/jsdom.
    const collectionLimit = 8;

    afterEach(() => {
        vi.resetModules();
        vi.doUnmock('../../src/reader/app/site-parsers');
        document.body.innerHTML = '';
    });

    it('continues a silent scan when collection hit the cap even if every target is single-pass', async () => {
        vi.resetModules();
        const collectScanTargets = vi.fn(function* () { yield; return makeTargets(collectionLimit, { singlePassScan: true }); });
        vi.doMock('../../src/reader/app/site-parsers', async importOriginal => ({
            ...(await importOriginal<Record<string, unknown>>()),
            collectScanTargetsInSteps: collectScanTargets,
            effectiveSiteScanCollectionLimit: () => collectionLimit,
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
        await vi.waitFor(() => expect(collectScanTargets.mock.calls.length).toBeGreaterThan(1), { timeout: 12_000 });
        scanner.destroy();
    }, 15_000);

    it('bounds consecutive continuations so an always-capped collection cannot spin forever', async () => {
        vi.resetModules();
        const collectScanTargets = vi.fn(function* () { yield; return makeTargets(collectionLimit, { singlePassScan: true }); });
        vi.doMock('../../src/reader/app/site-parsers', async importOriginal => ({
            ...(await importOriginal<Record<string, unknown>>()),
            collectScanTargetsInSteps: collectScanTargets,
            effectiveSiteScanCollectionLimit: () => collectionLimit,
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
    }, 15_000);

    it('advances non-silent continuations past the mirrored head', async () => {
        vi.resetModules();
        const targets = makeTargets(collectionLimit + 2, { singlePassScan: false });
        const collectScanTargets = vi.fn(function* (
            _limit: number,
            _href: string,
            options: { skipMirroredHosts?: boolean } = {},
        ) {
            yield;
            const start = options.skipMirroredHosts ? collectionLimit : 0;
            return targets.slice(start, start + collectionLimit);
        });
        vi.doMock('../../src/reader/app/site-parsers', async importOriginal => ({
            ...(await importOriginal<Record<string, unknown>>()),
            collectScanTargetsInSteps: collectScanTargets,
            effectiveSiteScanCollectionLimit: () => collectionLimit,
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

        await scanner.scanVisiblePage({ silent: false });
        await vi.waitFor(() => expect(collectScanTargets).toHaveBeenCalledTimes(2), { timeout: 5_000 });
        expect(collectScanTargets.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ skipMirroredHosts: false }));
        expect(collectScanTargets.mock.calls[1]?.[2]).toEqual(expect.objectContaining({ skipMirroredHosts: true }));
        await vi.waitFor(
            () => expect(document.querySelectorAll('.jpdb-reader-text-mirror')).toHaveLength(collectionLimit + 2),
            { timeout: 5_000 },
        );
        scanner.destroy();
    }, 15_000);
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
