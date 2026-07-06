#!/usr/bin/env node
// Chip-mirror fidelity smoke: small fixed-height chips/labels decorated via the
// text mirror must not (a) open intra-word gaps when a reading is wider than
// its base (新しい順 rendering as "新 しい 順"), or (b) clip the reading at the
// TOP of the fixed-height chip. Real layout, Chromium AND WebKit.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CSS_PATH = path.join(ROOT, 'dist', 'yomu.css');
const tempDir = mkdtempSync(path.join(tmpdir(), 'yomu-chip-mirror-smoke-'));
const entryPath = path.join(tempDir, 'probe.ts');
const bundlePath = path.join(tempDir, 'probe.js');

writeFileSync(entryPath, `
    import {
        applyTokensToScanTarget,
        collectTextTargetsIn,
        makeRoomForRubyInCroppedRows,
        removeNonDestructiveScanMirrors,
        setRubyDistortsConstrainedRowsForTest,
    } from ${JSON.stringify(path.join(ROOT, 'src/reader/dom/index.ts'))};
    import { DEFAULT_SETTINGS } from ${JSON.stringify(path.join(ROOT, 'src/reader/settings/index.ts'))};
    import type { JPDBCard, JPDBToken } from ${JSON.stringify(path.join(ROOT, 'src/reader/app/types.ts'))};

    const TEXT = '新しい順';
    function card(spelling: string, reading: string): JPDBCard {
        return {
            vid: 1, sid: 1, rid: 0, spelling, reading, frequencyRank: null,
            partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
        };
    }
    function tokens(): JPDBToken[] {
        return [
            { card: card('新しい', 'あたらしい'), start: 0, end: 3, length: 3, rubies: [{ text: 'あたら', start: 0, end: 1, length: 1 }], pitchClass: 'nakadaka', sentence: TEXT },
            { card: card('順', 'じゅん'), start: 3, end: 4, length: 1, rubies: [{ text: 'じゅん', start: 3, end: 4, length: 1 }], pitchClass: 'heiban', sentence: TEXT },
        ];
    }

    function paintLabel(label: HTMLElement): void {
        const target = collectTextTargetsIn(label, 40, false).find(candidate => candidate.text.trim() === TEXT);
        if (!target) throw new Error('target not collected');
        applyTokensToScanTarget(target, tokens(), { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });
        makeRoomForRubyInCroppedRows(document);
    }

    function rectOfText(node: Node, start: number, end: number): DOMRect {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        return range.getBoundingClientRect();
    }

    function findTextNode(root: Element, text: string): Text {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode as Text;
            if ((node.data ?? '').includes(text) && !node.parentElement?.closest('rt')) return node;
        }
        throw new Error('text node not found: ' + text);
    }

    const MORE_TEXT = 'さらに表示';
    function paintMore(host: HTMLElement): void {
        const target = collectTextTargetsIn(host, 40, false).find(candidate => candidate.text.trim() === MORE_TEXT);
        if (!target) throw new Error('more target not collected');
        applyTokensToScanTarget(target, [
            { card: card('さらに', 'さらに'), start: 0, end: 3, length: 3, rubies: [], pitchClass: 'heiban', sentence: MORE_TEXT },
            { card: card('表示', 'ひょうじ'), start: 3, end: 5, length: 2, rubies: [{ text: 'ひょうじ', start: 3, end: 5, length: 2 }], pitchClass: 'heiban', sentence: MORE_TEXT },
        ], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });
        makeRoomForRubyInCroppedRows(document);
    }

    Object.assign(window, {
        runShowMoreProbe() {
            setRubyDistortsConstrainedRowsForTest(null);
            removeNonDestructiveScanMirrors(document);
            const host = document.getElementById('more')!;
            host.textContent = MORE_TEXT;
            paintMore(host);
            const rt = host.querySelector<HTMLElement>('rt');
            if (!rt) return { rtCount: 0, rtTopClip: 0, mirror: Boolean(host.querySelector('.jpdb-reader-text-mirror')) };
            const clipBox = document.getElementById('more-row')!;
            const rtRect = rt.getBoundingClientRect();
            return {
                rtCount: host.querySelectorAll('rt').length,
                mirror: Boolean(host.querySelector('.jpdb-reader-text-mirror')),
                rtTopClip: clipBox.getBoundingClientRect().top - rtRect.top,
                rtHeight: rtRect.height,
            };
        },
        // A tab-style label whose line-height equals the fixed row height puts
        // the mirrored reading flush against the overflow-hidden top edge —
        // the "slightly cut off" iPad class. The room machinery must give the
        // reading real clearance, not just grow the row downward.
        runTabProbe() {
            setRubyDistortsConstrainedRowsForTest(null);
            removeNonDestructiveScanMirrors(document);
            const row = document.getElementById('tab-row')!;
            const label = document.getElementById('tab-label')!;
            label.textContent = TEXT;
            paintLabel(label);
            const scope = label.querySelector('.jpdb-reader-text-mirror') ?? label;
            const rts = [...scope.querySelectorAll<HTMLElement>('rt')];
            if (!rts.length) return { rtCount: 0, rtTopClip: 0 };
            const rtTop = Math.min(...rts.map(rt => rt.getBoundingClientRect().top));
            return { rtCount: rts.length, rtTopClip: row.getBoundingClientRect().top - rtTop };
        },
        runChipMirrorProbe() {
            setRubyDistortsConstrainedRowsForTest(null);
            removeNonDestructiveScanMirrors(document);
            const chip = document.getElementById('chip')!;
            const label = document.getElementById('chip-label')!;
            label.textContent = TEXT;
            const plainWidth = label.getBoundingClientRect().width;
            paintLabel(label);
            const mirror = label.querySelector<HTMLElement>('.jpdb-reader-text-mirror');
            const scope: Element = mirror ?? label;
            const words = [...scope.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
            const baseAtarashii = findTextNode(scope, '新');
            const shii = findTextNode(scope, 'しい');
            const jun = findTextNode(scope, '順');
            const rectShin = rectOfText(baseAtarashii, baseAtarashii.data.indexOf('新'), baseAtarashii.data.indexOf('新') + 1);
            const rectShii = rectOfText(shii, shii.data.indexOf('しい'), shii.data.indexOf('しい') + 2);
            const rectJun = rectOfText(jun, jun.data.indexOf('順'), jun.data.indexOf('順') + 1);
            const chipRect = chip.getBoundingClientRect();
            const rts = [...scope.querySelectorAll<HTMLElement>('rt')];
            const rtTop = Math.min(...rts.map(rt => rt.getBoundingClientRect().top));
            const decoratedWidth = (mirror ?? label).getBoundingClientRect().width;
            return {
                mirror: Boolean(mirror),
                intraWordGap: rectShii.left - rectShin.right,
                interWordGap: rectJun.left - rectShii.right,
                rtTopClip: chipRect.top - rtTop,
                widthGrowth: decoratedWidth - plainWidth,
                plainWidth,
                words: words.length,
                rtCount: rts.length,
            };
        },
    });
`);

await esbuild.build({ entryPoints: [entryPath], bundle: true, outfile: bundlePath, format: 'iife', platform: 'browser', logLevel: 'silent' });

const FIXTURE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
body { font: 14px/1.4 Roboto, sans-serif; width: 400px; margin: 40px; }
#chip { display: inline-flex; align-items: center; height: 32px; padding: 0 12px; border-radius: 8px;
        background: rgba(0,0,0,0.05); overflow: hidden; }
#chip-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; line-height: 20px; }
</style></head><body>
<div id="chip"><div id="chip-label"></div></div>
<div id="tab-row" style="overflow: hidden; height: 32px; margin-top: 24px; background: #f5f5f5;">
  <div id="tab-label" style="font-size: 14px; line-height: 32px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div>
</div>
<div id="more-row" style="overflow: hidden; height: 22px; margin-top: 24px; background: rgba(0,0,0,0.08); border-radius: 4px; padding: 0 8px;">
  <div id="more" style="font-size: 14px; line-height: 22px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">さらに表示</div>
</div>
</body></html>`;

let failed = false;
function fail(message, details) {
    console.error('FAIL:', message, JSON.stringify(details));
    failed = true;
}

// A reading wider than its base may add at most ~2px of spacing around the
// base before the label visibly reads as "新 しい 順" (a plain 14px CJK glyph
// gap is 14px; anything beyond a couple px is a visible split).
const MAX_GAP_PX = 2.5;
const MAX_TOP_CLIP_PX = 1;
// Readings need real breathing room at a clip edge; flush-at-edge renders shaved.
const MIN_TOP_CLEARANCE_PX = 0.5;

async function runEngine(name, browserType) {
    const browser = await browserType.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.route('https://chip-mirror.example/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FIXTURE }));
        await page.goto('https://chip-mirror.example/', { waitUntil: 'domcontentloaded' });
        await page.addStyleTag({ content: readFileSync(CSS_PATH, 'utf8') });
        await page.addScriptTag({ path: bundlePath });
        const result = await page.evaluate(() => window.runChipMirrorProbe());
        console.log(`${name} chip:`, JSON.stringify(result));
        if (result.rtCount < 2) fail(`${name}: expected both readings rendered`, result);
        if (result.intraWordGap > MAX_GAP_PX) fail(`${name}: intra-word gap (新 | しい) too wide`, result);
        if (result.interWordGap > MAX_GAP_PX) fail(`${name}: inter-word gap (しい | 順) too wide`, result);
        if (result.rtTopClip > MAX_TOP_CLIP_PX) fail(`${name}: reading clipped at chip top`, result);
        const more = await page.evaluate(() => window.runShowMoreProbe());
        console.log(`${name} show-more:`, JSON.stringify(more));
        if (more.rtCount < 1) fail(`${name}: show-more reading missing`, more);
        else if (more.rtTopClip > -MIN_TOP_CLEARANCE_PX) fail(`${name}: show-more reading has no top clearance`, more);
        const tab = await page.evaluate(() => window.runTabProbe());
        console.log(`${name} tab:`, JSON.stringify(tab));
        if (tab.rtCount < 1) fail(`${name}: tab reading missing`, tab);
        else if (tab.rtTopClip > -MIN_TOP_CLEARANCE_PX) fail(`${name}: tab reading flush with (or above) the clipped row top`, tab);
    } finally {
        await browser.close();
    }
}

try {
    await runEngine('chromium', chromium);
    await runEngine('webkit', webkit);
} finally {
    rmSync(tempDir, { recursive: true, force: true });
}
if (failed) process.exit(1);
console.log('chip-mirror fidelity smoke passed');
