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
}

async function verifyEngine(name, browserType) {
    const browser = await browserType.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
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
