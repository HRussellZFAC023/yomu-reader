#!/usr/bin/env node
// Regression guard: annotated text is the page's text, and every reading on a
// page looks the same.
//
// The owner's ja.wikipedia report: annotated words read in a different face
// from the plain kana around them, readings were bold at 0.58em and took the
// link colour, every word sat in a grey box, and a reading ran across two word
// boxes. This smoke runs the built userscript and yomu.css under the DEFAULT
// annotation settings on a page whose own CSS attacks every inherited font
// property (span, ruby and rt rules), with JPDB parse mocked, and measures the
// computed result in real engines:
//   * each word's base glyphs compute the same font as the host text around it;
//   * each reading is half the base size, regular weight, the page's face, one
//     muted colour for linked and plain words alike, at 4.5:1;
//   * each reading is centred over its own word and clear of its neighbours;
//   * nothing is painted behind a word at rest; only words the study source is
//     still teaching carry an underline (new solid, learning dashed, due
//     dotted, 3:1);
//   * known and due words carry no reading, and footnote markers are not
//     annotated.
// YOMU_TYPOGRAPHY_ENGINES=chromium,webkit (default both); YOMU_TYPOGRAPHY_DIST
// points at another build to prove a failure.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeServer,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const paths = createSmokePaths(import.meta.dirname);
const DIST = process.env.YOMU_TYPOGRAPHY_DIST ? path.resolve(process.env.YOMU_TYPOGRAPHY_DIST) : paths.dist;
const SCRIPT_PATH = path.join(DIST, 'yomu.user.js');
const CSS_PATH = path.join(DIST, 'yomu.css');
const OUT = path.join(paths.artifacts, 'annotation-typography');
const ENGINES = (process.env.YOMU_TYPOGRAPHY_ENGINES ?? 'chromium,webkit').split(',').map(name => name.trim()).filter(Boolean);
const THEMES = { light: { paper: '#ffffff', ink: '#202122' }, dark: { paper: '#101418', ink: '#eaecf0' } };

// [surface, spelling, reading, gloss, pos, frequency, state, pitch]
const ROWS = [
    ['今日', '今日', 'きょう', 'today', ['n'], 50, ['due'], ['HLL']],
    ['静か', '静か', 'しずか', 'quiet', ['adj-na'], 900, ['not-in-deck'], ['LHH']],
    ['喫茶店', '喫茶店', 'きっさてん', 'cafe', ['n'], 3000, ['new'], ['LHHHH']],
    ['新しい', '新しい', 'あたらしい', 'new', ['adj-i'], 200, ['learning'], ['LHHLL']],
    ['本', '本', 'ほん', 'book', ['n'], 100, ['known'], ['HL']],
    ['読みました', '読む', 'よむ', 'to read', ['v5m'], 150, ['not-in-deck'], ['HL']],
    ['日本語', '日本語', 'にほんご', 'Japanese', ['n'], 60, ['not-in-deck'], ['LHHH']],
    ['日本', '日本', 'にほん', 'Japan', ['n'], 40, ['not-in-deck'], ['LHH']],
    ['国内', '国内', 'こくない', 'domestic', ['n'], 700, ['not-in-deck'], ['HLLL']],
    ['使用', '使用', 'しよう', 'use', ['n'], 400, ['not-in-deck'], ['LHH']],
    ['言語', '言語', 'げんご', 'language', ['n'], 800, ['not-in-deck'], ['HLL']],
    ['注釈', '注釈', 'ちゅうしゃく', 'note', ['n'], 9000, ['not-in-deck'], ['LHHH']],
    ...['は', 'な', 'で', 'を', 'の'].map(particle => [particle, particle, particle, 'particle', ['prt'], 1, ['not-in-deck'], []]),
];
const FURIGANA = {
    静か: [['静', 'しず'], 'か'],
    新しい: [['新', 'あたら'], 'しい'],
    読みました: [['読', 'よ'], 'みました'],
};
const SENTENCE = '今日は静かな喫茶店で新しい本を読みました。';
const LINKED = '日本語は<a href="/wiki/日本">日本</a>国内で使用されている言語。'
    + '<sup class="mw-ref reference" id="cite_ref-3"><a href="#cite_note-3"><span class="cite-bracket">[</span>注釈 3<span class="cite-bracket">]</span></a></sup>';
// A host stylesheet aimed at bare elements, the way real sites style their own
// spans and ruby. None of it may reach Yomu's words or readings.
const HOSTILE_CSS = `
span { font-weight: 700; font-style: italic; letter-spacing: .2em; font-family: "Courier New", monospace; }
p span { font-size: 80%; }
ruby { font-size: 70%; font-weight: 900; }
rt { font-weight: 900; font-size: 90%; color: #d00; font-family: cursive; letter-spacing: .3em; }
p.tracked { letter-spacing: .04em; font-feature-settings: "palt"; }`;

const SETTINGS = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: 'mock-jpdb-token',
    jitenApiKey: '',
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    ankiEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    lookupOnClick: true,
    lookupOnHover: false,
    popupActivationMode: 'click',
    showFloatingButton: false,
    corsProxyUrl: '',
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
};

assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], paths.root, 'Run npm run build first.');
mkdirSync(OUT, { recursive: true });

let currentPage = '';
const server = await startLoopbackServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(currentPage);
}, 'Could not bind annotation typography smoke server');
const report = { dist: DIST, runs: {}, failures: [] };

try {
    for (const engine of ENGINES) {
        const browser = await launchSmokeBrowser(engine === 'webkit' ? webkit : chromium, engine, { headless: true });
        try {
            for (const theme of Object.keys(THEMES)) await checkScenario(browser, engine, theme);
        } finally {
            await browser.close();
        }
    }
} finally {
    writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await closeServer(server.server);
}
assert(!report.failures.length, `${report.failures.length} annotation typography check(s) failed (details: ${path.join(OUT, 'report.json')}):\n- ${report.failures.map(failure => failure.message).join('\n- ')}`);
console.log(`annotation typography smoke passed (${ENGINES.join(', ')}); report: ${path.join(OUT, 'report.json')}`);

async function checkScenario(browser, engine, theme) {
    const id = `${engine}-${theme}`;
    const { paper, ink } = THEMES[theme];
    currentPage = fixturePage(paper, ink);
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 760, height: 420 }, deviceScaleFactor: 2, colorScheme: theme });
    try {
        const page = await context.newPage();
        const bridge = `__yomuTypographySmoke_${id.replace(/\W/g, '_')}`;
        await page.exposeFunction(bridge, handleRequest);
        await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: SETTINGS, requestBridgeName: bridge });
        await page.goto(`${server.origin}/annotation-typography.html`, { waitUntil: 'domcontentloaded' });
        await installUserscriptCssResource(page, CSS_PATH);
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        await page.waitForFunction(() => document.querySelectorAll('#sentence .jpdb-reader-word').length >= 10
            && document.querySelectorAll('#linked .jpdb-reader-word').length >= 5
            && document.querySelector('#sentence .jpdb-reader-word.jpdb-new')?.style.getPropertyValue('--jpdb-reader-word-accessible-underline'),
        null, { timeout: 30_000 });
        await page.waitForTimeout(600);
        await page.mouse.move(2, 2);
        await page.waitForTimeout(200);
        await page.locator('main').screenshot({ path: path.join(OUT, `${id}.png`) });
        const measured = await page.evaluate(measurePage);
        report.runs[id] = measured;
        judge(id, measured, paper);
    } finally {
        await context.close();
    }
}

function judge(id, measured, paper) {
    for (const word of measured.words) {
        if (word.fontDiff.length) fail(`${id}: ${word.text} does not use the host font (${word.fontDiff.join('; ')}).`, word);
        if (word.background !== 'none') fail(`${id}: ${word.text} is painted at rest (${word.background}).`, word);
    }
    for (const paragraph of ['sentence', 'linked']) {
        const readings = measured.readings.filter(reading => reading.paragraph === paragraph);
        if (!readings.length) fail(`${id}: #${paragraph} shows no readings.`, measured);
        const colours = new Set(readings.map(reading => reading.color));
        if (colours.size !== 1) fail(`${id}: #${paragraph} readings use ${colours.size} colours (${[...colours].join(', ')}).`, readings);
    }
    for (const reading of measured.readings) {
        const expectedSize = Math.max(6, reading.baseFontSize * 0.5);
        if (Math.abs(reading.fontSize - expectedSize) > 0.6) fail(`${id}: reading ${reading.text} is ${reading.fontSize}px over ${reading.baseFontSize}px text, not half.`, reading);
        if (reading.fontWeight !== '400') fail(`${id}: reading ${reading.text} has weight ${reading.fontWeight}.`, reading);
        if (reading.fontFamily !== reading.baseFontFamily) fail(`${id}: reading ${reading.text} is set in ${reading.fontFamily}.`, reading);
        if (reading.letterSpacing !== 'normal' && reading.letterSpacing !== '0px') fail(`${id}: reading ${reading.text} is tracked (${reading.letterSpacing}).`, reading);
        if (contrast(reading.color, paper) < 4.5) fail(`${id}: reading ${reading.text} (${reading.color}) is below 4.5:1 on ${paper}.`, reading);
        if (Math.abs(reading.centre - reading.baseCentre) > 1.5) fail(`${id}: reading ${reading.text} is off its word's centre by ${(reading.centre - reading.baseCentre).toFixed(1)}px.`, reading);
    }
    for (const [left, right] of measured.readingNeighbours) {
        if (left.right > right.left + 0.5) fail(`${id}: readings ${left.text} and ${right.text} overlap.`, { left, right });
    }
    const byText = text => measured.words.find(word => word.text === text);
    const underline = text => byText(text)?.underline ?? { style: 'missing' };
    if (underline('喫茶店').style !== 'solid') fail(`${id}: the New word should carry a solid underline.`, byText('喫茶店'));
    if (underline('新しい').style !== 'dashed') fail(`${id}: the Learning word should carry a dashed underline.`, byText('新しい'));
    if (underline('今日').style !== 'dotted') fail(`${id}: the Due word should carry a dotted underline.`, byText('今日'));
    for (const text of ['喫茶店', '新しい', '今日']) {
        const color = underline(text).color;
        if (color && contrast(color, paper) < 3) fail(`${id}: ${text}'s underline (${color}) is below 3:1.`, byText(text));
    }
    for (const text of ['本', 'は', '日本', '国内', '静か']) {
        if (underline(text).style !== 'none') fail(`${id}: ${text} should carry no underline at rest.`, byText(text));
    }
    for (const text of ['本', '今日']) {
        if (measured.readings.some(reading => reading.word === text)) fail(`${id}: ${text}, which the study source knows, should carry no reading.`, measured.readings);
    }
    if (measured.footnoteWords) fail(`${id}: the footnote marker was annotated.`, measured);
    if (!measured.readings.some(reading => reading.word === '日本' && reading.inFlow)) fail(`${id}: the linked word's reading should sit in flow like its neighbours'.`, measured.readings);
}

function fail(message, details) {
    report.failures.push({ message, details });
}

function fixturePage(paper, ink) {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Yomu annotation typography smoke</title>
<style>body{margin:0;padding:24px;background:${paper};color:${ink};font:20px/1.9 "Hiragino Mincho ProN","Noto Serif JP",serif}a{color:${ink === '#202122' ? '#3366cc' : '#88a3e8'}}${HOSTILE_CSS}</style>
</head><body><main><p id="sentence" class="tracked">${SENTENCE}</p><p id="linked">${LINKED}</p></main></body></html>`;
}

function handleRequest(request) {
    const url = new URL(request.url);
    if (process.env.SMOKE_DEBUG) console.error('[request]', decodeURIComponent(request.url));
    if (url.origin === 'https://jpdb.io' && url.pathname === '/api/v1/parse') {
        return jsonHttpResponse(mockJpdbParseFromVocabulary(readJsonBody(request.data), ROWS, {
            tokenReading: entry => FURIGANA[entry.surface] ?? [[entry.surface, entry.reading]],
        }));
    }
    return { status: 404, responseText: '' };
}

// Runs in the page.
function measurePage() {
    const PROPS = ['fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'fontStretch', 'fontVariant', 'fontFeatureSettings', 'fontKerning', 'letterSpacing', 'wordSpacing'];
    const hostOf = element => {
        let host = element.parentElement;
        while (host?.closest('.jpdb-reader-word')) host = host.parentElement;
        return host;
    };
    const words = Array.from(document.querySelectorAll('main .jpdb-reader-word')).map(word => {
        const base = word.querySelector('.jpdb-reader-ruby-base') ?? word;
        const own = getComputedStyle(base);
        const host = getComputedStyle(hostOf(word));
        const after = getComputedStyle(word, '::after');
        const drawn = after.borderBottomWidth !== '0px' && !/rgba\([^)]*, 0\)|transparent/.test(after.borderBottomColor);
        return {
            text: word.dataset.expression || word.textContent.trim(),
            classes: word.className,
            fontDiff: PROPS.filter(prop => own[prop] !== host[prop]).map(prop => `${prop}: ${host[prop]} -> ${own[prop]}`),
            background: getComputedStyle(word).backgroundImage,
            underline: drawn ? { style: after.borderBottomStyle, color: after.borderBottomColor, width: after.borderBottomWidth } : { style: 'none' },
        };
    });
    const readings = Array.from(document.querySelectorAll('main .jpdb-reader-furi')).filter(reading => {
        const style = getComputedStyle(reading);
        return style.display !== 'none' && style.visibility !== 'hidden' && reading.getBoundingClientRect().width > 0;
    }).map(reading => {
        const word = reading.closest('.jpdb-reader-word');
        const ruby = reading.closest('ruby');
        const base = ruby?.querySelector('.jpdb-reader-ruby-base, rb') ?? word;
        const style = getComputedStyle(reading);
        const baseStyle = getComputedStyle(base);
        const rect = reading.getBoundingClientRect();
        const baseRect = (ruby?.firstChild?.nodeType === Node.TEXT_NODE ? ruby : base).getBoundingClientRect();
        return {
            text: reading.textContent,
            word: word?.dataset.expression,
            paragraph: reading.closest('p')?.id,
            inFlow: reading.tagName === 'RT',
            color: style.color,
            fontSize: Number.parseFloat(style.fontSize),
            fontWeight: style.fontWeight,
            fontFamily: style.fontFamily,
            letterSpacing: style.letterSpacing,
            baseFontSize: Number.parseFloat(baseStyle.fontSize),
            baseFontFamily: baseStyle.fontFamily,
            left: rect.left,
            right: rect.right,
            top: Math.round(rect.top),
            centre: (rect.left + rect.right) / 2,
            baseCentre: (baseRect.left + baseRect.right) / 2,
        };
    });
    const readingNeighbours = [];
    const sorted = [...readings].sort((a, b) => a.top - b.top || a.left - b.left);
    for (let index = 1; index < sorted.length; index += 1) {
        if (sorted[index].top === sorted[index - 1].top) readingNeighbours.push([sorted[index - 1], sorted[index]]);
    }
    return {
        words,
        readings,
        readingNeighbours,
        footnoteWords: document.querySelectorAll('sup .jpdb-reader-word').length,
    };
}

function contrast(foreground, background) {
    const luminance = colour => {
        const [r, g, b] = parseColour(colour).map(channel => {
            const value = channel / 255;
            return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
}

function parseColour(value) {
    const hex = /^#([0-9a-f]{6})$/i.exec(value);
    if (hex) return [0, 2, 4].map(offset => Number.parseInt(hex[1].slice(offset, offset + 2), 16));
    const srgb = /^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)/.exec(value);
    if (srgb) return srgb.slice(1, 4).map(channel => Math.round(Number(channel) * 255));
    return (String(value).match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
}
