#!/usr/bin/env node
// Compact-control fidelity smoke: fixed-height chips/labels must keep their
// authored width, height, clipping, and scroll geometry while reader-owned
// projected furigana remains visible. A reading wider than its base must not
// open intra-word gaps (新しい順 rendering as "新 しい 順") or reintroduce an
// in-flow ruby lane. Chromium AND WebKit.
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
    import ${JSON.stringify(path.join(ROOT, 'src/reader/companions/annotations.ts'))};
    import { collectScanTargets } from ${JSON.stringify(path.join(ROOT, 'src/reader/app/site-parsers.ts'))};
    import {
        applyTokensToScanTarget,
        collectFragmentTextTargetsIn,
        collectTextTargetsIn,
        documentPortalReaderWordScopeForSource,
        healTextMirrorPageVisibility,
        makeRoomForRubyInCroppedRows,
        projectAdditiveTextMirrors,
        removeNonDestructiveScanMirrors,
        resetDecorationPolicyCachesForTest,
        setRubyDistortsConstrainedRowsForTest,
        type ScanTextTarget,
    } from ${JSON.stringify(path.join(ROOT, 'src/reader/dom/index.ts'))};
    import { DEFAULT_SETTINGS } from ${JSON.stringify(path.join(ROOT, 'src/reader/settings/index.ts'))};
    import { CRITICAL_READER_CSS } from ${JSON.stringify(path.join(ROOT, 'src/reader/styles/index.ts'))};
    import { setRenderedWordPitchComponents } from ${JSON.stringify(path.join(ROOT, 'src/reader/dom/rendered-word-state.ts'))};
    import type { JPDBCard, JPDBToken } from ${JSON.stringify(path.join(ROOT, 'src/reader/app/types.ts'))};

    const TEXT = '新しい順';
    const ASK_TEXT = '質問する';
    const VIEW_TEXT = '視聴';
    const YOUTUBE_SHELF_MORE_SEGMENTS = ['+ 他 ', '3', ' 件'];
    const YOUTUBE_SHELF_MORE_SELECTOR = 'ytd-shelf-renderer > ytd-vertical-list-renderer > #more > yt-formatted-string[role="button"]';
    const DESCRIPTION_TEXT = [
        '新しいSiri AIとiOS 27について知っておくべきことのすべて',
        '父の日に向けて最大40%オフ！6月21日まで！',
        'MKBHD グッズ',
        'MKBHD イントロ曲のプレイリスト',
        '質問する',
    ].join('\\n\\n');
    const EXPANDED_DESCRIPTION_TEXT = 'いつも見てくれてありがとうございます\\n動画でもお話ししたとおり、音声のポッドキャストを毎週配信します。';
    const NATURAL_WRAP_DESCRIPTION_TEXT = 'いつも見てくれてありがとうございます動画でもお話ししたとおり、音声のポッドキャストを毎週配信します。';
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

    function paintLabel(label: HTMLElement, nonDestructive = false): void {
        const target = collectTextTargetsIn(label, 40, false).find(candidate => candidate.text.trim() === TEXT);
        if (!target) throw new Error('target not collected');
        applyTokensToScanTarget({ ...target, nonDestructive: nonDestructive || target.nonDestructive }, tokens(), { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });
        makeRoomForRubyInCroppedRows(document);
        projectAdditiveTextMirrors(document);
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

    function visibleElement(element: HTMLElement): boolean {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
            && style.visibility !== 'hidden'
            && rect.width > 0
            && rect.height > 0;
    }

    // The pitch underline lands on a different surface per rendering path: an
    // ordinary or mirrored word paints through its own ::after, while a
    // source-projected word disables that pseudo and paints the same channel on
    // each exact Range fragment. A probe that reads the word's inherited
    // text-decoration-color instead reports the page's text colour whatever the
    // pitch state is, so it can never see the underline go.
    function pitchUnderlineSurfaces(scope: ParentNode): HTMLElement[] {
        return [...scope.querySelectorAll<HTMLElement>('.jpdb-reader-word')].flatMap(word => {
            const fragments = [...word.querySelectorAll<HTMLElement>('.jpdb-reader-source-fragment')];
            return fragments.length ? fragments : [word];
        });
    }

    function paintsPitchUnderline(surface: HTMLElement): boolean {
        const underline = getComputedStyle(surface, '::after');
        if (underline.content === 'none' || underline.visibility === 'hidden') return false;
        // A single-pattern word paints a border colour; a compound word paints
        // its per-mora gradient as a background image on the same lane.
        const color = underline.borderBottomColor;
        return (Boolean(color) && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)')
            || underline.backgroundImage !== 'none';
    }

    function projectedReadingAssociations(root: ParentNode): Array<{
        source: HTMLElement;
        clone: HTMLElement;
        base: HTMLElement;
        sourceSurface: string;
        sourceRange: string;
        centerDelta: number;
        baselineDelta: number;
    }> {
        const sources = [...root.querySelectorAll<HTMLElement>(
            '.jpdb-reader-detached-furi:not([data-yomu-projected-reading="true"])',
        )];
        const available = new Set(
            [...document.querySelectorAll<HTMLElement>('[data-yomu-projected-reading="true"]')]
                .filter(visibleElement),
        );
        const associations = [];
        for (const source of sources) {
            const base = source.closest<HTMLElement>('.jpdb-reader-detached-ruby')
                ?? source.closest<HTMLElement>('.jpdb-reader-word');
            if (!base) continue;
            const baseRect = base.getBoundingClientRect();
            const candidates = [...available]
                .filter(clone => clone.textContent === source.textContent)
                .map(clone => {
                    const rect = clone.getBoundingClientRect();
                    return {
                        clone,
                        score: Math.abs((rect.left + rect.right - baseRect.left - baseRect.right) / 2)
                            + Math.abs(rect.bottom - baseRect.top),
                    };
                })
                .sort((left, right) => left.score - right.score);
            const clone = candidates[0]?.clone;
            if (!clone) continue;
            available.delete(clone);
            const cloneRect = clone.getBoundingClientRect();
            const word = source.closest<HTMLElement>('.jpdb-reader-word');
            associations.push({
                source,
                clone,
                base,
                sourceSurface: word?.dataset.surface ?? word?.dataset.expression ?? '',
                sourceRange: \`\${word?.dataset.tokenStart ?? ''}:\${word?.dataset.tokenEnd ?? ''}\`,
                centerDelta: (cloneRect.left + cloneRect.right - baseRect.left - baseRect.right) / 2,
                baselineDelta: cloneRect.bottom - baseRect.top,
            });
        }
        return associations;
    }

    function projectedReadingFor(source: HTMLElement | null): HTMLElement | null {
        if (!source) return null;
        const owner = source.closest<HTMLElement>('.jpdb-reader-word') ?? source.parentElement;
        return owner
            ? projectedReadingAssociations(owner).find(association => association.source === source)?.clone ?? null
            : null;
    }

    function boxGeometry(element: HTMLElement) {
        return {
            overflow: getComputedStyle(element).overflow,
            inlineOverflow: element.style.getPropertyValue('overflow'),
            client: [element.clientWidth, element.clientHeight],
            scroll: [element.scrollWidth, element.scrollHeight],
        };
    }

    function rectGeometry(element: Element) {
        const rect = element.getBoundingClientRect();
        return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
        };
    }

    function nativeControlStyle(element: Element) {
        const style = getComputedStyle(element);
        return {
            display: style.display,
            position: style.position,
            visibility: style.visibility,
            opacity: style.opacity,
            overflow: style.overflow,
            whiteSpace: style.whiteSpace,
            font: style.font,
            lineHeight: style.lineHeight,
            color: style.color,
            textFill: style.webkitTextFillColor,
            textDecorationLine: style.textDecorationLine,
            textDecorationColor: style.textDecorationColor,
            backgroundColor: style.backgroundColor,
            backgroundImage: style.backgroundImage,
        };
    }

    function sortedAttributes(element: Element): string[] {
        return [...element.attributes]
            .map(attribute => attribute.name + '=' + attribute.value)
            .sort();
    }

    function youtubeShelfMoreSnapshot(shelf: HTMLElement, label: HTMLElement) {
        const more = label.parentElement!;
        return {
            text: label.textContent ?? '',
            html: label.innerHTML,
            shelfRect: rectGeometry(shelf),
            moreRect: rectGeometry(more),
            labelRect: rectGeometry(label),
            spanRects: [...label.children].map(rectGeometry),
            moreBox: boxGeometry(more),
            labelBox: boxGeometry(label),
            labelStyle: nativeControlStyle(label),
            spanStyles: [...label.children].map(nativeControlStyle),
            shelfAttributes: sortedAttributes(shelf),
            moreAttributes: sortedAttributes(more),
            labelAttributes: sortedAttributes(label),
        };
    }

    function rectGeometryDelta(before: ReturnType<typeof rectGeometry>, after: ReturnType<typeof rectGeometry>): number {
        return Math.max(
            Math.abs(before.left - after.left),
            Math.abs(before.top - after.top),
            Math.abs(before.width - after.width),
            Math.abs(before.height - after.height),
        );
    }

    function youtubeShelfMoreGeometryDelta(
        before: ReturnType<typeof youtubeShelfMoreSnapshot>,
        after: ReturnType<typeof youtubeShelfMoreSnapshot>,
    ): number {
        if (before.spanRects.length !== after.spanRects.length) return 1_000;
        return Math.max(
            rectGeometryDelta(before.shelfRect, after.shelfRect),
            rectGeometryDelta(before.moreRect, after.moreRect),
            rectGeometryDelta(before.labelRect, after.labelRect),
            ...after.spanRects.map((rect, index) => rectGeometryDelta(before.spanRects[index], rect)),
        );
    }

    function freshYouTubeShelfMoreChildren(): HTMLSpanElement[] {
        return YOUTUBE_SHELF_MORE_SEGMENTS.map(text => {
            const span = document.createElement('span');
            span.textContent = text;
            return span;
        });
    }

    function youtubeShelfMoreScanTargets(shelf: HTMLElement, label: HTMLElement) {
        const fragmentOptions = youtubeShelfFragmentOptions();
        return {
            shelfFragments: collectFragmentTextTargetsIn(shelf, 40, true, '', fragmentOptions)
                .map(target => target.text),
            labelFragments: collectFragmentTextTargetsIn(label, 40, true, '', fragmentOptions)
                .map(target => target.text),
            textTargets: collectTextTargetsIn(label, 40, true, { includeFormChrome: true })
                .map(target => target.text),
        };
    }

    function youtubeShelfFragmentOptions() {
        return {
            allowUiText: true,
            minLength: 1,
            includeUiChrome: true,
            includeFormChrome: true,
            includeTabChrome: true,
            includePlayerChrome: true,
            includePassiveInteractions: true,
            heading: true,
        };
    }

    function youtubeShelfMoreTarget(label: HTMLElement) {
        return collectFragmentTextTargetsIn(label, 40, true, '', youtubeShelfFragmentOptions())
            .find(target => target.text.includes('他') && target.text.includes('件'));
    }

    function scanTargetTouchesRoot(target: ScanTextTarget, root: HTMLElement): boolean {
        return root.contains(target.parent)
            || ('fragments' in target && target.fragments.some(fragment => {
                const parent = fragment.node.parentElement;
                return Boolean(parent && root.contains(parent));
            }));
    }

    function productionScanTargetsTouching(root: HTMLElement, targets?: ScanTextTarget[]): ScanTextTarget[] {
        const productionTargets = targets ?? collectScanTargets(800, location.href, { skipMirroredHosts: true });
        return productionTargets.filter(target => scanTargetTouchesRoot(target, root));
    }

    function productionScanTextsTouching(root: HTMLElement): string[] {
        return productionScanTargetsTouching(root).map(target => target.text);
    }

    const YOMU_ANNOTATION_SELECTOR = [
        '.jpdb-reader-word',
        '.jpdb-reader-text-mirror',
        '.jpdb-reader-source-fragment',
        '.jpdb-reader-detached-furi',
        'ruby',
        'rt',
        '[data-yomu-source-projected]',
    ].join(',');

    function sourceGlyphRect(root: Element, surface: string): DOMRect {
        const node = findTextNode(root, surface);
        const start = node.data.indexOf(surface);
        return rectOfText(node, start, start + surface.length);
    }

    function projectedReadingByExpression(expression: string): HTMLElement | null {
        return [...document.querySelectorAll<HTMLElement>('[data-yomu-projected-reading="true"]')]
            .find(reading => reading.dataset.yomuExpression === expression) ?? null;
    }

    function nextPaint(): Promise<void> {
        return new Promise(resolve => requestAnimationFrame(() => resolve()));
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
        let overlap = 0;
        for (const { clone, base } of projectedReadingAssociations(root)) {
            const reading = clone.getBoundingClientRect();
            const source = base.getBoundingClientRect();
            const width = Math.min(reading.right, source.right) - Math.max(reading.left, source.left);
            const height = Math.min(reading.bottom, source.bottom) - Math.max(reading.top, source.top);
            if (width > 0.5 && height > 0.5) overlap = Math.max(overlap, height);
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
        projectAdditiveTextMirrors(document);
    }

    function paintSingleWord(host: HTMLElement, sentence: string, spelling: string, reading: string): void {
        const target = collectTextTargetsIn(host, 40, false).find(candidate => candidate.text.trim() === sentence);
        if (!target) throw new Error('single-word target not collected: ' + sentence);
        paintSingleWordTarget(target, spelling, reading);
    }

    function paintSingleWordTarget(target: ScanTextTarget, spelling: string, reading: string): void {
        const start = target.text.indexOf(spelling);
        if (start < 0) throw new Error('single-word spelling not found in production target: ' + spelling);
        applyTokensToScanTarget({ ...target, nonDestructive: true }, [{
            card: card(spelling, reading), start, end: start + spelling.length, length: spelling.length,
            rubies: [{ text: reading, start, end: start + spelling.length, length: spelling.length }],
            pitchClass: 'heiban', sentence: target.text,
        }], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });
        makeRoomForRubyInCroppedRows(document);
        projectAdditiveTextMirrors(document);
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
        projectAdditiveTextMirrors(document);
    }

    async function nextFrame(): Promise<void> {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }

    async function expandedDescriptionProbe(hostId: string) {
        setRubyDistortsConstrainedRowsForTest(null);
        removeNonDestructiveScanMirrors(document);
        const host = document.getElementById(hostId)!;
        const text = hostId === 'natural-wrap-description-host'
            ? NATURAL_WRAP_DESCRIPTION_TEXT
            : EXPANDED_DESCRIPTION_TEXT;
        host.textContent = text;
        const node = host.firstChild as Text;
        const originalInlineLineHeight = host.style.lineHeight;
        const start = text.indexOf('動画');
        applyTokensToScanTarget({
            node,
            parent: host,
            text,
            nonDestructive: true,
            decoration: 'content-ruby',
            proseWrap: true,
        }, [{
            card: card('動画', 'どうが'), start, end: start + 2, length: 2,
            rubies: [{ text: 'どうが', start, end: start + 2, length: 2 }],
            pitchClass: 'heiban', sentence: text,
        }], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });
        projectAdditiveTextMirrors(document);
        await nextFrame();

        host.style.setProperty('height', originalInlineLineHeight);
        host.style.setProperty('max-height', originalInlineLineHeight);
        host.style.setProperty('overflow', 'hidden');
        await Promise.resolve();
        projectAdditiveTextMirrors(document);
        await nextFrame();
        const collapsedLineHeight = host.style.lineHeight;
        host.style.removeProperty('height');
        host.style.removeProperty('max-height');
        host.style.removeProperty('overflow');
        await Promise.resolve();
        projectAdditiveTextMirrors(document);
        await nextFrame();
        const reexpandedLineHeight = host.style.lineHeight;

        const mirror = host.querySelector<HTMLElement>(':scope > .jpdb-reader-text-mirror');
        const sourceReading = mirror?.querySelector<HTMLElement>('.jpdb-reader-detached-furi') ?? null;
        const reading = projectedReadingFor(sourceReading);
        const wrapper = mirror?.querySelector<HTMLElement>('.jpdb-reader-detached-ruby') ?? null;
        const readingAssociations = mirror ? projectedReadingAssociations(mirror) : [];
        const tokenRange = document.createRange();
        tokenRange.setStart(node, start);
        tokenRange.setEnd(node, start + 2);
        const tokenTop = Math.min(...Array.from(tokenRange.getClientRects()).map(rect => rect.top));
        const precedingRange = document.createRange();
        precedingRange.setStart(node, 0);
        precedingRange.setEnd(node, start);
        const previousLineBottom = Math.max(...Array.from(precedingRange.getClientRects())
            .filter(rect => rect.top < tokenTop - 1)
            .map(rect => rect.bottom));
        const result = {
            additiveMirror: Boolean(mirror?.classList.contains('jpdb-reader-additive-text-mirror')),
            detachedReadingCount: mirror?.querySelectorAll('.jpdb-reader-detached-furi').length ?? 0,
            sourceReadingVisibleCount: mirror
                ? [...mirror.querySelectorAll<HTMLElement>('.jpdb-reader-detached-furi')].filter(visibleElement).length
                : 0,
            projectedReadingCount: readingAssociations.length,
            projectedReadings: readingAssociations.map(association => ({
                text: association.clone.textContent ?? '',
                sourceSurface: association.sourceSurface,
                sourceRange: association.sourceRange,
                centerDelta: association.centerDelta,
                baselineDelta: association.baselineDelta,
            })),
            fontSize: getComputedStyle(host).fontSize,
            reservedLineHeight: getComputedStyle(host).lineHeight,
            readingClearance: reading ? reading.getBoundingClientRect().top - previousLineBottom : -1,
            readingClipped: reading ? readingIsClipped(reading) : true,
            projectedWrapperDecoration: wrapper ? getComputedStyle(wrapper).textDecorationLine : '',
            mirrorCount: host.querySelectorAll(':scope > .jpdb-reader-text-mirror').length,
            originalInlineLineHeight,
            collapsedLineHeight,
            reexpandedLineHeight,
            restoredInlineLineHeight: '',
        };
        removeNonDestructiveScanMirrors(document);
        result.restoredInlineLineHeight = host.style.lineHeight;
        return result;
    }

    async function projectedCompoundPitchProbe() {
        setRubyDistortsConstrainedRowsForTest(null);
        removeNonDestructiveScanMirrors(document);
        const host = document.getElementById('compound-host')!;
        const text = '登録者数';
        host.textContent = text;
        const node = host.firstChild as Text;
        const compound = {
            ...card(text, 'とうろくしゃすう'),
            vid: 2856524,
            source: 'jiten' as const,
            wordWithReading: '登[とう]録[ろく]者[しゃ]数[すう]',
        };
        applyTokensToScanTarget({
            node,
            parent: host,
            text,
            nonDestructive: true,
            decoration: 'content-ruby',
            proseWrap: true,
        }, [{
            card: compound, start: 0, end: text.length, length: text.length,
            rubies: [{ text: 'とうろくしゃすう', start: 0, end: text.length, length: text.length }],
            pitchClass: '', sentence: text,
        }], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all', showPitchAccent: true });
        projectAdditiveTextMirrors(document);
        await nextFrame();

        const mirror = host.querySelector<HTMLElement>(':scope > .jpdb-reader-text-mirror');
        const word = mirror?.querySelector<HTMLElement>('.jpdb-reader-word') ?? null;
        if (word) setRenderedWordPitchComponents(word, {
            ...compound,
            pitchComponents: [
                { spelling: '登録', reading: 'とうろく', pitchAccent: ['HLLLL'], wordWithReading: '登[とう]録[ろく]' },
                { spelling: '者', reading: 'しゃ', pitchAccent: ['LH'], wordWithReading: '者[しゃ]' },
                { spelling: '数', reading: 'すう', pitchAccent: ['LHL'], wordWithReading: '数[すう]' },
            ],
        });
        const fragments = word ? [...word.querySelectorAll<HTMLElement>('.jpdb-reader-source-fragment')] : [];
        return {
            componentWord: word?.dataset.pitchComponents === 'true',
            projected: word?.dataset.yomuSourceProjected === 'true',
            fragmentCount: fragments.length,
            wordAfterContent: word ? getComputedStyle(word, '::after').content : '',
            paintedFragments: fragments.filter(fragment => getComputedStyle(fragment, '::after').backgroundImage !== 'none').length,
            gradientWidths: fragments.map(fragment => fragment.style.getPropertyValue('--jpdb-reader-source-gradient-width')),
            gradientOffsets: fragments.map(fragment => fragment.style.getPropertyValue('--jpdb-reader-source-gradient-offset')),
        };
    }

    async function singleLineDescriptionProbe() {
        setRubyDistortsConstrainedRowsForTest(null);
        removeNonDestructiveScanMirrors(document);
        const host = document.getElementById('single-line-description-host')!;
        const text = '動画を毎週配信します。';
        host.textContent = text;
        const before = host.getBoundingClientRect();
        const originalLineHeight = host.style.lineHeight;
        applyTokensToScanTarget({
            node: host.firstChild as Text,
            parent: host,
            text,
            nonDestructive: true,
            decoration: 'content-ruby',
        }, [{
            card: card('動画', 'どうが'), start: 0, end: 2, length: 2,
            rubies: [{ text: 'どうが', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban', sentence: text,
        }], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });
        projectAdditiveTextMirrors(document);
        await nextFrame();
        const result = {
            originalLineHeight,
            currentLineHeight: host.style.lineHeight,
            heightGrowth: host.getBoundingClientRect().height - before.height,
        };
        removeNonDestructiveScanMirrors(document);
        return result;
    }

    async function mixedFontSingleLineProbe() {
        setRubyDistortsConstrainedRowsForTest(null);
        removeNonDestructiveScanMirrors(document);
        const host = document.getElementById('mixed-font-single-line-host')!;
        const text = '日本語';
        const target = collectFragmentTextTargetsIn(host, 40, false).find(candidate => candidate.text === text);
        if (!target) throw new Error('mixed-font single-line target not collected');
        const before = host.getBoundingClientRect();
        const originalLineHeight = host.style.lineHeight;
        applyTokensToScanTarget({
            ...target,
            nonDestructive: true,
            decoration: 'content-ruby',
        }, [{
            card: card(text, 'にほんご'), start: 0, end: text.length, length: text.length,
            rubies: [{ text: 'にほんご', start: 0, end: text.length, length: text.length }],
            pitchClass: 'heiban', sentence: text,
        }], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });
        projectAdditiveTextMirrors(document);
        await nextFrame();
        const result = {
            originalLineHeight,
            currentLineHeight: host.style.lineHeight,
            heightGrowth: host.getBoundingClientRect().height - before.height,
        };
        removeNonDestructiveScanMirrors(document);
        return result;
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
        projectAdditiveTextMirrors(document);
    }

    function pitchWordSamples(scope: Element): { afterContent: string; decorationColor: string; rect: DOMRect; surface: string }[] {
        return [...scope.querySelectorAll<HTMLElement>('.jpdb-reader-word')].map(word => {
            // Source-projected word containers intentionally span the host's
            // line box. Crowding belongs to the painted native glyph range,
            // represented by its source fragment, not that positioning shell.
            const fragment = word.querySelector<HTMLElement>('.jpdb-reader-source-fragment');
            return {
                afterContent: getComputedStyle(word, '::after').content,
                decorationColor: getComputedStyle(word).textDecorationColor,
                rect: fragment?.getBoundingClientRect() ?? word.getBoundingClientRect(),
                surface: fragment ? 'source-fragment' : 'word',
            };
        });
    }

    function criticalReadingSamples(scope: Element): Array<{
        text: string;
        readingRect: DOMRect;
        baseRect: DOMRect;
    }> {
        return projectedReadingAssociations(scope).map(association => ({
            text: association.clone.textContent ?? '',
            readingRect: association.clone.getBoundingClientRect(),
            baseRect: association.source.closest('.jpdb-reader-word')
                ?.querySelector<HTMLElement>('.jpdb-reader-source-fragment')
                ?.getBoundingClientRect()
                ?? association.base.getBoundingClientRect(),
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
                readings1: criticalReadingSamples(line1),
                readings2: criticalReadingSamples(line2),
                line2Rect,
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
        runExpandedDescriptionProbe: () => expandedDescriptionProbe('expanded-description-host'),
        runSmallExpandedDescriptionProbe: () => expandedDescriptionProbe('small-expanded-description-host'),
        runNaturalWrappedDescriptionProbe: () => expandedDescriptionProbe('natural-wrap-description-host'),
        runProjectedCompoundPitchProbe: projectedCompoundPitchProbe,
        runSingleLineDescriptionProbe: singleLineDescriptionProbe,
        runMixedFontSingleLineProbe: mixedFontSingleLineProbe,
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
            projectAdditiveTextMirrors(document);

            const mirror = host.querySelector<HTMLElement>(':scope > .jpdb-reader-text-mirror');
            const words = mirror ? [...mirror.querySelectorAll<HTMLElement>('.jpdb-reader-word')] : [];
            const projectedWords = words.filter(word => word.dataset.yomuSourceProjected === 'true');
            const projectedFragments = projectedWords.flatMap(word => [
                ...word.querySelectorAll<HTMLElement>('.jpdb-reader-source-fragment'),
            ]);
            const summaryAfter = summary.getBoundingClientRect();
            const visibleSurfaces = words.flatMap(word => {
                const fragments = [...word.querySelectorAll<HTMLElement>('.jpdb-reader-source-fragment')];
                return fragments.length ? fragments : [word];
            }).filter(surface => {
                const style = getComputedStyle(surface);
                const rect = surface.getBoundingClientRect();
                return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
            });
            const lateWord = words.find(word => word.textContent?.includes('質問')) ?? null;
            const mirrorStyle = mirror ? getComputedStyle(mirror) : null;
            const readingAssociations = mirror ? projectedReadingAssociations(mirror) : [];
            return {
                additiveMirror: Boolean(mirror?.classList.contains('jpdb-reader-additive-text-mirror')),
                inlineRubyCount: mirror?.querySelectorAll('ruby,rt:not(.jpdb-reader-detached-furi)').length ?? -1,
                detachedReadingCount: mirror?.querySelectorAll('.jpdb-reader-detached-furi').length ?? 0,
                sourceReadingVisibleCount: mirror
                    ? [...mirror.querySelectorAll<HTMLElement>('.jpdb-reader-detached-furi')].filter(visibleElement).length
                    : 0,
                projectedReadingCount: readingAssociations.length,
                projectedReadings: readingAssociations.map(association => ({
                    text: association.clone.textContent ?? '',
                    sourceSurface: association.sourceSurface,
                    sourceRange: association.sourceRange,
                    centerDelta: association.centerDelta,
                    baselineDelta: association.baselineDelta,
                })),
                nativeHostVisible: getComputedStyle(host).visibility !== 'hidden',
                mirrorColor: mirrorStyle?.color ?? '',
                mirrorTextFill: mirrorStyle?.webkitTextFillColor ?? '',
                paintedWordContainers: projectedWords.filter(word => getComputedStyle(word).backgroundImage !== 'none').length,
                paintedSourceFragments: projectedFragments.filter(fragment => getComputedStyle(fragment).backgroundImage !== 'none').length,
                lateWordVisibility: lateWord ? getComputedStyle(lateWord).visibility : '',
                visibleWordSummaryOverlaps: visibleSurfaces.filter(surface => rectanglesOverlap(surface.getBoundingClientRect(), summaryAfter)).length,
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
            const chipBoxBefore = boxGeometry(chip);
            paintSingleWord(label, ASK_TEXT, '質問', 'しつもん');
            const mirror = label.querySelector<HTMLElement>('.jpdb-reader-text-mirror');
            const word = mirror?.querySelector<HTMLElement>('.jpdb-reader-word') ?? null;
            const sourceReading = mirror?.querySelector<HTMLElement>('.jpdb-reader-detached-furi') ?? null;
            const reading = projectedReadingFor(sourceReading);
            const actionReadingAssociations = mirror ? projectedReadingAssociations(mirror) : [];
            const base = mirror?.querySelector<HTMLElement>('.jpdb-reader-ruby-base') ?? null;
            const nativeAfter = findTextNode(label, ASK_TEXT);
            const baseAfter = rectOfText(nativeAfter, 0, 2);
            const chipAfter = chip.getBoundingClientRect();
            const chipBoxAfter = boxGeometry(chip);

            const metadata = document.getElementById('metadata-row')!;
            metadata.textContent = VIEW_TEXT;
            const metadataBefore = metadata.getBoundingClientRect();
            paintSingleWord(metadata, VIEW_TEXT, VIEW_TEXT, 'しちょう');
            const metadataReading = metadata.querySelector<HTMLElement>('.jpdb-reader-detached-furi');
            const metadataAfter = metadata.getBoundingClientRect();
            const metadataProjectedBefore = projectedReadingFor(metadataReading);
            const foreign = document.getElementById('foreign-line')!;
            const metadataRectBeforeReflow = metadata.getBoundingClientRect();
            foreign.style.visibility = 'hidden';
            resetDecorationPolicyCachesForTest();
            healTextMirrorPageVisibility();
            projectAdditiveTextMirrors(document);
            const metadataProjectedSafe = projectedReadingFor(metadataReading);
            foreign.style.visibility = '';
            resetDecorationPolicyCachesForTest();
            healTextMirrorPageVisibility();
            projectAdditiveTextMirrors(document);
            const metadataProjectedAgain = projectedReadingFor(metadataReading);
            const metadataRectAfterReflow = metadata.getBoundingClientRect();
            return {
                additiveMirror: Boolean(mirror?.classList.contains('jpdb-reader-additive-text-mirror')),
                inlineRubyCount: mirror?.querySelectorAll('ruby,rt:not(.jpdb-reader-detached-furi)').length ?? -1,
                detachedReadingCount: mirror?.querySelectorAll('.jpdb-reader-detached-furi').length ?? 0,
                sourceReadingVisibleCount: mirror
                    ? [...mirror.querySelectorAll<HTMLElement>('.jpdb-reader-detached-furi')].filter(visibleElement).length
                    : 0,
                projectedReadingCount: actionReadingAssociations.length,
                projectedReadings: actionReadingAssociations.map(association => ({
                    text: association.clone.textContent ?? '',
                    sourceSurface: association.sourceSurface,
                    sourceRange: association.sourceRange,
                    centerDelta: association.centerDelta,
                    baselineDelta: association.baselineDelta,
                })),
                nativeTextNodePreserved: nativeAfter === nativeBefore,
                nativeSourceText: nativeAfter.data,
                nativeBaseCenterDelta: (baseAfter.top + baseAfter.bottom - baseBefore.top - baseBefore.bottom) / 2,
                chipWidthGrowth: chipAfter.width - chipBefore.width,
                chipHeightGrowth: chipAfter.height - chipBefore.height,
                chipBoxBefore,
                chipBoxAfter,
                readingBaseClearance: reading && base ? base.getBoundingClientRect().top - reading.getBoundingClientRect().bottom : -1,
                projectedReadingVisible: Boolean(reading && visibleElement(reading)),
                projectedReadingClipped: reading ? readingIsClipped(reading) : true,
                pitchUnderlineSurfaces: mirror ? pitchUnderlineSurfaces(mirror).length : 0,
                visiblePitchUnderlines: mirror ? pitchUnderlineSurfaces(mirror).filter(paintsPitchUnderline).length : 0,
                underlineToChipBottom: word ? chipAfter.bottom - word.getBoundingClientRect().bottom : -1,
                metadataReadingRetained: Boolean(metadataReading),
                metadataSourceReadingVisible: Boolean(metadataReading && visibleElement(metadataReading)),
                metadataProjectedBefore: Boolean(metadataProjectedBefore && visibleElement(metadataProjectedBefore)),
                metadataProjectedSafe: Boolean(metadataProjectedSafe && visibleElement(metadataProjectedSafe)),
                metadataProjectedAgain: Boolean(metadataProjectedAgain && visibleElement(metadataProjectedAgain)),
                metadataReflowTopDelta: metadataRectAfterReflow.top - metadataRectBeforeReflow.top,
                metadataReflowHeightDelta: metadataRectAfterReflow.height - metadataRectBeforeReflow.height,
                metadataHeightGrowth: metadataAfter.height - metadataBefore.height,
            };
        },
        runLateClipProbe() {
            setRubyDistortsConstrainedRowsForTest(null);
            removeNonDestructiveScanMirrors(document);
            const host = document.getElementById('late-host')!;
            host.textContent = '共有';
            paintSingleWord(host, '共有', '共有', 'きょうゆう');
            const sourceReading = host.querySelector<HTMLElement>('.jpdb-reader-detached-furi');
            host.style.setProperty('overflow', 'hidden');
            host.style.setProperty('text-overflow', 'ellipsis');
            host.style.setProperty('white-space', 'nowrap');
            const boxBefore = boxGeometry(host);
            resetDecorationPolicyCachesForTest();
            healTextMirrorPageVisibility();
            projectAdditiveTextMirrors(document);
            const reading = projectedReadingFor(sourceReading);
            const boxAfter = boxGeometry(host);
            return {
                detachedReadingCount: host.querySelectorAll('.jpdb-reader-detached-furi').length,
                sourceReadingVisibleCount: sourceReading && visibleElement(sourceReading) ? 1 : 0,
                projectedReadingCount: reading ? 1 : 0,
                projectedText: reading?.textContent ?? '',
                boxBefore,
                boxAfter,
                readingClipped: reading ? readingIsClipped(reading) : true,
                readingBaseOverlap: readingBaseOverlap(host),
            };
        },
        async runYouTubeShortsActionPortalProbe() {
            removeNonDestructiveScanMirrors(document);
            const shorts = document.getElementById('shorts-root')!;
            const button = document.getElementById('shorts-share-button')!;
            const label = document.getElementById('shorts-share-label')!;
            const content = document.getElementById('shorts-content-host')!;
            const before = {
                text: label.textContent,
                html: label.innerHTML,
                rect: rectGeometry(label),
                rootAttributes: sortedAttributes(shorts),
                buttonAttributes: sortedAttributes(button),
                labelAttributes: sortedAttributes(label),
            };
            const actionTargetCount = collectTextTargetsIn(button, 40, false)
                .filter(target => target.text.trim() === '共有').length;
            const productionTargets = collectScanTargets(800, location.href, { skipMirroredHosts: true });
            const productionActionTargets = productionScanTargetsTouching(button, productionTargets)
                .map(target => target.text);
            const contentTarget = productionScanTargetsTouching(content, productionTargets)
                .find(target => target.text.includes('日本語'));
            if (!contentTarget) throw new Error('production Shorts content target not collected');
            paintSingleWordTarget(contentTarget, '日本語', 'にほんご');
            await nextPaint();
            await nextPaint();
            const portal = documentPortalReaderWordScopeForSource(label);
            const contentWord = content.querySelector<HTMLElement>('.jpdb-reader-word');
            const contentReading = contentWord?.querySelector<HTMLElement>('rt, .jpdb-reader-detached-furi') ?? null;
            const after = {
                text: label.textContent,
                html: label.innerHTML,
                rect: rectGeometry(label),
                rootAttributes: sortedAttributes(shorts),
                buttonAttributes: sortedAttributes(button),
                labelAttributes: sortedAttributes(label),
            };
            return {
                actionTargetCount,
                productionActionTargets,
                portal: Boolean(portal),
                portalDecoration: portal?.getAttribute('data-yomu-decoration') ?? null,
                nativeAnnotationNodes: button.querySelectorAll(YOMU_ANNOTATION_SELECTOR).length,
                contentWordCount: content.querySelectorAll('.jpdb-reader-word').length,
                contentReading: contentReading?.textContent ?? '',
                before,
                after,
            };
        },
        async runYouTubeShelfExpansionProbe() {
            setRubyDistortsConstrainedRowsForTest(null);
            removeNonDestructiveScanMirrors(document);
            const shelf = document.getElementById('youtube-shelf-expansion')!;
            const label = shelf.querySelector<HTMLElement>(YOUTUBE_SHELF_MORE_SELECTOR);
            if (!label) throw new Error('exact YouTube shelf expansion control missing');

            const baseline = youtubeShelfMoreSnapshot(shelf, label);
            const initialScan = youtubeShelfMoreScanTargets(shelf, label);
            const targetCollected = Boolean(youtubeShelfMoreTarget(label));
            const initialProductionTargets = productionScanTextsTouching(label);
            const replacementIdentityChanged: boolean[] = [];
            const replacementProductionTargets: string[][] = [];
            let maxGeometryDelta = 0;
            let nativeTextStable = true;
            let nativeHtmlStable = true;
            let nativeBoxGeometryStable = true;
            let nativeStyleStable = true;
            let nativeAttributesStable = true;

            for (let cycle = 0; cycle < 5; cycle += 1) {
                const previousChildren = [...label.children];
                label.replaceChildren(...freshYouTubeShelfMoreChildren());
                replacementIdentityChanged.push(previousChildren.length === label.children.length
                    && previousChildren.every((child, index) => child !== label.children[index]));
                await Promise.resolve();
                await nextPaint();
                replacementProductionTargets.push(productionScanTextsTouching(label));

                const snapshot = youtubeShelfMoreSnapshot(shelf, label);
                maxGeometryDelta = Math.max(maxGeometryDelta, youtubeShelfMoreGeometryDelta(baseline, snapshot));
                nativeTextStable &&= snapshot.text === baseline.text;
                nativeHtmlStable &&= snapshot.html === baseline.html;
                nativeBoxGeometryStable &&= JSON.stringify(snapshot.moreBox) === JSON.stringify(baseline.moreBox)
                    && JSON.stringify(snapshot.labelBox) === JSON.stringify(baseline.labelBox);
                nativeStyleStable &&= JSON.stringify(snapshot.labelStyle) === JSON.stringify(baseline.labelStyle)
                    && JSON.stringify(snapshot.spanStyles) === JSON.stringify(baseline.spanStyles);
                nativeAttributesStable &&= JSON.stringify(snapshot.shelfAttributes) === JSON.stringify(baseline.shelfAttributes)
                    && JSON.stringify(snapshot.moreAttributes) === JSON.stringify(baseline.moreAttributes)
                    && JSON.stringify(snapshot.labelAttributes) === JSON.stringify(baseline.labelAttributes);
            }

            return {
                selectorMatched: true,
                baseline,
                initialScan,
                targetCollected,
                initialProductionTargets,
                cycleCount: 5,
                replacementIdentityChanged,
                replacementProductionTargets,
                maxGeometryDelta,
                nativeTextStable,
                nativeHtmlStable,
                nativeBoxGeometryStable,
                nativeStyleStable,
                nativeAttributesStable,
                nativeAnnotationNodes: shelf.querySelectorAll(YOMU_ANNOTATION_SELECTOR).length,
                portalCount: document.querySelectorAll('.jpdb-reader-youtube-chrome-portal').length,
                finalSnapshot: youtubeShelfMoreSnapshot(shelf, label),
            };
        },
        runShowMoreProbe() {
            setRubyDistortsConstrainedRowsForTest(null);
            removeNonDestructiveScanMirrors(document);
            const host = document.getElementById('generic-more')!;
            host.textContent = MORE_TEXT;
            const before = host.getBoundingClientRect();
            const clipBox = document.getElementById('more-row')!;
            const clipBoxBefore = boxGeometry(clipBox);
            paintMore(host);
            const sources = [...host.querySelectorAll<HTMLElement>('.jpdb-reader-detached-furi')];
            const associations = projectedReadingAssociations(host);
            const rt = associations[0]?.clone;
            // With no clone there is no rect to measure. Return the full guard
            // surface anyway so the verify reports the missing projection
            // against the geometry and parse invariants instead of crashing.
            if (!rt) return {
                rtCount: 0,
                inlineRubyCount: host.querySelectorAll('ruby,rt:not(.jpdb-reader-detached-furi)').length,
                detachedReadingCount: sources.length,
                sourceReadingVisibleCount: sources.filter(visibleElement).length,
                projectedReadingCount: 0,
                projectedReadings: [],
                widthGrowth: host.getBoundingClientRect().width - before.width,
                heightGrowth: host.getBoundingClientRect().height - before.height,
                readingClipped: false,
                readingBaseOverlap: 0,
                rtTopClip: 0,
                mirror: Boolean(host.querySelector('.jpdb-reader-text-mirror')),
                clipBoxBefore,
                clipBoxAfter: boxGeometry(clipBox),
            };
            const rtRect = rt.getBoundingClientRect();
            const after = host.getBoundingClientRect();
            return {
                rtCount: associations.length,
                inlineRubyCount: host.querySelectorAll('ruby,rt:not(.jpdb-reader-detached-furi)').length,
                detachedReadingCount: sources.length,
                sourceReadingVisibleCount: sources.filter(visibleElement).length,
                projectedReadingCount: associations.length,
                projectedReadings: associations.map(association => ({
                    text: association.clone.textContent ?? '',
                    sourceSurface: association.sourceSurface,
                    sourceRange: association.sourceRange,
                    centerDelta: association.centerDelta,
                    baselineDelta: association.baselineDelta,
                })),
                mirror: Boolean(host.querySelector('.jpdb-reader-text-mirror')),
                rtTopClip: clipBox.getBoundingClientRect().top - rtRect.top,
                rtHeight: rtRect.height,
                readingClipped: readingIsClipped(rt),
                readingBaseOverlap: readingBaseOverlap(host),
                widthGrowth: after.width - before.width,
                heightGrowth: after.height - before.height,
                clipBoxBefore,
                clipBoxAfter: boxGeometry(clipBox),
            };
        },
        // A tab-style label whose line-height equals the fixed row height used
        // to clip its in-host reading. The projected clone must stay visible
        // without opening or growing the authored row.
        runTabProbe() {
            setRubyDistortsConstrainedRowsForTest(null);
            removeNonDestructiveScanMirrors(document);
            const row = document.getElementById('tab-row')!;
            const label = document.getElementById('tab-label')!;
            label.textContent = TEXT;
            const before = label.getBoundingClientRect();
            const rowBoxBefore = boxGeometry(row);
            paintLabel(label);
            const scope = label.querySelector('.jpdb-reader-text-mirror') ?? label;
            const sources = [...scope.querySelectorAll<HTMLElement>('.jpdb-reader-detached-furi')];
            const associations = projectedReadingAssociations(scope);
            const rts = associations.map(association => association.clone);
            if (!rts.length) return { rtCount: 0, rtTopClip: 0 };
            const rtTop = Math.min(...rts.map(rt => rt.getBoundingClientRect().top));
            const after = label.getBoundingClientRect();
            return {
                rtCount: rts.length,
                inlineRubyCount: scope.querySelectorAll('ruby,rt:not(.jpdb-reader-detached-furi)').length,
                detachedReadingCount: sources.length,
                sourceReadingVisibleCount: sources.filter(visibleElement).length,
                projectedReadingCount: associations.length,
                projectedReadings: associations.map(association => ({
                    text: association.clone.textContent ?? '',
                    sourceSurface: association.sourceSurface,
                    sourceRange: association.sourceRange,
                    centerDelta: association.centerDelta,
                    baselineDelta: association.baselineDelta,
                })),
                rtTopClip: row.getBoundingClientRect().top - rtTop,
                readingClipped: rts.some(readingIsClipped),
                readingClipAncestors: rts.flatMap(readingClipAncestors),
                readingBaseOverlap: readingBaseOverlap(scope),
                widthGrowth: after.width - before.width,
                heightGrowth: after.height - before.height,
                rowBoxBefore,
                rowBoxAfter: boxGeometry(row),
            };
        },
        runChipMirrorProbe() {
            setRubyDistortsConstrainedRowsForTest(null);
            removeNonDestructiveScanMirrors(document);
            const chip = document.getElementById('chip')!;
            const label = document.getElementById('chip-label')!;
            label.textContent = TEXT;
            const chipBefore = chip.getBoundingClientRect();
            const chipBoxBefore = boxGeometry(chip);
            const plainWidth = label.getBoundingClientRect().width;
            paintLabel(label, true);
            const mirror = label.querySelector<HTMLElement>('.jpdb-reader-text-mirror');
            const scope: Element = mirror ?? label;
            const words = [...scope.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
            // Base fidelity belongs to the page-owned source, not the invisible
            // annotation wrappers whose projected words are absolute containers.
            const nativeText = findTextNode(label, TEXT);
            const rectShin = rectOfText(nativeText, 0, 1);
            const rectShii = rectOfText(nativeText, 1, 3);
            const rectJun = rectOfText(nativeText, 3, 4);
            const chipRect = chip.getBoundingClientRect();
            const sources = [...scope.querySelectorAll<HTMLElement>('.jpdb-reader-detached-furi')];
            const associations = projectedReadingAssociations(scope);
            const rts = associations.map(association => association.clone);
            const visibleReadings = rts.filter(visibleElement);
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
                detachedReadingCount: sources.length,
                sourceReadingVisibleCount: sources.filter(visibleElement).length,
                projectedReadingCount: associations.length,
                projectedReadings: associations.map(association => ({
                    text: association.clone.textContent ?? '',
                    sourceSurface: association.sourceSurface,
                    sourceRange: association.sourceRange,
                    centerDelta: association.centerDelta,
                    baselineDelta: association.baselineDelta,
                })),
                visibleReadingCount: visibleReadings.length,
                readingClipped: rts.some(readingIsClipped),
                readingClipAncestors: rts.flatMap(readingClipAncestors),
                readingBaseOverlap: readingBaseOverlap(scope),
                chipWidthGrowth: chipAfter.width - chipBefore.width,
                chipHeightGrowth: chipAfter.height - chipBefore.height,
                chipBoxBefore,
                chipBoxAfter: boxGeometry(chip),
                pitchUnderlineSurfaces: pitchUnderlineSurfaces(scope).length,
                visiblePitchUnderlines: pitchUnderlineSurfaces(scope).filter(paintsPitchUnderline).length,
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

const FIXTURE = `<!doctype html><html lang="ja" class="jpdb-reader-word-highlight-status jpdb-reader-word-underline-pitch"><head><meta charset="utf-8"><style>
body { font: 14px/1.4 Roboto, sans-serif; width: 400px; min-height: 2400px; margin: 40px; }
#chip { display: inline-flex; align-items: center; height: 32px; padding: 0 12px; border-radius: 8px;
        background: rgba(0,0,0,0.05); overflow: hidden; }
#chip-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; line-height: 20px; }
#youtube-shelf-scroll-shell { display:block; width:400px; height:88px; overflow:auto; margin-top:24px; }
#youtube-shelf-expansion { display: block; width: 400px; margin-top: 48px; margin-bottom: 80px; }
#youtube-shelf-expansion > ytd-vertical-list-renderer { display: block; }
#youtube-shelf-expansion > ytd-vertical-list-renderer > #more {
  box-sizing: border-box; display: flex; align-items: center; justify-content: center;
  width: 400px; height: 40px; overflow: hidden; border-bottom: 1px solid #ddd;
}
#youtube-shelf-more-label {
  display: inline-flex; align-items: center; white-space: pre; overflow: visible;
  font: 500 14px/20px Roboto, sans-serif; color: rgb(96, 96, 96);
}
#shorts-root { display:block;position:relative;width:120px;height:180px;margin-top:24px; }
#shorts-actions { display:flex;flex-direction:column;width:48px; }
#shorts-share-button { box-sizing:border-box;width:48px;height:48px;padding:0;border:0; }
#shorts-share-label { display:block;width:34px;margin:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:14px/20px Roboto,sans-serif; }
</style></head><body>
<div id="chip" role="button"><div id="chip-label"></div></div>
<div id="tab-row" style="overflow: hidden; height: 32px; margin-top: 24px; background: #f5f5f5;">
  <div id="tab-label" role="tab" style="font-size: 14px; line-height: 32px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div>
</div>
<div id="more-row" style="overflow: hidden; height: 22px; margin-top: 24px; background: rgba(0,0,0,0.08); border-radius: 4px; padding: 0 8px;">
  <div id="generic-more" role="button" style="font-size: 14px; line-height: 22px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">さらに表示</div>
</div>
<div id="youtube-shelf-scroll-shell">
  <ytd-shelf-renderer id="youtube-shelf-expansion">
    <ytd-vertical-list-renderer>
      <div id="more">
        <yt-formatted-string id="youtube-shelf-more-label" role="button"><span>+ 他 </span><span>3</span><span> 件</span></yt-formatted-string>
      </div>
    </ytd-vertical-list-renderer>
  </ytd-shelf-renderer>
</div>
<ytm-shorts id="shorts-root">
  <div id="shorts-actions" role="toolbar">
    <button id="shorts-share-button" aria-label="共有"><span id="shorts-share-label">共有</span></button>
  </div>
  <div id="shorts-content-host">日本語の説明</div>
</ytm-shorts>
<ytm-slim-video-metadata-section-renderer>
  <ytm-button-renderer><button id="ask-chip" style="box-sizing:border-box;display:inline-flex;align-items:center;height:48px;padding:0 18px;border:0;border-radius:24px;overflow:visible;font:600 16px/20px Roboto,sans-serif"><yt-formatted-string id="ask-label">質問する</yt-formatted-string></button></ytm-button-renderer>
</ytm-slim-video-metadata-section-renderer>
<div id="metadata-stack" style="margin-top:20px;font:14px/16px Roboto,sans-serif">
  <div id="foreign-line" style="height:16px">チャンネル</div>
  <yt-formatted-string id="metadata-row" class="metadata-text" style="display:block;height:16px;overflow:visible">視聴</yt-formatted-string>
</div>
<div id="late-row" style="display:block;width:80px;height:24px;margin-top:20px;font:14px/24px Roboto,sans-serif"><yt-formatted-string id="late-host" style="display:block;width:80px;height:24px">共有</yt-formatted-string></div>
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
<div id="expanded-description-host" style="display:block;width:360px;margin-top:24px;white-space:pre-wrap;font:16px/20px Roboto,sans-serif"></div>
<div id="small-expanded-description-host" style="display:block;width:320px;margin-top:24px;white-space:pre-wrap;font:14px/18px Roboto,sans-serif"></div>
<div id="natural-wrap-description-host" style="display:block;width:120px;margin-top:24px;white-space:normal;font:14px/18px Roboto,sans-serif"></div>
<div id="single-line-description-host" style="display:block;width:320px;margin-top:24px;white-space:normal;font:14px/18px Roboto,sans-serif"></div>
<div id="mixed-font-single-line-host" style="display:block;width:320px;margin-top:24px;white-space:nowrap;font:16px/20px Roboto,sans-serif">日本<span style="font-size:10px">語</span></div>
<div id="compound-host" style="display:block;width:48px;margin-top:24px;white-space:normal;font:16px/20px Roboto,sans-serif"></div>
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

function verifyProbeChecks(name, details, checks) {
    checks
        .filter(check => check.failed)
        .forEach(check => fail(`${name}: ${check.message}`, details));
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
// DOMRects describe font line boxes rather than painted glyphs. Chromium and
// WebKit can report 1-2px of contact while the reading sits directly above the
// base with no visible gap. Larger penetration is a real collision.
const MAX_FONT_BOX_CONTACT_PX = 2.5;

function sameBoxGeometry(before, after) {
    return before.overflow === after.overflow
        && before.inlineOverflow === after.inlineOverflow
        && before.client[0] === after.client[0]
        && before.client[1] === after.client[1]
        && before.scroll[0] === after.scroll[0]
        && before.scroll[1] === after.scroll[1];
}

function maxRectDelta(before, after) {
    return Math.max(...['left', 'top', 'width', 'height'].map(key => Math.abs(before[key] - after[key])));
}

function projectedAssociationsAreAligned(associations) {
    return associations.every(association => Math.abs(association.centerDelta) <= 1
        && Math.abs(association.baselineDelta) <= 1);
}

function logProbe(name, label, result) {
    console.log(`${name} ${label}:`, JSON.stringify(result));
}

function verifyChip(name, result) {
    // The chip is a role=button control: annotated AT REST like any other
    // text. The reading rides the out-of-flow lane, so the control keeps its
    // authored geometry and hit target — that is the whole safety mechanism,
    // and the geometry guards below are what enforce it. Nothing is hidden.
    if (!result.mirror) fail(`${name}: compact closed control did not use the additive mirror path`, result);
    if (result.detachedReadingCount < 1) fail(`${name}: compact control reading missing`, result);
    if (result.sourceReadingVisibleCount !== 0) fail(`${name}: compact control source reading entered page layout`, result);
    if (result.projectedReadingCount === 0
        || result.visibleReadingCount === 0) fail(`${name}: compact control is not annotated at rest`, result);
    if (result.inlineRubyCount !== 0) fail(`${name}: compact control used an in-flow ruby lane`, result);
    if (Math.abs(result.chipWidthGrowth) > MAX_GEOMETRY_DELTA_PX || Math.abs(result.chipHeightGrowth) > MAX_GEOMETRY_DELTA_PX) fail(`${name}: compact control geometry changed`, result);
    if (!sameBoxGeometry(result.chipBoxBefore, result.chipBoxAfter)) fail(`${name}: compact control changed authored overflow or scroll geometry`, result);
    if (result.readingClipped) fail(`${name}: compact control reading is clipped`, result);
    if (result.readingBaseOverlap > MAX_FONT_BOX_CONTACT_PX) fail(`${name}: compact control reading intrudes into its base`, result);
    // The pitch underline is a status signal on the word itself; it costs no
    // layout, so a control shows it at rest exactly like body text does.
    if (result.pitchUnderlineSurfaces === 0) fail(`${name}: compact control has no pitch underline surface to measure`, result);
    if (result.visiblePitchUnderlines === 0) fail(`${name}: compact control lost its pitch underline at rest`, result);
}

function verifyYouTubeGeometry(name, youtube) {
    if (!youtube.additiveMirror || youtube.inlineRubyCount !== 0 || youtube.detachedReadingCount < 1) fail(`${name}: YouTube action chip did not use detached additive rendering`, youtube);
    // The 質問する action chip is a <button>: annotated at rest like any other
    // text. The source reading stays out of page layout and the projected clone
    // is what the user reads; the geometry guards below prove the chip is
    // unaffected, which is what makes annotating chrome safe.
    if (youtube.sourceReadingVisibleCount !== 0
        || youtube.projectedReadingCount === 0) fail(`${name}: YouTube action chip is not annotated at rest`, youtube);
    if (!youtube.nativeTextNodePreserved || youtube.nativeSourceText !== '質問する') fail(`${name}: additive rendering replaced or changed the source text node`, youtube);
    if (Math.abs(youtube.nativeBaseCenterDelta) > MAX_GEOMETRY_DELTA_PX) fail(`${name}: YouTube action chip base moved vertically`, youtube);
    if (Math.abs(youtube.chipWidthGrowth) > MAX_GEOMETRY_DELTA_PX || Math.abs(youtube.chipHeightGrowth) > MAX_GEOMETRY_DELTA_PX) fail(`${name}: YouTube action chip geometry changed`, youtube);
    if (!sameBoxGeometry(youtube.chipBoxBefore, youtube.chipBoxAfter)) fail(`${name}: YouTube action chip changed authored overflow or scroll geometry`, youtube);
    if (youtube.readingBaseClearance < -MAX_FONT_BOX_CONTACT_PX) fail(`${name}: YouTube action chip furigana intrudes into its base`, youtube);
    // The pitch underline is a status signal painted on the word itself, so it
    // costs no layout and a chip carries it at rest exactly like body text.
    if (youtube.pitchUnderlineSurfaces === 0) fail(`${name}: YouTube action chip has no pitch underline surface to measure`, youtube);
    if (youtube.visiblePitchUnderlines === 0) fail(`${name}: YouTube action chip lost its pitch underline at rest`, youtube);
    if (!youtube.metadataReadingRetained || youtube.metadataSourceReadingVisible) fail(`${name}: metadata source reading entered page layout`, youtube);
    if (!youtube.metadataProjectedBefore || !youtube.metadataProjectedSafe || !youtube.metadataProjectedAgain) fail(`${name}: metadata projected furigana did not remain visible across reflow`, youtube);
    if (Math.abs(youtube.metadataReflowTopDelta) > MAX_GEOMETRY_DELTA_PX || Math.abs(youtube.metadataReflowHeightDelta) > MAX_GEOMETRY_DELTA_PX) fail(`${name}: metadata reflow probe changed the source row geometry`, youtube);
    if (Math.abs(youtube.metadataHeightGrowth) > MAX_GEOMETRY_DELTA_PX) fail(`${name}: metadata safety clearance grew its host row`, youtube);
}

function verifyLateClip(name, lateClip) {
    if (lateClip.sourceReadingVisibleCount !== 0
        || lateClip.projectedReadingCount !== lateClip.detachedReadingCount
        || lateClip.projectedText !== 'きょうゆう'
        || lateClip.readingClipped
        || lateClip.readingBaseOverlap > MAX_FONT_BOX_CONTACT_PX) fail(`${name}: late compact clip did not project visible furigana`, lateClip);
    if (!sameBoxGeometry(lateClip.boxBefore, lateClip.boxAfter)
        || lateClip.boxAfter.overflow !== 'hidden'
        || lateClip.boxAfter.inlineOverflow !== 'hidden') fail(`${name}: late compact clip opened or changed page-owned scroll geometry`, lateClip);
}

function verifyYouTubeShelfExpansion(name, result) {
    const expectedText = '+ 他 3 件';
    const expectedHtml = '<span>+ 他 </span><span>3</span><span> 件</span>';
    const fixtureState = [result.selectorMatched, result.baseline.text, result.baseline.html];
    const ownershipState = [
        result.targetCollected,
        Object.values(result.initialScan).flat(),
        result.initialProductionTargets,
        result.replacementProductionTargets,
        result.nativeAnnotationNodes,
        result.portalCount,
    ];
    const recyclingState = [
        result.cycleCount,
        result.replacementIdentityChanged,
        result.nativeTextStable,
        result.nativeHtmlStable,
        result.nativeBoxGeometryStable,
        result.nativeStyleStable,
        result.nativeAttributesStable,
    ];
    verifyProbeChecks(name, result, [
        {
            failed: JSON.stringify(fixtureState) !== JSON.stringify([true, expectedText, expectedHtml]),
            message: 'exact YouTube shelf expansion fixture changed',
        },
        {
            failed: JSON.stringify(ownershipState) !== JSON.stringify([false, [], [], [[], [], [], [], []], 0, 0]),
            message: 'YouTube shelf expansion escaped the page-owned chrome boundary',
        },
        {
            failed: JSON.stringify(recyclingState)
                !== JSON.stringify([5, [true, true, true, true, true], true, true, true, true, true]),
            message: 'recycled YouTube shelf expansion changed native ownership or geometry',
        },
        {
            failed: result.maxGeometryDelta > MAX_GEOMETRY_DELTA_PX,
            message: 'recycled YouTube shelf expansion moved native geometry',
        },
        {
            failed: JSON.stringify([result.finalSnapshot.text, result.finalSnapshot.html])
                !== JSON.stringify([expectedText, expectedHtml]),
            message: 'recycled YouTube shelf expansion changed its segmented label',
        },
    ]);
}

function verifyYouTubeShortsAction(name, result) {
    const ownershipState = [
        result.actionTargetCount,
        result.productionActionTargets,
        result.portal,
        result.portalDecoration,
    ];
    const beforeNative = [result.before.text, result.before.html, result.before.rootAttributes,
        result.before.buttonAttributes, result.before.labelAttributes];
    const afterNative = [result.after.text, result.after.html, result.after.rootAttributes,
        result.after.buttonAttributes, result.after.labelAttributes];
    verifyProbeChecks(name, result, [
        {
            failed: JSON.stringify(ownershipState) !== JSON.stringify([0, [], false, null]),
            message: 'ytm-shorts native action escaped the page-owned chrome boundary',
        },
        {
            failed: JSON.stringify([...beforeNative, '共有']) !== JSON.stringify([...afterNative, result.before.text]),
            message: 'ytm-shorts action annotation changed native text, attributes, or descendants',
        },
        {
            failed: maxRectDelta(result.before.rect, result.after.rect) > MAX_GEOMETRY_DELTA_PX,
            message: 'ytm-shorts action annotation moved native geometry',
        },
        {
            failed: JSON.stringify([result.contentWordCount, result.contentReading])
                !== JSON.stringify([1, 'にほんご']),
            message: 'ytm-shorts chrome exclusion swallowed adjacent learner content',
        },
    ]);
}

function verifyDescription(name, description) {
    if (!description.additiveMirror || description.inlineRubyCount !== 0 || description.detachedReadingCount < 1) fail(`${name}: truncated description did not use detached additive rendering`, description);
    if (description.sourceReadingVisibleCount !== 0 || description.projectedReadingCount < 1
        || !projectedAssociationsAreAligned(description.projectedReadings)) fail(`${name}: truncated description did not use source-aligned projected readings`, description);
    if (!description.nativeHostVisible) fail(`${name}: truncated description lost its native fallback text`, description);
    // The semantic color intentionally inherits so detached readings follow
    // late page-theme changes. Transparent text-fill hides the duplicate base.
    if (!transparentPaint(description.mirrorTextFill)) fail(`${name}: additive description mirror painted a duplicate base copy`, description);
    if (description.paintedWordContainers !== 0) fail(`${name}: projected word container painted a full-host highlight`, description);
    if (description.paintedSourceFragments < 1) fail(`${name}: projected source fragments lost the normal highlight`, description);
    if (description.lateWordVisibility !== 'hidden') fail(`${name}: off-clip description word remained paintable`, description);
    if (description.visibleWordSummaryOverlaps !== 0) fail(`${name}: description annotation overlapped its summary sibling`, description);
    if (Math.abs(description.previewHeightGrowth) > MAX_GEOMETRY_DELTA_PX || Math.abs(description.summaryTopShift) > MAX_GEOMETRY_DELTA_PX || Math.abs(description.summaryHeightGrowth) > MAX_GEOMETRY_DELTA_PX) fail(`${name}: expanded-description or summary geometry changed`, description);
    if (description.previewOverflow !== 'hidden' || description.previewClientHeight !== 112 || description.previewScrollHeight <= description.previewClientHeight || description.mirrorMaxHeight !== '112px') fail(`${name}: authored 112px description clip was not preserved`, description);
    if (description.mirrorCount !== 1 || description.cycleMirrorCounts.some(count => count !== 1)) fail(`${name}: repeated description disclosure stacked mirrors`, description);
}

function verifyExpandedDescription(name, expanded) {
    if (!expanded.additiveMirror || expanded.detachedReadingCount < 1 || expanded.mirrorCount !== 1) fail(`${name}: expanded prose reading missing`, expanded);
    if (expanded.sourceReadingVisibleCount !== 0
        || expanded.projectedReadingCount !== expanded.detachedReadingCount
        || !projectedAssociationsAreAligned(expanded.projectedReadings)) fail(`${name}: expanded prose did not use source-aligned projected readings`, expanded);
    if (Number.parseFloat(expanded.reservedLineHeight) < Number.parseFloat(expanded.fontSize) * 2) fail(`${name}: expanded prose did not reserve a furigana lane`, expanded);
    if (expanded.readingClearance < 1 || expanded.readingClipped) fail(`${name}: expanded prose furigana collides with the preceding line`, expanded);
    if (expanded.projectedWrapperDecoration !== 'none') fail(`${name}: projected ruby retained the obsolete second underline`, expanded);
    if (expanded.collapsedLineHeight !== expanded.originalInlineLineHeight) fail(`${name}: collapsed prose kept the expanded reading lane`, expanded);
    if (Number.parseFloat(expanded.reexpandedLineHeight) < Number.parseFloat(expanded.fontSize) * 2) fail(`${name}: re-expanded prose did not restore its reading lane`, expanded);
    if (!expanded.originalInlineLineHeight || expanded.restoredInlineLineHeight !== expanded.originalInlineLineHeight) fail(`${name}: expanded prose line-height did not restore cleanly`, expanded);
}

function verifySingleLineDescription(name, singleLine) {
    if (singleLine.currentLineHeight !== singleLine.originalLineHeight || Math.abs(singleLine.heightGrowth) > MAX_GEOMETRY_DELTA_PX) fail(`${name}: single-line content grew a furigana lane`, singleLine);
}

function verifyCompoundPitch(name, compound) {
    if (!compound.componentWord || !compound.projected || compound.fragmentCount < 2) fail(`${name}: wrapped compound pitch word was not source-projected on every line`, compound);
    if (compound.wordAfterContent !== 'none' || compound.paintedFragments !== compound.fragmentCount) fail(`${name}: projected compound pitch gradient was lost`, compound);
    if (compound.gradientWidths.some(width => !width || Number.parseFloat(width) <= 0)) fail(`${name}: projected compound gradient geometry is incomplete`, compound);
    if (compound.gradientOffsets[0] !== '0px' || !compound.gradientOffsets.slice(1).some(offset => Number.parseFloat(offset) < 0)) fail(`${name}: wrapped compound gradient restarted on a later line`, compound);
}

function verifyCompactLabel(name, label, result, geometryBefore, geometryAfter) {
    if (result.detachedReadingCount < 1) fail(`${name}: ${label} reading missing`, result);
    // One contract for every compact label, chrome or content: the source
    // reading stays out of page layout and every one of them is projected.
    if (result.sourceReadingVisibleCount !== 0
        || result.projectedReadingCount !== result.detachedReadingCount
        || !projectedAssociationsAreAligned(result.projectedReadings)) fail(`${name}: ${label} projected reading missing or misaligned`, result);
    if (result.inlineRubyCount !== 0) fail(`${name}: ${label} used an in-flow ruby lane`, result);
    if (Math.abs(result.widthGrowth) > MAX_GEOMETRY_DELTA_PX || Math.abs(result.heightGrowth) > MAX_GEOMETRY_DELTA_PX) fail(`${name}: ${label} geometry changed`, result);
    if (!sameBoxGeometry(geometryBefore, geometryAfter)) fail(`${name}: ${label} changed authored overflow or scroll geometry`, result);
    if (result.readingClipped) fail(`${name}: ${label} reading is clipped`, result);
    if (result.readingBaseOverlap > MAX_FONT_BOX_CONTACT_PX) fail(`${name}: ${label} reading intrudes into its base`, result);
}

function verifyCriticalWords(name, label, words) {
    for (const word of words) {
        if (word.afterContent !== 'none') fail(`${name}: critical-css ${label} pitch ::after was not disabled`, word);
        if (transparentPaint(word.decorationColor)) fail(`${name}: critical-css ${label} pitch underline is not visible`, word);
    }
}

function verifyCriticalDescription(name, result) {
    if (result.line1WordCount < 1 || result.line2WordCount < 1) fail(`${name}: critical-css description pitch words missing`, result);
    verifyCriticalWords(name, 'description', [...result.words1, ...result.words2]);
    if (result.line1ToLine2Clearance <= 0) fail(`${name}: critical-css description pitch underline crowds the following line`, result);
}

function verifyCriticalTitle(name, result) {
    if (result.wordCount < 1) fail(`${name}: critical-css title pitch word missing`, result);
    verifyCriticalWords(name, 'title', result.words);
    if (result.titleToMetadataClearance <= 0) fail(`${name}: critical-css title pitch underline crowds the metadata row`, result);
}

async function openFixturePage(browser, url, body) {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(90_000);
    await page.route('https://www.youtube.com/**', route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body,
    }));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return page;
}

async function runPrimaryProbes(name, browser) {
    const page = await openFixturePage(browser, 'https://www.youtube.com/chip-mirror-smoke', FIXTURE);
    await page.addStyleTag({ content: readFileSync(CSS_PATH, 'utf8') });
    // Exercise source policy without requiring this focused smoke to rewrite
    // generated distribution assets.
    await page.addStyleTag({ content: readFileSync(READER_WORDS_CSS_PATH, 'utf8') });
    await page.addScriptTag({ path: bundlePath });

    const shortsAction = await page.evaluate(() => window.runYouTubeShortsActionPortalProbe());
    logProbe(name, 'youtube shorts action', shortsAction);
    verifyYouTubeShortsAction(name, shortsAction);

    const shelfExpansion = await page.evaluate(() => window.runYouTubeShelfExpansionProbe());
    logProbe(name, 'youtube shelf expansion', shelfExpansion);
    verifyYouTubeShelfExpansion(name, shelfExpansion);

    const chip = await page.evaluate(() => window.runChipMirrorProbe());
    logProbe(name, 'chip', chip);
    verifyChip(name, chip);

    const youtube = await page.evaluate(() => window.runYouTubeGeometryProbe());
    logProbe(name, 'youtube geometry', youtube);
    verifyYouTubeGeometry(name, youtube);

    const lateClip = await page.evaluate(() => window.runLateClipProbe());
    logProbe(name, 'late clip', lateClip);
    verifyLateClip(name, lateClip);

    const description = await page.evaluate(() => window.runYouTubeDescriptionClipProbe());
    logProbe(name, 'youtube description', description);
    verifyDescription(name, description);

    const expandedCases = [
        await page.evaluate(() => window.runExpandedDescriptionProbe()),
        await page.evaluate(() => window.runSmallExpandedDescriptionProbe()),
        await page.evaluate(() => window.runNaturalWrappedDescriptionProbe()),
    ];
    for (const expanded of expandedCases) {
        logProbe(name, `expanded description ${expanded.fontSize}`, expanded);
        verifyExpandedDescription(name, expanded);
    }

    const singleLineCases = [
        await page.evaluate(() => window.runSingleLineDescriptionProbe()),
        await page.evaluate(() => window.runMixedFontSingleLineProbe()),
    ];
    for (const singleLine of singleLineCases) {
        logProbe(name, 'single-line description', singleLine);
        verifySingleLineDescription(name, singleLine);
    }

    const compound = await page.evaluate(() => window.runProjectedCompoundPitchProbe());
    logProbe(name, 'projected compound pitch', compound);
    verifyCompoundPitch(name, compound);

    const more = await page.evaluate(() => window.runShowMoreProbe());
    logProbe(name, 'show-more', more);
    verifyCompactLabel(name, 'show-more', more, more.clipBoxBefore, more.clipBoxAfter);

    const tab = await page.evaluate(() => window.runTabProbe());
    logProbe(name, 'tab', tab);
    verifyCompactLabel(name, 'tab', tab, tab.rowBoxBefore, tab.rowBoxAfter);
}

async function runCriticalCssProbes(name, browser) {
    const page = await openFixturePage(browser, 'https://www.youtube.com/critical-css-smoke', CRIT_FIXTURE);
    try {
        await page.addScriptTag({ path: bundlePath });
        const criticalCss = await page.evaluate(() => window.CRITICAL_READER_CSS_TEXT);
        await page.addStyleTag({ content: criticalCss });

        const description = await page.evaluate(() => window.runCriticalCssDescriptionProbe());
        logProbe(name, 'critical-css description', description);
        verifyCriticalDescription(name, description);

        const title = await page.evaluate(() => window.runCriticalCssTitleProbe());
        logProbe(name, 'critical-css title', title);
        verifyCriticalTitle(name, title);
    } finally {
        await page.close();
    }
}

async function runEngine(name, browserType) {
    const browser = await browserType.launch({ headless: true });
    try {
        await runPrimaryProbes(name, browser);
        await runCriticalCssProbes(name, browser);
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
