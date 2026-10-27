#!/usr/bin/env node
// 先生's popup on a Recorded Page (ja.wikipedia 日本語), from the built product
// with fresh-install defaults and no keys: Chromium hovers the word, WebKit at
// iPad Pro 11 size taps it. Deterministic: api.jiten.moe is answered from the
// page's recorded product traffic and from
// scripts/fixtures/popup-word-detail/jiten-answers.json, Jiten's live answers
// recorded on 2026-10-19 (`--record` asks api.jiten.moe again and rewrites it).
//
//   quiet    Recorded answers without injected 429s (or live Jiten with --live).
//   refused  Jiten refuses (429) every request from the page's load until 6 s
//            after the learner opens 先生, as when the page's enrichment or
//            another tab has spent the address's minute. 2.1.6 asked once and
//            kept "Exact pitch unavailable" and "In context ×1".
//   refused-html  The same refusal with an HTML error body, so JSON decoding
//                 cannot hide the HTTP status from the popup's retry policy.
//
// The popup's header must end with 先生's pitch graph (nakadaka, Jiten [3])
// and its Jiten rank badge (#330), and never show "Exact pitch unavailable"
// or "In context ×N" while it loads.
//
// reflow-mechanism-fixture shifts the recorded article underneath an unmoved
// pointer. The selected word must survive native boundary events until a real
// pointer move; this is mechanism evidence, not visual acceptance.
//
// --live uses live Jiten for ALL vocabulary traffic, with no recorded API
// answers. The refused scenario still injects 429s until six seconds after
// opening; it never deliberately floods the public service.
// --jpdb loads a QA key through qa-env.mjs and selects JPDB parsing. It also
// requires live successful JPDB parses and the JPDB rank in the rendered card.
// --env-root may name the canonical checkout that owns the local QA key.
//   node scripts/popup-word-detail-smoke.mjs [--engines=chromium,webkit] [--product=v2.1.6|<build root>] [--record|--live] [--scenarios=quiet,refused,refused-html] [--press=hover,click]
//   --layout-only --sizes=320x568,360x640,390x844,844x390,320x1180,590x820,500x700,1280x600 --ipad-layout
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, devices, webkit } from 'playwright';
import { loadRecording, openRecordedPage, releaseProduct, worktreeProduct } from './lib/recorded-page.mjs';
import { createSmokePaths } from './lib/smoke-harness.mjs';
import { loadLocalEnv } from './lib/qa-env.mjs';
import { popupWordDetailLayout, visibleSensei } from './lib/popup-word-detail-layout.mjs';
import { studyWordDetailLayout } from './lib/popup-word-detail-study.mjs';

const { root: ROOT, artifacts: ARTIFACTS } = createSmokePaths(import.meta.dirname);
const ARTIFACT_DIR = path.join(ARTIFACTS, 'popup-word-detail');
const ANSWERS = path.join(ROOT, 'scripts', 'fixtures', 'popup-word-detail', 'jiten-answers.json');
const ATTRIBUTION = 'Jiten public API; JMdict is copyright the Electronic Dictionary Research and Development Group, CC BY-SA 4.0 (https://www.edrdg.org/edrdg/licence.html). Japanese Wikipedia query text: Wikipedia contributors, 日本語, CC BY-SA 4.0; see ../recorded/ATTRIBUTION.md. Example-sentence text is omitted.';
const SLUG = 'ja-wikipedia-nihongo';
const WORD = '先生';
const DETAIL_PATH = '/api/vocabulary/1387990/0/info';
const RANK_BADGE = /^Jiten\s*#330$/u;
const FILLER = /Exact pitch unavailable|完全一致のピッチ|In context|文脈内/u;
const REFUSED_AFTER_PRESS_MS = 6_000;
const SETTLE_MS = 8_000;
const ANSWER_WITHIN_MS = 80_000;
const PROFILES = {
    chromium: { engine: chromium, presses: ['hover', 'click'], contextOptions: {} },
    webkit: { engine: webkit, presses: ['hover', 'tap'], contextOptions: { ...devices['iPad Pro 11'] } },
};

const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const reportName = path.basename(option('report') ?? (args.includes('--layout-only') ? 'layout-report.json' : 'report.json'));
const recording = args.includes('--record');
const live = args.includes('--live');
let jpdbKey = '';
if (args.includes('--jpdb')) {
    loadLocalEnv(option('env-root') ?? ROOT);
    jpdbKey = process.env.YOMU_JPDB_API_KEY?.trim() || process.env.JPDB_API_KEY?.trim() || process.env.YOMU_TEST_API_KEY?.trim() || process.env.YOMU_PROFILE_API_KEY?.trim() || '';
    if (!jpdbKey) throw new Error('No JPDB QA key available through qa-env.mjs.');
}
const scenarios = (option('scenarios') ?? 'quiet,refused,refused-html').split(',');
const engines = (option('engines') ?? 'chromium,webkit').split(',');
const productRef = option('product') ?? 'worktree';
const product = productRef === 'worktree' ? worktreeProduct()
    : /^v\d/u.test(productRef) ? releaseProduct(productRef)
        : worktreeProduct(path.resolve(productRef));
const productTraffic = loadRecording(SLUG).productTraffic();
const answers = new Map(existsSync(ANSWERS) ? JSON.parse(readFileSync(ANSWERS, 'utf8')).answers.map(answer => [answerKey(answer), answer]) : []);
mkdirSync(ARTIFACT_DIR, { recursive: true });

const results = [];
for (const name of engines) {
    const profile = PROFILES[name];
    if (!profile) throw new Error(`Unknown engine ${name}; use ${Object.keys(PROFILES).join(', ')}.`);
    const browser = await profile.engine.launch({ headless: true });
    try {
        if (!args.includes('--layout-only')) {
            for (const press of (option('press')?.split(',') ?? profile.presses)) {
                for (const scenario of scenarios) recordResult(await openSensei(browser, name, { ...profile, press }, scenario));
            }
        }
        if (!args.includes('--skip-layout')) {
            const sizes = option('sizes')?.split(',').map(value => value.split('x').map(Number))
                ?? (option('widths') ?? '390,1280').split(',').map(value => [Number(value), 844]);
            for (const [width, height] of sizes) {
                for (const language of (option('languages') ?? 'en,ja').split(',')) {
                    const layout = { browser, product, engine: name, width, height, language, answerJiten, largeText: args.includes('--large-text') };
                    if (!args.includes('--study-only')) recordResult(await popupWordDetailLayout(layout));
                    if (!args.includes('--popup-only')) recordResult(await studyWordDetailLayout(layout));
                }
            }
            if (args.includes('--ipad-layout')) {
                for (const mode of ['sheet', 'popover']) for (const [width, height] of [[820, 1180], [1180, 820]]) {
                    recordResult(await popupWordDetailLayout({ browser, product, engine: name, width, height, language: 'en', answerJiten, contextOptions: devices['iPad Pro 11'], mode, rotate: true }));
                }
            }
        }
    } finally {
        await browser.close();
    }
}

if (recording) {
    mkdirSync(path.dirname(ANSWERS), { recursive: true });
    const recorded = [...answers.values()].sort((left, right) => answerKey(left).localeCompare(answerKey(right)));
    writeFileSync(ANSWERS, `${JSON.stringify({ source: 'https://api.jiten.moe (keyless answers; example text omitted)', attribution: ATTRIBUTION, recordedAt: new Date().toISOString().slice(0, 10), answers: recorded }, null, 1)}\n`);
    console.log(`Recorded ${recorded.length} api.jiten.moe answers to ${path.relative(ROOT, ANSWERS)}.`);
}
const failed = results.filter(result => result.failures.length);
writeFileSync(path.join(ARTIFACT_DIR, reportName), JSON.stringify({ product: product.label, network: live ? 'live Jiten; injected 429s in refused scenario' : 'recorded/deterministic', results }, null, 2));

if (failed.length) process.exitCode = 1;

function recordResult(result) {
    results.push(result);
    console.log(`${result.failures.length ? 'FAIL' : 'PASS'} ${result.engine} ${result.press} ${result.scenario}: ${result.failures.join('; ') || (result.layout ? `header ${result.headerHeights.join('/')} px, pills at ${result.pillOffsets.join('/')} px` : `pitch and #330 after ${result.answeredAfterMs} ms, ${result.detailRequests} detail request(s)`)}`);
}

async function openSensei(browser, engineName, profile, scenario) {
    let refusingUntil = scenario.startsWith('refused') ? Infinity : 0;
    const detailResponses = [];
    const jitenResponses = [];
    const jpdbParseStatuses = [];
    const run = await openRecordedPage({
        browser,
        slug: SLUG,
        product,
        settings: jpdbKey ? { apiKey: jpdbKey, parserProvider: 'jpdb' } : null,
        gmNetwork: 'replay',
        contextOptions: profile.contextOptions,
        onGmRequest: async request => {
            let response;
            try {
                const htmlRefused = scenario === 'refused-html' && new URL(request.url).hostname === 'api.jiten.moe' && Date.now() < refusingUntil;
                response = htmlRefused
                    ? { status: 429, contentType: 'text/html', body: '<html><body>Rate limit exceeded</body></html>' }
                    : await answerJiten(request, () => Date.now() < refusingUntil && scenario === 'refused');
                if (new URL(request.url).hostname === 'api.jiten.moe') jitenResponses.push({ at: Date.now(), url: request.url, responseType: request.responseType, status: response?.status, ...(response?.status >= 400 ? { body: String(response.body).slice(0, 240) } : {}) });
            } catch (error) {
                jitenResponses.push({ url: request.url, error: String(error?.message ?? error) });
                throw error;
            }
            if (response && request.url === 'https://jpdb.io/api/v1/parse') jpdbParseStatuses.push(response.status);
            if (response && new URL(request.url).pathname.startsWith('/api/vocabulary/1387990/')) {
                // Observation must never turn an upstream plain-text 429 into
                // a decoding/network error before the product sees its status.
                let body = {};
                try { body = JSON.parse(String(response.body || '{}')); } catch { /* non-JSON error body */ }
                detailResponses.push({ at: Date.now(), url: request.url, status: response.status, mainReading: body?.mainReading, pitchAccents: body?.pitchAccents });
            }
            return response;
        },
    });
    const { page } = run;
    const failures = [];
    const result = { engine: engineName, press: profile.press, scenario, failures, samples: [], detailResponses, jitenResponses, jpdbParseStatuses };
    result.providerErrors = [];
    page.on('console', message => {
        if (/Jiten.*(?:failed|detail|batch|parse)/iu.test(message.text())) result.providerErrors.push(message.text());
    });
    try {
        await page.waitForTimeout(SETTLE_MS);
        if (jpdbKey) result.configuration = await page.evaluate(() => ({ hasJpdbKey: Boolean(window.__yomuRealApp?.settings?.apiKey), parserProvider: window.__yomuRealApp?.settings?.parserProvider }));
        const word = await visibleSensei(page);
        // Observe the unminified build's actual renderer input, without
        // replacing its data loader, request path or rendered result.
        await page.evaluate(() => {
            const app = window.__yomuRealApp;
            window.__popupDetailRenders = [];
            window.__popupDetailPresses = [];
            window.__popupDetailLookupErrors = [];
            window.__popupDetailPointerMoves = [];
            window.__popupDetailPointerOvers = [];
            document.addEventListener('pointerover', event => {
                const target = event.target instanceof Element ? event.target : null;
                window.__popupDetailPointerOvers.push({ at: performance.now(), x: event.clientX, y: event.clientY, word: target?.closest('[data-expression]')?.getAttribute('data-expression') });
            }, { capture: true, passive: true });
            document.addEventListener('pointermove', event => {
                const target = event.target instanceof Element ? event.target : null;
                window.__popupDetailPointerMoves.push({ x: event.clientX, y: event.clientY, word: target?.closest('[data-expression]')?.getAttribute('data-expression'), inPopup: Boolean(target?.closest('.jpdb-reader-popover')) });
            }, { capture: true, passive: true });
            const lookup = app.jiten.lookupVocabularyInfoForCard;
            app.jiten.lookupVocabularyInfoForCard = function (...args) {
                return lookup.apply(this, args).catch(error => {
                    window.__popupDetailLookupErrors.push({ name: error?.name, message: error?.message });
                    throw error;
                });
            };
            for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']) {
                document.addEventListener(type, event => {
                    const target = event.target instanceof Element ? event.target : null;
                    window.__popupDetailPresses.push({ type, trusted: event.isTrusted, x: event.clientX, y: event.clientY, word: target?.closest('[data-expression]')?.getAttribute('data-expression'), tag: target?.tagName });
                }, { capture: true, passive: true });
            }
            if (typeof app?.renderCompletedCardPopover !== 'function') return;
            const render = app.renderCompletedCardPopover;
            app.renderCompletedCardPopover = function (...args) {
                const [, card, , trigger, data] = args;
                window.__popupDetailRenders.push({
                    trigger, source: card.source, spelling: card.spelling, reading: card.reading,
                    wordId: card.jitenWordId, readingIndex: card.jitenReadingIndex,
                    frequencyRank: card.frequencyRank, pitchAccent: [...card.pitchAccent],
                    jitenPitch: data.jitenVocabularyInfo?.pitchAccents,
                    jitenReading: data.jitenVocabularyInfo?.mainReading,
                    frequencyRanks: data.frequencyRanks,
                });
                return render.apply(this, args);
            };
        });
        const pressedAt = Date.now();
        if (scenario.startsWith('refused')) refusingUntil = pressedAt + REFUSED_AFTER_PRESS_MS;
        if (profile.press === 'tap') {
            // Tap the current visible word with native touch input, as a
            // finger does while page annotation continues. The header
            // assertions below still require the exact word's pitch and rank.
            const box = await word.boundingBox();
            if (!box) throw new Error('The visible word disappeared before the tap.');
            result.tapBox = box;
            // WebKit touch coordinates use the visual viewport. The recorded
            // desktop page can be wider than an iPad's viewport and zoomed out.
            const viewport = await page.evaluate(() => ({ scale: visualViewport?.scale ?? 1, left: visualViewport?.offsetLeft ?? 0, top: visualViewport?.offsetTop ?? 0 }));
            result.tapViewport = viewport;
            await page.touchscreen.tap((box.x + box.width / 2 - viewport.left) * viewport.scale, (box.y + box.height / 2 - viewport.top) * viewport.scale);
        }
        else if (profile.press === 'click') await word.click();
        else await word.hover();
        if (scenario === 'reflow-mechanism-fixture') {
            await page.waitForFunction(() => document.querySelector('[data-card-popover] .jpdb-reader-header'));
            // A recording cannot preserve the timing of late page reflow. Move
            // its real article so a different real word crosses the stationary
            // pointer; let WebKit generate the boundary events itself.
            result.reflow = await page.evaluate(() => {
                const point = window.__popupDetailPointerMoves.at(-1);
                const article = document.querySelector('#mw-content-text');
                const other = [...article.querySelectorAll('[data-expression]')].find(node => node.dataset.expression === '連体');
                if (!point || !other) throw new Error('Missing recorded reflow target.');
                const box = other.getBoundingClientRect();
                article.style.transform = `translate(${point.x - box.x - box.width / 2}px, ${point.y - box.y - box.height / 2}px)`;
                return { word: other.dataset.expression, point };
            });
        }
        let header = null;
        let answeredAt = 0;
        while (Date.now() - pressedAt < ANSWER_WITHIN_MS) {
            header = await page.evaluate(readHeader);
            if (header) result.samples.push({ atMs: Date.now() - pressedAt, ...header, html: undefined });
            if (header && FILLER.test(header.text) && !failures.length) failures.push(`the popup said "${FILLER.exec(header.text)[0]}" at ${Date.now() - pressedAt} ms`);
            if (header && header.spelling !== WORD) {
                failures.push(`Stationary lookup changed from ${WORD} to ${header.spelling}.`);
                break;
            }
            if (header?.pitch === 'nakadaka' && header.pills.some(pill => RANK_BADGE.test(pill))) answeredAt ||= Date.now();
            if (answeredAt && Date.now() - answeredAt >= 4_000) break;
            await page.waitForTimeout(250);
        }
        result.answeredAfterMs = answeredAt ? answeredAt - pressedAt : Date.now() - pressedAt;
        result.observedForMs = Date.now() - pressedAt;
        result.header = header && { ...header, html: undefined };
        if (header?.pitch !== 'nakadaka') failures.push(`no nakadaka pitch graph for ${WORD} (${header?.pitch || 'none'})`);
        if (!header?.pills.some(pill => RANK_BADGE.test(pill))) failures.push(`no Jiten #330 badge (${header?.pills.join(' | ') ?? 'no popup'})`);
        if (result.reflow && !failures.length) {
            result.stationaryPointerMoves = await page.evaluate(() => window.__popupDetailPointerMoves.length);
            if (result.stationaryPointerMoves !== 1) failures.push('The reflow probe moved the pointer.');
            // Hydration can move the article again after our imposed reflow.
            // Aim at its current word, rather than a now-blank old coordinate.
            await page.locator('.jpdb-reader-word[data-expression="連体"]:visible').first().hover();
            await page.waitForFunction(() => {
                const headword = document.querySelector('[data-card-popover] [data-yomu-headword]')?.cloneNode(true);
                headword?.querySelectorAll('rt, rp').forEach(node => node.remove());
                return headword && headword.textContent.trim() !== '先生';
            }, null, { timeout: 15_000 });
            result.afterDeliberateMove = await page.evaluate(readHeader);
        }
        if (scenario === 'scroll' && !failures.length) {
            // Native scroll input on the recorded article must release the
            // latch without moving the mouse. Mobile WebKit's automation
            // cannot send wheel input; use an attached keyboard's PageDown.
            await page.evaluate(() => {
                window.__popupScroll = { beforeY: scrollY, moves: window.__popupDetailPointerMoves.length };
                window.addEventListener('scroll', () => {
                    const probe = window.__popupScroll;
                    probe.startedAt ??= performance.now();
                    probe.afterY = scrollY;
                }, { capture: true, passive: true });
                const sample = () => {
                    const probe = window.__popupScroll;
                    if (!document.querySelector('[data-card-popover]')) probe.closedAt ??= performance.now();
                    if (!probe.closedAt) requestAnimationFrame(sample);
                };
                requestAnimationFrame(sample);
            });
            result.scrollInput = engineName === 'webkit' ? 'PageDown' : 'wheel-350px';
            if (engineName === 'webkit') await page.keyboard.press('PageDown');
            else await page.mouse.wheel(0, 350);
            await page.waitForTimeout(1_000);
            result.scroll = await page.evaluate(() => {
                const moves = window.__popupDetailPointerMoves;
                const origin = moves[window.__popupScroll.moves - 1];
                return { ...window.__popupScroll, open: Boolean(document.querySelector('[data-card-popover]')),
                    pointerMoved: moves.slice(window.__popupScroll.moves).some(point => Math.abs(point.x - origin.x) >= 0.01 || Math.abs(point.y - origin.y) >= 0.01) };
            });
            const scroll = result.scroll;
            if (!scroll.startedAt || scroll.afterY === scroll.beforeY) failures.push('Native input did not scroll the recorded article.');
            if (scroll.open || !scroll.closedAt) failures.push('Hover popup stayed open after user scrolling.');
            else if (scroll.closedAt - scroll.startedAt > 200) failures.push(`Scroll dismissal took ${Math.round(scroll.closedAt - scroll.startedAt)} ms (limit 200).`);
            if (scroll.pointerMoved) failures.push('The scroll probe moved the pointer.');
        }
        await page.screenshot({ path: path.join(ARTIFACT_DIR, `${engineName}-${profile.press}-${scenario}.png`) });
    } catch (error) {
        failures.push(String(error?.message ?? error).split('\n')[0]);
        result.error = String(error?.stack ?? error);
    } finally {
        result.detailRequests = run.ledger.requests({ host: 'api.jiten.moe', path: DETAIL_PATH }).length;
        result.detailNetwork = run.ledger.requests({ host: 'api.jiten.moe' }).filter(request => request.url.includes('/vocabulary/1387990/'));
        result.productTraffic = run.productTraffic();
        result.rendererInputs = await page.evaluate(() => window.__popupDetailRenders ?? []);
        result.lookupErrors = await page.evaluate(() => window.__popupDetailLookupErrors ?? []);
        result.pointerMoves = await page.evaluate(() => window.__popupDetailPointerMoves ?? []);
        result.pointerOvers = await page.evaluate(() => window.__popupDetailPointerOvers ?? []);
        result.pageErrors = run.pageErrors;
        if (scenario.startsWith('refused') && !jitenResponses.some(response => response.status === 429 && response.url.includes('/vocabulary/search?'))) failures.push('The identity search never exercised a 429.');
        if (jpdbKey && (!jpdbParseStatuses.includes(200) || !result.rendererInputs.some(input => input.frequencyRanks?.jpdb?.rank))) failures.push('The JPDB-key path did not supply a successful parse and a JPDB card rank.');
        result.presses = await page.evaluate(() => window.__popupDetailPresses ?? []);
        if (result.tapBox) {
            const press = result.presses.find(event => event.type === 'pointerdown');
            const box = result.tapBox;
            if (!press || press.x < box.x || press.x > box.x + box.width || press.y < box.y || press.y > box.y + box.height) failures.push('Native touch did not land on the measured word.');
        }
        result.samples = result.samples.filter((sample, index, all) => index === 0 || JSON.stringify({ ...sample, atMs: 0 }) !== JSON.stringify({ ...all[index - 1], atMs: 0 }));
        await run.close();
    }
    return result;
}

function readHeader() {
    const visible = node => {
        if (!node) return false;
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const details = node.closest('details:not([open])');
        return box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth
            && style.visibility !== 'hidden' && style.opacity !== '0'
            && (!details || details.querySelector(':scope > summary')?.contains(node));
    };
    const popover = [...document.querySelectorAll('.jpdb-reader-popover')].find(visible);
    const header = popover?.querySelector('[data-card-popover] .jpdb-reader-header');
    if (!header) return null;
    const graph = header.querySelector('.jpdb-reader-card-tools .jpdb-reader-pitch svg');
    const polyline = visible(graph) ? graph.querySelector('polyline') : null;
    const headword = header.querySelector('[data-yomu-headword]')?.cloneNode(true);
    headword?.querySelectorAll('rt, rp').forEach(node => node.remove());
    return {
        spelling: headword?.textContent?.trim() ?? '',
        text: header.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
        pitch: polyline?.getAttribute('class') ?? '',
        reading: header.querySelector('.jpdb-reader-pitch')?.textContent?.trim() ?? '',
        points: polyline?.getAttribute('points') ?? '',
        headerHeight: Math.round(header.getBoundingClientRect().height),
        pills: [...header.querySelectorAll('.jpdb-reader-word-pills .jpdb-reader-pill')].filter(visible).map(pill => pill.textContent?.replace(/\s+/gu, ' ').trim() ?? '').filter(Boolean),
    };
}

async function answerJiten(request, refusing) {
    if (jpdbKey && request.url === 'https://jpdb.io/api/v1/parse') {
        const response = await fetch(request.url, { method: request.method, headers: { Authorization: `Bearer ${jpdbKey}`, 'Content-Type': 'application/json' }, body: request.bodyText });
        return { status: response.status, contentType: 'application/json', body: await response.text() };
    }
    if (new URL(request.url).hostname !== 'api.jiten.moe') return undefined;
    if (refusing()) return { status: 429, contentType: 'application/json', body: '{"title":"Too Many Requests","status":429}' };
    const recorded = !live && answers.get(answerKey(request));
    if (recorded) return { status: recorded.status, contentType: 'application/json', body: recorded.body };
    const traffic = !live && productTraffic.lookup(request.method, request.url, request.bodyText);
    if (traffic) return { status: traffic.status, contentType: traffic.contentType, body: traffic.body };
    if (!recording && !live) return undefined;
    const response = await fetch(request.url, {
        method: request.method,
        headers: { accept: 'application/json', ...(request.method === 'GET' ? {} : { 'content-type': 'application/json' }) },
        body: request.method === 'GET' ? undefined : request.bodyText,
    });
    const body = await response.text();
    if (response.ok) answers.set(answerKey(request), { method: request.method, url: request.url, requestBody: request.bodyText || undefined, status: response.status, body: request.url.endsWith('/random-example-sentences') ? '[]' : body });
    return { status: response.status, contentType: 'application/json', body };
}

function answerKey({ method, url, requestBody, bodyText }) {
    return `${method} ${url} ${requestBody ?? bodyText ?? ''}`;
}
