#!/usr/bin/env node
// Manual probe: load the REAL youtube.com in a real engine with the built
// userscript, then report which on-page surfaces actually received annotations.
//
// Exists because the synthetic fixtures assert chrome is annotated at rest and
// pass, while the owner's iPad screenshots of the same surfaces show buttons and
// metadata bare. Something about the real page differs from the fixtures, so
// this measures the real one rather than arguing from the fixture.
//
// Signed out on purpose: no credentials, and a watch page still carries the
// reported shapes (action buttons, view-count/date metadata, chips, guide rail).
//
//   node scripts/manual/real-youtube-chrome-annotation-probe.mjs [videoId]
// Passing a video ID makes the live-chat same-turn alignment proof mandatory;
// the default keeps the original watch-page census usable for ordinary VODs.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const USERSCRIPT = path.join(ROOT, 'dist/yomu.user.js');
const USERSCRIPT_SOURCE = USERSCRIPT;
const CSS = path.join(ROOT, 'dist/yomu.css');
// Resolve companions from the userscript's own @require list rather than a
// hardcoded subset: the detached-reading projection lives in the annotations
// companion, and omitting it silently produces a page where readings parse but
// nothing is ever painted — which looks exactly like the bug under test.
const COMPANIONS = readFileSync(USERSCRIPT_SOURCE, 'utf8')
    .split(/\r?\n/u)
    .flatMap(line => {
        const match = line.match(/^\/\/ @require https:\/\/yomureader\.com\/greasyfork\/([^#\s]+)(?:#\S+)?$/u);
        if (!match) return [];
        const fileName = path.basename(match[1]);
        return [path.join(ROOT, 'docs/public/greasyfork', fileName)];
    });
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const VIDEO_ID = process.argv[2] ?? 'Zt0GNAKuJIA';
const LIVE_CHAT_REQUIRED = process.argv[2] !== undefined;

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'ja',
    apiKey: '',
    ankiEnabled: false,
    localDictionariesEnabled: true,
    showFloatingButton: true,
    furiganaMode: 'all',
    subtitlePlayerEnabled: false,
    youtubeImmersionEnabled: false,
};

const gmShim = `
(() => {
  const store = new Map(Object.entries(${JSON.stringify({ [SETTINGS_KEY]: settings })}));
  const listeners = new Map();
  window.GM_getValue = (k, d) => store.has(k) ? store.get(k) : d;
  window.GM_setValue = (k, v) => { const old = store.get(k); store.set(k, v); (listeners.get(k)||[]).forEach(f=>{try{f(k,old,v,false)}catch{}}); };
  window.GM_deleteValue = k => store.delete(k);
  window.GM_listValues = () => [...store.keys()];
  window.GM_addValueChangeListener = (k, f) => { const a = listeners.get(k)||[]; a.push(f); listeners.set(k,a); return a.length-1; };
  window.GM_removeValueChangeListener = () => {};
  window.GM_registerMenuCommand = () => {};
  window.GM_openInTab = () => {};
  window.GM_getResourceText = n => n === 'yomuCss' ? ${JSON.stringify(readFileSync(CSS, 'utf8'))} : '';
  window.GM_info = { script: { version: 'probe', name: 'yomu' }, scriptHandler: 'ProbeGM' };
  window.GM = {
    getValue: async (k,d)=>window.GM_getValue(k,d), setValue: async (k,v)=>window.GM_setValue(k,v),
    deleteValue: async k=>window.GM_deleteValue(k), listValues: async ()=>window.GM_listValues(),
    registerMenuCommand: ()=>{}, openInTab: ()=>{}, xmlHttpRequest: o=>window.GM_xmlhttpRequest(o),
  };
  window.GM_xmlhttpRequest = o => {
    fetch(o.url, { method: o.method || 'GET', headers: o.headers, body: o.data })
      .then(async r => { const t = await r.text(); o.onload?.({ status: r.status, statusText: '', responseText: t, response: t, responseHeaders: '', finalUrl: o.url }); })
      .catch(e => o.onerror?.({ status: 0, error: String(e) }));
    return { abort(){} };
  };
})();`;

const INIT_SOURCE = [
    gmShim,
    ...COMPANIONS.map(companion => readFileSync(companion, 'utf8')),
    readFileSync(USERSCRIPT, 'utf8'),
].join('\n;\n');

// The surfaces the owner circled, described by role rather than by brittle id.
const SURFACES = [
    { key: 'masthead create', selector: 'ytd-masthead ytd-button-renderer, ytd-masthead button' },
    { key: 'action buttons (share/save)', selector: '#top-level-buttons-computed button, #actions button' },
    { key: 'subscribe', selector: '#subscribe-button button, ytd-subscribe-button-renderer button' },
    { key: 'view/date metadata', selector: '#info-container, ytd-watch-metadata #info' },
    { key: 'filter chips', selector: 'yt-chip-cloud-chip-renderer' },
    { key: 'guide rail', selector: 'ytd-mini-guide-entry-renderer, ytd-guide-entry-renderer' },
    { key: 'video titles (control)', selector: '#video-title, ytd-watch-metadata h1' },
    { key: 'description', selector: '#description-inline-expander' },
];

async function waitForLiveChatFrame(page) {
    const deadline = Date.now() + 30_000;
    let frame = null;
    while (!frame && Date.now() < deadline) {
        frame = page.frames().find(candidate => /\/live_chat(?:_replay)?(?:[/?#]|$)/u.test(candidate.url())) ?? null;
        if (!frame) await page.waitForTimeout(250);
    }
    return frame;
}

function liveChatAnnotationsReady() {
    const scroller = document.querySelector('#item-scroller');
    const annotatedMessage = scroller?.querySelector(
        'yt-live-chat-text-message-renderer .jpdb-reader-word, '
        + 'yt-live-chat-paid-message-renderer .jpdb-reader-word',
    );
    return Boolean(annotatedMessage
        && document.querySelector('[data-yomu-projected-reading="true"]'));
}

async function waitForLiveChatAnnotations(frame) {
    await frame.waitForSelector('#item-scroller', { state: 'attached', timeout: 30_000 });
    await frame.waitForFunction(liveChatAnnotationsReady, undefined, { timeout: 90_000 });
}

function collectLiveChatDiagnostics() {
    return {
        readerBooted: Boolean(document.querySelector('.jpdb-reader-fab, [data-jpdb-reader-root]')),
        words: document.querySelectorAll('.jpdb-reader-word').length,
        sourceReadings: document.querySelectorAll('.jpdb-reader-detached-furi:not([data-yomu-projected-reading])').length,
        projectedReadings: document.querySelectorAll('[data-yomu-projected-reading="true"]').length,
        scrollLayers: document.querySelectorAll('.jpdb-reader-detached-reading-scroll-layer').length,
        messages: document.querySelectorAll('yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer').length,
    };
}

function optionalLiveChatResult(result) {
    if (LIVE_CHAT_REQUIRED || result.passed) return result;
    return {
        ...result,
        status: 'skipped',
        passed: true,
        observedFailures: result.failures,
        failures: [],
    };
}

async function failedLiveChatResult(frame, error) {
    const diagnostics = await frame.evaluate(collectLiveChatDiagnostics).catch(() => null);
    return {
        status: LIVE_CHAT_REQUIRED ? 'failed' : 'skipped',
        passed: !LIVE_CHAT_REQUIRED,
        failures: LIVE_CHAT_REQUIRED ? ['live-chat-probe-could-not-complete'] : [],
        observedFailures: LIVE_CHAT_REQUIRED ? [] : ['live-chat-probe-could-not-complete'],
        errorType: error instanceof Error ? error.name : 'UnknownError',
        diagnostics,
        messageTextRedacted: true,
    };
}

async function evaluateLiveChatAlignment() {
    const MESSAGE_SELECTOR = 'yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer';
    const PROJECTED_SELECTOR = '[data-yomu-projected-reading="true"]';
    const SOURCE_SELECTOR = '.jpdb-reader-detached-ruby, .jpdb-reader-word';

    function round(value) {
        return Math.round(value * 100) / 100;
    }

    function box(element) {
        const rect = element.getBoundingClientRect();
        return {
            left: round(rect.left), top: round(rect.top), right: round(rect.right),
            bottom: round(rect.bottom), width: round(rect.width), height: round(rect.height),
        };
    }

    function paints(element) {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden'
            && rect.width > 0 && rect.height > 0;
    }

    function describe(element) {
        return element ? `${element.localName}${element.id ? `#${element.id}` : ''}` : null;
    }

    function sourceIsWithinScrollMargin(source, scrollerRect, requestedScrollDelta) {
        const rect = source.getBoundingClientRect();
        const margin = 36;
        return requestedScrollDelta < 0
            ? rect.top >= scrollerRect.top && rect.bottom <= scrollerRect.bottom - margin
            : rect.top >= scrollerRect.top + margin && rect.bottom <= scrollerRect.bottom;
    }

    function projectedReadings() {
        return [...document.querySelectorAll(PROJECTED_SELECTOR)]
            .filter(clone => clone instanceof HTMLElement && paints(clone));
    }

    function sourceReadings(scroller, requestedScrollDelta) {
        const scrollerRect = scroller.getBoundingClientRect();
        const candidates = [...scroller.querySelectorAll(SOURCE_SELECTOR)]
            .filter(source => source instanceof HTMLElement
                && !source.closest('.jpdb-reader-detached-reading-overlay') && paints(source))
            .filter(source => sourceIsWithinScrollMargin(source, scrollerRect, requestedScrollDelta));
        return candidates.filter(source => source.closest(MESSAGE_SELECTOR));
    }

    function sourcePairScore(clone, source) {
        const rect = source.getBoundingClientRect();
        return Math.abs(rect.left - Number(clone.dataset.yomuSourceLeft))
            + Math.abs(rect.top - Number(clone.dataset.yomuSourceTop))
            + Math.abs(rect.width - Number(clone.dataset.yomuSourceWidth))
            + (source.matches('.jpdb-reader-detached-ruby') ? 0 : 4);
    }

    function expressionsMatch(clone, source) {
        const word = source.matches('.jpdb-reader-word') ? source : source.closest('.jpdb-reader-word');
        const expression = clone.dataset.yomuExpression ?? '';
        const sourceExpression = word?.dataset.expression ?? word?.dataset.surface ?? '';
        return !(expression && sourceExpression && expression !== sourceExpression);
    }

    function closestProjectionPair(scroller, requestedScrollDelta) {
        const pairs = [];
        const sources = sourceReadings(scroller, requestedScrollDelta);
        for (const clone of projectedReadings()) {
            for (const source of sources) {
                if (!expressionsMatch(clone, source)) continue;
                pairs.push({ clone, source, score: sourcePairScore(clone, source) });
            }
        }
        return pairs.sort((first, second) => first.score - second.score)[0] ?? null;
    }

    function composedAncestry(source) {
        const ancestry = [];
        let current = source;
        while (current && ancestry.length < 24) {
            const style = getComputedStyle(current);
            ancestry.push({
                element: describe(current),
                position: style.position,
                display: style.display,
                overflowX: style.overflowX,
                overflowY: style.overflowY,
                transform: style.transform,
                contain: style.contain,
            });
            const root = current.getRootNode();
            current = current.assignedSlot
                ?? current.parentElement
                ?? (root instanceof ShadowRoot ? root.host : null);
        }
        return ancestry;
    }

    function annotationCounts(scroller) {
        const clones = [...document.querySelectorAll(PROJECTED_SELECTOR)];
        const messages = [...scroller.querySelectorAll(MESSAGE_SELECTOR)];
        return {
            messages: messages.length,
            annotatedMessages: messages.filter(message => message.querySelector('.jpdb-reader-word')).length,
            words: scroller.querySelectorAll('.jpdb-reader-word').length,
            sourceReadings: scroller.querySelectorAll('.jpdb-reader-detached-furi:not([data-yomu-projected-reading])').length,
            projectedReadings: clones.length,
            visibleProjectedReadings: clones.filter(item => item instanceof HTMLElement && paints(item)).length,
            scrollProjectedReadings: clones.filter(item => item.classList.contains('jpdb-reader-projected-furi-scroll')).length,
            projectedReadingsInsideScroller: scroller.querySelectorAll(PROJECTED_SELECTOR).length,
        };
    }

    function projectionMode(clone) {
        if (clone.classList.contains('jpdb-reader-projected-furi-scroll')) return 'scroll';
        if (clone.classList.contains('jpdb-reader-projected-furi-document')) return 'document';
        return 'viewport';
    }

    function snapshot(label, context) {
        const { scroller, source, clone, layerHost } = context;
        const sourceRect = source.getBoundingClientRect();
        const cloneRect = clone.getBoundingClientRect();
        return {
            label,
            source: box(source),
            clone: box(clone),
            alignment: round(cloneRect.bottom - sourceRect.top),
            stampedSourceTop: round(Number(clone.dataset.yomuSourceTop)),
            mode: projectionMode(clone),
            layerHost: describe(layerHost),
            layerHostInsideScroller: Boolean(layerHost && (layerHost === scroller || scroller.contains(layerHost))),
            extents: {
                scrollTop: round(scroller.scrollTop),
                scrollHeight: scroller.scrollHeight,
                clientHeight: scroller.clientHeight,
                scrollWidth: scroller.scrollWidth,
                clientWidth: scroller.clientWidth,
                nativeLayerCount: scroller.querySelectorAll('.jpdb-reader-detached-reading-scroll-layer').length,
            },
            annotationCounts: annotationCounts(scroller),
        };
    }

    function countMessages(node) {
        if (!(node instanceof Element)) return 0;
        return Number(node.matches(MESSAGE_SELECTOR)) + node.querySelectorAll(MESSAGE_SELECTOR).length;
    }

    function observeMessageMutations(scroller, mutations) {
        const observer = new MutationObserver(records => records.forEach(record => {
            mutations.addedMessages += [...record.addedNodes]
                .reduce((total, node) => total + countMessages(node), 0);
            mutations.removedMessages += [...record.removedNodes]
                .reduce((total, node) => total + countMessages(node), 0);
        }));
        observer.observe(scroller, { childList: true, subtree: true });
        return observer;
    }

    function nextFrame(value) {
        return new Promise(resolve => requestAnimationFrame(() => resolve(value())));
    }

    function framesWithDeltas(samples, before) {
        return samples.map(sample => ({
            ...sample,
            sourceDelta: round(sample.source.top - before.source.top),
            cloneDelta: round(sample.clone.bottom - before.clone.bottom),
            stampedSourceDelta: round(sample.stampedSourceTop - before.stampedSourceTop),
            alignmentDelta: round(sample.alignment - before.alignment),
        }));
    }

    function layerFailures(context) {
        const { appliedScrollDelta, pair, sameTurn, afterActivity, layer } = context;
        const failures = [];
        if (Math.abs(appliedScrollDelta) < 16) failures.push('live-chat-scroller-did-not-move');
        if (pair.score > 12) failures.push('projected-source-match-not-exact');
        if (sameTurn.mode !== 'scroll') failures.push('projected-reading-not-in-scroll-mode');
        if (!sameTurn.layerHostInsideScroller) failures.push('scroll-layer-host-outside-item-scroller');
        if (sameTurn.extents.nativeLayerCount !== 1) failures.push('native-scroll-layer-count-not-one');
        if (afterActivity?.extents.nativeLayerCount !== 1 || !layer?.isConnected) {
            failures.push('native-scroll-layer-not-stable-during-live-activity');
        }
        if (layer?.closest('#items') || layer?.matches(MESSAGE_SELECTOR)) {
            failures.push('native-scroll-layer-entered-message-recycler');
        }
        return failures;
    }

    function liveActivityFailures(mutations, afterPair, afterActivity) {
        const failures = [];
        if (mutations.addedMessages === 0 && mutations.removedMessages === 0) {
            failures.push('live-chat-message-activity-not-observed');
        }
        if (!afterPair || !afterActivity) {
            failures.push('post-activity-message-projection-not-found');
            return failures;
        }
        if (!afterPair.source.closest(MESSAGE_SELECTOR)) failures.push('post-activity-source-not-message-owned');
        if (!afterPair.source.isConnected || !afterPair.clone.isConnected) {
            failures.push('post-activity-projection-disconnected');
        }
        if (afterPair.score > 12) failures.push('post-activity-projected-source-match-not-exact');
        if (Math.abs(afterActivity.alignment) > 2) failures.push('post-activity-projection-misaligned');
        if (afterActivity.mode !== 'scroll' || !afterActivity.layerHostInsideScroller) {
            failures.push('post-activity-projection-left-scroll-layer');
        }
        return failures;
    }

    function alignmentFailures(before, frames, expectedVisualDelta) {
        const failures = [];
        if (Math.abs(before.alignment) > 2) failures.push('initial-projected-source-misaligned');
        if (Math.abs(frames[1].sourceDelta - expectedVisualDelta) > 1.5) {
            failures.push('same-turn-source-delta-mismatch');
        }
        if (Math.abs(frames[1].cloneDelta - frames[1].sourceDelta) > 1.5) {
            failures.push('same-turn-clone-lagged-source');
        }
        if (Math.abs(frames[1].alignmentDelta) > 1.5) failures.push('same-turn-alignment-shifted');
        return failures;
    }

    function frameIntegrityFailures(before, sameTurn, frames) {
        const failures = [];
        if (before.extents.scrollHeight !== sameTurn.extents.scrollHeight
            || before.extents.scrollWidth !== sameTurn.extents.scrollWidth) {
            failures.push('scroll-extents-changed-in-scroll-frame');
        }
        if (frames.some(sample => sample.annotationCounts.projectedReadings < 1
            || sample.annotationCounts.sourceReadings < 1)) failures.push('annotations-disappeared');
        return failures;
    }

    const scroller = document.querySelector('#item-scroller');
    if (!(scroller instanceof HTMLElement)) throw new Error('item-scroller-missing');
    const requestedScrollDelta = scroller.scrollTop >= 32 ? -32 : 32;
    const pair = closestProjectionPair(scroller, requestedScrollDelta);
    if (!pair) throw new Error('visible-projected-source-pair-not-found');
    const { clone, source } = pair;
    const layer = clone.parentElement;
    const layerHost = layer?.parentElement ?? null;
    const snapshotContext = { scroller, source, clone, layerHost };
    const takeSnapshot = label => snapshot(label, snapshotContext);
    const before = takeSnapshot('before');
    const mutations = { addedMessages: 0, removedMessages: 0 };
    const messageObserver = observeMessageMutations(scroller, mutations);
    const sameTurn = await nextFrame(() => {
        scroller.scrollTop += requestedScrollDelta;
        return takeSnapshot('scroll-frame-same-turn');
    });
    const nextFrameSnapshot = await nextFrame(() => takeSnapshot('next-frame'));
    const settledFrame = await nextFrame(() => takeSnapshot('settled-frame'));
    scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight;
    await nextFrame(() => undefined);
    const activityDeadline = Date.now() + 15_000;
    while (mutations.addedMessages === 0 && mutations.removedMessages === 0
        && Date.now() < activityDeadline) {
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    await nextFrame(() => undefined);
    const afterPair = closestProjectionPair(scroller, -1);
    const afterActivity = afterPair ? snapshot('after-live-activity', {
        scroller,
        source: afterPair.source,
        clone: afterPair.clone,
        layerHost: afterPair.clone.parentElement?.parentElement ?? null,
    }) : null;
    messageObserver.disconnect();
    const frames = framesWithDeltas([before, sameTurn, nextFrameSnapshot, settledFrame], before);
    const appliedScrollDelta = round(sameTurn.extents.scrollTop - before.extents.scrollTop);
    const expectedVisualDelta = -appliedScrollDelta;
    const beforeBottomGap = before.extents.scrollHeight - before.extents.clientHeight - before.extents.scrollTop;
    const afterBottomGap = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
    const failures = [
        ...layerFailures({ appliedScrollDelta, pair, sameTurn, afterActivity, layer }),
        ...alignmentFailures(before, frames, expectedVisualDelta),
        ...frameIntegrityFailures(before, sameTurn, frames),
        ...liveActivityFailures(mutations, afterPair, afterActivity),
    ];
    if (beforeBottomGap <= 2 && afterBottomGap > 2) failures.push('live-chat-auto-scroll-did-not-recover');
    return {
        status: failures.length ? 'failed' : 'passed',
        passed: failures.length === 0,
        failures,
        messageTextRedacted: true,
        target: {
            sourceKind: source.classList.contains('jpdb-reader-detached-ruby') ? 'detached-ruby' : 'word',
            messageKind: source.closest(MESSAGE_SELECTOR)?.localName ?? null,
            matchScore: round(pair.score),
            composedAncestry: composedAncestry(source),
        },
        requestedScrollDelta,
        appliedScrollDelta,
        expectedVisualDelta,
        frames,
        afterActivity,
        liveActivity: {
            ...mutations,
            observed: mutations.addedMessages > 0 || mutations.removedMessages > 0,
            beforeBottomGap: round(beforeBottomGap),
            afterBottomGap: round(afterBottomGap),
        },
    };
}

async function probeLiveChatAlignment(page) {
    const frame = await waitForLiveChatFrame(page);
    if (!frame) {
        return {
            status: LIVE_CHAT_REQUIRED ? 'failed' : 'skipped',
            passed: !LIVE_CHAT_REQUIRED,
            failures: LIVE_CHAT_REQUIRED ? ['live-chat-frame-not-found'] : [],
            messageTextRedacted: true,
        };
    }

    try {
        await waitForLiveChatAnnotations(frame);
        return optionalLiveChatResult(await frame.evaluate(evaluateLiveChatAlignment));
    } catch (error) {
        return failedLiveChatResult(frame, error);
    }
}

// YouTube deliberately serves HeadlessChrome an "outdated browser" placeholder
// instead of live chat. Use the installed, headed Chrome channel so this probe
// exercises the same chat implementation a user sees.
const browser = await chromium.launch({ headless: false, channel: 'chrome' });
try {
    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        locale: 'ja-JP',
        extraHTTPHeaders: { 'Accept-Language': 'ja,en;q=0.8' },
        bypassCSP: true,
    });
    // Keep the signed-out probe deterministic: YouTube otherwise interposes a
    // regional consent sheet and never instantiates the live-chat contents.
    await context.addCookies([{
        name: 'SOCS', value: 'CAI', domain: '.youtube.com', path: '/', secure: true,
    }]);
    // Playwright does not guarantee ordering across multiple addInitScript
    // registrations. A userscript manager does guarantee GM shim -> @require
    // companions -> core, so inject that exact sequence as one program.
    await context.addInitScript({ content: INIT_SOURCE });

    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
    await page.goto(`https://www.youtube.com/watch?v=${VIDEO_ID}&hl=ja`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // The reader may annotate the consent button before Playwright resolves its
    // accessible name. Match the visible source text instead of requiring the
    // name to remain byte-for-byte unchanged after furigana is attached.
    const rejectConsent = page.locator('button')
        .filter({ hasText: /(?:Reject all|すべてを拒否)/u })
        .last();
    if (await rejectConsent.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await rejectConsent.click();
        await page.locator('[aria-modal="true"]')
            .waitFor({ state: 'hidden', timeout: 10_000 })
            .catch(() => {});
    }
    // Give the reader time to boot, scan, and run its settle sweep.
    await page.waitForTimeout(15_000);
    await page.evaluate(() => scrollTo(0, 600));
    await page.waitForTimeout(6_000);
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(4_000);

    const report = await page.evaluate(surfaces => {
        const hasJapanese = text => /[぀-ヿ㐀-鿿]/.test(text);
        const paints = clone => {
            const style = getComputedStyle(clone);
            const rect = clone.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0;
        };
        const projected = [...document.querySelectorAll('[data-yomu-projected-reading="true"]')];
        return {
            readerBooted: Boolean(document.querySelector('.jpdb-reader-fab, [data-jpdb-reader-root]')),
            consentWall: Boolean(document.querySelector('[aria-modal="true"]')
                && /Cookie|cookie/.test(document.body.textContent ?? '')),
            totalWords: document.querySelectorAll('.jpdb-reader-word').length,
            // Distinguish "no reading data at all" from "reading parsed but not
            // painted": the source lane is written at parse time, the clone at
            // paint time. Zero sources means the probe has no dictionary, not a
            // projection defect.
            sourceReadings: document.querySelectorAll('.jpdb-reader-detached-furi:not([data-yomu-projected-reading])').length,
            inlineRuby: document.querySelectorAll('.jpdb-reader-word rt').length,
            wordsWithPitch: [...document.querySelectorAll('.jpdb-reader-word')]
                .filter(w => w.dataset.pitchClass && w.dataset.pitchClass !== 'unknown').length,
            totalProjected: projected.length,
            visibleProjected: projected.filter(paints).length,
            // Which readings failed to paint, and by what mechanism. display:none
            // is the occlusion/visibility verdict; a zero box is a measurement
            // failure. Both look identical to a user: the furigana is missing.
            hidden: projected.filter(c => !paints(c)).slice(0, 12).map(c => {
                const cs = getComputedStyle(c);
                const r = c.getBoundingClientRect();
                return {
                    text: c.textContent,
                    display: cs.display,
                    visibility: cs.visibility,
                    width: Math.round(r.width),
                    documentSpace: c.classList.contains('jpdb-reader-projected-furi-document'),
                    stampedTop: c.dataset.yomuSourceTop ?? null,
                    // Content behind a modal is correctly blanked; distinguish
                    // that from a reading lost on a surface the user can see.
                    behindModal: Boolean(c.dataset.yomuExpression && [...document.querySelectorAll('.jpdb-reader-word')]
                        .filter(w => w.textContent?.includes(c.dataset.yomuExpression))
                        .some(w => w.closest('[aria-hidden="true"],[inert]'))),
                };
            }),
            diag: (() => {
                const src = document.querySelector('.jpdb-reader-detached-furi:not([data-yomu-projected-reading])');
                if (!src) return null;
                const word = src.closest('.jpdb-reader-word');
                const host = src.closest('[data-yomu-decoration]');
                const cs = getComputedStyle(src);
                return {
                    text: src.textContent,
                    srcDisplay: cs.display,
                    srcVisibility: cs.visibility,
                    inMirror: Boolean(src.closest('.jpdb-reader-text-mirror')),
                    controlMirror: src.closest('.jpdb-reader-text-mirror')?.dataset.yomuControlMirror ?? null,
                    detachedFlag: src.closest('.jpdb-reader-text-mirror')?.dataset.yomuDetachedReadings ?? null,
                    decoration: host?.getAttribute('data-yomu-decoration') ?? null,
                    wordRect: word ? JSON.parse(JSON.stringify(word.getBoundingClientRect())) : null,
                    overlayLayers: document.querySelectorAll('.jpdb-reader-detached-reading-overlay').length,
                    hasDiagnosticsHook: typeof window.__yomuProjectedReadingDiagnostics === 'function',
                };
            })(),
            surfaces: surfaces.map(surface => {
                const hosts = [...document.querySelectorAll(surface.selector)];
                const japanese = hosts.filter(host => hasJapanese(host.textContent ?? ''));
                const annotated = japanese.filter(host => host.querySelector('.jpdb-reader-word'));
                const withReading = japanese.filter(host => {
                    const words = [...host.querySelectorAll('.jpdb-reader-word')];
                    return words.some(word => word.querySelector('.jpdb-reader-detached-furi, rt'));
                });
                return {
                    key: surface.key,
                    hosts: hosts.length,
                    japaneseHosts: japanese.length,
                    annotated: annotated.length,
                    withReading: withReading.length,
                    sample: japanese[0]?.textContent?.trim().slice(0, 30) ?? '',
                };
            }),
        };
    }, SURFACES);

    const liveChat = await probeLiveChatAlignment(page);
    console.log(JSON.stringify({
        videoId: VIDEO_ID,
        ...report,
        liveChat,
        injectedCompanions: COMPANIONS.map(companion => path.basename(companion)),
        pageErrors: errors.slice(0, 3),
    }, null, 2));
    await page.screenshot({ path: path.join(ROOT, 'artifacts', 'real-youtube-chrome-probe.png'), fullPage: false });
    if (!liveChat.passed) throw new Error(`Live-chat scroll alignment failed: ${liveChat.failures.join(', ')}`);
} finally {
    await browser.close();
}
