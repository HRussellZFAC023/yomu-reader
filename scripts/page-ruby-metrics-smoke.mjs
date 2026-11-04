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
//                     computed line height and its rt's. Only genuinely
//                     fragmented ruby can rewrap; its glyph/font metrics and
//                     fragment thickness still hold. Yomu readings may grow lines.
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
import { chromium, devices, webkit } from 'playwright';
import { AOZORA_CSS_URL, AOZORA_SLUG, aozoraParagraphsMechanismFixture } from './lib/aozora-mechanism-fixtures.mjs';
import { answerJpdbParseByScriptRuns } from './lib/jpdb-script-run-parse.mjs';
import { openRecordedPage, releaseProduct, worktreeProduct } from './lib/recorded-page.mjs';

const PARAGRAPHS = 60;
const PAGE_RUBY = 200;
const TOLERANCE_PX = 0.5;
const GLYPH_TYPOGRAPHY_PROPERTIES = ['font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch',
    'font-feature-settings', 'font-variant', 'font-kerning', 'font-variation-settings', 'font-optical-sizing', 'letter-spacing', 'word-spacing'];
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

for (const layout of layouts) {
    if (!LAYOUTS[layout]) throw new Error(`Unknown layout ${layout}; one of ${Object.keys(LAYOUTS).join(', ')}`);
    const browser = await LAYOUTS[layout].engine.launch();
    try {
        const bare = await measure(browser, layout, null, null);
        check(bare.paragraphs.length === PARAGRAPHS && bare.pageRuby.length === PAGE_RUBY, `${layout}: the bare page has ${bare.paragraphs.length} paragraphs and ${bare.pageRuby.length} page ruby to compare`);
        for (const name of cases) {
            judge(`${product.label} ${layout} readings ${name}`, CASES[name], bare, await measure(browser, layout, product, CASES[name]));
        }
    } finally {
        await browser.close();
    }
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
        .filter(([after, before]) => !sameRubyMetrics(after, before, !subject.paragraphsHold));
    check(annotated.pageRuby.length === bare.pageRuby.length && changed.length === 0,
        `${label}: the page's ruby keeps its metrics (${changed.length} of ${bare.pageRuby.length} changed${changed.length ? `, e.g. ${changed[0][0].text}: ${JSON.stringify(changed[0][1])} → ${JSON.stringify(changed[0][0])}` : ''})`);
    const controlIndex = annotated.pageRuby.findIndex((ruby, index) => !fragmentedRuby(ruby, bare.pageRuby[index])
        && sameRubyMetrics(ruby, bare.pageRuby[index], !subject.paragraphsHold));
    check(controlIndex >= 0, `${label}: an unfragmented metric control is present`);
    if (controlIndex >= 0) {
        const control = annotated.pageRuby[controlIndex];
        for (const property of ['rubyBlockSize', 'rtBlockSize', 'rtInlineSize']) {
            check(!sameRubyMetrics({ ...control, [property]: control[property] + 10 }, bare.pageRuby[controlIndex], !subject.paragraphsHold),
                `${label}: the oracle rejects a 10px ${property} regression`);
        }
    }
    const fragmentIndex = annotated.pageRuby.findIndex((ruby, index) => fragmentedRuby(ruby, bare.pageRuby[index])
        && sameRubyMetrics(ruby, bare.pageRuby[index], !subject.paragraphsHold));
    if (fragmentIndex >= 0 && !subject.paragraphsHold) {
        const control = annotated.pageRuby[fragmentIndex];
        for (const property of ['baseGlyphs', 'readingGlyphs']) {
            const glyphs = control[property].map((glyph, index) => index ? glyph : { ...glyph, block: glyph.block + 10 });
            check(!sameRubyMetrics({ ...control, [property]: glyphs }, bare.pageRuby[fragmentIndex], !subject.paragraphsHold),
                `${label}: the fragmented oracle rejects a 10px ${property} regression`);
        }
        for (const property of ['rubyFragmentBlocks', 'rtFragmentBlocks']) {
            check(!sameRubyMetrics({ ...control, [property]: control[property].map(size => size + 10) }, bare.pageRuby[fragmentIndex], !subject.paragraphsHold),
                `${label}: the fragmented oracle rejects a 10px ${property} regression`);
        }
        for (const property of GLYPH_TYPOGRAPHY_PROPERTIES) {
            check(Object.hasOwn(control.baseGlyphs[0].font, property), `${label}: the glyph oracle captures ${property}`);
            const baseGlyphs = control.baseGlyphs.map((glyph, index) => index ? glyph : { ...glyph, font: { ...glyph.font, [property]: 'corrupted' } });
            check(!sameRubyMetrics({ ...control, baseGlyphs }, bare.pageRuby[fragmentIndex], true),
                `${label}: the fragmented oracle rejects changed ${property}`);
        }
    }
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

function fragmentedRuby(after, before) {
    return [after, before].some(ruby => ruby && (ruby.rubyFragmentBlocks.length > 1 || ruby.rtFragmentBlocks.length > 1));
}

function sameRubyMetrics(after, before, readingsCanReflow = false) {
    if (!before || after.text !== before.text) return false;
    const styles = ['rubyLineHeight', 'rtLineHeight', 'rtFontSize', 'rubyDisplay', 'rtDisplay'].every(key => after[key] === before[key]);
    // Visible Yomu readings may grow lines and rewrap an author's ruby. Its
    // union box then includes different inter-line gaps, and its rt box can
    // stretch to fit a newly unbroken base. Compare fragment thickness and each
    // glyph's font and block extent. Native ruby justification can redistribute
    // inline advances when it rewraps, without changing the glyph's typography.
    const sameThickness = (a, b) => a.every(size => b.some(other => Math.abs(size - other) <= TOLERANCE_PX))
        && b.every(size => a.some(other => Math.abs(size - other) <= TOLERANCE_PX));
    const sameGlyphs = (a, b) => a.length === b.length && a.every((glyph, index) => glyph.text === b[index].text
        && glyph.block > 0 && b[index].block > 0
        && JSON.stringify(glyph.font) === JSON.stringify(b[index].font) && Math.abs(glyph.block - b[index].block) <= TOLERANCE_PX);
    const ownBoxes = ['rubyBlockSize', 'rtBlockSize', 'rtInlineSize'].every(key => Math.abs(after[key] - before[key]) <= TOLERANCE_PX);
    const fragmentationCanReflow = readingsCanReflow && fragmentedRuby(after, before);
    if (!fragmentationCanReflow) return styles && ownBoxes;
    return styles && after.baseGlyphs.length > 0 && after.readingGlyphs.length > 0
        && sameThickness(after.rubyFragmentBlocks, before.rubyFragmentBlocks)
        && sameThickness(after.rtFragmentBlocks, before.rtFragmentBlocks)
        && sameGlyphs(after.baseGlyphs, before.baseGlyphs) && sameGlyphs(after.readingGlyphs, before.readingGlyphs);
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
        const read = await run.page.evaluate(readPage, { paragraphs: PARAGRAPHS, pageRuby: PAGE_RUBY, vertical: LAYOUTS[layout].vertical, fontProperties: GLYPH_TYPOGRAPHY_PROPERTIES });
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
function readPage({ paragraphs, pageRuby, vertical, fontProperties }) {
    const main = document.querySelector('.main_text');
    const round = value => Math.round(value * 100) / 100;
    const box = rect => `${round(rect.left)},${round(rect.top)}@${round(rect.width)}x${round(rect.height)}`;
    const isPageRuby = ruby => !ruby.querySelector(':scope > rt.jpdb-reader-furi');
    const block = rect => round(vertical ? rect?.width ?? 0 : rect?.height ?? 0);
    const inline = rect => round(vertical ? rect?.height ?? 0 : rect?.width ?? 0);
    const glyphMetrics = (root, excludeReadings = false) => {
        if (!root) return [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const glyphs = [];
        for (let text = walker.nextNode(); text; text = walker.nextNode()) {
            if (excludeReadings && text.parentElement.closest('rt,rp')) continue;
            let offset = 0;
            for (const char of text.data) {
                const range = document.createRange();
                range.setStart(text, offset);
                range.setEnd(text, offset + char.length);
                // A one-character Range at a native ruby line boundary may
                // include an empty caret fragment on the preceding line. Its
                // union is not a glyph box. Ignore empty fragments, then use
                // the actual glyph's smallest block extent.
                const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
                const rect = rects.sort((a, b) => block(a) - block(b))[0];
                const style = getComputedStyle(text.parentElement);
                const font = Object.fromEntries(fontProperties.map(property => [property, style.getPropertyValue(property)]));
                glyphs.push({ text: char, block: block(rect), inline: inline(rect), font });
                offset += char.length;
            }
        }
        return glyphs;
    };
    const rubies = [...main.querySelectorAll('ruby')].filter(isPageRuby).slice(0, pageRuby).map(ruby => {
        const rt = ruby.querySelector(':scope > rt');
        const rubyStyle = getComputedStyle(ruby);
        const rtStyle = rt ? getComputedStyle(rt) : null;
        const rubyRect = ruby.getBoundingClientRect();
        const rtRect = rt?.getBoundingClientRect();
        return {
            text: ruby.textContent,
            rubyLineHeight: rubyStyle.lineHeight,
            rubyDisplay: rubyStyle.display,
            rtLineHeight: rtStyle?.lineHeight ?? '',
            rtFontSize: rtStyle?.fontSize ?? '',
            rtDisplay: rtStyle?.display ?? '',
            rubyBlockSize: block(rubyRect),
            rtBlockSize: block(rtRect),
            rtInlineSize: inline(rtRect),
            rubyFragmentBlocks: [...ruby.getClientRects()].map(block),
            rtFragmentBlocks: rt ? [...rt.getClientRects()].map(block) : [],
            baseGlyphs: glyphMetrics(ruby, true),
            readingGlyphs: [...ruby.querySelectorAll(':scope > rt')].flatMap(reading => glyphMetrics(reading)),
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
