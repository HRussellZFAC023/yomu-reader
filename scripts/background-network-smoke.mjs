#!/usr/bin/env node
// Background Network gate (W1-50): with no key and no interaction, the built
// product only fetches what it shows. Every case drives the BUILT product on a
// Recorded Page and reads its Network Ledger.
//
//   idle      ja.wikipedia 日本語, defaults, 20 s untouched: no jpdb.io pitch
//             page, at most 10 jpdb.io word searches, none for a segmenter
//             guess, no query asked twice (2.1.6: 44 pitch pages, repeats).
//   pitch     the same page with the underline painting pitch: the pitch lane
//             runs and words carry pitch classes.
//   hover     defaults, after 15 s idle: hovered words show their reading and
//             first gloss within 1 s of the dwell at p90, and the popup still
//             draws a pitch graph.
//   youtube   the recorded watch page with captions, defaults, 40 s of
//             playback: no jpdb.io request at all (2.1.6: hundreds).
//
//   node scripts/background-network-smoke.mjs [idle|pitch|hover|youtube] [--product=worktree|v2.1.6|/abs/worktree]
//
// jpdb.io was unreachable when the pages were recorded, so its answers are a
// mechanism fixture: an empty search page for a word with kanji, and one
// heiban vocabulary result for a kana query (the pitch client's reading
// query), after 600 ms. Jiten answers come from the recording, after 200 ms.
import { chromium } from 'playwright';
import { kanjiReadingCoverage } from './lib/recorded-page-probes.mjs';
import { openRecordedPage, releaseProduct, worktreeProduct } from './lib/recorded-page.mjs';

const IDLE_MS = 20_000;
const LOAD_ATTEMPTS = 3;
const HOVER_IDLE_MS = 15_000;
const YOUTUBE_MS = 40_000;
const MAX_IDLE_SEARCHES = 10;
const SEGMENTER_GUESSES = ['見まする', '見ましる', 'ありがつ'];
const DWELL_MS = 150;
const POPOVER_BUDGET_MS = 1_000;
// Hover until this many words were answered, or MAX_HOVERS were tried.
const HOVER_SAMPLES = 8;
const MAX_HOVERS = 20;
const HOVER_WAIT_MS = 5_000;
const PITCH_CLASS = /\bjpdb-pitch-(heiban|atamadaka|nakadaka|odaka|kifuku)\b/u;
const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1];
const cases = args.filter(arg => !arg.startsWith('--'));
const runCase = name => !cases.length || cases.includes(name);
const product = productFor(option('product') ?? 'worktree');
const failures = [];

const check = (condition, message) => {
    console.log(`${condition ? 'PASS' : 'FAIL'} ${product.label} ${message}`);
    if (!condition) failures.push(message);
};

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
    if (runCase('idle')) await idleWikipedia();
    if (runCase('pitch')) await pitchChannelWikipedia();
    if (runCase('hover')) await hoverWikipedia();
    if (runCase('youtube')) await youtubePlayback();
} finally {
    await browser.close();
}

if (failures.length) {
    console.error(`\n[background-network] ${failures.length} failure(s)`);
    process.exit(1);
}
console.log('\n[background-network] all checks passed');

function productFor(ref) {
    if (ref === 'worktree') return worktreeProduct();
    return ref.startsWith('/') ? { ...worktreeProduct(ref), label: ref } : releaseProduct(ref);
}

async function idleWikipedia() {
    const run = await answeredWikipedia('idle', IDLE_MS);
    if (!run) return;
    try {
        const { pitch, search } = jpdbLanes(run.ledger);
        check(pitch.length === 0, `idle ja-wikipedia-nihongo: ${pitch.length} jpdb.io pitch page(s) in ${IDLE_MS / 1000} s untouched (want 0)`);
        check(search.length <= MAX_IDLE_SEARCHES, `idle ja-wikipedia-nihongo: ${search.length} jpdb.io word search(es) (want ≤ ${MAX_IDLE_SEARCHES}) ${JSON.stringify(search.map(queryOf))}`);
        const queries = [...pitch, ...search].map(entry => entry.url);
        const guesses = queries.map(queryOfUrl).filter(query => SEGMENTER_GUESSES.includes(query));
        check(!guesses.length, `idle ja-wikipedia-nihongo: no jpdb.io query for a segmenter guess ${JSON.stringify(guesses)}`);
        const repeats = queries.length - new Set(queries).size;
        check(!repeats, `idle ja-wikipedia-nihongo: ${new Set(queries).size} distinct jpdb.io quer(ies), ${repeats} asked again`);
        const coverage = await kanjiReadingCoverage(run.page, { root: '#mw-content-text' });
        console.log(`INFO ${product.label} idle ja-wikipedia-nihongo: ${coverage.covered}/${coverage.kanjiRuns} visible kanji runs under a painted reading, ${run.ledger.requests({ host: 'api.jiten.moe' }).length} Jiten request(s) ${JSON.stringify(run.productTraffic().served)}`);
    } finally {
        await run.close();
    }
}

async function pitchChannelWikipedia() {
    const run = await answeredWikipedia('pitch', IDLE_MS, { wordUnderlineColorSource: 'pitch' });
    if (!run) return;
    try {
        const { pitch } = jpdbLanes(run.ledger);
        const painted = await run.page.evaluate(pattern => [...document.querySelectorAll('#mw-content-text .jpdb-reader-word')]
            .filter(word => new RegExp(pattern, 'u').test(word.className)).length, PITCH_CLASS.source);
        check(pitch.length > 0, `pitch ja-wikipedia-nihongo: the underline paints pitch, so the pitch lane ran (${pitch.length} jpdb.io pitch page(s))`);
        check(painted > 0, `pitch ja-wikipedia-nihongo: ${painted} word(s) carry a pitch class`);
    } finally {
        await run.close();
    }
}

async function hoverWikipedia() {
    const run = await answeredWikipedia('hover', HOVER_IDLE_MS);
    if (!run) return;
    try {
        const samples = [];
        for (const word of await hoverTargets(run.page)) {
            samples.push(await hoverSample(run.page, word));
            if (samples.filter(sample => sample.shownMs !== null).length >= HOVER_SAMPLES) break;
        }
        const judged = samples.filter(sample => sample.shownMs !== null);
        const times = judged.map(sample => sample.shownMs).sort((left, right) => left - right);
        const p90 = times[Math.ceil(times.length * 0.9) - 1];
        const detail = samples.map(sample => `${sample.text}:${sample.shownMs ?? 'unanswered'}`).join(' ');
        console.log(`INFO ${product.label} hover: ${judged.length} of ${samples.length} hovered words were answered by the recording; the rest asked Jiten for what it never recorded and are not judged (${detail})`);
        check(judged.length >= 5, `hover ja-wikipedia-nihongo: ${judged.length} hovered word(s) the recording answered (want ≥ 5)`);
        if (judged.length >= 5) check(p90 <= DWELL_MS + POPOVER_BUDGET_MS, `hover ja-wikipedia-nihongo: reading and first gloss shown ${p90} ms after the pointer arrived at p90 (want ≤ ${DWELL_MS} ms dwell + ${POPOVER_BUDGET_MS} ms)`);
        check(judged.some(sample => sample.pitchGraph), `hover ja-wikipedia-nihongo: the popup still draws the hovered word's pitch graph (${judged.filter(sample => sample.pitchGraph).length} of ${judged.length})`);
    } finally {
        await run.close();
    }
}

async function youtubePlayback() {
    const run = await openRecordedPage({ browser, slug: 'youtube-watch', product, hostOptions: { captions: true }, onGmRequest: modelledAnswers });
    try {
        await run.page.waitForTimeout(YOUTUBE_MS);
        const jpdb = run.ledger.requests({ host: 'jpdb.io' });
        const words = await run.page.evaluate(() => document.querySelectorAll('.jpdb-reader-word').length);
        check(words > 0, `youtube-watch: the product parsed the captions (${words} words)`);
        check(jpdb.length === 0, `youtube-watch: ${jpdb.length} jpdb.io request(s) in ${YOUTUBE_MS / 1000} s of playback with defaults (want 0)`);
    } finally {
        await run.close();
    }
}

// A load whose Jiten requests the recording mostly could not answer measures
// a Jiten outage (every word with kanji then rightly asks jpdb.io for its
// reading, and no hovered word can be answered): load again, up to
// LOAD_ATTEMPTS times.
async function answeredWikipedia(name, settleMs, settings = null) {
    for (let attempt = 1; attempt <= LOAD_ATTEMPTS; attempt += 1) {
        const run = await openWikipedia(settings);
        await run.page.waitForTimeout(settleMs);
        const { verdict, served } = run.productTraffic();
        if (verdict === 'answered') return run;
        console.log(`INFO ${product.label} ${name} ja-wikipedia-nihongo: load ${attempt} was a Jiten outage (${verdict} ${JSON.stringify(served)}), loading again`);
        await run.close();
    }
    check(false, `${name} ja-wikipedia-nihongo: none of ${LOAD_ATTEMPTS} loads was answered by the recorded Jiten traffic; record it again (docs/dev/recorded-pages.md)`);
    return null;
}

function openWikipedia(settings = null) {
    return openRecordedPage({ browser, slug: 'ja-wikipedia-nihongo', product, settings, onGmRequest: modelledAnswers });
}

// The pitch client asks jpdb.io's search from fetchPitch; the identity lane
// asks the same URL shape from the vocabulary search. The ledger tells them
// apart by the function names on the request's stack.
function jpdbLanes(ledger) {
    const pitch = new Set(ledger.requests({ host: 'jpdb.io', caller: 'fetchPitch' }).map(entry => entry.ledgerId));
    const jpdb = ledger.requests({ host: 'jpdb.io' });
    return { pitch: jpdb.filter(entry => pitch.has(entry.ledgerId)), search: jpdb.filter(entry => !pitch.has(entry.ledgerId)) };
}

async function modelledAnswers(request) {
    const url = new URL(request.url);
    if (url.hostname === 'api.jiten.moe') {
        await sleep(200);
        return undefined;
    }
    if (!url.hostname.endsWith('jpdb.io')) return undefined;
    await sleep(600);
    return { status: 200, contentType: 'text/html; charset=utf-8', body: jpdbSearchAnswer(url.searchParams.get('q') ?? '') };
}

function jpdbSearchAnswer(query) {
    if (!query || /\p{Script=Han}/u.test(query)) return '<!doctype html><div class="results search"></div>';
    const morae = [...query.matchAll(/.[ゃゅょャュョぁぃぅぇぉァィゥェォ]?/gu)].map(match => match[0]);
    const segment = (level, text) => `<div style="background-image: linear-gradient(to ${level === 'low' ? 'top' : 'bottom'},var(--pitch-${level}-s),var(--pitch-${level}-e));"><div>${text}</div></div>`;
    const contour = morae.length > 1 ? segment('low', morae[0]) + segment('high', morae.slice(1).join('')) : segment('low', query);
    const href = `/vocabulary/1/${encodeURIComponent(query)}`;
    return `<!doctype html><div class="results search"><div class="result vocabulary"><a href="${href}#a">${query}</a>
        <div class="subsection-pitch-accent"><div class="subsection"><div><div>${contour}</div></div></div></div></div></div>`;
}

// Visible kanji words, one per distinct text: first those that already show a
// reading (the recording holds their Jiten answer), then the rest.
async function hoverTargets(page) {
    const words = await page.evaluate(() => {
        const seen = new Set();
        return [...document.querySelectorAll('#mw-content-text .jpdb-reader-word')].flatMap((word, index) => {
            const copy = word.cloneNode(true);
            copy.querySelectorAll('rt, rp').forEach(element => element.remove());
            const text = copy.textContent.trim();
            const rect = word.getBoundingClientRect();
            if (!/\p{Script=Han}/u.test(text) || seen.has(text) || rect.top < 60 || rect.bottom > innerHeight - 40 || !rect.width) return [];
            seen.add(text);
            word.dataset.backgroundNetworkTarget = String(index);
            return [{ index, text, read: Boolean(word.querySelector('rt')?.textContent.trim()) }];
        });
    });
    return [...words.filter(word => word.read), ...words.filter(word => !word.read)].slice(0, MAX_HOVERS);
}

// Time from the pointer arriving to a popover showing the word's reading and a
// gloss; null when nothing came in HOVER_WAIT_MS (the recording held no answer).
async function hoverSample(page, word) {
    await page.mouse.move(2, 2);
    await page.waitForTimeout(400);
    const box = await page.locator(`[data-background-network-target="${word.index}"]`).boundingBox();
    const arrivedAt = Date.now();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // The popover counts once its headword is this word (an inflected word's
    // headword is its dictionary form: they share the first kanji), so the
    // last word's popover, still open, is never read as this one's.
    const kanji = word.text.match(/\p{Script=Han}/u)[0];
    const handle = await page.waitForFunction(firstKanji => {
        const popover = document.querySelector('.jpdb-reader-popover');
        const headword = popover?.querySelector('[data-yomu-headword]');
        if (!headword) return false;
        const base = headword.cloneNode(true);
        base.querySelectorAll('rt, rp, .jpdb-reader-furi').forEach(element => element.remove());
        const reading = [...headword.querySelectorAll('rt, .jpdb-reader-furi')].some(element => element.textContent.trim());
        const gloss = popover.querySelector('.jpdb-reader-jiten-meaning, .jpdb-reader-local-glossary, .jpdb-reader-local-glossary-entry')?.textContent.trim();
        return base.textContent.includes(firstKanji) && reading && Boolean(gloss);
    }, kanji, { timeout: HOVER_WAIT_MS, polling: 50 }).catch(() => null);
    const shownMs = handle ? Date.now() - arrivedAt : null;
    const pitchGraph = Boolean(handle) && await page.waitForSelector('.jpdb-reader-popover .jpdb-reader-pitch svg', { timeout: 2_000 }).then(() => true, () => false);
    return { text: word.text, shownMs, pitchGraph };
}

function queryOf(entry) {
    return queryOfUrl(entry.url);
}

function queryOfUrl(url) {
    return new URL(url).searchParams.get('q') ?? '';
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
