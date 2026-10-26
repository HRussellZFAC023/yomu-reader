#!/usr/bin/env node
// Background Network gate (W1-50): with no key and no interaction, the built
// product only fetches what it shows. Every case drives the BUILT product on a
// Recorded Page and reads its Network Ledger.
//
//   idle      ja.wikipedia 日本語, defaults, 20 s untouched: no jpdb.io pitch
//             page, at most 10 jpdb.io word searches, none for a segmenter
//             guess, no query asked twice (2.1.6: 44 pitch pages, repeats),
//             and no cloud OCR upload of the page's pictures before a press
//             (scrolling to one or resting the mouse on it is not a press);
//             a press on it does read it.
//   pitch     the same page with the underline painting pitch: the pitch lane
//             runs and words carry pitch classes.
//   hover     defaults, after 15 s idle: hovered words show their reading and
//             first gloss, rendered where a learner sees them, within 1 s of the
//             dwell at p90 (a popover that never shows counts against it), and
//             the popup still draws a pitch graph. A load over budget is
//             measured once more on a fresh load (a saturated machine).
//   youtube   the recorded watch page with captions, defaults, 40 s of
//             playback: no jpdb.io request at all (2.1.6: hundreds).
//   surfaces  pitch painted on one surface fetches nothing for the other,
//             beyond the first minute: ja.wikipedia with only the subtitle
//             text painting pitch, 75 s untouched, with Jiten's recorded
//             answers stripped of pitch (every word then lacks one), sends no
//             jpdb.io pitch page and searches only words with kanji; the
//             watch page with only the page underline painting pitch sends
//             jpdb.io no word shown only in its captions in 75 s.
//
//   node scripts/background-network-smoke.mjs [idle|pitch|hover|youtube|surfaces] [--product=worktree|v2.1.6|/abs/worktree] [--browser=chromium|webkit]
//
// jpdb.io was unreachable when the pages were recorded, so its answers are a
// mechanism fixture: an empty search page for a word with kanji, and one
// heiban vocabulary result for a kana query (the pitch client's reading
// query), after 600 ms. Jiten answers come from the recording, after 200 ms.
import { chromium, webkit } from 'playwright';
import { kanjiReadingCoverage } from './lib/recorded-page-probes.mjs';
import { loadRecording, openRecordedPage, releaseProduct, worktreeProduct } from './lib/recorded-page.mjs';
import { preloadHostedRuntimeAssets } from './lib/recorded-products.mjs';

const IDLE_MS = 20_000;
const LOAD_ATTEMPTS = 5;
const HOVER_IDLE_MS = 15_000;
const YOUTUBE_MS = 40_000;
const CROSS_SURFACE_MS = 75_000;
const MAX_IDLE_SEARCHES = 10;
const SEGMENTER_GUESSES = ['見まする', '見ましる', 'ありがつ'];
const DWELL_MS = 150;
const POPOVER_BUDGET_MS = 1_000;
// Hover until this many words were answered, or MAX_HOVERS were tried.
const HOVER_SAMPLES = 8;
const MAX_HOVERS = 20;
const HOVER_WAIT_MS = 5_000;
const HOVER_LOADS = 2;
// The popup's word lookup, by the function on its request's stack.
const POPUP_WORD_LOOKUP = 'loadJitenVocabularyInfo';
const EXAMPLE_SENTENCES = /\/random-example-sentences(?:\?|$)/u;
const CLOUD_OCR_HOSTS = /^(lensfrontend-pa\.googleapis\.com|lens\.google\.com|vision\.googleapis\.com)$/u;
// The product's subtitle surfaces (SUBTITLE_SURFACE_SELECTOR in main-helpers.ts).
const SUBTITLE_SURFACES = '.jpdb-subtitle-player, .jpdb-subtitle-list, .asbplayer-subtitles-container-bottom, .asbplayer-offscreen, .jpdb-reader-subtitle-surface';
const HAN = /\p{Script=Han}/u;
const PITCH_CLASS = /\bjpdb-pitch-(heiban|atamadaka|nakadaka|odaka|kifuku)\b/u;
const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1];
const cases = args.filter(arg => !arg.startsWith('--'));
const runCase = name => !cases.length || cases.includes(name);
const product = productFor(option('product') ?? 'worktree');
preloadHostedRuntimeAssets(product);
const engine = option('browser') ?? 'chromium';
if (!['chromium', 'webkit'].includes(engine)) throw new Error(`Unknown browser: ${engine}`);
const contextOptions = engine === 'webkit'
    ? { viewport: { width: 820, height: 1180 }, hasTouch: true }
    : {};
const failures = [];
const recordedTraffic = loadRecording('ja-wikipedia-nihongo').productTraffic();

const check = (condition, message) => {
    console.log(`${condition ? 'PASS' : 'FAIL'} ${product.label} ${message}`);
    if (!condition) failures.push(message);
};

const browser = await ({ chromium, webkit })[engine].launch(engine === 'chromium' ? { args: ['--autoplay-policy=no-user-gesture-required'] } : {});
console.log(`INFO ${product.label} background-network: ${engine}${engine === 'webkit' ? ' 820x1180 touch; hover uses the recorded desktop mouse viewport' : ''}`);
try {
    if (runCase('idle')) await idleWikipedia();
    if (runCase('pitch')) await pitchChannelWikipedia();
    if (runCase('hover')) await hoverWikipedia();
    if (runCase('youtube')) await youtubePlayback();
    if (runCase('surfaces')) {
        await subtitlePitchOnArticle();
        await pagePitchOnCaptions();
    }
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
        const kana = search.map(queryOf).filter(query => !HAN.test(query));
        check(!kana.length, `idle ja-wikipedia-nihongo: jpdb.io word searches only for words with kanji ${JSON.stringify(kana)}`);
        const ocr = run.ledger.requests({ host: CLOUD_OCR_HOSTS });
        check(!ocr.length, `idle ja-wikipedia-nihongo: ${ocr.length} cloud OCR request(s) with no tap (want 0) ${JSON.stringify(ocr.map(entry => entry.host))}`);
        const coverage = await kanjiReadingCoverage(run.page, { root: '#mw-content-text' });
        console.log(`INFO ${product.label} idle ja-wikipedia-nihongo: ${coverage.covered}/${coverage.kanjiRuns} visible kanji runs under a painted reading, ${run.ledger.requests({ host: 'api.jiten.moe' }).length} Jiten request(s) ${JSON.stringify(run.productTraffic().served)} by path ${JSON.stringify(jitenPaths(run.ledger))}`);
        await pictureWaitsForPress(run);
    } finally {
        await run.close();
    }
}

// The page's photo of a Japanese sign (recorded, but not read while idle):
// scrolling to it and resting the mouse on it upload nothing; a press reads it.
// The press is released off the picture, because a click opens its file page.
async function pictureWaitsForPress(run) {
    const picture = run.page.locator('#mw-content-text img[src*="Welcome_board"]').first();
    await picture.scrollIntoViewIfNeeded();
    // A real press starts with a picture the learner can see. Lazy image
    // decoding and the OCR image conversion can be slow on the shared Mac;
    // this positive check has no OCR latency requirement.
    await picture.evaluate(image => image.decode());
    await run.page.waitForTimeout(2_000);
    await picture.hover();
    await run.page.waitForTimeout(2_000);
    const unasked = run.ledger.requests({ host: CLOUD_OCR_HOSTS }).length;
    check(!unasked, `idle ja-wikipedia-nihongo: ${unasked} cloud OCR request(s) after scrolling to a picture and resting the mouse on it (want 0)`);
    // Late readings can move the image during the hover wait. Press its
    // current visible position, as a learner does, rather than stale coordinates.
    await picture.hover();
    await run.page.mouse.down();
    await run.page.mouse.move(2, 2);
    await run.page.mouse.up();
    await waitFor(() => run.ledger.requests({ host: CLOUD_OCR_HOSTS }).filter(entry => entry.trustedInteractionBefore).length, 30_000);
    await run.page.waitForTimeout(2_000);
    const pressed = run.ledger.requests({ host: CLOUD_OCR_HOSTS }).filter(entry => entry.trustedInteractionBefore).length;
    if (!pressed) console.log(`INFO ${product.label} picture press: ${JSON.stringify({ image: await picture.evaluate(image => ({ complete: image.complete, width: image.naturalWidth, height: image.naturalHeight })), interactions: run.ledger.interactions().slice(-4), errors: run.pageErrors, requests: run.ledger.requests().slice(-8).map(entry => ({ url: entry.url, served: entry.served })) })}`);
    check(pressed === 1, `idle ja-wikipedia-nihongo: a press on the picture asks the cloud OCR provider once (${pressed} request(s) after the press, want 1)`);
    const retired = run.ledger.requests({ host: 'lens.google.com' }).filter(entry => new URL(entry.url).pathname === '/v3/upload');
    check(!retired.length, `idle ja-wikipedia-nihongo: ${retired.length} request(s) to the retired Lens web upload endpoint (want 0)`);
}

async function waitFor(count, timeoutMs) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until && !count()) await sleep(100);
    return count();
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

// The first popup on a page pays for code the page has not run yet, and on a
// saturated machine that one hover can cross the budget by itself. A load
// whose p90 is over budget, or that left fewer than five words to judge, is
// measured once more on a fresh load; both are logged, and the second
// decides. 2.1.6 fails both (words that never show).
async function hoverWikipedia() {
    for (let attempt = 1; attempt <= HOVER_LOADS; attempt += 1) {
        const run = await answeredWikipedia('hover', HOVER_IDLE_MS);
        if (!run) return;
        try {
            const result = await hoverMeasure(run);
            const last = attempt === HOVER_LOADS;
            if (!last && (result.judged.length < 5 || !result.withinBudget)) {
                console.log(`INFO ${product.label} hover: load ${attempt} judged ${result.judged.length} word(s), p90 ${result.p90} ms; measuring a fresh load`);
                continue;
            }
            const { judged, p90 } = result;
            check(judged.length >= 5, `hover ja-wikipedia-nihongo: ${judged.length} hovered word(s) the recording answered (want ≥ 5)`);
            if (judged.length >= 5) check(result.withinBudget, `hover ja-wikipedia-nihongo: reading and first gloss visible ${p90} ms after the pointer arrived at p90 (want ≤ ${DWELL_MS} ms dwell + ${POPOVER_BUDGET_MS} ms)`);
            check(judged.some(sample => sample.pitchGraph), `hover ja-wikipedia-nihongo: the popup still draws the hovered word's pitch graph (${judged.filter(sample => sample.pitchGraph).length} of ${judged.length})`);
            return;
        } finally {
            await run.close();
        }
    }
}

async function hoverMeasure(run) {
    const samples = [];
    for (const word of await hoverTargets(run.page)) {
        samples.push(await hoverSample(run, word));
        if (samples.filter(sample => !sample.recordingGap).length >= HOVER_SAMPLES) break;
    }
    // A word is set aside only when, during its hover, the product asked Jiten
    // something the recording never held. A popover that did not show within
    // HOVER_WAIT_MS for any other reason is the product's failure, and counts.
    const judged = samples.filter(sample => !sample.recordingGap);
    const times = judged.map(sample => sample.shownMs ?? Infinity).sort((left, right) => left - right);
    const p90 = times[Math.ceil(times.length * 0.9) - 1];
    const detail = samples.map(sample => `${sample.text}:${sample.recordingGap ? 'not-recorded' : sample.shownMs ?? 'never-shown'}`).join(' ');
    console.log(`INFO ${product.label} hover: ${judged.length} of ${samples.length} hovered words judged; the rest asked Jiten for what the recording never held (${detail})`);
    return { judged, p90, withinBudget: p90 <= DWELL_MS + POPOVER_BUDGET_MS };
}

async function youtubePlayback() {
    const run = await openRecordedPage({ browser, contextOptions, waitUntil: 'domcontentloaded', navigationTimeoutMs: 120_000, slug: 'youtube-watch', product, hostOptions: { captions: true }, onGmRequest: modelledAnswers });
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

// Only the subtitle text paints pitch, and an article has no subtitles. Its
// words still get their identity, but nothing from jpdb.io's pitch pages, for
// longer than the paced lane's first minute.
async function subtitlePitchOnArticle() {
    const run = await answeredWikipedia('surfaces', CROSS_SURFACE_MS, { subtitleTextColorSource: 'pitch' }, withoutJitenPitch);
    if (!run) return;
    try {
        const { pitch, search } = jpdbLanes(run.ledger);
        check(pitch.length === 0, `surfaces ja-wikipedia-nihongo: subtitles paint pitch, the article does not: ${pitch.length} jpdb.io pitch page(s) in ${CROSS_SURFACE_MS / 1000} s (want 0) ${JSON.stringify(pitch.map(queryOf))}`);
        const kana = search.map(queryOf).filter(query => !HAN.test(query));
        check(!kana.length, `surfaces ja-wikipedia-nihongo: jpdb.io word searches only for words with kanji ${JSON.stringify(kana)}`);
    } finally {
        await run.close();
    }
}

// Only the page underline paints pitch. The watch page's own words (title,
// description, buttons) may go to jpdb.io; a word shown only in the captions
// may not. Caption lines change, so their words are collected as they show.
async function pagePitchOnCaptions() {
    const traffic = loadRecording('youtube-watch').productTraffic();
    const run = await openRecordedPage({ browser, contextOptions, waitUntil: 'domcontentloaded', navigationTimeoutMs: 120_000, slug: 'youtube-watch', product, hostOptions: { captions: true }, settings: { wordUnderlineColorSource: 'pitch' }, onGmRequest: request => withoutJitenPitch(request, traffic) });
    try {
        const captionWords = new Set();
        const pageWords = new Set();
        for (const until = Date.now() + CROSS_SURFACE_MS; Date.now() < until;) {
            const words = await run.page.evaluate(renderedWordTexts, SUBTITLE_SURFACES);
            words.forEach(([text, caption]) => (caption ? captionWords : pageWords).add(text));
            await run.page.waitForTimeout(500);
        }
        const captionOnly = [...captionWords].filter(text => !pageWords.has(text));
        const asked = run.ledger.requests({ host: 'jpdb.io' }).map(queryOf);
        const forCaptions = asked.filter(query => captionOnly.includes(query));
        check(captionOnly.length > 0, `surfaces youtube-watch: the product parsed the captions (${captionOnly.length} word(s) shown only in captions, ${pageWords.size} on the page)`);
        check(!forCaptions.length, `surfaces youtube-watch: the page underline paints pitch, the captions do not: ${forCaptions.length} jpdb.io request(s) for caption words in ${CROSS_SURFACE_MS / 1000} s (want 0; ${asked.length} for the page's own words) ${JSON.stringify(forCaptions)}`);
    } finally {
        await run.close();
    }
}

// Both the written form and its reading can become a pitch query. Keep their
// surface so a kana query for caption-only kanji cannot escape this check.
function renderedWordTexts(subtitleSurfaces) {
    return [...document.querySelectorAll('.jpdb-reader-word')].flatMap(word => {
        const copy = word.cloneNode(true);
        copy.querySelectorAll('rt, rp').forEach(element => element.remove());
        const caption = Boolean(word.closest(subtitleSurfaces));
        return [...new Set([copy.textContent.trim(), word.dataset.reading].filter(Boolean))].map(text => [text, caption]);
    });
}

// The recorded Jiten word details, without the pitch Jiten knew.
async function withoutJitenPitch(request, recorded) {
    const url = new URL(request.url);
    if (url.hostname !== 'api.jiten.moe' || !url.pathname.endsWith('/info')) return modelledAnswers(request);
    const answer = recorded.lookup(request.method || 'GET', request.url, request.data);
    if (!answer) return modelledAnswers(request);
    const body = JSON.parse(answer.body.toString());
    await sleep(200);
    return { status: 200, contentType: 'application/json', body: JSON.stringify({ ...body, pitchAccents: [] }) };
}

// A load whose Jiten requests the recording mostly could not answer measures
// a Jiten outage (every word with kanji then rightly asks jpdb.io for its
// reading, and no hovered word can be answered): load again, up to
// LOAD_ATTEMPTS times. It happens when a load scans the article before the
// page chrome, an order the recording does not hold; a busy machine takes it
// more often (three loads running in a row were seen).
async function answeredWikipedia(name, settleMs, settings = null, answer = modelledAnswers) {
    for (let attempt = 1; attempt <= LOAD_ATTEMPTS; attempt += 1) {
        // A touch-only device has no hover gesture. Measure mouse hover on the
        // recorded desktop viewport; the remaining WebKit cases use tablet touch.
        const run = await openWikipedia(settings, answer, name === 'hover' && engine === 'webkit' ? {} : contextOptions);
        await run.page.waitForTimeout(settleMs);
        const { verdict, served } = run.productTraffic();
        const parses = run.ledger.requests({ host: 'api.jiten.moe' }).filter(entry => new URL(entry.url).pathname.endsWith('/parse'));
        const missedParses = parses.filter(entry => entry.served !== 'recorded-product').length;
        const parsesAnswered = parses.length > 0 && missedParses === 0;
        if (verdict === 'answered' && parsesAnswered) return run;
        console.log(`INFO ${product.label} ${name} ja-wikipedia-nihongo: load ${attempt} was a Jiten outage (${verdict}, ${missedParses}/${parses.length} parse request(s) unanswered, ${JSON.stringify(served)}), loading again`);
        await run.close();
    }
    check(false, `${name} ja-wikipedia-nihongo: none of ${LOAD_ATTEMPTS} loads was answered by the recorded Jiten traffic; record it again (docs/dev/recorded-pages.md)`);
    return null;
}

function openWikipedia(settings = null, answer = modelledAnswers, viewportOptions = contextOptions) {
    return openRecordedPage({ browser, contextOptions: viewportOptions, waitUntil: 'domcontentloaded', navigationTimeoutMs: 120_000, slug: 'ja-wikipedia-nihongo', product, settings, onGmRequest: request => answer(request, recordedTraffic) });
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
// gloss where a learner can see them; null when that never happened within
// HOVER_WAIT_MS. recordingGap: the popup's own word lookup (its search or word
// details, not the example sentences or the page's background passes) asked
// Jiten, during this hover, for something the recording does not hold.
async function hoverSample(run, word) {
    const { page, ledger } = run;
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
        // Rendered, not merely present: a box with area inside both the popover
        // and the viewport, not hidden, transparent or uncoloured.
        const frame = popover.getBoundingClientRect();
        const visible = element => {
            if (!element?.textContent.trim()) return false;
            if (element.checkVisibility && !element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
            const style = getComputedStyle(element);
            if (/^rgba\(.*,\s*0\)$|^transparent$/u.test(style.color)) return false;
            return [...element.getClientRects()].some(rect => rect.width > 0 && rect.height > 0
                && rect.right > Math.max(0, frame.left) && rect.left < Math.min(innerWidth, frame.right)
                && rect.bottom > Math.max(0, frame.top) && rect.top < Math.min(innerHeight, frame.bottom));
        };
        const base = headword.cloneNode(true);
        base.querySelectorAll('rt, rp, .jpdb-reader-furi').forEach(element => element.remove());
        const reading = [...headword.querySelectorAll('rt, .jpdb-reader-furi')].some(visible);
        const gloss = [...popover.querySelectorAll('.jpdb-reader-jiten-meaning, .jpdb-reader-local-glossary, .jpdb-reader-local-glossary-entry')].some(visible);
        return base.textContent.includes(firstKanji) && visible(headword) && reading && gloss;
    }, kanji, { timeout: HOVER_WAIT_MS, polling: 50 }).catch(() => null);
    const shownMs = handle ? Date.now() - arrivedAt : null;
    const recordingGap = !handle && ledger.requests({ host: 'api.jiten.moe', channel: 'gm', caller: POPUP_WORD_LOOKUP })
        .some(entry => entry.at >= arrivedAt && entry.served === 'offline' && !EXAMPLE_SENTENCES.test(entry.url));
    const pitchGraph = Boolean(handle) && await page.waitForFunction(() => [...document.querySelectorAll('.jpdb-reader-popover .jpdb-reader-pitch svg')]
        .some(svg => [...svg.getClientRects()].some(rect => rect.width > 0 && rect.height > 0)), null, { timeout: 2_000, polling: 50 }).then(() => true, () => false);
    return { text: word.text, shownMs, recordingGap, pitchGraph };
}

// Jiten requests by endpoint (/api/vocabulary/<id>/<n>/info folds to one).
function jitenPaths(ledger) {
    const paths = {};
    for (const entry of ledger.requests({ host: 'api.jiten.moe' })) {
        const endpoint = new URL(entry.url).pathname.replace(/\/\d+(?=\/|$)/gu, '/:n');
        paths[endpoint] = 1 + (paths[endpoint] ?? 0);
    }
    return paths;
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
