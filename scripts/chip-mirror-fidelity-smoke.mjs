#!/usr/bin/env node
// Compact-control fidelity smoke: fixed-height chips/labels must keep their
// authored width and height while detached furigana remains visible. A reading
// wider than its base must not open intra-word gaps (新しい順 rendering as
// "新 しい 順") or reintroduce an in-flow ruby lane. Chromium AND WebKit.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CSS_PATH = path.join(ROOT, 'dist', 'yomu.css');
const READER_WORDS_CSS_PATH = path.join(ROOT, 'src', 'reader', 'styles', 'reader-words-ocr.css');
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
    import { CRITICAL_READER_CSS } from ${JSON.stringify(path.join(ROOT, 'src/reader/styles/index.ts'))};
    import type { JPDBCard, JPDBToken } from ${JSON.stringify(path.join(ROOT, 'src/reader/app/types.ts'))};

    const TEXT = '新しい順';
    const ASK_TEXT = '質問する';
    const VIEW_TEXT = '視聴';
    const DESCRIPTION_TEXT = [
        '新しいSiri AIとiOS 27について知っておくべきことのすべて',
        '父の日に向けて最大40%オフ！6月21日まで！',
        'MKBHD グッズ',
        'MKBHD イントロ曲のプレイリスト',
        '質問する',
    ].join('\\n\\n');
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

    function paintSingleWord(host: HTMLElement, sentence: string, spelling: string, reading: string): void {
        const target = collectTextTargetsIn(host, 40, false).find(candidate => candidate.text.trim() === sentence);
        if (!target) throw new Error('single-word target not collected: ' + sentence);
        const start = sentence.indexOf(spelling);
        applyTokensToScanTarget({ ...target, nonDestructive: true }, [{
            card: card(spelling, reading), start, end: start + spelling.length, length: spelling.length,
            rubies: [{ text: reading, start, end: start + spelling.length, length: spelling.length }],
            pitchClass: 'heiban', sentence,
        }], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });
        makeRoomForRubyInCroppedRows(document);
    }

    function paintDescriptionPreview(host: HTMLElement): void {
        const node = host.firstChild as Text | null;
        if (!node || node.nodeType !== Node.TEXT_NODE || node.data !== DESCRIPTION_TEXT) {
            throw new Error('description preview native text missing');
        }
        const questionStart = DESCRIPTION_TEXT.indexOf('質問');
        applyTokensToScanTarget({
            node,
            parent: host,
            text: DESCRIPTION_TEXT,
            nonDestructive: true,
            decoration: 'content-ruby',
        }, [
            {
                card: card('新しい', 'あたらしい'), start: 0, end: 3, length: 3,
                rubies: [{ text: 'あたら', start: 0, end: 1, length: 1 }],
                pitchClass: 'nakadaka', sentence: DESCRIPTION_TEXT,
            },
            {
                card: card('質問', 'しつもん'), start: questionStart, end: questionStart + 2, length: 2,
                rubies: [{ text: 'しつもん', start: questionStart, end: questionStart + 2, length: 2 }],
                pitchClass: 'heiban', sentence: DESCRIPTION_TEXT,
            },
        ], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });
        makeRoomForRubyInCroppedRows(document);
    }

    function rectanglesOverlap(left: DOMRect, right: DOMRect): boolean {
        return Math.min(left.right, right.right) - Math.max(left.left, right.left) > 0.5
            && Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 0.5;
    }

    function paintPlainWord(host: HTMLElement, text: string, spelling: string, reading: string, pitchClass: JPDBToken['pitchClass']): void {
        const target = collectTextTargetsIn(host, 40, false).find(candidate => candidate.text.trim() === text);
        if (!target) throw new Error('critical-css target not collected: ' + text);
        const start = text.indexOf(spelling);
        applyTokensToScanTarget({ ...target, nonDestructive: true }, [{
            card: card(spelling, reading), start, end: start + spelling.length, length: spelling.length,
            rubies: [{ text: reading, start, end: start + spelling.length, length: spelling.length }],
            pitchClass, sentence: text,
        }], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });
        makeRoomForRubyInCroppedRows(document);
    }

    function pitchWordSamples(scope: Element): { afterContent: string; decorationColor: string; rect: DOMRect }[] {
        return [...scope.querySelectorAll<HTMLElement>('.jpdb-reader-word')].map(word => ({
            afterContent: getComputedStyle(word, '::after').content,
            decorationColor: getComputedStyle(word).textDecorationColor,
            rect: word.getBoundingClientRect(),
        }));
    }

    Object.assign(window, {
        CRITICAL_READER_CSS_TEXT: CRITICAL_READER_CSS,
        // These two probes exercise CRITICAL_READER_CSS in isolation (no
        // dist/yomu.css, no reader-words-ocr.css) so the pitch-disable rules
        // it alone must carry — ::after suppression and native underline
        // color — are proven on the inline fallback sheet, not just the full
        // stylesheet the other probes above load.
        runCriticalCssDescriptionProbe() {
            setRubyDistortsConstrainedRowsForTest(null);
            removeNonDestructiveScanMirrors(document);
            const line1 = document.getElementById('crit-desc-line1')!;
            const line2 = document.getElementById('crit-desc-line2')!;
            paintPlainWord(line1, line1.textContent ?? '', '新しい', 'あたらしい', 'nakadaka');
            paintPlainWord(line2, line2.textContent ?? '', '質問', 'しつもん', 'heiban');
            const words1 = pitchWordSamples(line1);
            const words2 = pitchWordSamples(line2);
            const line2Rect = line2.getBoundingClientRect();
            return {
                words1,
                words2,
                line1WordCount: words1.length,
                line2WordCount: words2.length,
                line1ToLine2Clearance: words1.length ? line2Rect.top - Math.max(...words1.map(w => w.rect.bottom)) : -1,
            };
        },
        runCriticalCssTitleProbe() {
            setRubyDistortsConstrainedRowsForTest(null);
            removeNonDestructiveScanMirrors(document);
            const title = document.getElementById('crit-title')!;
            const metadata = document.getElementById('crit-metadata')!;
            paintPlainWord(title, title.textContent ?? '', '新しい', 'あたらしい', 'nakadaka');
            const words = pitchWordSamples(title);
            const metadataRect = metadata.getBoundingClientRect();
            return {
                words,
                wordCount: words.length,
                titleToMetadataClearance: words.length ? metadataRect.top - Math.max(...words.map(w => w.rect.bottom)) : -1,
            };
        },
        runYouTubeDescriptionClipProbe() {
            setRubyDistortsConstrainedRowsForTest(null);
            removeNonDestructiveScanMirrors(document);
            const panel = document.getElementById('structured-description')!;
            const preview = document.getElementById('collapsed-string')!;
            const host = document.getElementById('description-host')!;
            const summary = document.getElementById('description-summary')!;
            host.textContent = DESCRIPTION_TEXT;
            const previewBefore = preview.getBoundingClientRect();
            const summaryBefore = summary.getBoundingClientRect();
            paintDescriptionPreview(host);

            // The real component keeps the panel mounted while disclosure
            // state changes. Reapplying after repeated hide/show cycles must
            // reuse one mirror rather than stack duplicate paint layers.
            const cycleMirrorCounts: number[] = [];
            for (let cycle = 0; cycle < 3; cycle += 1) {
                panel.hidden = true;
                panel.hidden = false;
                paintDescriptionPreview(host);
                cycleMirrorCounts.push(host.querySelectorAll(':scope > .jpdb-reader-text-mirror').length);
            }

            const mirror = host.querySelector<HTMLElement>(':scope > .jpdb-reader-text-mirror');
            const words = mirror ? [...mirror.querySelectorAll<HTMLElement>('.jpdb-reader-word')] : [];
            const summaryAfter = summary.getBoundingClientRect();
            const visibleWords = words.filter(word => {
                const style = getComputedStyle(word);
                const rect = word.getBoundingClientRect();
                return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
            });
            const lateWord = words.find(word => word.textContent?.includes('質問')) ?? null;
            const mirrorStyle = mirror ? getComputedStyle(mirror) : null;
            return {
                additiveMirror: Boolean(mirror?.classList.contains('jpdb-reader-additive-text-mirror')),
                inlineRubyCount: mirror?.querySelectorAll('ruby,rt:not(.jpdb-reader-detached-furi)').length ?? -1,
                detachedReadingCount: mirror?.querySelectorAll('.jpdb-reader-detached-furi').length ?? 0,
                nativeHostVisible: getComputedStyle(host).visibility !== 'hidden',
                mirrorColor: mirrorStyle?.color ?? '',
                mirrorTextFill: mirrorStyle?.webkitTextFillColor ?? '',
                lateWordVisibility: lateWord ? getComputedStyle(lateWord).visibility : '',
                visibleWordSummaryOverlaps: visibleWords.filter(word => rectanglesOverlap(word.getBoundingClientRect(), summaryAfter)).length,
                previewHeightGrowth: preview.getBoundingClientRect().height - previewBefore.height,
                summaryTopShift: summaryAfter.top - summaryBefore.top,
                summaryHeightGrowth: summaryAfter.height - summaryBefore.height,
                previewOverflow: getComputedStyle(preview).overflow,
                previewClientHeight: preview.clientHeight,
                previewScrollHeight: preview.scrollHeight,
                mirrorMaxHeight: mirror?.style.maxHeight ?? '',
                mirrorCount: host.querySelectorAll(':scope > .jpdb-reader-text-mirror').length,
                cycleMirrorCounts,
            };
        },
        runYouTubeGeometryProbe() {
            setRubyDistortsConstrainedRowsForTest(null);
            removeNonDestructiveScanMirrors(document);
            const chip = document.getElementById('ask-chip')!;
            const label = document.getElementById('ask-label')!;
            label.textContent = ASK_TEXT;
            const nativeBefore = findTextNode(label, ASK_TEXT);
            const baseBefore = rectOfText(nativeBefore, 0, 2);
            const chipBefore = chip.getBoundingClientRect();
            paintSingleWord(label, ASK_TEXT, '質問', 'しつもん');
            const mirror = label.querySelector<HTMLElement>('.jpdb-reader-text-mirror');
            const word = mirror?.querySelector<HTMLElement>('.jpdb-reader-word') ?? null;
            const reading = mirror?.querySelector<HTMLElement>('.jpdb-reader-detached-furi') ?? null;
            const base = mirror?.querySelector<HTMLElement>('.jpdb-reader-ruby-base') ?? null;
            const nativeAfter = findTextNode(label, ASK_TEXT);
            const baseAfter = rectOfText(nativeAfter, 0, 2);
            const chipAfter = chip.getBoundingClientRect();

            const metadata = document.getElementById('metadata-row')!;
            metadata.textContent = VIEW_TEXT;
            const metadataBefore = metadata.getBoundingClientRect();
            paintSingleWord(metadata, VIEW_TEXT, VIEW_TEXT, 'しちょう');
            const metadataReading = metadata.querySelector<HTMLElement>('.jpdb-reader-detached-furi');
            const metadataAfter = metadata.getBoundingClientRect();
            return {
                additiveMirror: Boolean(mirror?.classList.contains('jpdb-reader-additive-text-mirror')),
                inlineRubyCount: mirror?.querySelectorAll('ruby,rt:not(.jpdb-reader-detached-furi)').length ?? -1,
                detachedReadingCount: mirror?.querySelectorAll('.jpdb-reader-detached-furi').length ?? 0,
                actionReadingHiddenReason: reading?.dataset.yomuDetachedReadingHidden ?? '',
                actionReadingDisplay: reading ? getComputedStyle(reading).display : '',
                nativeBaseCenterDelta: (baseAfter.top + baseAfter.bottom - baseBefore.top - baseBefore.bottom) / 2,
                chipWidthGrowth: chipAfter.width - chipBefore.width,
                chipHeightGrowth: chipAfter.height - chipBefore.height,
                readingBaseClearance: reading && base ? base.getBoundingClientRect().top - reading.getBoundingClientRect().bottom : -1,
                nativeUnderline: word ? getComputedStyle(word).textDecorationColor : '',
                pseudoContent: word ? getComputedStyle(word, '::after').content : '',
                underlineToChipBottom: word ? chipAfter.bottom - word.getBoundingClientRect().bottom : -1,
                metadataReadingRetained: Boolean(metadataReading),
                metadataReadingHiddenReason: metadataReading?.dataset.yomuDetachedReadingHidden ?? '',
                metadataHeightGrowth: metadataAfter.height - metadataBefore.height,
            };
        },
        runShowMoreProbe() {
            setRubyDistortsConstrainedRowsForTest(null);
            removeNonDestructiveScanMirrors(document);
            const host = document.getElementById('more')!;
            host.textContent = MORE_TEXT;
            const before = host.getBoundingClientRect();
            paintMore(host);
            const rt = host.querySelector<HTMLElement>('rt,.jpdb-reader-detached-furi');
            if (!rt) return { rtCount: 0, rtTopClip: 0, mirror: Boolean(host.querySelector('.jpdb-reader-text-mirror')) };
            const clipBox = document.getElementById('more-row')!;
            const rtRect = rt.getBoundingClientRect();
            const after = host.getBoundingClientRect();
            return {
                rtCount: host.querySelectorAll('rt,.jpdb-reader-detached-furi').length,
                inlineRubyCount: host.querySelectorAll('ruby,rt:not(.jpdb-reader-detached-furi)').length,
                detachedReadingCount: host.querySelectorAll('.jpdb-reader-detached-furi').length,
                mirror: Boolean(host.querySelector('.jpdb-reader-text-mirror')),
                rtTopClip: clipBox.getBoundingClientRect().top - rtRect.top,
                rtHeight: rtRect.height,
                readingClipped: readingIsClipped(rt),
                readingBaseOverlap: readingBaseOverlap(host),
                widthGrowth: after.width - before.width,
                heightGrowth: after.height - before.height,
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
            const before = label.getBoundingClientRect();
            paintLabel(label);
            const scope = label.querySelector('.jpdb-reader-text-mirror') ?? label;
            const rts = [...scope.querySelectorAll<HTMLElement>('rt,.jpdb-reader-detached-furi')];
            if (!rts.length) return { rtCount: 0, rtTopClip: 0 };
            const rtTop = Math.min(...rts.map(rt => rt.getBoundingClientRect().top));
            const after = label.getBoundingClientRect();
            return {
                rtCount: rts.length,
                inlineRubyCount: scope.querySelectorAll('ruby,rt:not(.jpdb-reader-detached-furi)').length,
                detachedReadingCount: scope.querySelectorAll('.jpdb-reader-detached-furi').length,
                rtTopClip: row.getBoundingClientRect().top - rtTop,
                readingClipped: rts.some(readingIsClipped),
                readingClipAncestors: rts.flatMap(readingClipAncestors),
                readingBaseOverlap: readingBaseOverlap(scope),
                widthGrowth: after.width - before.width,
                heightGrowth: after.height - before.height,
            };
        },
        runChipMirrorProbe() {
            setRubyDistortsConstrainedRowsForTest(null);
            removeNonDestructiveScanMirrors(document);
            const chip = document.getElementById('chip')!;
            const label = document.getElementById('chip-label')!;
            label.textContent = TEXT;
            const chipBefore = chip.getBoundingClientRect();
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
            const chipAfter = chip.getBoundingClientRect();
            return {
                mirror: Boolean(mirror),
                intraWordGap: rectShii.left - rectShin.right,
                interWordGap: rectJun.left - rectShii.right,
                rtTopClip: chipRect.top - rtTop,
                widthGrowth: decoratedWidth - plainWidth,
                plainWidth,
                words: words.length,
                rtCount: rts.length,
                inlineRubyCount: scope.querySelectorAll('ruby,rt:not(.jpdb-reader-detached-furi)').length,
                detachedReadingCount: scope.querySelectorAll('.jpdb-reader-detached-furi').length,
                readingClipped: rts.some(readingIsClipped),
                readingClipAncestors: rts.flatMap(readingClipAncestors),
                readingBaseOverlap: readingBaseOverlap(scope),
                chipWidthGrowth: chipAfter.width - chipBefore.width,
                chipHeightGrowth: chipAfter.height - chipBefore.height,
                visiblePitchUnderlines: words.filter(word => {
                    const color = getComputedStyle(word, '::after').borderBottomColor;
                    return color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)';
                }).length,
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
    define: { __YOMU_VERSION__: JSON.stringify('critical-css-smoke') },
    logLevel: 'silent',
});

const FIXTURE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
body { font: 14px/1.4 Roboto, sans-serif; width: 400px; margin: 40px; }
#chip { display: inline-flex; align-items: center; height: 32px; padding: 0 12px; border-radius: 8px;
        background: rgba(0,0,0,0.05); overflow: hidden; }
#chip-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; line-height: 20px; }
</style></head><body class="jpdb-reader-word-underline-pitch">
<div id="chip" role="button"><div id="chip-label"></div></div>
<div id="tab-row" style="overflow: hidden; height: 32px; margin-top: 24px; background: #f5f5f5;">
  <div id="tab-label" role="tab" style="font-size: 14px; line-height: 32px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div>
</div>
<div id="more-row" style="overflow: hidden; height: 22px; margin-top: 24px; background: rgba(0,0,0,0.08); border-radius: 4px; padding: 0 8px;">
  <div id="more" role="button" style="font-size: 14px; line-height: 22px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">さらに表示</div>
</div>
<ytm-slim-video-metadata-section-renderer>
  <ytm-button-renderer><button id="ask-chip" style="box-sizing:border-box;display:inline-flex;align-items:center;height:48px;padding:0 18px;border:0;border-radius:24px;overflow:visible;font:600 16px/20px Roboto,sans-serif"><yt-formatted-string id="ask-label">質問する</yt-formatted-string></button></ytm-button-renderer>
</ytm-slim-video-metadata-section-renderer>
<div id="metadata-stack" style="margin-top:20px;font:14px/16px Roboto,sans-serif">
  <div id="foreign-line" style="height:16px">チャンネル</div>
  <yt-formatted-string id="metadata-row" class="metadata-text" style="display:block;height:16px;overflow:visible">視聴</yt-formatted-string>
</div>
<ytm-structured-description-content-renderer id="structured-description" style="display:block;width:256px;margin-top:24px">
  <ytm-expandable-video-description-body-renderer style="display:block;box-sizing:border-box;width:232px;margin:0 12px;padding:12px">
    <div id="collapsed-string-container" style="width:208px;height:112px;white-space:pre-wrap">
      <div id="collapsed-string" style="width:208px;height:112px;max-height:112px;overflow:hidden;white-space:pre-wrap;font:14px/16px Roboto,sans-serif">
        <span id="description-host" class="ytAttributedStringHost ytAttributedStringWhiteSpacePreWrap"></span>
      </div>
    </div>
  </ytm-expandable-video-description-body-renderer>
  <ytm-expandable-metadata-renderer id="description-summary" style="box-sizing:border-box;display:flex;align-items:center;width:232px;height:72px;margin:12px 12px 0;padding:12px 16px;background:#eee">
    <p style="height:20px;max-height:20px;overflow:hidden;line-height:20px;margin:0">Marques Brownlee shares initial thoughts on the 2026 conference.</p>
    <h3 style="margin:0 0 0 auto">概要</h3>
  </ytm-expandable-metadata-renderer>
</ytm-structured-description-content-renderer>
</body></html>`;

// A second, standalone page: only CRITICAL_READER_CSS is injected (no
// dist/yomu.css, no reader-words-ocr.css), proving the inline fallback sheet
// alone disables ::after and keeps the native underline visible on both a
// wrapped multiline description and a clamped two-line homepage-style title.
const CRIT_FIXTURE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
body {
  font: 14px/1.4 Roboto, sans-serif;
  width: 320px;
  margin: 24px;
  --jpdb-reader-pitch-heiban: #62d27d;
  --jpdb-reader-pitch-nakadaka: #ffd166;
}
#crit-desc-line1, #crit-desc-line2 { font-size: 14px; line-height: 20px; }
#crit-title-block { width: 240px; margin-top: 24px; }
#crit-title { font: 16px/20px Roboto, sans-serif; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
#crit-metadata { margin-top: 6px; font: 12px/16px Roboto, sans-serif; color: #606060; }
</style></head><body class="jpdb-reader-word-underline-pitch">
<div id="crit-desc-line1">新しいSiri AIとiOS 27について知っておくべきことのすべて</div>
<div id="crit-desc-line2">質問する内容について詳しく解説します</div>
<div id="crit-title-block">
  <div id="crit-title">MKBHDが解説する新しいSiri AIとiOS 27についての全知識と質問する内容についての詳細レビューまとめ</div>
  <div id="crit-metadata">1.2M回視聴・3日前</div>
</div>
</body></html>`;

let failed = false;
function fail(message, details) {
    console.error('FAIL:', message, JSON.stringify(details));
    failed = true;
}

function transparentPaint(value) {
    const normalized = String(value ?? '').replace(/\s+/g, '').toLowerCase();
    return normalized === 'transparent'
        || normalized === 'rgba(0,0,0,0)'
        || normalized.endsWith(',0)');
}

// A reading wider than its base may add at most ~2px of spacing around the
// base before the label visibly reads as "新 しい 順" (a plain 14px CJK glyph
// gap is 14px; anything beyond a couple px is a visible split).
const MAX_GAP_PX = 2.5;
const MAX_GEOMETRY_DELTA_PX = 0.5;

async function runEngine(name, browserType) {
    const browser = await browserType.launch({ headless: true });
    try {
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(90_000);
        await page.route('https://www.youtube.com/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FIXTURE }));
        await page.goto('https://www.youtube.com/chip-mirror-smoke', { waitUntil: 'domcontentloaded' });
        await page.addStyleTag({ content: readFileSync(CSS_PATH, 'utf8') });
        // Exercise the source policy without requiring this focused smoke to
        // rewrite generated distribution assets.
        await page.addStyleTag({ content: readFileSync(READER_WORDS_CSS_PATH, 'utf8') });
        await page.addScriptTag({ path: bundlePath });
        const result = await page.evaluate(() => window.runChipMirrorProbe());
        console.log(`${name} chip:`, JSON.stringify(result));
        if (result.detachedReadingCount < 1) fail(`${name}: compact control reading missing`, result);
        if (result.inlineRubyCount !== 0) fail(`${name}: compact control used an in-flow ruby lane`, result);
        if (Math.abs(result.chipWidthGrowth) > MAX_GEOMETRY_DELTA_PX || Math.abs(result.chipHeightGrowth) > MAX_GEOMETRY_DELTA_PX) fail(`${name}: compact control geometry changed`, result);
        if (result.readingClipped) fail(`${name}: compact control reading is clipped`, result);
        if (result.readingBaseOverlap > 0) fail(`${name}: compact control reading overlaps base text`, result);
        if (result.intraWordGap > MAX_GAP_PX) fail(`${name}: intra-word gap (新 | しい) too wide`, result);
        if (result.interWordGap > MAX_GAP_PX) fail(`${name}: inter-word gap (しい | 順) too wide`, result);
        if (result.visiblePitchUnderlines < result.words) fail(`${name}: compact annotation lost pitch underline`, result);
        const youtube = await page.evaluate(() => window.runYouTubeGeometryProbe());
        console.log(`${name} youtube geometry:`, JSON.stringify(youtube));
        if (!youtube.additiveMirror || youtube.inlineRubyCount !== 0 || youtube.detachedReadingCount < 1) fail(`${name}: YouTube action chip did not use detached additive rendering`, youtube);
        if (youtube.actionReadingHiddenReason || youtube.actionReadingDisplay === 'none') fail(`${name}: YouTube action chip hid a safe furigana lane`, youtube);
        if (Math.abs(youtube.nativeBaseCenterDelta) > MAX_GEOMETRY_DELTA_PX) fail(`${name}: YouTube action chip base moved vertically`, youtube);
        if (Math.abs(youtube.chipWidthGrowth) > MAX_GEOMETRY_DELTA_PX || Math.abs(youtube.chipHeightGrowth) > MAX_GEOMETRY_DELTA_PX) fail(`${name}: YouTube action chip geometry changed`, youtube);
        // Font rasterisation can round the intended detached lane to one CSS
        // pixel in WebKit/Linux. The invariant is visible separation with no
        // overlap, not an engine-specific 2px measurement.
        if (youtube.readingBaseClearance < 0.5) fail(`${name}: YouTube action chip furigana overlaps its base`, youtube);
        if (!youtube.nativeUnderline || youtube.nativeUnderline === 'transparent' || youtube.nativeUnderline === 'rgba(0, 0, 0, 0)' || youtube.pseudoContent !== 'none') fail(`${name}: YouTube mirror pitch underline is not glyph-anchored native decoration`, youtube);
        if (youtube.underlineToChipBottom < 4) fail(`${name}: YouTube pitch underline fell to the chip edge`, youtube);
        if (!youtube.metadataReadingRetained || youtube.metadataReadingHiddenReason !== 'unsafe-lane') fail(`${name}: close metadata furigana was not safety-culled with 3px clearance`, youtube);
        if (Math.abs(youtube.metadataHeightGrowth) > MAX_GEOMETRY_DELTA_PX) fail(`${name}: metadata safety clearance grew its host row`, youtube);
        const description = await page.evaluate(() => window.runYouTubeDescriptionClipProbe());
        console.log(`${name} youtube description:`, JSON.stringify(description));
        if (!description.additiveMirror || description.inlineRubyCount !== 0 || description.detachedReadingCount < 1) fail(`${name}: truncated description did not use detached additive rendering`, description);
        if (!description.nativeHostVisible) fail(`${name}: truncated description lost its native fallback text`, description);
        if (!transparentPaint(description.mirrorColor) || !transparentPaint(description.mirrorTextFill)) fail(`${name}: additive description mirror painted a duplicate base copy`, description);
        if (description.lateWordVisibility !== 'hidden') fail(`${name}: off-clip description word remained paintable`, description);
        if (description.visibleWordSummaryOverlaps !== 0) fail(`${name}: description annotation overlapped its summary sibling`, description);
        if (Math.abs(description.previewHeightGrowth) > MAX_GEOMETRY_DELTA_PX || Math.abs(description.summaryTopShift) > MAX_GEOMETRY_DELTA_PX || Math.abs(description.summaryHeightGrowth) > MAX_GEOMETRY_DELTA_PX) fail(`${name}: expanded-description or summary geometry changed`, description);
        if (description.previewOverflow !== 'hidden' || description.previewClientHeight !== 112 || description.previewScrollHeight <= description.previewClientHeight || description.mirrorMaxHeight !== '112px') fail(`${name}: authored 112px description clip was not preserved`, description);
        if (description.mirrorCount !== 1 || description.cycleMirrorCounts.some(count => count !== 1)) fail(`${name}: repeated description disclosure stacked mirrors`, description);
        const more = await page.evaluate(() => window.runShowMoreProbe());
        console.log(`${name} show-more:`, JSON.stringify(more));
        if (more.detachedReadingCount < 1) fail(`${name}: show-more reading missing`, more);
        if (more.inlineRubyCount !== 0) fail(`${name}: show-more used an in-flow ruby lane`, more);
        if (Math.abs(more.widthGrowth) > MAX_GEOMETRY_DELTA_PX || Math.abs(more.heightGrowth) > MAX_GEOMETRY_DELTA_PX) fail(`${name}: show-more geometry changed`, more);
        if (more.readingClipped) fail(`${name}: show-more reading is clipped`, more);
        if (more.readingBaseOverlap > 0) fail(`${name}: show-more reading overlaps base text`, more);
        const tab = await page.evaluate(() => window.runTabProbe());
        console.log(`${name} tab:`, JSON.stringify(tab));
        if (tab.detachedReadingCount < 1) fail(`${name}: tab reading missing`, tab);
        if (tab.inlineRubyCount !== 0) fail(`${name}: tab used an in-flow ruby lane`, tab);
        if (Math.abs(tab.widthGrowth) > MAX_GEOMETRY_DELTA_PX || Math.abs(tab.heightGrowth) > MAX_GEOMETRY_DELTA_PX) fail(`${name}: tab geometry changed`, tab);
        if (tab.readingClipped) fail(`${name}: tab reading is clipped`, tab);
        if (tab.readingBaseOverlap > 0) fail(`${name}: tab reading overlaps base text`, tab);

        const criticalPage = await browser.newPage();
        try {
            criticalPage.setDefaultNavigationTimeout(90_000);
            await criticalPage.route('https://www.youtube.com/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: CRIT_FIXTURE }));
            await criticalPage.goto('https://www.youtube.com/critical-css-smoke', { waitUntil: 'domcontentloaded' });
            await criticalPage.addScriptTag({ path: bundlePath });
            const criticalCss = await criticalPage.evaluate(() => window.CRITICAL_READER_CSS_TEXT);
            await criticalPage.addStyleTag({ content: criticalCss });

            const descCritical = await criticalPage.evaluate(() => window.runCriticalCssDescriptionProbe());
            console.log(`${name} critical-css description:`, JSON.stringify(descCritical));
            if (descCritical.line1WordCount < 1 || descCritical.line2WordCount < 1) fail(`${name}: critical-css description pitch words missing`, descCritical);
            for (const word of [...descCritical.words1, ...descCritical.words2]) {
                if (word.afterContent !== 'none') fail(`${name}: critical-css description pitch ::after was not disabled`, word);
                if (transparentPaint(word.decorationColor)) fail(`${name}: critical-css description pitch underline is not visible`, word);
            }
            if (descCritical.line1ToLine2Clearance <= 0) fail(`${name}: critical-css description pitch underline crowds the following line`, descCritical);

            const titleCritical = await criticalPage.evaluate(() => window.runCriticalCssTitleProbe());
            console.log(`${name} critical-css title:`, JSON.stringify(titleCritical));
            if (titleCritical.wordCount < 1) fail(`${name}: critical-css title pitch word missing`, titleCritical);
            for (const word of titleCritical.words) {
                if (word.afterContent !== 'none') fail(`${name}: critical-css title pitch ::after was not disabled`, word);
                if (transparentPaint(word.decorationColor)) fail(`${name}: critical-css title pitch underline is not visible`, word);
            }
            if (titleCritical.titleToMetadataClearance <= 0) fail(`${name}: critical-css title pitch underline crowds the metadata row`, titleCritical);
        } finally {
            await criticalPage.close();
        }
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
