#!/usr/bin/env node
// Real-engine regression for viewport-projected readings inside nested dynamic
// components. Shadow-tree scroll events are not composed, so a document-only
// listener leaves fixed clones behind while their source text moves.
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
    const readingSnapshot = (anchor: HTMLElement) => {
        const clone = document.querySelector('[data-yomu-projected-reading="true"]');
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
        };
    };
    const scrollResult = (before, after) => ({
        before,
        after,
        sourceDelta: after.sourceTop - before.sourceTop,
        cloneDelta: after.cloneBottom - before.cloneBottom,
        stampedSourceDelta: after.stampedSourceTop - before.stampedSourceTop,
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
                #content { box-sizing: border-box; height: 360px; padding-top: 52px; }
            </style>
            <div id="scroller"><div id="content"></div></div>
        \`;
        const scroller = platformRoot.getElementById('scroller');
        const content = platformRoot.getElementById('content');
        if (!(scroller instanceof HTMLElement) || !(content instanceof HTMLElement)) {
            throw new Error('outer dynamic component did not mount');
        }

        const component = document.createElement('dynamic-label');
        component.style.display = 'block';
        const componentRoot = component.attachShadow({ mode: 'open' });
        const anchor = document.createElement('span');
        const { owner, source } = makeReading(anchor);
        componentRoot.append(anchor);
        content.append(component);
        document.body.append(platform);

        const measure = () => anchor.getBoundingClientRect();
        syncProjectedReadings(owner, [{
            source,
            anchor,
            rect: measure(),
            measure,
        }]);
        await settleProjection();
        const before = readingSnapshot(anchor);
        scroller.scrollTop = 32;
        await nextPaint();
        const after = readingSnapshot(anchor);
        clearProjectedReadings(owner);
        platform.remove();
        return scrollResult(before, after);
    };

    window.runSlottedReadingScrollProbe = async () => {
        const platform = document.createElement('dynamic-platform');
        platform.style.cssText = 'display:block;width:280px;margin:100px 0 0 80px;';
        const root = platform.attachShadow({ mode: 'open' });
        root.innerHTML = \`
            <style>
                #scroller { height:120px;overflow:auto;border:1px solid #999;background:white; }
                #content { box-sizing:border-box;height:360px;padding-top:52px; }
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
        if (anchor.assignedSlot !== slot) throw new Error('light-DOM reading was not assigned to its slot');
        const measure = () => anchor.getBoundingClientRect();
        syncProjectedReadings(owner, [{ source, anchor, rect: measure(), measure }]);
        await settleProjection();
        const before = readingSnapshot(anchor);
        scroller.scrollTop = 32;
        await nextPaint();
        const after = readingSnapshot(anchor);
        clearProjectedReadings(owner);
        platform.remove();
        return scrollResult(before, after);
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
        await nextPaint();
        const after = readingSnapshot(anchor);
        clearProjectedReadings(owner);
        first.platform.remove();
        second.platform.remove();
        return scrollResult(before, after);
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

function verifyScrollResult(engine, scenario, result) {
    console.log(`${engine} ${scenario} scroll: ${JSON.stringify(result)}`);
    if (Math.abs(result.sourceDelta + 32) > 1) {
        fail(`${engine} ${scenario}`, 'source did not move with its scroller', result);
    }
    if (Math.abs(result.cloneDelta - result.sourceDelta) > 1) {
        fail(`${engine} ${scenario}`, 'projected reading moved with the viewport instead of its source', result);
    }
    if (Math.abs(result.stampedSourceDelta - result.sourceDelta) > 1) {
        fail(`${engine} ${scenario}`, 'projected reading retained stale source geometry', result);
    }
    if (Math.abs(result.after.alignment) > 1 || result.after.display === 'none') {
        fail(`${engine} ${scenario}`, 'projected reading was not visibly anchored after scroll', result);
    }
    // Every scenario here sits inside an inner scroller, whose offset the
    // document layer knows nothing about. Document-space anchoring would leave
    // these readings behind mid-scroll, so they must keep the follow path.
    if (result.after.documentSpace) {
        fail(`${engine} ${scenario}`, 'reading inside an inner scroller claimed document-space anchoring', result);
    }
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

async function verifyEngine(name, browserType) {
    const browser = await browserType.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
        if (name === 'chromium') {
            const client = await page.context().newCDPSession(page);
            await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        }
        await page.route('https://www.youtube.com/**', route => route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: fixture,
        }));
        await page.goto('https://www.youtube.com/detached-reading-scroll-smoke');
        const nested = await page.evaluate(() => window.runDetachedReadingScrollProbe());
        verifyScrollResult(name, 'nested-shadow', nested);
        const slotted = await page.evaluate(() => window.runSlottedReadingScrollProbe());
        verifyScrollResult(name, 'slotted', slotted);
        const moved = await page.evaluate(() => window.runMovedReadingScrollProbe());
        verifyScrollResult(name, 'moved-root', moved);
        const midScrollSnapshots = await page.evaluate(() => window.runMidScrollThrottledProbe());
        for (const [index, snapshot] of midScrollSnapshots.entries()) {
            if (snapshot.display === 'none' || Math.abs(snapshot.alignment) > 2) {
                fail(name, `mid-scroll frame ${index + 1} drifted or blanked`, snapshot);
            }
        }
        const pinned = await page.evaluate(() => window.runPinnedReadingProbe());
        console.log(`${name} pinned masthead: ${JSON.stringify(pinned)}`);
        if (pinned.inFrame.documentSpace || pinned.settled.documentSpace) {
            fail(name, 'reading under a fixed masthead claimed document-space anchoring', pinned);
        }
        for (const [phase, snapshot] of Object.entries(pinned)) {
            if (snapshot.display === 'none' || Math.abs(snapshot.alignment) > 2) {
                fail(name, `pinned masthead reading drifted or blanked (${phase})`, snapshot);
            }
        }
        const fling = await page.evaluate(() => window.runRootFlingProbe());
        console.log(`${name} root fling modes: ${fling.documentSpaceCount}/${fling.readingCount} document-space, `
            + `page extent ${JSON.stringify(fling.extentBefore)} -> ${JSON.stringify(fling.extentAfter)}`);
        if (fling.documentSpaceCount !== fling.readingCount) {
            fail(name, 'plain document text did not use document-space anchoring', fling.documentSpaceCount);
        }
        if (fling.extentAfter.width > fling.extentBefore.width
            || fling.extentAfter.height > fling.extentBefore.height) {
            fail(name, 'projected readings grew the page scroll area', fling);
        }
        verifyFlingFrames(name, 'sustained', fling.sustained);
        verifyFlingFrames(name, 'in-frame', fling.inFrame);
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
