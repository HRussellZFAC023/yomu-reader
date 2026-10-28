#!/usr/bin/env node
// Page-owned ruby keeps its metrics: the built product on 『吾輩は猫である』
// from the recorded Aozora Bunko page, whose text carries the author's own
// ruby (<ruby><rb>到底</rb><rp>（</rp><rt>とうてい</rt><rp>）</rp></ruby>).
//
// It runs on aozora-paragraphs-mechanism-fixture (lib/aozora-mechanism-
// fixtures.mjs): the recording with each line of .main_text a <p> inside an
// <article>, the shape Narou and Kakuyomu serve and the one where a Yomu word
// wraps a whole author <ruby>. On the Aozora page itself Yomu reads each text
// run alone and leaves ruby out, so its ruby never lands inside a word, and no
// recording of a paragraph-shaped ruby page can be committed (those sites are
// copyrighted, and redaction keeps no ruby text). Same text, same CSS.
//
//   readings off      underline on, so words wrap the author's ruby: every
//                     paragraph's getClientRects is unchanged, and every page
//                     ruby keeps its computed line height and its rt's.
//   readings on       furigana on, every word known, so no Yomu reading is
//                     due: the same two checks.
//   readings shown    furigana on for every word: every page ruby keeps its
//                     computed line height, its rt's, and its own box. Yomu's
//                     readings may grow lines.
//
// Layouts: WebKit with the page's own style; WebKit with .main_text paged in
// CSS columns; Chromium and WebKit with .main_text vertical-rl and paged in
// fixed-height columns, the shape reader.ttsu.app and other vertical paged
// readers give a novel. The paged layouts take a reader app's type (18px/1.8,
// the browser's ruby metrics).
//
// The recording holds no dictionary answers, so jpdb.io parse is answered by
// lib/jpdb-script-run-parse.mjs: every kanji run is one word with a made-up
// kana reading, every kana run one word.
//
// 2.1.6 restyled the author's ruby inside a word: under the reader type its
// line height went from 32.4 px to 18 px and its rt's from normal to 9 px, in
// every layout and engine. With readings off, 59 of 60 paragraphs moved in
// WebKit: a paged-columns paragraph grew from 326 to 332 px and a vertical one
// widened from 493 to 505 px, moving text between pages.
//
//   node scripts/page-ruby-metrics-smoke.mjs
//   node scripts/page-ruby-metrics-smoke.mjs --product=v2.1.6     # the failures 2.1.6 shipped with
//   node scripts/page-ruby-metrics-smoke.mjs --layouts=webkit-horizontal
//   node scripts/page-ruby-metrics-smoke.mjs --ipad   # WebKit iPad portrait
import { assertClampRowHeal, assertPageRubyLifecycle } from './lib/page-ruby-cells.mjs';
import { chromium, devices, webkit } from 'playwright';
import { AOZORA_CSS_URL, AOZORA_SLUG, aozoraParagraphsMechanismFixture } from './lib/aozora-mechanism-fixtures.mjs';
import { answerJpdbParseByScriptRuns } from './lib/jpdb-script-run-parse.mjs';
import { openRecordedPage, releaseProduct, worktreeProduct } from './lib/recorded-page.mjs';

const PARAGRAPHS = 60;
const PAGE_RUBY = 200;
const TOLERANCE_PX = 0.5;
const SETTLE_MAX_MS = 25_000;
const SETTLE_STABLE_MS = 2_500;
// A reader app sets its own type and leaves ruby to the browser: it does not
// load aozora.css, whose ruby{line-height:100%} rt{line-height:50%} would
// outrank Yomu's word rules anyway.
const READER_TYPE = '.main_text{font-size:18px;line-height:1.8}';
const COLUMNS_PAGED = `${READER_TYPE}.main_text{width:800px;height:560px;column-width:380px;column-gap:40px;column-fill:auto;overflow:hidden}`;
const VERTICAL_PAGED = `${READER_TYPE}.main_text{writing-mode:vertical-rl;width:1000px;height:560px;column-width:560px;column-gap:0;column-fill:auto;overflow:hidden}`;
const LAYOUTS = {
    'webkit-horizontal': { engine: webkit, css: '', vertical: false, readerApp: false },
    'webkit-columns': { engine: webkit, css: COLUMNS_PAGED, vertical: false, readerApp: true },
    'chromium-vertical': { engine: chromium, css: VERTICAL_PAGED, vertical: true, readerApp: true },
    'webkit-vertical': { engine: webkit, css: VERTICAL_PAGED, vertical: true, readerApp: true },
};
const BASE_SETTINGS = { onboardingSeen: true, apiKey: 'page-ruby-metrics-smoke', wordUnderlineColorSource: 'status', showFloatingButton: false };
const CASES = {
    off: { settings: { ...BASE_SETTINGS, furiganaMode: 'off', showFurigana: false }, cardState: 'not-in-deck', paragraphsHold: true },
    on: { settings: { ...BASE_SETTINGS, furiganaMode: 'known-status', showFurigana: true }, cardState: 'known', paragraphsHold: true },
    shown: { settings: { ...BASE_SETTINGS, furiganaMode: 'all', showFurigana: true }, cardState: 'not-in-deck', paragraphsHold: false },
};

const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1];
const layouts = (option('layouts') ?? Object.keys(LAYOUTS).join(',')).split(',');
const cases = (option('cases') ?? Object.keys(CASES).join(',')).split(',');
const productRef = option('product') ?? 'worktree';
const product = productRef === 'worktree' ? worktreeProduct() : productRef.startsWith('/') ? worktreeProduct(productRef) : releaseProduct(productRef);
const fixture = aozoraParagraphsMechanismFixture();
const failures = [];
const check = (condition, message) => {
    console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
    if (!condition) failures.push(message);
};

const browsers = new Map();
try {
for (const layout of layouts) {
    if (!LAYOUTS[layout]) throw new Error(`Unknown layout ${layout}; one of ${Object.keys(LAYOUTS).join(', ')}`);
    const type = LAYOUTS[layout].engine;
    let browser = browsers.get(type);
    if (!browser) { browser = await type.launch(); browsers.set(type, browser); }
        const bare = await measure(browser, layout, null, null);
        check(bare.paragraphs.length === PARAGRAPHS && bare.pageRuby.length === PAGE_RUBY, `${layout}: the bare page has ${bare.paragraphs.length} paragraphs and ${bare.pageRuby.length} page ruby to compare`);
        for (const name of cases) {
            judge(`${product.label} ${layout} readings ${name}`, CASES[name], bare, await measure(browser, layout, product, CASES[name]));
        }
}
    for (const [type, browser] of browsers) {
        await assertClampRowHeal(browser, type.name());
        await assertPageRubyLifecycle(browser, type.name());
    }
} finally {
    for (const browser of browsers.values()) await browser.close();
}

if (failures.length) {
    console.error(`\n[page-ruby-metrics] ${failures.length} failure(s) on ${product.label}`);
    process.exit(1);
}
console.log(`\n[page-ruby-metrics] ${product.label} passed`);

function judge(label, subject, bare, annotated) {
    check(annotated.pageErrors.length === 0, `${label}: no page errors ${JSON.stringify(annotated.pageErrors)}`);
    check(annotated.wrappedPageRuby.length > 0, `${label}: words wrap the page's own ruby (${annotated.wrappedPageRuby.length}: ${annotated.wrappedPageRuby.slice(0, 5).join(' ')})`);
    if (subject.paragraphsHold) check(annotated.yomuReadings === 0, `${label}: no Yomu reading is due (${annotated.yomuReadings} shown)`);
    else check(annotated.yomuReadings > 0, `${label}: Yomu readings are on screen (${annotated.yomuReadings})`);
    const changed = annotated.pageRuby
        .map((ruby, index) => [ruby, bare.pageRuby[index]])
        .filter(([after, before]) => !sameRubyMetrics(after, before));
    check(annotated.pageRuby.length === bare.pageRuby.length && changed.length === 0,
        `${label}: the page's ruby keeps its metrics (${changed.length} of ${bare.pageRuby.length} changed${changed.length ? `, e.g. ${changed[0][0].text}: ${JSON.stringify(changed[0][1])} → ${JSON.stringify(changed[0][0])}` : ''})`);
    if (!subject.paragraphsHold) return;
    const moved = annotated.paragraphs
        .map((rects, index) => ({ index, before: bare.paragraphs[index], after: rects }))
        .filter(({ before, after }) => !sameRects(before, after));
    check(annotated.paragraphs.length === bare.paragraphs.length && moved.length === 0,
        `${label}: every paragraph's client rects are unchanged (${moved.length} of ${bare.paragraphs.length} moved${moved.length ? `, e.g. paragraph ${moved[0].index}: ${moved[0].before.join(' + ')} → ${moved[0].after.join(' + ')}` : ''})`);
}

function sameRects(before = [], after = []) {
    return before.length === after.length && before.every((rect, index) => sameBox(rect, after[index]));
}

function sameBox(a, b) {
    const [x1, y1, w1, h1] = a.split(/[,@x]/u).map(Number);
    const [x2, y2, w2, h2] = b.split(/[,@x]/u).map(Number);
    return [x1 - x2, y1 - y2, w1 - w2, h1 - h2].every(delta => Math.abs(delta) <= TOLERANCE_PX);
}

function sameRubyMetrics(after, before) {
    if (!before || after.text !== before.text) return false;
    const styles = ['rubyLineHeight', 'rtLineHeight', 'rtFontSize', 'rubyDisplay', 'rtDisplay'].every(key => after[key] === before[key]);
    // Yomu readings on screen may grow the line around the ruby, never the
    // ruby. Where the ruby sits is the paragraph check's business: a word
    // boundary can move a glyph along its line (engines snap text runs).
    const near = key => Math.abs(after[key] - before[key]) <= TOLERANCE_PX;
    // WebKit breaks a ruby base between its kanji at a line end, on the bare
    // page too (斑入 at 380 px columns), and lays the rt over the first piece
    // only. Readings shown move line ends, so a ruby whole on the bare page
    // can be broken under Yomu: there the rt's inline size follows the line
    // end, not Yomu. Linux WebKit's fonts broke 這入 that way in CI.
    const whole = after.lines === 1 && before.lines === 1;
    return styles && near('rubyBlockSize') && near('rtBlockSize') && (!whole || near('rtInlineSize'));
}

async function measure(browser, layout, subject, testCase) {
    const run = await openRecordedPage({
        browser,
        slug: AOZORA_SLUG,
        product: subject,
        settings: testCase?.settings ?? null,
        contextOptions: args.includes('--ipad') && LAYOUTS[layout].engine === webkit ? { ...devices['iPad Pro 11'], viewport: { width: 820, height: 1180 } } : {},
        navigate: false,
        onGmRequest: request => answerJpdbParseByScriptRuns(request, { cardState: testCase?.cardState }),
    });
    try {
        await run.page.route(run.recording.manifest.url, route => route.fulfill(fixture));
        if (LAYOUTS[layout].readerApp) await run.page.route(AOZORA_CSS_URL, route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
        if (LAYOUTS[layout].css) await run.page.addInitScript(hostStyle, LAYOUTS[layout].css);
        await run.page.goto(run.recording.manifest.url, { waitUntil: 'load' });
        if (subject) await settle(run.page);
        const read = await run.page.evaluate(readPage, { paragraphs: PARAGRAPHS, pageRuby: PAGE_RUBY, vertical: LAYOUTS[layout].vertical });
        return { ...read, pageErrors: run.pageErrors.slice(0, 3) };
    } finally {
        await run.close();
    }
}

// The reader's own page style, in place before Yomu starts.
function hostStyle(css) {
    const install = () => {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.append(style);
    };
    if (document.head) install();
    else document.addEventListener('DOMContentLoaded', install, { once: true });
}

// Words and readings stop changing for SETTLE_STABLE_MS.
async function settle(page) {
    const startedAt = Date.now();
    let last = '';
    let stableSince = Date.now();
    while (Date.now() - startedAt < SETTLE_MAX_MS) {
        await page.waitForTimeout(500);
        const now = await page.evaluate(() => `${document.querySelectorAll('.jpdb-reader-word').length}/${document.querySelectorAll('rt.jpdb-reader-furi').length}`);
        if (now !== last) {
            last = now;
            stableSince = Date.now();
        } else if (!now.startsWith('0/') && Date.now() - stableSince >= SETTLE_STABLE_MS) return;
    }
}

// Runs in the page. A page ruby is one whose reading is not Yomu's: 2.1.6
// wrote its own ruby without the jpdb-reader-ruby class.
function readPage({ paragraphs, pageRuby, vertical }) {
    const main = document.querySelector('.main_text');
    const round = value => Math.round(value * 100) / 100;
    const box = rect => `${round(rect.left)},${round(rect.top)}@${round(rect.width)}x${round(rect.height)}`;
    const isPageRuby = ruby => !ruby.querySelector(':scope > rt.jpdb-reader-furi');
    const block = rect => round(vertical ? rect?.width ?? 0 : rect?.height ?? 0);
    const inline = rect => round(vertical ? rect?.height ?? 0 : rect?.width ?? 0);
    const rubies = [...main.querySelectorAll('ruby')].filter(isPageRuby).slice(0, pageRuby).map(ruby => {
        const rt = ruby.querySelector(':scope > rt');
        const rubyStyle = getComputedStyle(ruby);
        const rtStyle = rt ? getComputedStyle(rt) : null;
        // One rect per line the ruby spans: its block size is a line's, not
        // the union of the lines a break spreads it over.
        const pieces = [...(ruby.querySelector(':scope > rb') ?? ruby).getClientRects()];
        const rtRect = rt?.getBoundingClientRect();
        return {
            text: ruby.textContent,
            rubyLineHeight: rubyStyle.lineHeight,
            rubyDisplay: rubyStyle.display,
            rtLineHeight: rtStyle?.lineHeight ?? '',
            rtFontSize: rtStyle?.fontSize ?? '',
            rtDisplay: rtStyle?.display ?? '',
            lines: pieces.length,
            rubyBlockSize: Math.max(0, ...[...ruby.getClientRects()].map(block)),
            rtBlockSize: block(rtRect),
            rtInlineSize: inline(rtRect),
        };
    });
    return {
        paragraphs: [...main.querySelectorAll(':scope > p')].slice(0, paragraphs).map(p => [...p.getClientRects()].map(box)),
        pageRuby: rubies,
        wrappedPageRuby: [...main.querySelectorAll('.jpdb-reader-word ruby')].filter(isPageRuby).map(ruby => ruby.querySelector('rb')?.textContent ?? ruby.textContent),
        yomuReadings: [...main.querySelectorAll('rt.jpdb-reader-furi')].filter(rt => {
            const rect = rt.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && getComputedStyle(rt).visibility !== 'hidden';
        }).length,
    };
}
