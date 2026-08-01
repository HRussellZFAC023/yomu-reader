#!/usr/bin/env node
// Real-engine proof for #45: disabling every visible page-annotation channel
// must leave native CJK line breaking and text-node identity untouched. A
// settings transition must also remove wrappers and number/counter binders
// left by an earlier annotated scan. Runs in all three Playwright engines.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const tempDir = mkdtempSync(path.join(tmpdir(), 'yomu-layout-neutral-scan-smoke-'));
const entryPath = path.join(tempDir, 'probe.ts');
const bundlePath = path.join(tempDir, 'probe.js');

writeFileSync(entryPath, `
    import {
        pageScanHasVisibleAnnotations,
        VisiblePageScanner,
    } from ${JSON.stringify(path.join(ROOT, 'src/reader/app/visible-page-scanner.ts'))};
    import {
        applyTokensToScanTarget,
        collectTextTargetsIn,
    } from ${JSON.stringify(path.join(ROOT, 'src/reader/dom/index.ts'))};
    import { DEFAULT_SETTINGS } from ${JSON.stringify(path.join(ROOT, 'src/reader/settings/index.ts'))};
    import type { JPDBCard, JPDBToken, ReaderSettings } from ${JSON.stringify(path.join(ROOT, 'src/reader/app/types.ts'))};

    const NATIVE_TEXT = '日本に住んでいる外国人の皆さんや、子どもたちに、できるだけやさしい日本語でニュースを伝える文章です。';
    const COUNTER_TEXT = '7件';

    function card(spelling: string, reading = spelling): JPDBCard {
        return {
            vid: 1,
            sid: 1,
            rid: 0,
            spelling,
            reading,
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jpdb',
        };
    }

    function token(sentence: string, start: number, end: number): JPDBToken {
        const spelling = sentence.slice(start, end);
        return {
            card: card(spelling),
            start,
            end,
            length: end - start,
            rubies: [],
            pitchClass: '',
            sentence,
        };
    }

    function neutralSettings(): ReaderSettings {
        return {
            ...DEFAULT_SETTINGS,
            showFurigana: false,
            furiganaMode: 'off',
            wordHighlightColorSource: 'off',
            wordUnderlineColorSource: 'off',
            wordTextColorSource: 'off',
        };
    }

    function visibleSettings(): ReaderSettings {
        return {
            ...neutralSettings(),
            wordHighlightColorSource: 'jpdb',
        };
    }

    function rounded(value: number): number {
        return Math.round(value * 1000) / 1000;
    }

    function characterGeometry(node: Text) {
        const geometry = [];
        for (let offset = 0; offset < node.data.length; offset += 1) {
            const range = document.createRange();
            range.setStart(node, offset);
            range.setEnd(node, offset + 1);
            const rect = range.getBoundingClientRect();
            geometry.push([
                rounded(rect.left),
                rounded(rect.top),
                rounded(rect.width),
                rounded(rect.height),
            ]);
            range.detach?.();
        }
        return geometry;
    }

    function characterLineMap(geometry: number[][]): number[] {
        const lineTops: number[] = [];
        return geometry.map(([, top]) => {
            let line = lineTops.findIndex(existing => Math.abs(existing - top) <= 0.5);
            if (line >= 0) return line;
            lineTops.push(top);
            line = lineTops.length - 1;
            return line;
        });
    }

    function paintPriorAnnotations(article: HTMLElement, counter: HTMLElement): void {
        const articleTarget = collectTextTargetsIn(article, 10, false)
            .find(candidate => candidate.text === NATIVE_TEXT);
        const counterTarget = collectTextTargetsIn(counter, 10, false)
            .find(candidate => candidate.text === COUNTER_TEXT);
        if (!articleTarget || !counterTarget) throw new Error('fixture text target was not collected');
        applyTokensToScanTarget(articleTarget, [token(NATIVE_TEXT, 0, NATIVE_TEXT.length)], visibleSettings());
        applyTokensToScanTarget(counterTarget, [token(COUNTER_TEXT, 1, 2)], visibleSettings());
    }

    Object.assign(window, {
        async runLayoutNeutralPageScanProbe() {
            const native = document.querySelector<HTMLElement>('#native')!;
            const prior = document.querySelector<HTMLElement>('#prior')!;
            const counter = document.querySelector<HTMLElement>('#counter')!;
            const nativeTextNode = native.firstChild;
            if (!(nativeTextNode instanceof Text)) throw new Error('native fixture did not begin as one text node');

            const beforeGeometry = characterGeometry(nativeTextNode);
            const beforeLineMap = characterLineMap(beforeGeometry);
            paintPriorAnnotations(prior, counter);
            const priorCounts = {
                words: document.querySelectorAll('.jpdb-reader-word').length,
                binders: document.querySelectorAll('.jpdb-reader-number-bind').length,
            };

            const settings = neutralSettings();
            let parseCalls = 0;
            const scanner = new VisiblePageScanner({
                getSettings: () => settings,
                parseJapanese: async () => {
                    parseCalls += 1;
                    return [];
                },
                pauseMutationObserver: callback => callback(),
                preloadParsedTokens: () => undefined,
                enrichPitchWords: () => undefined,
                enrichAnkiWords: () => undefined,
                toast: () => undefined,
            });
            try {
                await scanner.scanVisiblePage({ silent: true });
            } finally {
                scanner.destroy();
            }

            const afterTextNode = native.firstChild;
            const afterGeometry = afterTextNode instanceof Text ? characterGeometry(afterTextNode) : [];
            return {
                channels: {
                    furigana: settings.furiganaMode,
                    highlight: settings.wordHighlightColorSource,
                    underline: settings.wordUnderlineColorSource,
                    text: settings.wordTextColorSource,
                    hasVisibleAnnotations: pageScanHasVisibleAnnotations(settings),
                },
                parseCalls,
                native: {
                    sameTextNode: afterTextNode === nativeTextNode,
                    childNodes: native.childNodes.length,
                    text: native.textContent,
                    beforeGeometry,
                    afterGeometry,
                    beforeLineMap,
                    afterLineMap: characterLineMap(afterGeometry),
                    lineCount: new Set(beforeLineMap).size,
                },
                prior: {
                    before: priorCounts,
                    wordsAfter: document.querySelectorAll('.jpdb-reader-word').length,
                    bindersAfter: document.querySelectorAll('.jpdb-reader-number-bind').length,
                    articleText: prior.textContent,
                    articleChildNodes: prior.childNodes.length,
                    counterText: counter.textContent,
                    counterChildNodes: counter.childNodes.length,
                },
            };
        },
    });
`);

await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    outfile: bundlePath,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    define: { __YOMU_VERSION__: JSON.stringify('layout-neutral-page-scan-smoke') },
    logLevel: 'silent',
});

const FIXTURE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
body { margin: 24px; }
.fixture { box-sizing: border-box; width: 248px; margin: 0 0 24px; font: 19px/1.45 sans-serif; }
</style></head><body>
<p id="native" class="fixture">日本に住んでいる外国人の皆さんや、子どもたちに、できるだけやさしい日本語でニュースを伝える文章です。</p>
<p id="prior" class="fixture">日本に住んでいる外国人の皆さんや、子どもたちに、できるだけやさしい日本語でニュースを伝える文章です。</p>
<p id="counter" class="fixture">7件</p>
</body></html>`;

function assert(condition, engine, message, result) {
    if (!condition) throw new Error(`${engine}: ${message}\n${JSON.stringify(result, null, 2)}`);
}

function verify(engine, result) {
    const channels = result.channels;
    for (const channel of ['furigana', 'highlight', 'underline', 'text']) {
        assert(channels[channel] === 'off', engine, `${channel} channel was not disabled`, result);
    }
    assert(channels.hasVisibleAnnotations === false,
        engine, 'fixture was not in the fully layout-neutral settings state', result);
    assert(result.parseCalls === 0, engine, 'neutral scan still invoked the parser', result);
    assert(result.native.sameTextNode, engine, 'neutral scan replaced the native CJK text node', result);
    assert(result.native.childNodes === 1, engine, 'neutral scan split the native CJK text run', result);
    assert(result.native.text.includes('やさしい日本語'), engine, 'neutral scan changed native CJK text', result);
    assert(result.native.lineCount >= 2, engine, 'fixture did not exercise native line wrapping', result);
    assert(JSON.stringify(result.native.beforeLineMap) === JSON.stringify(result.native.afterLineMap),
        engine, 'neutral scan changed the native character-to-line map', result);
    assert(JSON.stringify(result.native.beforeGeometry) === JSON.stringify(result.native.afterGeometry),
        engine, 'neutral scan changed native character geometry', result);
    assert(result.prior.before.words >= 2, engine, 'prior annotated wrappers were not created', result);
    assert(result.prior.before.binders === 1, engine, 'prior number/counter binder was not created', result);
    assert(result.prior.wordsAfter === 0, engine, 'neutral scan left reader-word wrappers behind', result);
    assert(result.prior.bindersAfter === 0, engine, 'neutral scan left a number/counter binder behind', result);
    assert(result.prior.articleText === result.native.text,
        engine, 'prior annotated paragraph text was not restored', result);
    assert(result.prior.articleChildNodes === 1,
        engine, 'prior annotated paragraph was not restored to one native text node', result);
    assert(result.prior.counterText === '7件', engine, 'prior number/counter text was not restored', result);
    assert(result.prior.counterChildNodes === 1,
        engine, 'prior number/counter run was not restored to one native text node', result);
}

async function runEngine(name, browserType) {
    const browser = await browserType.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 640, height: 720 } });
        await page.setContent(FIXTURE, { waitUntil: 'domcontentloaded' });
        await page.addScriptTag({ path: bundlePath });
        const result = await page.evaluate(() => window.runLayoutNeutralPageScanProbe());
        verify(name, result);
        console.log(`${name}: layout-neutral native line map + cleanup passed (${result.native.lineCount} lines)`);
    } finally {
        await browser.close();
    }
}

try {
    await runEngine('chromium', chromium);
    await runEngine('firefox', firefox);
    await runEngine('webkit', webkit);
    console.log('layout-neutral page scan smoke passed');
} finally {
    rmSync(tempDir, { recursive: true, force: true });
}
