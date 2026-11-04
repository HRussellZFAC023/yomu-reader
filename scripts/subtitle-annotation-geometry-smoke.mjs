#!/usr/bin/env node
// DOM geometry fixtures, using the complete source stylesheet in real engines.
// A compact inline with the same font supplies the base-font underline anchor;
// changing the caption reading lane must not move the line away from that base.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { build, transformSync } from 'esbuild';
import { createInstrumenter } from 'istanbul-lib-instrument';

const root = path.resolve(import.meta.dirname, '..');
const suppliedCss = process.argv.find(arg => arg.startsWith('--css='))?.slice(6);
const out = path.resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'artifacts/subtitle-annotation-geometry');
const temp = mkdtempSync(path.join(tmpdir(), 'yomu-subtitle-annotation-'));
mkdirSync(out, { recursive: true });
const cssPath = suppliedCss ? path.resolve(suppliedCss) : path.join(temp, 'yomu.css');
if (!suppliedCss) {
    execFileSync(process.execPath, [path.join(root, 'scripts/build-reader-css.mjs')], {
        env: { ...process.env, YOMU_READER_CSS_OUT: cssPath, YOMU_NEW_TAB_CSS_OUT: path.join(temp, 'newtab.css') },
        stdio: 'pipe',
    });
}
const sourceCss = readFileSync(cssPath, 'utf8');
const css = process.argv.includes('--legacy-line-height')
    ? sourceCss.replace('inset-block-end: calc((1lh - 1em) / 2);', '') : sourceCss;
const instrumenter = createInstrumenter({ esModules: true });
const probe = (await build({ bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent', plugins: [{
    name: 'actual-word-geometry-coverage',
    setup(build) {
        build.onLoad({ filter: /subtitle-word-geometry\.ts$/ }, args => ({
            contents: instrumenter.instrumentSync(transformSync(readFileSync(args.path, 'utf8'), { loader: 'ts', format: 'esm' }).code, args.path),
            loader: 'js',
        }));
    },
}], stdin: {
    contents: 'import { refreshSubtitleWordUnderlines } from "./src/reader/subtitles/subtitle-word-geometry.ts"; Object.assign(window, { refreshSubtitleWordUnderlines });',
    resolveDir: root,
} })).outputFiles[0].text;
const plain = '<span class="jpdb-reader-word jpdb-pitch-heiban">かな</span>';
const ruby = '<span class="jpdb-reader-word jpdb-reader-has-furi jpdb-pitch-heiban"><ruby class="jpdb-reader-ruby"><span class="jpdb-reader-ruby-base">日本語</span><rp>(</rp><rt class="jpdb-reader-furi">にほんご</rt><rp>)</rp></ruby>です</span>';
const parsed = `${plain}${ruby}${plain}`;
const fontData = readFileSync(path.join(root, 'video/public/fonts/noto-sans-jp-variable-subset.woff2')).toString('base64');
const summaries = [];

try {
    for (const [engine, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
        const browser = await browserType.launch({ headless: true });
        try {
            const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
            await page.setContent(`<style>${css}</style><style>
                html,body{margin:0;background:#111}
                .jpdb-subtitle-text{bottom:80px;top:auto}
                .baseline{display:inline-block;width:0;height:0;padding:0;border:0}
                #reference{position:absolute;left:-10000px;top:0;display:inline-block;line-height:1}
            </style><div class="jpdb-subtitle-player jpdb-reader-subtitle-underline-pitch">
                <div class="jpdb-subtitle-text"><div class="jpdb-subtitle-lines jpdb-subtitle-has-primary">
                    <div class="jpdb-subtitle-primary-row"><div class="jpdb-subtitle-primary"></div></div>
                </div></div></div><span id="reference">かな<span class="baseline"></span></span>`);
            await page.addScriptTag({ content: probe });
            const cases = [];
            for (const font of ['"Yu Gothic", sans-serif', 'Meiryo, sans-serif', 'serif']) {
                for (const size of [20, 28, 40, 60]) {
                    for (const scale of [1, 1.25]) {
                      for (const readings of [true, false]) {
                        for (const layout of ['single', 'wrapped', 'multiline', 'internal', 'internal-ruby', 'component']) {
                            const result = await page.evaluate(measure, { font, size, scale, readings, layout, parsed });
                            const label = `${engine} ${font} ${size}px scale ${scale} readings ${readings} ${layout}`;
                            assert(result.words.length > 0, `${label}: words did not render`);
                            for (const word of result.words) {
                                assert(Math.abs(word.underlineBottom - word.expectedBottom) <= 1,
                                    `${label}: underline left its glyph baseline: ${JSON.stringify(word)}`);
                                assert.equal(word.fragments.length, word.lineTops.length > 1 ? word.lineTops.length : 0, `${label}: missing an internal underline fragment`);
                                for (const fragment of word.fragments) {
                                    assert(Math.abs(fragment.bottom - fragment.expectedBottom) <= 1, `${label}: internal underline left its glyph baseline`);
                                }
                                if (layout === 'component') {
                                    assert(word.fragments.every(fragment => fragment.gradient.includes('linear-gradient')), `${label}: compound pitch lost its colors`);
                                    assert(Math.abs(word.gradientWidth - word.fragments.reduce((sum, fragment) => sum + fragment.width / scale, 0)) <= 1, `${label}: gradient was restarted per line`);
                                }
                            }
                            assert.equal(result.repeatedRangeReads, 0, `${label}: unchanged layout remeasured word Ranges`);
                            assert.equal(result.repeatedMutations, 0, `${label}: unchanged layout mutated annotations`);
                            if (layout === 'component') {
                                assert.equal(result.unwrappedFragments, 0, `${label}: widening left stale fragments`);
                                assert(result.rewrappedFragments > 1, `${label}: narrowing did not recover fragments`);
                            }
                            assert.deepEqual(result.before, result.after, `${label}: underline changed text or caption geometry`);
                            assert(Math.abs(result.lastGlyphBottom - result.toggledLastGlyphBottom) <= 1, `${label}: toggling readings moved the final base baseline`);
                            assert.deepEqual(result.before, result.withTranslation, `${label}: translation progress changed primary geometry`);
                            assert(Math.abs(result.linePitch / size - (readings && !['internal', 'component'].includes(layout) ? 1.754 : 1.36)) <= .002,
                                `${label}: incorrect reading lane: ${result.linePitch}`);
                            if (readings) assert(result.readingTop === null || result.readingTop >= result.before.row[1] - 1, `${label}: first reading escapes its caption background`);
                            if (layout === 'single') {
                                assert.deepEqual(result.pending.row, result.after.row, `${label}: parsing moved the caption row`);
                                const verticalGlyphs = geometry => geometry.glyphs.map(box => [box[1], box[3]]);
                                assert.deepEqual(verticalGlyphs(result.pending), verticalGlyphs(result.after), `${label}: parsing moved glyph baselines`);
                            } else {
                                assert(result.lineTops.length > 1, `${label}: multiline case did not wrap`);
                            }
                            cases.push({ font, size, scale, readings, layout, linePitch: result.linePitch, maxAnchorError: Math.max(...result.words.map(word => Math.abs(word.underlineBottom - word.expectedBottom))) });
                        }
                      }
                    }
                }
            }
            const fontLoad = await verifyFontLoad(page, fontData);
            assert.equal(fontLoad.before.dimensions, fontLoad.after.dimensions, `${engine}: late-font fixture changed its fixed outer dimensions`);
            assert.equal(fontLoad.before.font, fontLoad.after.font, `${engine}: late-font fixture changed its family declaration`);
            assert.notEqual(fontLoad.before.glyphHeight, fontLoad.after.glyphHeight, `${engine}: late font did not change native glyph metrics`);
            assert(fontLoad.after.errors.every(error => error <= 1), `${engine}: loaded font left stale underline geometry: ${JSON.stringify(fontLoad)}`);
            const hidden = await page.evaluate(() => {
                window.refreshSubtitleWordUnderlines(document.createElement('div'));
                const player = document.querySelector('.jpdb-subtitle-player');
                player.style.display = 'none';
                window.refreshSubtitleWordUnderlines(player);
                const hiddenFragments = player.querySelectorAll('[data-yomu-subtitle-fragment]').length;
                player.style.display = '';
                player.querySelector('.jpdb-subtitle-primary').innerHTML = '<span class="jpdb-reader-word"><br>かな<br></span>';
                window.refreshSubtitleWordUnderlines(player);
                return { hiddenFragments, trailingEmptyLineFragments: player.querySelectorAll('[data-yomu-subtitle-fragment]').length };
            });
            assert.equal(hidden.hiddenFragments, 0, `${engine}: hidden caption retained stale fragments`);
            assert.equal(hidden.trailingEmptyLineFragments, 0, `${engine}: empty trailing line acquired an underline`);
            const coverage = await page.evaluate(() => window.__coverage__);
            writeFileSync(path.join(out, `${engine}-istanbul.json`), `${JSON.stringify(coverage)}\n`);
            await page.screenshot({ path: path.join(out, `${engine}-geometry-fixture.png`) });
            summaries.push({ engine, cases, fontLoad });
            console.log(`${engine}: ${cases.length} subtitle annotation geometry fixtures passed`);
        } finally {
            await browser.close();
        }
    }
    writeFileSync(path.join(out, 'report.json'), `${JSON.stringify(summaries, null, 2)}\n`);
} finally {
    rmSync(temp, { recursive: true, force: true });
}

async function verifyFontLoad(page, fontData) {
    return page.evaluate(async data => {
        const player = document.querySelector('.jpdb-subtitle-player');
        const primary = document.querySelector('.jpdb-subtitle-primary');
        player.style.transform = 'none';
        player.style.setProperty('--subtitle-font-size', '28px');
        player.style.setProperty('--subtitle-family', 'LateSubtitleFont, "Yu Gothic", sans-serif');
        primary.parentElement.parentElement.style.width = '280px';
        primary.innerHTML = `<span class="jpdb-reader-word jpdb-pitch-heiban">${'かな'.repeat(20)}</span>`;
        window.refreshSubtitleWordUnderlines(player);
        const snapshot = () => {
            const word = primary.firstElementChild;
            const range = document.createRange();
            range.selectNodeContents(word.firstChild);
            const native = Array.from(range.getClientRects());
            const marker = document.createElement('span');
            marker.className = 'baseline';
            word.append(marker);
            const baseline = marker.getBoundingClientRect().top;
            marker.remove();
            const reference = document.querySelector('#reference');
            reference.style.font = getComputedStyle(primary).font;
            reference.style.lineHeight = '1';
            const descent = reference.getBoundingClientRect().bottom - reference.querySelector('.baseline').getBoundingClientRect().top;
            return { dimensions: `${primary.clientWidth}x${primary.clientHeight}`, font: getComputedStyle(primary).font,
                glyphHeight: native[0].height,
                errors: Array.from(word.querySelectorAll('[data-yomu-subtitle-fragment]'), (fragment, index) =>
                    Math.abs(fragment.getBoundingClientRect().bottom - (baseline + descent - (native.at(-1).top - native[index].top)))) };
        };
        const before = snapshot();
        const face = new FontFace('LateSubtitleFont', `url(data:font/woff2;base64,${data})`);
        document.fonts.add(face);
        await document.fonts.load('28px LateSubtitleFont', 'かな');
        await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return { before, after: snapshot() };
    }, fontData);
}

function measure({ font, size, scale, readings, layout, parsed }) {
    const player = document.querySelector('.jpdb-subtitle-player');
    const primary = document.querySelector('.jpdb-subtitle-primary');
    const row = primary.parentElement;
    const lines = row.parentElement;
    player.classList.toggle('yomu-furi-off', !readings);
    player.style.setProperty('--subtitle-family', font);
    player.style.setProperty('--subtitle-font-size', `${size}px`);
    player.style.transform = `scale(${scale})`;
    player.style.transformOrigin = '0 0';
    const internal = ['internal', 'internal-ruby', 'component'].includes(layout);
    lines.style.width = layout === 'wrapped' || internal ? `${size * 10}px` : `${size * 20}px`;
    let html = layout === 'multiline' ? `${parsed}<br>${parsed}` : layout === 'wrapped' ? parsed.repeat(3) : parsed;
    if (internal) {
        const contents = layout === 'internal-ruby' ? '<ruby class="jpdb-reader-ruby"><span class="jpdb-reader-ruby-base">日</span><rt class="jpdb-reader-furi">にち</rt></ruby>かな'.repeat(12) : 'かな'.repeat(20);
        const components = layout === 'component' ? 'data-pitch-components="true" style="--jpdb-reader-inline-pitch-gradient:linear-gradient(to right,#359eff 0% 50%,#e94b5a 50% 100%)"' : '';
        html = `<span class="jpdb-reader-word jpdb-pitch-heiban" ${components}>${contents}</span>`;
    }
    primary.innerHTML = html;
    row.classList.toggle('jpdb-subtitle-has-kanji', /\p{Script=Han}/u.test(primary.textContent));
    const rect = box => [box.x, box.y, box.width, box.height].map(value => Math.round(value * 1000) / 1000);
    const textRects = () => {
        const walker = document.createTreeWalker(primary, NodeFilter.SHOW_TEXT);
        const boxes = [];
        let text;
        while ((text = walker.nextNode())) {
            if (text.parentElement.closest('rt,rp,.baseline')) continue;
            const range = document.createRange();
            for (let i = 0; i < text.length; i += 1) {
                range.setStart(text, i);
                range.setEnd(text, i + 1);
                boxes.push(rect(range.getBoundingClientRect()));
            }
        }
        return boxes;
    };
    const geometry = () => ({ row: rect(row.getBoundingClientRect()), glyphs: textRects() });
    const reference = document.querySelector('#reference');
    const style = getComputedStyle(primary);
    reference.style.font = style.font;
    reference.style.lineHeight = '1';
    const referenceDescent = reference.getBoundingClientRect().bottom - reference.querySelector('.baseline').getBoundingClientRect().top;
    const before = geometry();
    const linePitch = parseFloat(style.lineHeight);
    const readingTop = Math.min(...Array.from(primary.querySelectorAll('rt'), rt => rt.getBoundingClientRect().top));
    window.refreshSubtitleWordUnderlines(player);
    let repeatedRangeReads = 0;
    const originalRects = Range.prototype.getClientRects;
    Range.prototype.getClientRects = function() { repeatedRangeReads += 1; return originalRects.call(this); };
    const observer = new MutationObserver(() => {});
    observer.observe(primary, { attributes: true, subtree: true, childList: true });
    for (let i = 0; i < 10; i += 1) window.refreshSubtitleWordUnderlines(player);
    const repeatedMutations = observer.takeRecords().length;
    observer.disconnect();
    Range.prototype.getClientRects = originalRects;
    // Suppressing paint is an independent control: the pseudo must never be
    // contributing size, wrapping or line-height to the caption itself.
    const control = document.createElement('style');
    control.textContent = '.jpdb-subtitle-primary .jpdb-reader-word::after{content:none!important}';
    document.head.append(control);
    const after = geometry();
    control.remove();
    const words = Array.from(primary.querySelectorAll('.jpdb-reader-word'), word => {
        const marker = document.createElement('span');
        marker.className = 'baseline';
        word.append(marker);
        const baseline = marker.getBoundingClientRect().top;
        marker.remove();
        const pseudo = getComputedStyle(word, '::after');
        const walker = document.createTreeWalker(word, NodeFilter.SHOW_TEXT);
        const lineTops = [];
        let text;
        while ((text = walker.nextNode())) {
            if (text.parentElement.closest('rt,rp')) continue;
            const range = document.createRange();
            range.selectNodeContents(text);
            for (const box of range.getClientRects()) if (!lineTops.includes(box.top)) lineTops.push(box.top);
        }
        const expectedBottom = baseline + referenceDescent * scale;
        const fragments = Array.from(word.querySelectorAll('[data-yomu-subtitle-fragment]'), (fragment, index) => {
            const box = fragment.getBoundingClientRect();
            return { bottom: box.bottom, width: box.width,
                expectedBottom: expectedBottom - (lineTops.at(-1) - lineTops[index]),
                gradient: getComputedStyle(fragment, '::after').backgroundImage };
        });
        return {
            text: word.textContent,
            underlineBottom: word.getBoundingClientRect().bottom - parseFloat(pseudo.insetBlockEnd) * scale,
            expectedBottom, lineTops, fragments,
            gradientWidth: parseFloat(word.querySelector('[data-yomu-subtitle-fragment]')?.style.getPropertyValue('--jpdb-reader-source-gradient-width') ?? '0'),
        };
    });
    const lineTops = [...new Set(after.glyphs.map(box => box[1]))];
    const lastGlyphBottom = Math.max(...after.glyphs.map(box => box[1] + box[3]));
    player.classList.toggle('yomu-furi-off', readings);
    const toggledLastGlyphBottom = Math.max(...textRects().map(box => box[1] + box[3]));
    player.classList.toggle('yomu-furi-off', !readings);
    const secondary = document.createElement('button');
    secondary.className = 'jpdb-subtitle-secondary';
    secondary.textContent = 'Translating…';
    lines.append(secondary);
    lines.classList.add('jpdb-subtitle-has-secondary');
    secondary.textContent = 'The translation can arrive later and wrap onto another line.'.repeat(3);
    const withTranslation = geometry();
    secondary.remove();
    lines.classList.remove('jpdb-subtitle-has-secondary');
    let pending = null;
    if (layout === 'single') {
        primary.innerHTML = 'かな日本語ですかな';
        pending = geometry();
        primary.innerHTML = html;
    }
    let unwrappedFragments = null;
    let rewrappedFragments = null;
    if (layout === 'component') {
        lines.style.maxWidth = 'none';
        lines.style.width = `${size * 80}px`;
        window.refreshSubtitleWordUnderlines(player);
        unwrappedFragments = primary.querySelectorAll('[data-yomu-subtitle-fragment]').length;
        lines.style.maxWidth = '100%';
        lines.style.width = `${size * 10}px`;
        window.refreshSubtitleWordUnderlines(player);
        rewrappedFragments = primary.querySelectorAll('[data-yomu-subtitle-fragment]').length;
    }
    return { before, after, words, lineTops, pending, linePitch, readingTop: Number.isFinite(readingTop) ? readingTop : null,
        lastGlyphBottom, toggledLastGlyphBottom, withTranslation, repeatedRangeReads, repeatedMutations, unwrappedFragments, rewrappedFragments };
}
