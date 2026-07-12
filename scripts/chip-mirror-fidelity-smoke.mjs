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
    const MINI_TEXT = '登録チャンネル';
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
            if ((node.data ?? '').includes(text) && !node.parentElement?.closest('rt,.jpdb-reader-detached-furi')) return node;
        }
        throw new Error('text node not found: ' + text);
    }

    function readingIsClipped(reading: HTMLElement): boolean {
        const rect = reading.getBoundingClientRect();
        for (let ancestor = reading.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            if (![style.overflow, style.overflowX, style.overflowY].some(value => value === 'hidden' || value === 'clip')) continue;
            const box = ancestor.getBoundingClientRect();
            if (rect.top < box.top - 0.5 || rect.bottom > box.bottom + 0.5 || rect.left < box.left - 0.5 || rect.right > box.right + 0.5) return true;
        }
        return false;
    }

    function readingClipAncestors(reading: HTMLElement): string[] {
        const rect = reading.getBoundingClientRect();
        const clipped: string[] = [];
        for (let ancestor = reading.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            if (![style.overflow, style.overflowX, style.overflowY].some(value => value === 'hidden' || value === 'clip')) continue;
            const box = ancestor.getBoundingClientRect();
            if (rect.top < box.top - 0.5 || rect.bottom > box.bottom + 0.5 || rect.left < box.left - 0.5 || rect.right > box.right + 0.5) clipped.push(ancestor.id || ancestor.className || ancestor.tagName);
        }
        return clipped;
    }

    function readingBaseOverlap(root: Element): number {
        const bases = [...root.querySelectorAll<HTMLElement>('.jpdb-reader-ruby-base')].map(base => base.getBoundingClientRect());
        let overlap = 0;
        for (const reading of root.querySelectorAll<HTMLElement>('rt,.jpdb-reader-detached-furi')) {
            const r = reading.getBoundingClientRect();
            for (const b of bases) {
                const width = Math.min(r.right, b.right) - Math.max(r.left, b.left);
                const height = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
                if (width > 0.5 && height > 0.5) overlap += 1;
            }
        }
        return overlap;
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

    function paintMiniGuideLabel(host: HTMLElement): void {
        const target = collectTextTargetsIn(host, 40, false).find(candidate => candidate.text.trim() === MINI_TEXT);
        if (!target) throw new Error('mini-guide target not collected');
        applyTokensToScanTarget(target, [
            {
                card: card(MINI_TEXT, 'とうろくチャンネル'), start: 0, end: MINI_TEXT.length,
                length: MINI_TEXT.length,
                rubies: [{ text: 'とうろくチャンネル', start: 0, end: MINI_TEXT.length, length: MINI_TEXT.length }],
                pitchClass: 'heiban', sentence: MINI_TEXT,
            },
        ], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });
        makeRoomForRubyInCroppedRows(document);
    }

    Object.assign(window, {
        runMiniGuideProbe() {
            setRubyDistortsConstrainedRowsForTest(null);
            removeNonDestructiveScanMirrors(document);
            const host = document.querySelector('mini-guide-probe')!.shadowRoot!.getElementById('mini-label')!;
            host.textContent = MINI_TEXT;
            const before = host.getBoundingClientRect();
            paintMiniGuideLabel(host);
            const mirror = host.querySelector<HTMLElement>('.jpdb-reader-additive-text-mirror');
            const reading = mirror?.querySelector<HTMLElement>('.jpdb-reader-detached-furi') ?? null;
            const after = host.getBoundingClientRect();
            return {
                mirror: Boolean(mirror),
                readingCount: mirror?.querySelectorAll('.jpdb-reader-detached-furi').length ?? 0,
                readingClipped: reading ? readingIsClipped(reading) : true,
                readingBaseOverlap: mirror ? readingBaseOverlap(mirror) : -1,
                overflow: getComputedStyle(host).overflow,
                overflowStamp: host.dataset.yomuDetachedReadingOverflow ?? '',
                widthGrowth: after.width - before.width,
                heightGrowth: after.height - before.height,
                nativeText: host.childNodes[0]?.textContent ?? '',
            };
        },
        runShowMoreProbe() {
            setRubyDistortsConstrainedRowsForTest(null);
            removeNonDestructiveScanMirrors(document);
            const host = document.getElementById('more')!;
            host.textContent = MORE_TEXT;
            paintMore(host);
            const rt = host.querySelector<HTMLElement>('rt,.jpdb-reader-detached-furi');
            if (!rt) return { rtCount: 0, rtTopClip: 0, mirror: Boolean(host.querySelector('.jpdb-reader-text-mirror')) };
            const clipBox = document.getElementById('more-row')!;
            const rtRect = rt.getBoundingClientRect();
            return {
                rtCount: host.querySelectorAll('rt,.jpdb-reader-detached-furi').length,
                mirror: Boolean(host.querySelector('.jpdb-reader-text-mirror')),
                rtTopClip: clipBox.getBoundingClientRect().top - rtRect.top,
                rtHeight: rtRect.height,
                readingClipped: readingIsClipped(rt),
                readingBaseOverlap: readingBaseOverlap(host),
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
            const rts = [...scope.querySelectorAll<HTMLElement>('rt,.jpdb-reader-detached-furi')];
            if (!rts.length) return { rtCount: 0, rtTopClip: 0 };
            const rtTop = Math.min(...rts.map(rt => rt.getBoundingClientRect().top));
            return {
                rtCount: rts.length,
                rtTopClip: row.getBoundingClientRect().top - rtTop,
                readingClipped: rts.some(readingIsClipped),
                readingClipAncestors: rts.flatMap(readingClipAncestors),
                readingBaseOverlap: readingBaseOverlap(scope),
            };
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
            const rts = [...scope.querySelectorAll<HTMLElement>('rt,.jpdb-reader-detached-furi')];
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
                readingClipped: rts.some(readingIsClipped),
                readingClipAncestors: rts.flatMap(readingClipAncestors),
                readingBaseOverlap: readingBaseOverlap(scope),
                visiblePitchUnderlines: words.filter(word => {
                    const color = getComputedStyle(word, '::after').borderBottomColor;
                    return color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)';
                }).length,
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
</style></head><body class="jpdb-reader-word-underline-pitch">
<div id="chip"><div id="chip-label"></div></div>
<div id="tab-row" style="overflow: hidden; height: 32px; margin-top: 24px; background: #f5f5f5;">
  <div id="tab-label" style="font-size: 14px; line-height: 32px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div>
</div>
<div id="more-row" style="overflow: hidden; height: 22px; margin-top: 24px; background: rgba(0,0,0,0.08); border-radius: 4px; padding: 0 8px;">
  <div id="more" style="font-size: 14px; line-height: 22px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">さらに表示</div>
</div>
<mini-guide-probe></mini-guide-probe>
<script>
customElements.define('mini-guide-probe', class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = '<a id="mini-label" href="#subscriptions" style="box-sizing:border-box;position:relative;display:flow-root;width:64px;height:16px;margin-top:24px;overflow:hidden;font-size:10px;line-height:16px;white-space:nowrap">登録チャンネル</a>';
  }
});
</script>
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
        if (result.rtCount !== 0) fail(`${name}: compact control reserved a reading lane`, result);
        if (result.intraWordGap > MAX_GAP_PX) fail(`${name}: intra-word gap (新 | しい) too wide`, result);
        if (result.interWordGap > MAX_GAP_PX) fail(`${name}: inter-word gap (しい | 順) too wide`, result);
        if (result.visiblePitchUnderlines < result.words) fail(`${name}: compact annotation lost pitch underline`, result);
        const more = await page.evaluate(() => window.runShowMoreProbe());
        console.log(`${name} show-more:`, JSON.stringify(more));
        if (more.rtCount !== 0) fail(`${name}: show-more control reserved a reading lane`, more);
        const tab = await page.evaluate(() => window.runTabProbe());
        console.log(`${name} tab:`, JSON.stringify(tab));
        if (tab.rtCount !== 0) fail(`${name}: tab control reserved a reading lane`, tab);
        const mini = await page.evaluate(() => window.runMiniGuideProbe());
        console.log(`${name} mini-guide:`, JSON.stringify(mini));
        if (!mini.mirror || mini.readingCount < 1) fail(`${name}: mini-guide reading missing`, mini);
        else if (mini.readingClipped) fail(`${name}: mini-guide reading is clipped`, mini);
        else if (mini.readingBaseOverlap > 0) fail(`${name}: mini-guide reading overlaps base text`, mini);
        if (Math.abs(mini.widthGrowth) > 0.5 || Math.abs(mini.heightGrowth) > 0.5) fail(`${name}: mini-guide geometry changed`, mini);
        if (!mini.nativeText.includes('登録チャンネル')) fail(`${name}: mini-guide native fallback was removed`, mini);
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
