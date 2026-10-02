import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockElementBoundingClientRect } from './helpers/dom-fixtures';
import { mirrorToken } from './helpers/japanese-token-fixtures';
import { testEnSettings } from './helpers/settings-fixture';
import type { JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { VisiblePageScanner } from '../../src/reader/app/visible-page-scanner';
import {
    applyTokensToScanTarget,
    collectFragmentTextTargetsIn,
    collectTextTargetsIn,
    removeNonDestructiveScanMirrors,
    type ScanTextTarget,
} from '../../src/reader/dom';

// The scan hands the app the roots a chunk painted into, and the app refreshes
// contrast and indexes words by querying those roots. A fragment target's
// parent is only its first fragment's parent, and a mirror can mount outside
// it, so every root a target's words land in must be handed over, or those
// words keep no contrast variables and never get a late card repaint.
const SETTINGS: ReaderSettings = { ...testEnSettings(), furiganaMode: 'all' };
const WORDS: Array<[string, string]> = [
    ['日本語', 'にほんご'], ['勉強', 'べんきょう'], ['本', 'ほん'], ['注意', 'ちゅうい'], ['学習', 'がくしゅう'],
    ['始める', 'はじめる'], ['保存', 'ほぞん'], ['単語', 'たんご'], ['確認', 'かくにん'], ['読む', 'よむ'],
];

beforeEach(() => {
    window.history.pushState({}, '', '/reading/');
    mockElementBoundingClientRect({ width: 100, height: 20 });
});
afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    window.history.pushState({}, '', '/');
});

describe('the visible-page scan hands over every word it paints', () => {
    it.each([
        ['a flex row wrapping a direct text run', '<div style="display:flex"><span>勉強</span>の本と日本語</div>', ['勉強', '本', '日本語']],
        ['a link card with a strong title and a span summary', `<a class="yomu-link-card" href="/x">
            <strong>学習を始める 0</strong>
            <span>保存した単語を確認します。日本語を勉強しましょう。</span>
        </a>`, ['学習', '始める', '保存', '単語', '確認', '日本語', '勉強']],
        ['a paragraph after a bold lead-in', '<p><b>注意</b>：日本語の本を読む。</p>', ['注意', '日本語', '本', '読む']],
        ['a hero heading split across two spans', '<h1><span class="name">よむ</span> <span class="text">日本語を読む</span></h1>', ['日本語', '読む']],
        ['Aozora lines that open with native ruby', `<div class="main_text">${[0, 1, 2].map(line => `<ruby><rb>注意</rb><rp>（</rp><rt>ちゅうい</rt><rp>）</rp></ruby>して日本語の本を読む${line}。`).join('<br />\n')}</div>`, ['日本語', '本', '読む']],
        ['a word that keeps a whole native ruby', '<p><ruby>日本<rt>にほん</rt>語<rt>ご</rt></ruby></p>', ['日本語']],
    ])('%s', async (_shape, html, expressions) => {
        const { painted, contrastMissed, indexMissed } = await scanAndCollectHandover(html);
        expect(new Set(painted.map(word => word.dataset.expression))).toEqual(new Set(expressions));
        expect(contrastMissed).toEqual([]);
        expect(indexMissed).toEqual([]);
    });
});

describe('applyTokensToScanTarget returns every element holding the words it painted', () => {
    it('includes a body-portal mirror', () => {
        document.body.innerHTML = '<article class="comment-thread"><p id="comment-text">日本語</p></article>';
        const target = onlyTarget(collectTextTargetsIn(document.getElementById('comment-text')!, 40, false));
        const roots = paint({ ...target, nonDestructive: true });
        expect(document.querySelector('.jpdb-reader-document-annotation-portal .jpdb-reader-word')).not.toBeNull();
        expect(wordsOutside(roots)).toEqual([]);
    });

    it('includes a mirror mounted on a host above the source', () => {
        document.body.innerHTML = '<div><yt-formatted-string id="host"><span id="source">日本<b>語</b>の本</span></yt-formatted-string></div>';
        const target = onlyTarget(collectFragmentTextTargetsIn(document.getElementById('source')!, 40, false));
        const roots = paint({ ...target, nonDestructive: true });
        expect(document.querySelector('#host > .jpdb-reader-text-mirror .jpdb-reader-word')).not.toBeNull();
        expect(wordsOutside(roots)).toEqual([]);
    });

    it('covers per-leaf mirrors of a reactive target', () => {
        document.body.innerHTML = '<div id="row"><span>日本</span><span>語の本</span></div>';
        const target = onlyTarget(collectFragmentTextTargetsIn(document.getElementById('row')!, 40, false));
        const roots = paint({ ...target, nonDestructive: true });
        expect(document.querySelectorAll('.jpdb-reader-text-mirror').length).toBeGreaterThan(1);
        expect(wordsOutside(roots)).toEqual([]);
    });

    it('includes a control mirror mounted after its control', () => {
        document.body.innerHTML = '<div><button id="control">日本語</button></div>';
        const control = document.getElementById('control')!;
        const roots = paint({
            text: '日本語', parent: control, fragments: [], nonDestructive: true, controlTextMirror: true, passiveInteraction: true,
        });
        expect(control.nextElementSibling?.querySelector('.jpdb-reader-word')).not.toBeNull();
        expect(wordsOutside(roots)).toEqual([]);
    });

    it('includes a canvas fallback text layer', () => {
        document.body.innerHTML = '<div class="canvas-reader"><canvas width="400" height="240" lang="ja">日本語の本を読む</canvas></div>';
        const canvas = document.querySelector('canvas')!;
        const roots = paint({ text: '日本語の本を読む', parent: canvas, fragments: [], layoutSensitive: true, nonDestructive: true });
        expect(document.querySelector('.jpdb-reader-canvas-text-layer .jpdb-reader-word')).not.toBeNull();
        expect(wordsOutside(roots)).toEqual([]);
    });
});

async function scanAndCollectHandover(html: string): Promise<{ painted: HTMLElement[]; contrastMissed: string[]; indexMissed: string[] }> {
    document.body.innerHTML = html;
    const contrastRoots: ParentNode[] = [];
    const indexedRoots: ParentNode[] = [];
    const scanner = new VisiblePageScanner({
        getSettings: () => SETTINGS,
        parseJapanese: async texts => texts.map(tokensFor),
        pauseMutationObserver: callback => callback(),
        preloadParsedTokens: vi.fn(),
        enrichPitchWords: vi.fn(),
        enrichAnkiWords: vi.fn(),
        toast: vi.fn(),
        refreshWordContrast: root => contrastRoots.push(root),
        noteRenderedRoots: roots => indexedRoots.push(...roots),
    });
    await scanner.scanVisiblePage({ silent: true });
    scanner.destroy();
    const painted = readerWords();
    const missedBy = (roots: ParentNode[]) => painted
        .filter(word => !roots.some(root => root.contains(word)))
        .map(word => word.dataset.expression ?? '');
    return { painted, contrastMissed: missedBy(contrastRoots), indexMissed: missedBy(indexedRoots) };
}

function paint(target: ScanTextTarget): HTMLElement[] {
    return applyTokensToScanTarget(target, tokensFor(target.text), SETTINGS);
}

function onlyTarget<T extends ScanTextTarget>(targets: T[]): T {
    expect(targets).toHaveLength(1);
    return targets[0];
}

function wordsOutside(roots: HTMLElement[]): string[] {
    const words = readerWords();
    expect(words.length).toBeGreaterThan(0);
    return words.filter(word => !roots.some(root => root.contains(word))).map(word => word.dataset.expression ?? '');
}

function readerWords(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
}

function tokensFor(text: string): JPDBToken[] {
    const tokens: JPDBToken[] = [];
    for (let start = 0; start < text.length;) {
        const word = WORDS.find(([spelling]) => text.startsWith(spelling, start));
        if (!word) {
            start += 1;
            continue;
        }
        const [spelling, reading] = word;
        const end = start + spelling.length;
        tokens.push({ ...mirrorToken(spelling, reading), start, end, rubies: [{ text: reading, start, end, length: end - start }], sentence: text });
        start = end;
    }
    return tokens;
}
