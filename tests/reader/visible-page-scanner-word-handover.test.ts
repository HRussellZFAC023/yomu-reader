import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockElementBoundingClientRect } from './helpers/dom-fixtures';
import { createVisiblePageScannerFixture, tokensForJapaneseFixture } from './helpers/visible-page-scanner-fixtures';
import { testEnSettings } from './helpers/settings-fixture';
import type { JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { VisiblePageScanner } from '../../src/reader/app/visible-page-scanner';
import { ReaderApp } from '../../src/reader/app/main';
import {
    collectFragmentTextTargetsIn,
    collectTextTargetsIn,
    removeNonDestructiveScanMirrors,
    type ScanTextTarget,
} from '../../src/reader/dom';

// Contrast and indexing consume the painted-word handover before each yield.
const SETTINGS: ReaderSettings = { ...testEnSettings(), furiganaMode: 'all' };
const scanners = new Set<VisiblePageScanner>();
const WORDS: Array<[string, string]> = [
    ['日本語', 'にほんご'], ['勉強', 'べんきょう'], ['本', 'ほん'], ['注意', 'ちゅうい'], ['学習', 'がくしゅう'],
    ['始める', 'はじめる'], ['保存', 'ほぞん'], ['単語', 'たんご'], ['確認', 'かくにん'], ['読む', 'よむ'],
];

beforeEach(() => {
    window.history.pushState({}, '', '/reading/');
    mockElementBoundingClientRect({ width: 100, height: 20 });
});
afterEach(() => {
    scanners.forEach(scanner => scanner.destroy());
    scanners.clear();
    removeNonDestructiveScanMirrors(document);
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    window.history.pushState({}, '', '/');
});

describe('the visible-page scan hands over every word it paints', () => {
    it.each(['fragments', 'portal'] as const)('uses the actual app index and contrast consumers before yielding for %s', async shape => {
        document.body.innerHTML = shape === 'fragments'
            ? '<a href="/x"><strong>学習</strong><span>日本語の本を読む</span></a>'
            : '<article class="comment-thread"><p id="source">日本語</p></article>';
        document.body.style.backgroundColor = '#22262b';
        document.body.style.color = '#eef2f6';
        const app = new ReaderApp();
        const internals = app as unknown as {
            pageScanner: VisiblePageScanner;
            renderedWordIndex: Map<string, Set<HTMLElement>>;
            settings: ReaderSettings;
        };
        let guards = 0;
        const assertConsumers = () => {
            const words = readerWords();
            expect(words.length).toBeGreaterThan(0);
            const indexed = new Set([...internals.renderedWordIndex.values()].flatMap(words => [...words]));
            expect(words.filter(word => !indexed.has(word))).toEqual([]);
            expect(words.filter(word => !word.style.getPropertyValue('--jpdb-reader-highlight-backdrop'))).toEqual([]);
        };
        Object.assign(app, {
            settings: { ...SETTINGS, learningTargetChosen: true, ankiEnabled: false },
            parseJapanese: async (texts: string[]) => texts.map(tokensFor),
            preloadParsedTokens: vi.fn(), enrichPitchWords: vi.fn(), enrichAnkiWords: vi.fn(),
            pauseAutoScanObserver: <T>(callback: () => T): T => { const value = callback(); guards++; assertConsumers(); return value; },
        });
        try {
            if (shape === 'fragments') await internals.pageScanner.scanVisiblePage({ silent: true });
            else {
                const target = onlyTarget(collectTextTargetsIn(document.getElementById('source')!, 40, false));
                const apply = internals.pageScanner as unknown as {
                    applyTokens(targets: ScanTextTarget[], parsed: JPDBToken[][], settings: ReaderSettings): Promise<ParentNode[]>;
                };
                await apply.applyTokens([{ ...target, nonDestructive: true }], [tokensFor(target.text)], internals.settings);
                expect(document.querySelector('.jpdb-reader-document-annotation-portal .jpdb-reader-word')).not.toBeNull();
            }
            expect(guards).toBeGreaterThan(0);
            assertConsumers();
        } finally { app.destroy(); document.body.style.backgroundColor = ''; document.body.style.color = ''; }
    });

    it.each([
        ['a flex row wrapping a direct text run', '<div style="display:flex"><span>勉強</span>の本と日本語</div>', ['勉強', '本', '日本語']],
        ['a link card with a strong title and a span summary', `<a class="yomu-link-card" href="/x">
            <strong>学習を始める 0</strong>
            <span>保存した単語を確認します。日本語を勉強しましょう。</span>
        </a>`, ['学習', '始める', '保存', '単語', '確認', '日本語', '勉強']],
        ['a paragraph after a bold lead-in', '<p><b>注意</b>：日本語の本を読む。</p>', ['注意', '日本語', '本', '読む']],
        ['a hero heading split across two spans', '<h1><span class="name">よむ</span> <span class="text">日本語を読む</span></h1>', ['日本語', '読む']],
        ['a word that keeps a whole native ruby', '<p><ruby>日本<rt>にほん</rt>語<rt>ご</rt></ruby></p>', ['日本語']],
    ])('%s', async (_shape, html, expressions) => {
        const { painted, missed } = await scanAndCollectHandover(html);
        expect(new Set(painted.map(word => word.dataset.expression))).toEqual(new Set(expressions));
        expect(missed).toEqual([]);
    });
});

describe('mirror and text-layer paint roots and handover cover every word', () => {
    it('includes a body-portal mirror', async () => {
        document.body.innerHTML = '<article class="comment-thread"><p id="comment-text">日本語</p></article>';
        const target = onlyTarget(collectTextTargetsIn(document.getElementById('comment-text')!, 40, false));
        const roots = await paint({ ...target, nonDestructive: true });
        expect(document.querySelector('.jpdb-reader-document-annotation-portal .jpdb-reader-word')).not.toBeNull();
        expect(wordsOutside(roots)).toEqual([]);
    });

    it('includes a mirror mounted on a host above the source', async () => {
        document.body.innerHTML = '<div><yt-formatted-string id="host"><span id="source">日本<b>語</b>の本</span></yt-formatted-string></div>';
        const target = onlyTarget(collectFragmentTextTargetsIn(document.getElementById('source')!, 40, false));
        const roots = await paint({ ...target, nonDestructive: true });
        expect(document.querySelector('#host > .jpdb-reader-text-mirror .jpdb-reader-word')).not.toBeNull();
        expect(wordsOutside(roots)).toEqual([]);
    });

    it('includes the per-leaf mirrors of a reactive target, each in a body portal', async () => {
        document.body.innerHTML = '<article class="comment-thread"><p id="row"><span>日本</span><span>語の本</span></p></article>';
        const target = onlyTarget(collectFragmentTextTargetsIn(document.getElementById('row')!, 40, false));
        const roots = await paint({ ...target, nonDestructive: true });
        expect(document.querySelectorAll('body > .jpdb-reader-document-annotation-portal .jpdb-reader-word')).toHaveLength(3);
        expect(wordsOutside(roots)).toEqual([]);
    });

    it('includes a control mirror mounted after its control', async () => {
        document.body.innerHTML = '<div><button id="control" aria-label="日本語">日本語</button></div>';
        const control = document.getElementById('control')!;
        const roots = await paint({
            text: '日本語', parent: control, fragments: [], nonDestructive: true, controlTextMirror: true, passiveInteraction: true,
        });
        expect(control.nextElementSibling?.querySelector('.jpdb-reader-word')).not.toBeNull();
        expect(wordsOutside(roots)).toEqual([]);
    });

    it('includes a canvas fallback text layer', async () => {
        document.body.innerHTML = '<div class="canvas-reader"><canvas width="400" height="240" lang="ja">日本語の本を読む</canvas></div>';
        const canvas = document.querySelector('canvas')!;
        const roots = await paint({ text: '日本語の本を読む', parent: canvas, fragments: [], layoutSensitive: true, nonDestructive: true });
        expect(document.querySelector('.jpdb-reader-canvas-text-layer .jpdb-reader-word')).not.toBeNull();
        expect(wordsOutside(roots)).toEqual([]);
    });
});

describe('paint roots after a parse batch', () => {
    it('reach ruby room and enrichment once each, a root inside another covered by it', async () => {
        // The direct text run's source scope is the div, which holds the <p>.
        document.body.innerHTML = '<div id="outer">勉強の本<p>日本語の本</p></div>';
        const enrichAnkiWords = vi.fn();
        const rubyRoomRoots: ParentNode[] = [];
        const scanner = createVisiblePageScannerFixture({ ...SETTINGS, ankiEnabled: true }, tokensFor, {
            enrichAnkiWords,
            makeRoomForRubyInCroppedRows: root => { if (root && root !== document) rubyRoomRoots.push(root); return 0; },
        });
        scanners.add(scanner);

        await scanner.scanVisiblePage({ silent: true });

        const outer = document.getElementById('outer');
        expect(readerWords().map(word => word.dataset.expression)).toEqual(['勉強', '本', '日本語', '本']);
        expect(enrichAnkiWords.mock.calls.map(([, roots]) => roots)).toEqual([[outer]]);
        expect(rubyRoomRoots).toEqual([outer]);
    });
});

async function scanAndCollectHandover(html: string): Promise<{ painted: HTMLElement[]; missed: string[] }> {
    document.body.innerHTML = html;
    const handedOver = new Set<HTMLElement>();
    const scanner = handoverScanner(handedOver);
    const followupRoots: ParentNode[] = [];
    const internals = scanner as unknown as { dependencies: { makeRoomForRubyInCroppedRows?: (root?: ParentNode) => number } };
    internals.dependencies.makeRoomForRubyInCroppedRows = root => { if (root && root !== document) followupRoots.push(root); return 0; };
    await scanner.scanVisiblePage({ silent: true });
    scanner.destroy();
    const painted = readerWords();
    expect(painted.filter(word => !followupRoots.some(root => root.contains(word)))).toEqual([]);
    const missed = painted
        .filter(word => !handedOver.has(word))
        .map(word => word.dataset.expression ?? '');
    return { painted, missed };
}

function handoverScanner(handedOver: Set<HTMLElement>): VisiblePageScanner {
    const scanner = createVisiblePageScannerFixture(SETTINGS, tokensFor, {
        notePaintedWords: words => words.forEach(word => handedOver.add(word)),
    });
    scanners.add(scanner);
    return scanner;
}

async function paint(target: ScanTextTarget): Promise<ParentNode[]> {
    const handedOver = new Set<HTMLElement>();
    const scanner = handoverScanner(handedOver);
    const apply = scanner as unknown as {
        applyTokens(targets: ScanTextTarget[], parsed: JPDBToken[][], settings: ReaderSettings): Promise<ParentNode[]>;
    };
    const roots = await apply.applyTokens([target], [tokensFor(target.text)], SETTINGS);
    expect(readerWords().filter(word => !handedOver.has(word))).toEqual([]);
    return roots;
}

function onlyTarget<T extends ScanTextTarget>(targets: T[]): T {
    expect(targets).toHaveLength(1);
    return targets[0];
}

function wordsOutside(roots: ParentNode[]): string[] {
    const words = readerWords();
    expect(words.length).toBeGreaterThan(0);
    return words.filter(word => !roots.some(root => root.contains(word))).map(word => word.dataset.expression ?? '');
}

function readerWords(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
}

function tokensFor(text: string): JPDBToken[] {
    return tokensForJapaneseFixture(text, WORDS);
}
