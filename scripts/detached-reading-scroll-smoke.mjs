#!/usr/bin/env node
// Real-engine regression for detached readings inside nested dynamic
// components. Inner-panel content and its clone must share a compositor-owned
// scroll layer; waiting for a JavaScript refresh leaves a visibly stale frame.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const IMPLEMENTATION_PATH = process.env.YOMU_SCROLL_IMPL
    || path.join(ROOT, 'src/reader/dom/detached-reading-overlay-impl.ts');
const tempDir = mkdtempSync(path.join(tmpdir(), 'yomu-reading-scroll-smoke-'));
const entryPath = path.join(tempDir, 'probe.ts');
const bundlePath = path.join(tempDir, 'probe.js');

writeFileSync(entryPath, `
    import {
        clearProjectedReadings,
        syncProjectedReadings,
    } from ${JSON.stringify(IMPLEMENTATION_PATH)};

    const nextPaint = () => new Promise<void>(
        resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const settleProjection = async () => {
        await nextPaint();
        // Let the observer's initial delivery settle before moving the source;
        // otherwise that unrelated first callback can mask a missed scroll.
        await new Promise(resolve => setTimeout(resolve, 50));
        await nextPaint();
    };
    const makeReading = (anchor: HTMLElement, surface = '動的', reading = 'どうてき') => {
        anchor.style.cssText = 'display:inline-block;margin-left:64px;font:16px sans-serif;line-height:24px;';
        const owner = document.createElement('span');
        owner.className = 'jpdb-reader-word';
        owner.textContent = surface;
        const source = document.createElement('span');
        source.className = 'jpdb-reader-furi jpdb-reader-detached-furi';
        source.style.cssText = 'font:700 10px sans-serif;line-height:10px;';
        source.textContent = reading;
        owner.append(source);
        anchor.append(owner);
        return { owner, source };
    };
    const projectedReadingFor = (anchor: HTMLElement) => {
        const roots: ParentNode[] = [];
        const seen = new Set<ParentNode>();
        let node: Node | null = anchor;
        while (node) {
            const root = node.getRootNode();
            if ((root instanceof Document || root instanceof ShadowRoot) && !seen.has(root)) {
                seen.add(root);
                roots.push(root);
            }
            if (node instanceof Element && node.assignedSlot) node = node.assignedSlot;
            else if (root instanceof ShadowRoot) node = root.host;
            else node = null;
        }
        return roots.map(root => root.querySelector('[data-yomu-projected-reading="true"]')).find(Boolean);
    };
    const scrollerSnapshot = (scroller: HTMLElement) => ({
        scrollWidth: scroller.scrollWidth,
        scrollHeight: scroller.scrollHeight,
        clientWidth: scroller.clientWidth,
        clientHeight: scroller.clientHeight,
        inlinePosition: scroller.style.getPropertyValue('position'),
        inlinePositionPriority: scroller.style.getPropertyPriority('position'),
        layerCount: scroller.querySelectorAll('.jpdb-reader-detached-reading-scroll-layer').length,
        contentIsLast: scroller.querySelector('#content') === scroller.lastElementChild,
    });
    const readingSnapshot = (anchor: HTMLElement) => {
        const clone = projectedReadingFor(anchor);
        if (!(clone instanceof HTMLElement)) throw new Error('projected reading was not painted');
        const sourceRect = anchor.getBoundingClientRect();
        const cloneRect = clone.getBoundingClientRect();
        return {
            sourceTop: sourceRect.top,
            cloneBottom: cloneRect.bottom,
            stampedSourceTop: Number(clone.dataset.yomuSourceTop),
            alignment: cloneRect.bottom - sourceRect.top,
            display: getComputedStyle(clone).display,
            documentSpace: clone.classList.contains('jpdb-reader-projected-furi-document'),
            scrollSpace: clone.classList.contains('jpdb-reader-projected-furi-scroll'),
            layerHost: clone.parentElement?.parentElement?.id
                || clone.parentElement?.parentElement?.localName
                || null,
        };
    };
    const scrollResult = (before, inFrame, after, scrollerGuard) => ({
        before,
        inFrame,
        after,
        scrollerGuard,
        sourceDelta: after.sourceTop - before.sourceTop,
        cloneDelta: after.cloneBottom - before.cloneBottom,
        stampedSourceDelta: after.stampedSourceTop - before.stampedSourceTop,
        inFrameSourceDelta: inFrame.sourceTop - before.sourceTop,
        inFrameCloneDelta: inFrame.cloneBottom - before.cloneBottom,
        inFrameStampedSourceDelta: inFrame.stampedSourceTop - before.stampedSourceTop,
    });

    window.runDetachedReadingScrollProbe = async () => {
        const platform = document.createElement('dynamic-platform');
        platform.style.cssText = 'display:block;width:280px;margin:100px 0 0 80px;';
        const platformRoot = platform.attachShadow({ mode: 'open' });
        platformRoot.innerHTML = \`
            <style>
                #scroller {
                    box-sizing: border-box;
                    height: 120px;
                    overflow: auto;
                    border: 1px solid #999;
                    background: white;
                }
                #scroller > * { margin:13px!important;min-height:17px!important;padding:5px!important;border:2px solid red!important; }
                #content { box-sizing: border-box; height: 200px; padding-top: 52px; }
                #scroller > #content:last-child { height: 360px; }
            </style>
            <div id="scroller"><div id="content"></div></div>
        \`;
        const scroller = platformRoot.getElementById('scroller');
        const content = platformRoot.getElementById('content');
        if (!(scroller instanceof HTMLElement) || !(content instanceof HTMLElement)) {
            throw new Error('outer dynamic component did not mount');
        }

        const component = document.createElement('dynamic-label');
        // A positioned/scaled/clipped shadow host is not a viable mount: its
        // light-DOM children may be undistributed, and its coordinate space is
        // not 1:1. The projection must skip it and use the safe scroller.
        component.style.cssText = 'display:block;position:relative;overflow:hidden;height:24px;transform:scale(1.1);transform-origin:top left;';
        const componentRoot = component.attachShadow({ mode: 'open' });
        const anchor = document.createElement('span');
        const { owner, source } = makeReading(anchor);
        componentRoot.append(anchor);
        content.append(component);
        document.body.append(platform);
        const extentBefore = scrollerSnapshot(scroller);

        const measure = () => anchor.getBoundingClientRect();
        syncProjectedReadings(owner, [{
            source,
            anchor,
            rect: measure(),
            measure,
        }]);
        await settleProjection();
        const extentProjected = scrollerSnapshot(scroller);
        const before = readingSnapshot(anchor);
        scroller.scrollTop = 32;
        const inFrame = readingSnapshot(anchor);
        await nextPaint();
        const after = readingSnapshot(anchor);
        const scrollLayer = projectedReadingFor(anchor)?.parentElement;
        scrollLayer?.remove();
        await settleProjection();
        const recoveredClone = projectedReadingFor(anchor);
        const recovery = {
            sameLayer: recoveredClone?.parentElement === scrollLayer,
            cloneConnected: recoveredClone?.isConnected === true,
            layerCount: scroller.querySelectorAll('.jpdb-reader-detached-reading-scroll-layer').length,
        };
        clearProjectedReadings(owner);
        const extentCleared = scrollerSnapshot(scroller);
        platform.remove();
        return {
            ...scrollResult(before, inFrame, after, { extentBefore, extentProjected, extentCleared }),
            recovery,
        };
    };

    window.runSlottedReadingScrollProbe = async () => {
        const platform = document.createElement('dynamic-platform');
        platform.style.cssText = 'display:block;width:280px;margin:100px 0 0 80px;';
        const root = platform.attachShadow({ mode: 'open' });
        root.innerHTML = \`
            <style>
                #scroller { height:120px;overflow:auto;border:1px solid #999;background:white; }
                #content { position:relative;box-sizing:border-box;height:360px;padding-top:52px; }
                slot { position:relative; }
            </style>
            <div id="scroller"><div id="content"><slot name="label"></slot></div></div>
        \`;
        const scroller = root.getElementById('scroller');
        const slot = root.querySelector('slot');
        if (!(scroller instanceof HTMLElement) || !(slot instanceof HTMLSlotElement)) {
            throw new Error('slotted dynamic component did not mount');
        }
        const anchor = document.createElement('span');
        anchor.slot = 'label';
        const { owner, source } = makeReading(anchor, '投影', 'とうえい');
        platform.append(anchor);
        document.body.append(platform);
        const extentBefore = scrollerSnapshot(scroller);
        if (anchor.assignedSlot !== slot) throw new Error('light-DOM reading was not assigned to its slot');
        const measure = () => anchor.getBoundingClientRect();
        syncProjectedReadings(owner, [{ source, anchor, rect: measure(), measure }]);
        await settleProjection();
        const extentProjected = scrollerSnapshot(scroller);
        const before = readingSnapshot(anchor);
        scroller.scrollTop = 32;
        const inFrame = readingSnapshot(anchor);
        await nextPaint();
        const after = readingSnapshot(anchor);
        clearProjectedReadings(owner);
        const extentCleared = scrollerSnapshot(scroller);
        platform.remove();
        return scrollResult(before, inFrame, after, { extentBefore, extentProjected, extentCleared });
    };

    window.runMovedReadingScrollProbe = async () => {
        const mountPlatform = (marginTop: number) => {
            const platform = document.createElement('dynamic-platform');
            platform.style.cssText = 'display:block;width:280px;margin:' + marginTop + 'px 0 0 80px;';
            const root = platform.attachShadow({ mode: 'open' });
            root.innerHTML = \`
                <style>
                    #scroller { height:120px;overflow:auto;border:1px solid #999;background:white; }
                    #content { box-sizing:border-box;height:360px;padding-top:52px; }
                </style>
                <div id="scroller"><div id="content"></div></div>
            \`;
            const scroller = root.getElementById('scroller');
            const content = root.getElementById('content');
            if (!(scroller instanceof HTMLElement) || !(content instanceof HTMLElement)) {
                throw new Error('movable dynamic component did not mount');
            }
            return { platform, scroller, content };
        };
        const first = mountPlatform(20);
        const second = mountPlatform(20);
        const anchor = document.createElement('span');
        const { owner, source } = makeReading(anchor, '移動', 'いどう');
        first.content.append(anchor);
        document.body.append(first.platform, second.platform);
        const measure = () => anchor.getBoundingClientRect();
        syncProjectedReadings(owner, [{ source, anchor, rect: measure(), measure }]);
        await settleProjection();

        // Moving an existing annotation must migrate listeners without another
        // syncProjectedReadings call from the framework integration.
        second.content.append(anchor);
        await new Promise(resolve => setTimeout(resolve, 0));
        await nextPaint();
        const before = readingSnapshot(anchor);
        second.scroller.scrollTop = 32;
        const inFrame = readingSnapshot(anchor);
        await nextPaint();
        const after = readingSnapshot(anchor);
        clearProjectedReadings(owner);
        first.platform.remove();
        second.platform.remove();
        return scrollResult(before, inFrame, after);
    };

    window.runMidScrollThrottledProbe = async () => {
        const platform = document.createElement('dynamic-platform');
        platform.style.cssText = 'display:block;width:280px;margin:100px 0 0 80px;';
        const root = platform.attachShadow({ mode: 'open' });
        root.innerHTML = \`
            <style>
                #scroller { height:120px;overflow:auto;border:1px solid #999;background:white; }
                #content { box-sizing:border-box;height:360px;padding-top:52px; }
            </style>
            <div id="scroller"><div id="content"></div></div>
        \`;
        const scroller = root.getElementById('scroller');
        const content = root.getElementById('content');
        if (!(scroller instanceof HTMLElement) || !(content instanceof HTMLElement)) {
            throw new Error('throttled dynamic component did not mount');
        }
        const anchor = document.createElement('span');
        const { owner, source } = makeReading(anchor, '連続', 'れんぞく');
        content.append(anchor);
        document.body.append(platform);
        const measure = () => anchor.getBoundingClientRect();
        syncProjectedReadings(owner, [{ source, anchor, rect: measure(), measure }]);
        await settleProjection();

        const midScrollSnapshots = [];
        for (let step = 1; step <= 5; step++) {
            scroller.scrollTop = step * 8;
            await nextPaint();
            midScrollSnapshots.push(readingSnapshot(anchor));
        }

        clearProjectedReadings(owner);
        platform.remove();
        return midScrollSnapshots;
    };

    // A masthead pinned over the page does not move when the page scrolls, so
    // its readings must stay on the follow path; document-space anchoring would
    // scroll them away from a word that never moved.
    window.runPinnedReadingProbe = async () => {
        const masthead = document.createElement('header');
        masthead.style.cssText = 'position:fixed;top:0;left:0;right:0;height:56px;background:white;';
        const anchor = document.createElement('span');
        const { owner, source } = makeReading(anchor, '固定', 'こてい');
        masthead.append(anchor);
        document.body.append(masthead);
        const spacer = document.createElement('div');
        spacer.style.cssText = 'height:2400px;';
        document.body.append(spacer);
        const measure = () => anchor.getBoundingClientRect();
        syncProjectedReadings(owner, [{ source, anchor, rect: measure(), measure }]);
        await settleProjection();

        scrollBy(0, 240);
        const inFrame = readingSnapshot(anchor);
        await nextPaint();
        const settled = readingSnapshot(anchor);

        clearProjectedReadings(owner);
        masthead.remove();
        spacer.remove();
        scrollTo(0, 0);
        return { inFrame, settled };
    };

    // The reported tablet symptom is the document scroller carrying a dense
    // page of readings, not one reading in an inner box. Two properties matter
    // and they fail differently: readings must survive a sustained fling where
    // no frame ever settles, and they must stay glued to their word within the
    // scrolled frame itself, before any main-thread work runs. A tablet's
    // compositor moves the page without waiting for script, so a reading that
    // needs a refresh frame to catch up is a reading that visibly comes adrift.
    window.runRootFlingProbe = async (readingCount = 60, steps = 12, distance = 96) => {
        const page = document.createElement('div');
        page.style.cssText = 'margin:0;padding:0;';
        const anchors: HTMLElement[] = [];
        const owners: HTMLElement[] = [];
        for (let index = 0; index < readingCount; index++) {
            // Half the rows are line-clamped feed titles — overflow:hidden with
            // content that overflows by design, the commonest annotated shape on
            // a video feed. They must reach document space like plain rows do.
            const row = document.createElement('p');
            row.style.cssText = index % 2 === 1
                ? 'display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;'
                    + 'margin:0;padding:16px 0;font:16px sans-serif;max-width:200px;'
                : 'margin:0;padding:16px 0;font:16px sans-serif;';
            const anchor = document.createElement('span');
            const { owner } = makeReading(anchor, '連続', 'れんぞく');
            owner.dataset.expression = 'r' + index;
            row.append(anchor);
            // A clamped row only clips if its content genuinely overflows, which
            // is what makes scrollHeight exceed clientHeight on a real title.
            // The filler goes AFTER the anchor so the annotated word stays on
            // the visible first line and only the tail is clipped.
            if (index % 2 === 1) row.append(document.createTextNode('とても長いタイトルのテキストがここに入ります'.repeat(2)));
            page.append(row);
            anchors.push(anchor);
            owners.push(owner);
        }
        document.body.append(page);
        const root = document.documentElement;
        const extentBefore = { width: root.scrollWidth, height: root.scrollHeight };
        for (const [index, anchor] of anchors.entries()) {
            const owner = owners[index];
            const source = owner.querySelector('.jpdb-reader-detached-furi');
            if (!(source instanceof HTMLElement)) throw new Error('fling reading source missing');
            const measure = () => anchor.getBoundingClientRect();
            syncProjectedReadings(owner, [{ source, anchor, rect: measure(), measure }]);
        }
        await settleProjection();
        // Document-space readings are absolutely positioned, so they must not
        // grow the page's scrollable area or a reading could raise a scrollbar.
        const extentAfter = { width: root.scrollWidth, height: root.scrollHeight };
        const documentSpaceCount = document
            .querySelectorAll('.jpdb-reader-projected-furi-document').length;

        const sampleFrame = (frame: number, phase: string) => {
            const clones = new Map<string, HTMLElement>();
            for (const clone of document.querySelectorAll('[data-yomu-projected-reading="true"]')) {
                if (clone instanceof HTMLElement) clones.set(clone.dataset.yomuExpression ?? '', clone);
            }
            let checked = 0;
            let blanked = 0;
            let worstAlignment = 0;
            for (const [index, anchor] of anchors.entries()) {
                const rect = anchor.getBoundingClientRect();
                if (rect.top < 24 || rect.bottom > innerHeight - 8) continue;
                checked += 1;
                const clone = clones.get('r' + index);
                if (!clone) { blanked += 1; continue; }
                if (getComputedStyle(clone).display === 'none') { blanked += 1; continue; }
                const alignment = clone.getBoundingClientRect().bottom - rect.top;
                if (Math.abs(alignment) > Math.abs(worstAlignment)) worstAlignment = alignment;
            }
            return { frame, phase, checked, blanked, worstAlignment, scrollY: Math.round(scrollY) };
        };

        const sustained = [];
        const inFrame = [];
        for (let step = 1; step <= steps; step++) {
            scrollBy(0, distance);
            // Same script turn as the scroll: no rAF has run, so this is the
            // page as the compositor would show it before any catch-up work.
            inFrame.push(sampleFrame(step, 'in-frame'));
            // Then one frame later, still without a settle pass.
            await nextPaint();
            sustained.push(sampleFrame(step, 'sustained'));
        }

        owners.forEach(owner => clearProjectedReadings(owner));
        page.remove();
        scrollTo(0, 0);
        return { inFrame, sustained, extentBefore, extentAfter, documentSpaceCount, readingCount };
    };

    // YouTube search wraps its document-scrolled results in a flex ytd-search
    // shell that advertises overflow-x:auto and clips overflow-y. On iPad that
    // shell commonly has only a 1-2px responsive-rounding range on the cross
    // axis and never actually scrolls, so it is not a compositor scroll owner.
    // Paint after the document is already scrolled, matching the
    // visible-page scanner discovering a later search row, then move the page
    // again and inspect the same script turn before any refresh frame can help.
    window.runYouTubeSearchRootScrollProbe = async (distance = 32) => {
        const topSpacer = document.createElement('div');
        topSpacer.style.cssText = 'height:640px;';
        const search = document.createElement('ytd-search');
        search.style.cssText = 'display:flex;width:100%;overflow-x:auto;overflow-y:hidden;';
        const results = document.createElement('ytd-two-column-search-results-renderer');
        results.style.cssText = 'display:block;flex:0 0 calc(100% + 2px);min-width:0;';
        const anchors: HTMLElement[] = [];
        const owners: HTMLElement[] = [];
        const readingCount = 18;
        for (let index = 0; index < readingCount; index++) {
            const row = document.createElement('ytd-video-renderer');
            row.style.cssText = 'box-sizing:border-box;display:block;height:72px;padding:20px 0;';
            const title = document.createElement('a');
            title.id = 'video-title';
            title.style.cssText = 'display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;';
            const anchor = document.createElement('span');
            const { owner } = makeReading(anchor, '検索', 'けんさく');
            owner.dataset.expression = 'search-r' + index;
            title.append(anchor, document.createTextNode(' Mini Evo の検索結果'));
            row.append(title);
            results.append(row);
            anchors.push(anchor);
            owners.push(owner);
        }
        search.append(results);
        const bottomSpacer = document.createElement('div');
        bottomSpacer.style.cssText = 'height:640px;';
        document.body.append(topSpacer, search, bottomSpacer);

        scrollTo(0, 360);
        const initialScrollY = Math.round(scrollY);
        const extentBefore = {
            scrollWidth: search.scrollWidth,
            clientWidth: search.clientWidth,
            scrollHeight: search.scrollHeight,
            clientHeight: search.clientHeight,
        };
        for (const [index, anchor] of anchors.entries()) {
            const owner = owners[index];
            const source = owner.querySelector('.jpdb-reader-detached-furi');
            if (!(source instanceof HTMLElement)) throw new Error('search reading source missing');
            const measure = () => anchor.getBoundingClientRect();
            syncProjectedReadings(owner, [{ source, anchor, rect: measure(), measure }]);
        }
        await settleProjection();

        const readingSnapshotFor = (anchor: HTMLElement, expression: string) => {
            const clone = [...document.querySelectorAll<HTMLElement>('[data-yomu-projected-reading="true"]')]
                .find(candidate => candidate.dataset.yomuExpression === expression);
            if (!clone) throw new Error('search projected reading was not painted: ' + expression);
            const sourceRect = anchor.getBoundingClientRect();
            const cloneRect = clone.getBoundingClientRect();
            return {
                sourceTop: sourceRect.top,
                cloneBottom: cloneRect.bottom,
                stampedSourceTop: Number(clone.dataset.yomuSourceTop),
                alignment: cloneRect.bottom - sourceRect.top,
                display: getComputedStyle(clone).display,
                documentSpace: clone.classList.contains('jpdb-reader-projected-furi-document'),
                scrollSpace: clone.classList.contains('jpdb-reader-projected-furi-scroll'),
                layerHost: clone.parentElement?.parentElement?.localName || null,
            };
        };
        const before = readingSnapshotFor(anchors[0], 'search-r0');
        const documentSpaceCount = document
            .querySelectorAll('.jpdb-reader-projected-furi-document').length;
        const scrollSpaceCount = document
            .querySelectorAll('.jpdb-reader-projected-furi-scroll').length;
        const searchLayerCount = search
            .querySelectorAll('.jpdb-reader-detached-reading-scroll-layer').length;

        scrollBy(0, distance);
        const inFrame = readingSnapshotFor(anchors[0], 'search-r0');
        await nextPaint();
        const after = readingSnapshotFor(anchors[0], 'search-r0');
        const result = {
            ...scrollResult(before, inFrame, after),
            initialScrollY,
            appliedScrollDelta: Math.round(scrollY) - initialScrollY,
            extentBefore,
            documentSpaceCount,
            scrollSpaceCount,
            searchLayerCount,
            readingCount,
        };

        owners.forEach(owner => clearProjectedReadings(owner));
        topSpacer.remove();
        search.remove();
        bottomSpacer.remove();
        scrollTo(0, 0);
        return result;
    };
`);

esbuild.buildSync({
    entryPoints: [entryPath],
    outfile: bundlePath,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    logLevel: 'silent',
});

const css = readFileSync(path.join(ROOT, 'dist', 'yomu.css'), 'utf8');
const bundle = readFileSync(bundlePath, 'utf8');
const fixture = `<!doctype html>
<html><head><meta charset="utf-8"><style>${css}</style></head>
<body><script>${bundle}</script></body></html>`;

function fail(engine, message, result) {
    throw new Error(`${engine}: ${message}\n${JSON.stringify(result, null, 2)}`);
}

function failWhen(condition, engine, message, result) {
    if (condition) fail(engine, message, result);
}

function verifyScrollMotion(engine, result) {
    failWhen(Math.abs(result.inFrameSourceDelta + 32) > 1,
        engine, 'source did not move in the compositor scroll turn', result);
    failWhen(Math.abs(result.inFrameCloneDelta - result.inFrameSourceDelta) > 1,
        engine, 'projected reading lagged behind its source during the scrolled frame', result);
    failWhen(Math.abs(result.inFrame.alignment) > 1 || result.inFrame.display === 'none',
        engine, 'projected reading was visibly detached during the scrolled frame', result);
    failWhen(Math.abs(result.sourceDelta + 32) > 1,
        engine, 'source did not move with its scroller', result);
    failWhen(Math.abs(result.cloneDelta - result.sourceDelta) > 1,
        engine, 'projected reading moved with the viewport instead of its source', result);
    failWhen(Math.abs(result.stampedSourceDelta - result.sourceDelta) > 1,
        engine, 'projected reading retained stale source geometry', result);
    failWhen(Math.abs(result.after.alignment) > 1 || result.after.display === 'none',
        engine, 'projected reading was not visibly anchored after scroll', result);
    // Every scenario here sits inside an inner scroller, whose offset the
    // document layer knows nothing about. It must use the scroll-native layer,
    // not the document layer or the old frame-delayed viewport fallback.
    failWhen(result.after.documentSpace || !result.after.scrollSpace,
        engine, 'reading inside an inner scroller missed scroll-native anchoring', result);
}

function verifyLayerHost(engine, result, expectedLayerHost) {
    failWhen(expectedLayerHost && result.after.layerHost !== expectedLayerHost,
        engine, `reading used unsafe layer host ${result.after.layerHost}`, result);
}

function verifyScrollerDimensions(engine, result, extents) {
    const { extentBefore, extentProjected, extentCleared } = extents;
    for (const key of ['scrollWidth', 'scrollHeight', 'clientWidth', 'clientHeight']) {
        failWhen(extentProjected[key] !== extentBefore[key] || extentCleared[key] !== extentBefore[key],
            engine, `projection changed the scroller ${key}`, result);
    }
    failWhen(!extentBefore.contentIsLast || !extentProjected.contentIsLast || !extentCleared.contentIsLast,
        engine, 'projection displaced the panel content from :last-child', result);
}

function verifyScrollerLifecycle(engine, result, extents) {
    const { extentBefore, extentProjected, extentCleared } = extents;
    failWhen(extentProjected.layerCount !== 1 || extentCleared.layerCount !== 0,
        engine, 'scroll projection layer was not created and cleaned up exactly once', result);
    failWhen(extentCleared.inlinePosition !== extentBefore.inlinePosition
        || extentCleared.inlinePositionPriority !== extentBefore.inlinePositionPriority,
    engine, 'scroller position ownership was not restored after cleanup', result);
}

function verifyScrollerGuard(engine, result) {
    if (!result.scrollerGuard) return;
    verifyScrollerDimensions(engine, result, result.scrollerGuard);
    verifyScrollerLifecycle(engine, result, result.scrollerGuard);
    if (result.recovery) {
        failWhen(!result.recovery.sameLayer || !result.recovery.cloneConnected || result.recovery.layerCount !== 1,
            engine, 'panel renderer removal did not reconnect the registered scroll layer', result);
    }
}

function verifyScrollResult(engine, scenario, result, expectedLayerHost) {
    console.log(`${engine} ${scenario} scroll: ${JSON.stringify(result)}`);
    const scenarioName = `${engine} ${scenario}`;
    verifyScrollMotion(scenarioName, result);
    verifyLayerHost(scenarioName, result, expectedLayerHost);
    verifyScrollerGuard(scenarioName, result);
}

function verifyFlingFrames(engine, phase, frames) {
    const worst = frames.reduce((carry, frame) => (frame.blanked > carry.blanked
        || (frame.blanked === carry.blanked && Math.abs(frame.worstAlignment) > Math.abs(carry.worstAlignment))
        ? frame
        : carry), frames[0]);
    console.log(`${engine} root fling ${phase}: ${JSON.stringify(worst)}`);
    if (!worst.checked) fail(engine, `root fling ${phase} inspected no readings`, worst);
    for (const frame of frames) {
        if (frame.blanked > 0) {
            fail(engine, `root fling ${phase} frame ${frame.frame} blanked ${frame.blanked} readings`, frame);
        }
        if (Math.abs(frame.worstAlignment) > 2) {
            fail(engine, `root fling ${phase} frame ${frame.frame} drifted off its word`, frame);
        }
    }
}

async function applyEngineThrottling(name, page) {
    if (name !== 'chromium') return;
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

function verifyMidScrollSnapshots(name, snapshots) {
    for (const [index, snapshot] of snapshots.entries()) {
        failWhen(snapshot.display === 'none' || Math.abs(snapshot.alignment) > 2,
            name, `mid-scroll frame ${index + 1} drifted or blanked`, snapshot);
    }
}

function verifyPinnedReading(name, pinned) {
    console.log(`${name} pinned masthead: ${JSON.stringify(pinned)}`);
    failWhen(pinned.inFrame.documentSpace || pinned.settled.documentSpace,
        name, 'reading under a fixed masthead claimed document-space anchoring', pinned);
    for (const [phase, snapshot] of Object.entries(pinned)) {
        failWhen(snapshot.display === 'none' || Math.abs(snapshot.alignment) > 2,
            name, `pinned masthead reading drifted or blanked (${phase})`, snapshot);
    }
}

function verifyRootFling(name, fling) {
    console.log(`${name} root fling modes: ${fling.documentSpaceCount}/${fling.readingCount} document-space, `
        + `page extent ${JSON.stringify(fling.extentBefore)} -> ${JSON.stringify(fling.extentAfter)}`);
    failWhen(fling.documentSpaceCount !== fling.readingCount,
        name, 'plain document text did not use document-space anchoring', fling.documentSpaceCount);
    failWhen(fling.extentAfter.width > fling.extentBefore.width
        || fling.extentAfter.height > fling.extentBefore.height,
    name, 'projected readings grew the page scroll area', fling);
    verifyFlingFrames(name, 'sustained', fling.sustained);
    verifyFlingFrames(name, 'in-frame', fling.inFrame);
}

function verifyYouTubeSearchRootScroll(name, result) {
    console.log(`${name} YouTube search root scroll: ${JSON.stringify(result)}`);
    const scenario = `${name} YouTube search root`;
    failWhen(result.initialScrollY <= 0,
        scenario, 'probe did not annotate after a nonzero document scroll', result);
    const horizontalRange = result.extentBefore.scrollWidth - result.extentBefore.clientWidth;
    failWhen(horizontalRange < 1 || horizontalRange > 4
        || result.extentBefore.scrollHeight > result.extentBefore.clientHeight,
    scenario, 'search shell did not exercise the inert small-range conditional-scroller shape', result);
    failWhen(result.documentSpaceCount !== result.readingCount
        || result.scrollSpaceCount !== 0
        || result.searchLayerCount !== 0,
    scenario, 'non-overflowing search shell claimed projected readings from document space', result);
    failWhen(Math.abs(result.appliedScrollDelta - 32) > 1,
        scenario, 'document did not move by the requested search scroll distance', result);
    failWhen(Math.abs(result.inFrameSourceDelta + 32) > 1,
        scenario, 'search result source did not move in the document scroll turn', result);
    failWhen(Math.abs(result.inFrameCloneDelta - result.inFrameSourceDelta) > 1
        || Math.abs(result.inFrame.alignment) > 1
        || result.inFrame.display === 'none',
    scenario, 'search result reading detached during the immediate document scroll frame', result);
    failWhen(Math.abs(result.sourceDelta + 32) > 1
        || Math.abs(result.cloneDelta - result.sourceDelta) > 1
        || Math.abs(result.after.alignment) > 1
        || result.after.display === 'none',
    scenario, 'search result reading was not aligned after the document scroll frame', result);
}

async function verifyEngine(name, browserType) {
    const browser = await browserType.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
        await applyEngineThrottling(name, page);
        await page.route('https://www.youtube.com/**', route => route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: fixture,
        }));
        await page.goto('https://www.youtube.com/detached-reading-scroll-smoke');
        const nested = await page.evaluate(() => window.runDetachedReadingScrollProbe());
        verifyScrollResult(name, 'nested-shadow', nested, 'scroller');
        const slotted = await page.evaluate(() => window.runSlottedReadingScrollProbe());
        verifyScrollResult(name, 'slotted', slotted, 'content');
        const moved = await page.evaluate(() => window.runMovedReadingScrollProbe());
        verifyScrollResult(name, 'moved-root', moved);
        const midScrollSnapshots = await page.evaluate(() => window.runMidScrollThrottledProbe());
        verifyMidScrollSnapshots(name, midScrollSnapshots);
        const pinned = await page.evaluate(() => window.runPinnedReadingProbe());
        verifyPinnedReading(name, pinned);
        const fling = await page.evaluate(() => window.runRootFlingProbe());
        verifyRootFling(name, fling);
        const search = await page.evaluate(() => window.runYouTubeSearchRootScrollProbe());
        verifyYouTubeSearchRootScroll(name, search);
    } finally {
        await browser.close();
    }
}

try {
    await verifyEngine('chromium', chromium);
    await verifyEngine('webkit', webkit);
    console.log('detached reading scroll smoke passed');
} finally {
    rmSync(tempDir, { recursive: true, force: true });
}
