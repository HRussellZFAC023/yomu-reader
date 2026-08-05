#!/usr/bin/env node
// Real-engine regressions for the popup lifecycle: the panel must not throw the
// reader back to the top, must not close itself under a parked cursor, and must
// close when tapped away from on touch.
//
// These four scenarios live here rather than in jsdom because every one of them
// turns on geometry jsdom does not have. tests/reader/hover-lookup.test.ts stubs
// document.elementFromPoint to always hit, which is precisely the hit-test whose
// sampling error kills a hover popover in a real browser; and jsdom has no layout,
// so it cannot show a re-render moving an edge out from under a cursor, or a scroll
// offset being clamped by a body that is briefly shorter than the one it replaced.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
    addGmStorageBridgeInitScript,
    arrayParam,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    DEFAULT_ANKI_CONNECT_URL,
    jsonHttpResponse,
    launchSmokeBrowser,
    mockAnkiConnectResponse,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    resolveAnkiAction,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback } from './lib/smoke-test-helpers.mjs';

const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);
const PAGE_PATH = '/popup-lifecycle.html';
const LOOKUP_WORD = '読む';
// Every content word gets a mocked vocabulary entry. Anything the mock does not
// cover falls through to the local fallback tokenizer, which segments differently
// (it merged 読む into 読むつもり on the first draft of this fixture) and the target
// word's data-expression then no longer matches.
const SENTENCE = '今日は日本語の記事を読みました。';
const WORD_SELECTOR = `[data-smoke-sentence] .jpdb-reader-word[data-expression="${LOOKUP_WORD}"]`;
const POPOVER_SELECTOR = '.jpdb-reader-popover';
const POPOVER_BODY_SELECTOR = '.jpdb-reader-popover .jpdb-reader-popover-body';

// Long enough that the entry genuinely overflows the panel, so there is a real
// scroll offset to lose and real headroom for a shrink to remove. A short gloss
// renders a ~170px definition stack that never scrolls, and every scroll assertion
// downstream becomes a no-op.
const LONG_GLOSS = [
    'to read',
    'to peruse a text carefully from beginning to end without skipping any part of it',
    'to guess, to infer, to read between the lines of somebody else\'s intent',
    'to count, to tally, to number off aloud one item at a time',
    'to interpret a situation, to size up the state of play before committing to it',
    'to foresee, to anticipate what has not yet happened but on the evidence probably will',
    'to recite aloud from a written text, as when reading a passage out to a class',
    'to make sense of a diagram, a map, a chart, or a set of instrument readings',
    'to decipher handwriting, worn inscriptions, or characters partly rubbed away',
    'to take a meaning from something that was not stated, as in reading a mood',
    'to study a subject formally over a period of years at a university',
    'to check a measurement off a dial, gauge, or scale and note the value down',
    'to scan a room, a crowd, or a board position and judge what is going on',
    'to construe a passage one way rather than another when both are grammatical',
    'to follow a score, a set of tablature, or any other written notation while playing',
].join('; ');
const VOCABULARY = [
    ['読みました', LOOKUP_WORD, 'よみました', LONG_GLOSS, ['v5m'], 401, ['not-in-deck'], ['HL']],
    ['今日', '今日', 'きょう', 'today', ['n'], 100, ['not-in-deck'], ['LHH']],
    ['日本語', '日本語', 'にほんご', 'Japanese language', ['n'], 250, ['not-in-deck'], ['LHHH']],
    ['記事', '記事', 'きじ', 'article', ['n'], 700, ['not-in-deck'], ['LH']],
];

// The provider whose late arrival the scroll scenarios turn on. AnkiConnect's
// note DETAIL fetch is the deferred half of the Anki lookup: the render completes
// without it and re-renders when it lands. CARD_RENDER_ANKI_TIMEOUT_MS is 4000, so
// the gate has to open comfortably inside that or the hydration falls back instead
// of re-rendering, and the scenario would pass for the wrong reason.
const ANKI_DETAIL_ACTION = 'notesInfo';
const ANKI_DETAIL_GATE_TIMEOUT_MS = 3_000;
const ANKI_NOTE_ID = 9001;

const SCROLL_TARGET_PX = 220;
const MIN_SCROLL_RANGE_PX = 160;
const WATCHDOG_PERIOD_MS = 90;
const WATCHDOG_PERIODS_TO_OUTLAST = 5;
const HOVER_ENDURANCE_MS = Number(process.env.YOMU_POPUP_HOVER_ENDURANCE_MS || 20_000);
const HOVER_ENDURANCE_WHEEL_INTERVAL_MS = 250;
// Well clear of WATCHDOG_PERIOD_MS in both directions, because what these scenarios
// measure is whether the CONFIGURED delay is the thing that decides when the panel
// goes away. It used not to be: the close timer was cleared and re-armed on every
// coalesced pointer frame, so with a hand still in motion it never elapsed, and the
// panel was taken down instead by the hover watchdog — a poll phased from mount time.
// Measured on 1.8.85 at this delay: closes at 178ms, 221ms, 407ms and 441ms, every
// one of them from the watchdog tick and not one from the close timer. A delay at or
// below the poll period cannot tell the two mechanisms apart.
const HOVER_CLOSE_DELAY_MS = 600;
// Allowance for event dispatch, the rAF coalescing hop, and the Playwright round trip
// that observes the removal. Asserted on BOTH sides: closing early is the same defect
// as closing late — the delay exists so a learner can leave the panel and come back.
const HOVER_CLOSE_LATENCY_SLACK_LATE_MS = 250;
const HOVER_CLOSE_LATENCY_SLACK_EARLY_MS = 120;
// How long the scenarios keep the hand moving after leaving the hover surface. Long
// enough that a per-pointermove re-arm is unmistakable rather than borderline.
const HOVER_CLOSE_WATCH_MS = 3_000;
const HOVER_CLOSE_JIGGLE_INTERVAL_MS = 16;
// How long the pointer is parked on the hover surface before it leaves, per pass. The
// spread is what breaks the phase coincidence a mount-phased poll can hide behind —
// see measureAcrossDwells. A third of the configured delay apart is enough that no two
// passes can share a window this narrow.
const HOVER_CLOSE_DWELLS_MS = [0, 200, 400];
const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
// Short on purpose. The mechanism only exists when the panel is placed ABOVE the
// cursor, where its bottom is pinned to the word and growth or shrinkage moves the
// TOP edge. A tall viewport puts the panel below the word, pins the top for free,
// and the scenario would pass without testing anything.
const HOVER_VIEWPORT = { width: 1280, height: 560 };
const PHONE_VIEWPORT = { width: 390, height: 844 };

const desktopSettings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: 'mock-jpdb-key',
    jitenApiKey: '',
    // On, so LONG_GLOSS actually reaches the panel. With definitions off the card
    // renders a 150px "no definitions" stub and there is nothing to scroll.
    jpdbDefinitionsEnabled: true,
    jitenDefinitionsEnabled: false,
    bunproDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    jpdbKanjiEnabled: false,
    kanjivgEnabled: false,
    kanjiOriginsEnabled: false,
    rtkEnabled: false,
    uchisenEnabled: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    showFloatingButton: false,
    showFurigana: true,
    furiganaMode: 'all',
    ankiEnabled: true,
    ankiSectionEnabled: true,
    ankiConnectUrl: DEFAULT_ANKI_CONNECT_URL,
    ankiDeck: 'Mining',
    ankiModel: 'Imported Japanese',
    lookupOnClick: true,
    lookupOnHover: true,
    popupActivationMode: 'hover',
    hoverOpenDelayMs: 0,
    hoverCloseDelayMs: 0,
    popoverHeightMode: 'fixed',
    popoverHeight: 300,
    popoverWidth: 460,
    popoverBackdropEnabled: false,
    enableLogging: false,
};

// A fixed popover height cannot shrink, so the frame height would never respond to
// a smaller render and the top-edge assertion would be vacuous. The hover scenarios
// use content-driven height, which is also what a learner gets by default.
const hoverSettings = {
    ...desktopSettings,
    popoverHeightMode: 'available',
};

// The shrink scenario measures the frame's response to a smaller render, so it must
// be the only thing that changes the frame. With Anki on, its note-detail hydration
// re-renders the card a beat later and restores the very content the scenario just
// removed, leaving the height unchanged for a reason that has nothing to do with the
// property under test.
const hoverShrinkSettings = {
    ...hoverSettings,
    ankiEnabled: false,
    ankiSectionEnabled: false,
};

// The close-latency scenarios time one specific transition, so nothing else may move
// the panel while they measure: Anki's note-detail hydration re-renders the card a
// beat after mount, and a rebuild landing inside the measurement window would change
// what the pointer is over for a reason unrelated to close scheduling.
const hoverCloseLatencySettings = {
    ...hoverShrinkSettings,
    hoverCloseDelayMs: HOVER_CLOSE_DELAY_MS,
};

const phoneSettings = {
    ...desktopSettings,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    lookupOnHover: false,
    popupActivationMode: 'click',
};

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT, 'Run npm run build first.');

const pageHtml = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<!-- Without this the mobile context lays out at 980px while taps are issued in
     390px viewport coordinates, and the touch scenario aims at the wrong place. -->
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>popup lifecycle</title>
<style>
  body { margin: 0; font: 24px/2 system-ui, sans-serif; background: #10141a; color: #eef2f7; }
  /* The sentence sits low in the viewport so a hover panel is placed ABOVE it. */
  main { padding: 62vh 32px 1200px; }
  p { margin: 0 0 48px; }
</style></head>
<body><main><p data-smoke-sentence>${SENTENCE}</p></main></body></html>`;

const server = await startLoopbackServer((request, response) => {
    if (new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== PAGE_PATH) {
        response.writeHead(404, { 'content-type': 'text/plain' });
        response.end('Not found');
        return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(pageHtml);
}, 'Could not bind popup lifecycle smoke server');

const SCENARIOS = [
    ['scrollAcrossLateProvider', runScrollAcrossLateProvider],
    ['hoverSurvivesContentShrink', runHoverSurvivesContentShrink],
    ['hoverSurvivesSustainedWheel', runHoverSurvivesSustainedWheel],
    ['hoverClosesAfterLeavingWord', runHoverClosesAfterLeavingWord],
    ['hoverClosesAfterLeavingPanel', runHoverClosesAfterLeavingPanel],
    ['touchDismissesInertOverlays', runTouchDismissesInertOverlays],
];
// Each scenario covers a different mechanism, so being able to run one is how you
// confirm it still fails on unfixed code instead of trusting the whole bundle.
const requested = (process.env.YOMU_POPUP_SCENARIOS || '').split(',').map(name => name.trim()).filter(Boolean);
const selected = requested.length ? SCENARIOS.filter(([name]) => requested.includes(name)) : SCENARIOS;
assert(selected.length > 0, 'YOMU_POPUP_SCENARIOS matched no scenario', { requested, known: SCENARIOS.map(([name]) => name) });

const report = { ok: false, scenarios: {} };
const browser = await launchSmokeBrowser();

try {
    for (const [name, run] of selected) report.scenarios[name] = await run(browser, server);
    report.ok = true;
    writeFileSync(path.join(ARTIFACTS, 'popup-lifecycle-smoke.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log('popup lifecycle smoke passed');
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}

/**
 * (a) A learner has scrolled down to the examples; a provider lands seconds later
 * and rebuilds the panel. The offset must survive the rebuild.
 *
 * The rebuild count is asserted too. Without it the scenario passes whenever the
 * late render fails to happen at all, which is the easiest way for a scroll test
 * to go quietly green while testing nothing.
 */
async function runScrollAcrossLateProvider(browser, server) {
    const gate = createGate();
    const { context, page, requests } = await openReaderPage(browser, server, {
        settings: desktopSettings,
        viewport: DESKTOP_VIEWPORT,
        ankiDetailGate: gate,
    });
    try {
        await page.locator(WORD_SELECTOR).first().click();
        await page.waitForSelector(POPOVER_BODY_SELECTOR, { timeout: 15_000 });
        await waitForScrollableBody(page);
        // Installed only once the panel exists: the recorder watches the popover
        // element itself for the body being swapped out, and there is nothing to
        // watch before the mount.
        await installPopoverRebuildRecorder(page);

        const scrolled = await scrollPopoverBody(page, SCROLL_TARGET_PX);
        assert(scrolled >= 120, 'Popover body did not scroll far enough to prove anything', { scrolled });

        gate.open();
        const rebuilt = await waitForPopoverRebuild(page);
        const settled = await popoverScrollState(page);

        assert(
            rebuilt.rebuilds >= 1,
            'No late provider rebuild was observed, so the scroll assertion proves nothing',
            { rebuilt, requests: requests.slice(-24) },
        );
        assert(settled.connected, 'Popover disappeared while a late provider resolved', settled);
        assert(
            Math.abs(settled.scrollTop - scrolled) <= 2,
            'Late provider rebuild threw the reader back up the entry',
            { scrolled, settled, rebuilt },
        );
        return { scrolled, settled, rebuilds: rebuilt.rebuilds, minScrollTopSeen: rebuilt.minScrollTopSeen };
    } finally {
        await context.close();
    }
}

/**
 * (b) The cursor is parked in the panel's upper third and the content shrinks.
 * A hover popover placed above the cursor is bottom-pinned, so before the fix its
 * top edge travelled the full height delta and slid out from under the cursor;
 * the watchdog then hit-tested the gap and closed the panel.
 */
async function runHoverSurvivesContentShrink(browser, server) {
    const { context, page } = await openReaderPage(browser, server, {
        settings: hoverShrinkSettings,
        viewport: HOVER_VIEWPORT,
    });
    try {
        const hovered = await openHoverPopoverAtUpperThird(page);
        const before = await popoverBox(page);

        const shrunk = await shrinkPopoverContent(page);
        assert(shrunk.removed >= 1, 'Could not shrink the hover popover, so nothing was tested', shrunk);
        await page.waitForTimeout(WATCHDOG_PERIOD_MS * WATCHDOG_PERIODS_TO_OUTLAST + 120);

        const after = await popoverBox(page);
        assert(after.connected, 'Hover popover closed itself after its content shrank under a parked cursor', { before, after, shrunk });
        assert(
            Math.abs(after.top - before.top) <= 2,
            'Hover popover top edge moved under a parked cursor when its content shrank',
            { before, after, shrunk },
        );
        assert(after.height < before.height, 'Popover did not actually get shorter, so the edge assertion is vacuous', { before, after });
        return { pointer: hovered.pointer, before, after, shrunk };
    } finally {
        await context.close();
    }
}

/**
 * (c) The reported gesture: scroll up and down inside the hover popup for ~20s,
 * with a provider landing midway. That is roughly 220 watchdog samples, each an
 * independent chance to mis-resolve the element under the cursor.
 *
 * Honest status: this is an ENDURANCE guard, not a discriminating regression test.
 * Measured against unfixed source it PASSES, because the wheel events keep the
 * stored pointer point fresh at a spot inside the panel and the hit-test keeps
 * landing. The discriminating half of the same mechanism is scenario (b), which
 * moves the panel instead of the pointer and does fail on unfixed source. Keep this
 * one for what it does cover: that the pointer latch cannot wedge the wrong way and
 * that nothing in a long sustained interaction tears the panel down.
 */
async function runHoverSurvivesSustainedWheel(browser, server) {
    const gate = createGate();
    const { context, page } = await openReaderPage(browser, server, {
        settings: hoverSettings,
        viewport: HOVER_VIEWPORT,
        ankiDetailGate: gate,
    });
    try {
        const hovered = await openHoverPopoverAtUpperThird(page);
        await installPopoverRebuildRecorder(page);

        const deadline = Date.now() + HOVER_ENDURANCE_MS;
        const releaseAt = Date.now() + Math.floor(HOVER_ENDURANCE_MS / 2);
        let released = false;
        let wheels = 0;
        let closedAfterMs = null;
        while (Date.now() < deadline) {
            if (!released && Date.now() >= releaseAt) {
                gate.open();
                released = true;
            }
            await page.mouse.wheel(0, wheels % 2 === 0 ? 120 : -120);
            wheels += 1;
            await page.waitForTimeout(HOVER_ENDURANCE_WHEEL_INTERVAL_MS);
            if (!(await popoverBox(page)).connected) {
                closedAfterMs = HOVER_ENDURANCE_MS - (deadline - Date.now());
                break;
            }
        }
        if (!released) gate.open();

        const after = await popoverBox(page);
        const rebuilds = await readPopoverRebuilds(page);
        assert(
            after.connected,
            `Hover popover closed itself during ${HOVER_ENDURANCE_MS}ms of scrolling inside it`,
            { closedAfterMs, wheels, rebuilds, pointer: hovered.pointer },
        );
        return { durationMs: HOVER_ENDURANCE_MS, wheels, rebuilds: rebuilds.rebuilds, after };
    } finally {
        await context.close();
    }
}

/**
 * (c2) The flip side of (b) and (c), and the one the owner reported: the panel must
 * also GO AWAY. The pointer leaves the hovered word for empty page space and never
 * enters the panel, and the hand keeps moving the way a hand does. The close is owed
 * hoverCloseDelayMs after the departure — not after the gesture eventually stops, and
 * not on some other clock's cadence.
 *
 * Measured from inside the page rather than by polling from node: `departedAt` is the
 * first pointermove that lands on neither a parsed word nor the panel, `removedAt` is
 * the mutation that unmounts the panel. Polling would fold the harness round trip into
 * the number and could not tell a 90ms close from a 300ms one.
 */
async function runHoverClosesAfterLeavingWord(browser, server) {
    const { context, page } = await openReaderPage(browser, server, {
        settings: hoverCloseLatencySettings,
        viewport: HOVER_VIEWPORT,
    });
    try {
        const word = page.locator(WORD_SELECTOR).first();
        const passes = await measureAcrossDwells(page, async dwellMs => {
            await word.hover();
            await page.waitForSelector(POPOVER_BODY_SELECTOR, { timeout: 15_000 });
            const panel = await popoverBox(page);
            assert(panel.connected, 'Hover popover never mounted');
            const wordBox = await word.boundingBox();
            assert(wordBox, 'Could not measure the hovered word');
            // Straight DOWN from the word into main's bottom padding. The panel is placed
            // above the word in this viewport, so descending never touches it, and the
            // sentence is one line so no neighbouring word is crossed on the way — either
            // would legitimately keep a popup open and the measurement would be of
            // retargeting rather than of closing.
            const destination = await pickEmptyPagePoint(page, [
                { x: Math.round(wordBox.x + wordBox.width / 2), y: Math.round(wordBox.y + wordBox.height + 140) },
                { x: Math.round(wordBox.x + wordBox.width / 2), y: HOVER_VIEWPORT.height - 24 },
            ]);
            assert(destination, 'Found no empty page space below the sentence to move into', { wordBox, panel });
            assert(
                destination.y > panel.top + panel.height,
                'Chosen destination is not clear of the panel, so leaving the word would cross it',
                { destination, panel },
            );

            await page.waitForTimeout(dwellMs);
            const measured = await measureHoverCloseLatency(page, destination);
            assertHoverCloseLatency(measured, 'Hover popover outlived the pointer leaving the word', { panel, wordBox });
            return measured;
        });
        return { passes, latenciesMs: passes.map(pass => pass.latencyMs) };
    } finally {
        await context.close();
    }
}

/**
 * (c3) The same guarantee for the other close path: the pointer went INTO the panel
 * (latching it open, which is what 1.8.80 added) and then left. One pointerleave must
 * schedule one close that actually fires — the latch releasing is not enough if the
 * close it schedules is cancelled again by the next pointermove.
 */
async function runHoverClosesAfterLeavingPanel(browser, server) {
    const { context, page } = await openReaderPage(browser, server, {
        settings: hoverCloseLatencySettings,
        viewport: HOVER_VIEWPORT,
    });
    try {
        const passes = await measureAcrossDwells(page, async dwellMs => {
            const hovered = await openHoverPopoverAtUpperThird(page);
            const panel = hovered.box;
            // Away from the panel on the side the word is NOT on. The panel sits above the
            // word here, so leaving upward or sideways cannot land back on the anchor and
            // re-open the very lookup being timed.
            const destination = await pickEmptyPagePoint(page, [
                { x: Math.round(panel.left + panel.width + 60), y: Math.round(panel.top + panel.height / 2) },
                { x: Math.max(4, Math.round(panel.left - 60)), y: Math.round(panel.top + panel.height / 2) },
                { x: Math.round(panel.left + panel.width / 2), y: Math.max(4, Math.round(panel.top - 40)) },
            ]);
            assert(destination, 'Found no empty page space beside the panel to move into', { panel });

            await page.waitForTimeout(dwellMs);
            const measured = await measureHoverCloseLatency(page, destination);
            assertHoverCloseLatency(measured, 'Hover popover outlived the pointer leaving the panel', { panel, pointer: hovered.pointer });
            return measured;
        });
        return { passes, latenciesMs: passes.map(pass => pass.latencyMs) };
    } finally {
        await context.close();
    }
}

/**
 * Runs one close measurement per dwell, re-opening the panel each time, and returns
 * them all.
 *
 * The dwells are the whole reason this is a gate rather than a coin toss. The
 * mechanism that used to close the panel is a poll phased from the panel's MOUNT, so
 * its latency is `period - (time from mount to departure)`: hold the choreography
 * fixed and that lands on the same value every run, which can be inside the asserted
 * window by pure coincidence (it was, for the word scenario, on 1.8.85). Parking the
 * pointer for a different length of time before leaving shifts that phase by the dwell
 * and leaves a delay-owned close untouched, so the three passes agree only when the
 * configured delay is what decides.
 */
async function measureAcrossDwells(page, measure) {
    const passes = [];
    for (const dwellMs of HOVER_CLOSE_DWELLS_MS) {
        passes.push({ dwellMs, ...await measure(dwellMs) });
        await page.waitForSelector(POPOVER_SELECTOR, { state: 'detached', timeout: 5_000 });
    }
    return passes;
}

/**
 * (d) On a phone there is no backdrop, so the outside-pointerdown allowlist is the
 * only dismissal route — and it used to treat every Yomu-owned surface as
 * keep-open, including the surfaces that paint over the page text the learner is
 * tapping. Parameterised over the three shapes that do that.
 */
async function runTouchDismissesInertOverlays(browser, server) {
    const overlays = [
        { label: 'ocr-layer', className: 'jpdb-ocr-layer', childClassName: 'jpdb-ocr-line' },
        { label: 'subtitle-root', className: 'jpdb-subtitle-player', childClassName: 'jpdb-subtitle-primary' },
        { label: 'page-addon-root', className: 'yomu-jpdb-page-addon', childClassName: 'yomu-jpdb-word-addon-body' },
    ];
    const results = [];
    for (const overlay of overlays) {
        const { context, page } = await openReaderPage(browser, server, {
            settings: phoneSettings,
            viewport: PHONE_VIEWPORT,
            hasTouch: true,
            isMobile: true,
        });
        try {
            await page.locator(WORD_SELECTOR).first().tap();
            await page.waitForSelector(POPOVER_SELECTOR, { timeout: 15_000 });
            const backdrops = await page.locator('.jpdb-reader-backdrop').count();
            assert(backdrops === 0, 'Phone fixture produced a backdrop, so it is not reproducing the reported configuration', { backdrops });

            await selectSentenceText(page);
            assert(await selectedText(page), 'Fixture failed to select page text, so the selection assertion is vacuous');

            const target = await mountInertOverlay(page, overlay);
            await page.touchscreen.tap(target.x, target.y);
            await page.waitForTimeout(200);

            const remaining = await page.locator(POPOVER_SELECTOR).count();
            const selection = await selectedText(page);
            assert(remaining === 0, `Tapping inert ${overlay.label} paint left the popup open`, { overlay: overlay.label, remaining, target });
            assert(selection === '', `Tapping inert ${overlay.label} paint left the page text selected`, { overlay: overlay.label, selection });
            results.push({ overlay: overlay.label, target, backdrops, dismissed: true, selectionCleared: true });
        } finally {
            await context.close();
        }
    }
    return results;
}

async function openReaderPage(browser, server, options) {
    const context = await browser.newContext({
        bypassCSP: true,
        viewport: options.viewport,
        hasTouch: Boolean(options.hasTouch),
        isMobile: Boolean(options.isMobile),
    });
    const page = await context.newPage();
    const requests = [];
    await page.exposeFunction('__yomuPopupLifecycleRequest', request => handleRequest(request, requests, options.ankiDetailGate));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: options.settings,
        css: readFileSync(CSS_PATH, 'utf8'),
        requestBridgeName: '__yomuPopupLifecycleRequest',
    });
    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ path: CSS_PATH });
    // The userscript's @require companions carry the learning-target runtime and
    // must execute in declaration order before main, exactly as a userscript
    // manager would run them; loading main alone throws "learning-target runtime
    // did not load" and annotates nothing.
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForFunction(
        selector => document.querySelectorAll(selector).length >= 1,
        WORD_SELECTOR,
        { timeout: 20_000 },
    );
    return { context, page, requests };
}

// A one-shot latch the page-side request handler awaits. `open` is called from the
// scenario, so the provider resolves at a moment the test chose rather than one the
// network happened to produce.
function createGate() {
    let release = () => undefined;
    const promise = new Promise(resolve => { release = resolve; });
    return { promise, open: () => release() };
}

async function handleRequest(request, requestLog, ankiDetailGate) {
    const url = new URL(request.url);
    if (url.origin === 'https://jpdb.io' && url.pathname === '/api/v1/parse') {
        const body = readJsonBody(request.data);
        requestLog.push({ kind: 'jpdb-parse' });
        return jsonHttpResponse(mockJpdbParseFromVocabulary(body, VOCABULARY));
    }
    if (url.origin === 'https://jpdb.io') return jsonHttpResponse({});
    if (request.url.startsWith(DEFAULT_ANKI_CONNECT_URL)) {
        const body = readJsonBody(request.data);
        if (ankiDetailGate && body.action === ANKI_DETAIL_ACTION) {
            requestLog.push({ kind: 'anki-gated', action: body.action });
            await Promise.race([ankiDetailGate.promise, delay(ANKI_DETAIL_GATE_TIMEOUT_MS)]);
        }
        requestLog.push({ kind: 'anki', action: body.action });
        return jsonHttpResponse(mockAnkiConnectResponse(body, ankiAction, { requestLog }));
    }
    requestLog.push({ kind: 'unexpected', url: request.url });
    return { status: 404, responseText: '' };
}

function ankiAction(action, params) {
    return resolveAnkiAction(action, params, {
        version: () => 6,
        deckNames: () => ['Mining'],
        modelNames: () => ['Imported Japanese'],
        modelFieldNames: () => ['Expression', 'Reading', 'Meaning', 'Sentence'],
        findNotes: () => [ANKI_NOTE_ID],
        findCards: () => [],
        notesInfo: params2 => arrayParam(params2.notes).map(noteId => ankiNoteInfo(Number(noteId))),
        cardsInfo: () => [],
        areDue: () => [],
        canAddNotes: params2 => arrayParam(params2.notes).map(() => true),
        getDeckStats: () => ({ 1: { name: 'Mining', total_in_deck: 1 } }),
        getDecks: () => ({ Mining: [] }),
    });
}

function ankiNoteInfo(noteId) {
    return {
        noteId,
        modelName: 'Imported Japanese',
        tags: ['yomu'],
        cards: [8001],
        fields: {
            Expression: { value: LOOKUP_WORD, order: 0 },
            Reading: { value: 'よむ', order: 1 },
            Meaning: { value: 'to read (existing Anki note detail)', order: 2 },
            Sentence: { value: SENTENCE, order: 3 },
        },
    };
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Counts full rebuilds of the popover frame (the setInnerHtml swap that replaces
// .jpdb-reader-popover-body) and the lowest scrollTop seen after one, so a
// momentary reset that a later frame repairs is still visible in the report.
async function installPopoverRebuildRecorder(page) {
    await page.evaluate(() => {
        const state = { rebuilds: 0, minScrollTopSeen: null };
        window.__yomuPopupLifecycle = state;
        const observed = document.querySelector('.jpdb-reader-popover');
        if (!(observed instanceof HTMLElement)) throw new Error('no popover to observe');
        const observer = new MutationObserver(records => {
            for (const record of records) {
                if (record.target !== observed) continue;
                const replaced = [...record.removedNodes].some(
                    node => node instanceof HTMLElement && node.classList.contains('jpdb-reader-popover-body'),
                );
                if (!replaced) continue;
                state.rebuilds += 1;
                const body = document.querySelector('.jpdb-reader-popover .jpdb-reader-popover-body');
                const scrollTop = body instanceof HTMLElement ? body.scrollTop : null;
                if (scrollTop !== null && (state.minScrollTopSeen === null || scrollTop < state.minScrollTopSeen)) {
                    state.minScrollTopSeen = scrollTop;
                }
            }
        });
        observer.observe(observed, { childList: true, subtree: false });
        state.stop = () => observer.disconnect();
    });
}

async function readPopoverRebuilds(page) {
    return page.evaluate(() => ({
        rebuilds: window.__yomuPopupLifecycle?.rebuilds ?? 0,
        minScrollTopSeen: window.__yomuPopupLifecycle?.minScrollTopSeen ?? null,
    }));
}

async function waitForPopoverRebuild(page) {
    await page.waitForFunction(() => (window.__yomuPopupLifecycle?.rebuilds ?? 0) >= 1, null, { timeout: 10_000 })
        .catch(() => undefined);
    // Two frames past the rebuild: restorePopoverScrollOffsetSoon deliberately
    // makes a second pass on the next animation frame for the case where the
    // rebuilt body was still shorter than the one it replaced.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return readPopoverRebuilds(page);
}

// A timeout here means the fixture stopped producing an overflowing entry, which
// would silently turn every scroll assertion into a no-op. Report the measurement
// instead of a bare Playwright timeout so the cause is legible.
async function waitForScrollableBody(page) {
    try {
        await page.waitForFunction(({ selector, minRange }) => {
            const body = document.querySelector(selector);
            return body instanceof HTMLElement && body.scrollHeight - body.clientHeight > minRange;
        }, { selector: POPOVER_BODY_SELECTOR, minRange: MIN_SCROLL_RANGE_PX }, { timeout: 15_000 });
    } catch {
        const measured = await page.evaluate(selector => {
            const body = document.querySelector(selector);
            if (!(body instanceof HTMLElement)) return { present: false };
            return {
                present: true,
                scrollHeight: body.scrollHeight,
                clientHeight: body.clientHeight,
                children: [...body.children].map(child => `${child.className}:${Math.round(child.getBoundingClientRect().height)}`),
            };
        }, POPOVER_BODY_SELECTOR);
        assert(false, 'Popover entry never overflowed its body, so no scroll assertion could mean anything', measured);
    }
}

async function scrollPopoverBody(page, target) {
    return page.evaluate(({ selector, top }) => {
        const body = document.querySelector(selector);
        if (!(body instanceof HTMLElement)) return 0;
        body.scrollTop = top;
        return body.scrollTop;
    }, { selector: POPOVER_BODY_SELECTOR, top: target });
}

async function popoverScrollState(page) {
    return page.evaluate(selector => {
        const body = document.querySelector(selector);
        if (!(body instanceof HTMLElement)) return { connected: false, scrollTop: null };
        return { connected: true, scrollTop: body.scrollTop, scrollRange: body.scrollHeight - body.clientHeight };
    }, POPOVER_BODY_SELECTOR);
}

async function popoverBox(page) {
    return page.evaluate(selector => {
        const popover = document.querySelector(selector);
        if (!(popover instanceof HTMLElement)) return { connected: false };
        const rect = popover.getBoundingClientRect();
        return { connected: true, top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    }, POPOVER_SELECTOR);
}

// Records, in page time, the moment the pointer left every hover surface and the
// moment the panel was unmounted. Both live in the page so the reported latency is
// the product's, with no harness round trip folded into it.
async function installHoverCloseRecorder(page) {
    await page.evaluate(popoverSelector => {
        // Re-installed once per pass, so the previous pass's observer and listener have
        // to go: left connected they would keep writing to their own state object and
        // the surviving one would report a departure that belongs to an earlier gesture.
        window.__yomuHoverCloseTeardown?.();
        const state = { departedAt: null, removedAt: null, lastInsideAt: null, moves: 0, movesAfterDeparture: 0 };
        window.__yomuHoverClose = state;
        const insideHoverSurface = target => target instanceof Element
            && Boolean(target.closest('.jpdb-reader-word') || target.closest(popoverSelector));
        const onPointerMove = event => {
            state.moves += 1;
            if (insideHoverSurface(event.target)) {
                state.lastInsideAt = performance.now();
                // Re-entering restarts the clock: the close is owed from the LAST
                // departure, and a scenario that wandered back over the word would
                // otherwise report a latency it never actually owed.
                state.departedAt = null;
                state.movesAfterDeparture = 0;
                return;
            }
            if (state.departedAt === null) state.departedAt = performance.now();
            state.movesAfterDeparture += 1;
        };
        document.addEventListener('pointermove', onPointerMove, true);
        const observer = new MutationObserver(() => {
            if (state.removedAt !== null || document.querySelector(popoverSelector)) return;
            state.removedAt = performance.now();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        window.__yomuHoverCloseTeardown = () => {
            observer.disconnect();
            document.removeEventListener('pointermove', onPointerMove, true);
        };
    }, POPOVER_SELECTOR);
}

async function readHoverCloseRecord(page) {
    return page.evaluate(() => {
        const state = window.__yomuHoverClose;
        if (!state) return { present: false };
        return {
            present: true,
            departedAt: state.departedAt,
            removedAt: state.removedAt,
            lastInsideAt: state.lastInsideAt,
            moves: state.moves,
            movesAfterDeparture: state.movesAfterDeparture,
        };
    });
}

async function pickEmptyPagePoint(page, candidates) {
    for (const point of candidates) {
        const empty = await page.evaluate(({ x, y, popoverSelector }) => {
            const target = document.elementFromPoint(x, y);
            return target instanceof Element
                && !target.closest('.jpdb-reader-word')
                && !target.closest(popoverSelector);
        }, { ...point, popoverSelector: POPOVER_SELECTOR });
        if (empty) return point;
    }
    return null;
}

// Travels to `destination` in steps, then keeps the hand alive there. Both halves
// matter: a single jump gives the close scheduler one event to react to and would hide
// a per-pointermove re-arm completely, and stopping dead after arrival lets a
// scheduler that only fires once the pointer is still look correct.
async function measureHoverCloseLatency(page, destination) {
    await installHoverCloseRecorder(page);
    await page.mouse.move(destination.x, destination.y, { steps: 12 });
    const deadline = Date.now() + HOVER_CLOSE_WATCH_MS;
    let jiggles = 0;
    let record = await readHoverCloseRecord(page);
    while (record.removedAt === null && Date.now() < deadline) {
        await page.mouse.move(destination.x + (jiggles % 2 === 0 ? 1 : -1), destination.y);
        jiggles += 1;
        await page.waitForTimeout(HOVER_CLOSE_JIGGLE_INTERVAL_MS);
        record = await readHoverCloseRecord(page);
    }
    const latencyMs = record.departedAt !== null && record.removedAt !== null
        ? Math.round(record.removedAt - record.departedAt)
        : null;
    return {
        destination,
        jiggles,
        latencyMs,
        configuredDelayMs: HOVER_CLOSE_DELAY_MS,
        earliestMs: HOVER_CLOSE_DELAY_MS - HOVER_CLOSE_LATENCY_SLACK_EARLY_MS,
        latestMs: HOVER_CLOSE_DELAY_MS + HOVER_CLOSE_LATENCY_SLACK_LATE_MS,
        ...record,
    };
}

function assertHoverCloseLatency(measured, message, context) {
    assert(measured.present, 'Hover close recorder never installed', { measured, ...context });
    assert(
        measured.movesAfterDeparture >= 2,
        'The pointer never produced moves outside the hover surfaces, so no close was owed and the measurement is vacuous',
        { measured, ...context },
    );
    assert(measured.departedAt !== null, 'Pointer never left the hover surfaces', { measured, ...context });
    assert(
        measured.removedAt !== null,
        `${message}: still open after ${HOVER_CLOSE_WATCH_MS}ms of pointer movement away from it`,
        { measured, ...context },
    );
    assert(
        measured.latencyMs <= measured.latestMs,
        `${message}: closed ${measured.latencyMs}ms after departure, and the configured delay is ${HOVER_CLOSE_DELAY_MS}ms`,
        { measured, ...context },
    );
    // The early bound is the same defect seen from the other side: a panel taken down
    // by a poll on its own cadence ignores the learner's delay in whichever direction
    // the phase happens to fall, and a delay that closes early is a panel you cannot
    // return to.
    assert(
        measured.latencyMs >= measured.earliestMs,
        `${message}: closed ${measured.latencyMs}ms after departure, ahead of the configured ${HOVER_CLOSE_DELAY_MS}ms delay, so something other than that delay decided it`,
        { measured, ...context },
    );
}

// Park the cursor a third of the way down the panel: high enough that a top edge
// travelling downward leaves the pointer outside, which is the failure the
// position lock exists to prevent.
async function openHoverPopoverAtUpperThird(page) {
    const word = page.locator(WORD_SELECTOR).first();
    await word.hover();
    await page.waitForSelector(POPOVER_BODY_SELECTOR, { timeout: 15_000 });
    await waitForScrollableBody(page);
    const box = await popoverBox(page);
    assert(box.connected, 'Hover popover never mounted');
    const pointer = { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 3) };
    await page.mouse.move(pointer.x, pointer.y);
    await page.waitForTimeout(120);
    const stillOpen = await popoverBox(page);
    assert(stillOpen.connected, 'Hover popover closed while the pointer moved into it', { box, pointer });
    return { pointer, box: stillOpen };
}

// Stand-in for a hydration pass that renders less than the previous one: the
// product-side trigger is a provider returning a smaller entry, and what matters
// to this scenario is the height change and the reposition it drives, not which
// provider caused it.
async function shrinkPopoverContent(page) {
    const shrunk = await page.evaluate(selector => {
        const body = document.querySelector(selector);
        if (!(body instanceof HTMLElement)) return { removed: 0 };
        // Removing a fixed fraction is not enough: the panel is capped at the space
        // above the word, so the surviving half can still overflow and the frame
        // height never changes. Shed content until it is comfortably under the cap,
        // which is what a smaller render actually does to the frame.
        const target = Math.max(80, Math.floor(body.clientHeight / 2));
        const before = { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, children: body.children.length };
        let removed = 0;
        while (body.scrollHeight > target && body.children.length > 1) {
            body.lastElementChild?.remove();
            removed += 1;
        }
        // One section can be taller than the target on its own; trim its text
        // rather than leave the frame unchanged and the assertion vacuous.
        if (body.scrollHeight > target && body.firstElementChild instanceof HTMLElement) {
            body.firstElementChild.style.maxHeight = `${target}px`;
            body.firstElementChild.style.overflow = 'hidden';
            removed += 1;
        }
        return { removed, before, after: { scrollHeight: body.scrollHeight, children: body.children.length }, target };
    }, POPOVER_BODY_SELECTOR);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForTimeout(60);
    return shrunk;
}

async function selectSentenceText(page) {
    await page.evaluate(() => {
        const sentence = document.querySelector('[data-smoke-sentence]');
        if (!sentence) return;
        const range = document.createRange();
        range.selectNodeContents(sentence);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
    });
}

async function selectedText(page) {
    return page.evaluate(() => (window.getSelection()?.toString() ?? '').trim());
}

// The dismissal chain reads the pressed element's classes, so an injected overlay
// with the real class names exercises the real code path — while keeping the
// scenario about dismissal rather than about staging a manga page, a video player
// and a jpdb review host in one fixture.
async function mountInertOverlay(page, overlay) {
    const target = await page.evaluate(({ className, childClassName }) => {
        document.querySelectorAll('[data-yomu-smoke-overlay]').forEach(node => node.remove());
        const root = document.createElement('div');
        root.className = className;
        root.dataset.jpdbReaderRoot = 'true';
        root.dataset.yomuSmokeOverlay = 'true';
        // Top-anchored: the fixture keeps its sentence low so hover panels open
        // upward, and a bottom-anchored overlay would sit on the word itself.
        root.style.cssText = 'position:fixed;left:0;right:0;top:0;height:180px;z-index:2147483000;background:rgba(0,0,0,0.35);';
        const child = document.createElement('div');
        child.className = childClassName;
        // Reader CSS for these surfaces uses !important in places, so a child laid
        // out to 0x0 is a real possibility; measure the ROOT and confirm the point
        // by hit-test rather than trusting the child's box.
        child.style.setProperty('position', 'absolute', 'important');
        child.style.setProperty('inset', '0', 'important');
        child.style.setProperty('display', 'block', 'important');
        // .jpdb-subtitle-player is a click-through root (pointer-events:none) and can
        // never be the tapped element; in the product the taps land on the text
        // elements inside it, which do take pointer events. Without this the first
        // version of this scenario reported a pass for a tap that fell through to the
        // page and dismissed for the ordinary reason.
        child.style.setProperty('pointer-events', 'auto', 'important');
        root.append(child);
        document.body.append(root);
        const rect = root.getBoundingClientRect();
        const point = { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
        const resolved = document.elementFromPoint(point.x, point.y);
        return {
            ...point,
            rootRect: { top: rect.top, height: rect.height, width: rect.width },
            resolvedClassName: resolved instanceof HTMLElement ? resolved.className : null,
            resolvedInsideOverlay: Boolean(resolved && root.contains(resolved)),
        };
    }, overlay);
    // Without this the tap could land on the page and dismiss for the ordinary
    // reason, reporting a pass for a path it never exercised.
    assert(
        target.resolvedInsideOverlay,
        `Tap point did not resolve inside the injected ${overlay.label}, so the scenario would not exercise it`,
        { overlay: overlay.label, target },
    );
    return target;
}
