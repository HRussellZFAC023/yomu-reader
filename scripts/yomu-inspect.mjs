#!/usr/bin/env node
// Inspect the built userscript in an isolated browser; never attaches to a profile.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { addGmStorageBridgeInitScript, launchSmokeBrowser, YOMU_SETTINGS_KEY } from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback } from './lib/smoke-test-helpers.mjs';
import { inspectReportHtml, requestKey } from './lib/inspect-report.mjs';

const { values } = parseArgs({ options: {
    url: { type: 'string' }, record: { type: 'string' }, replay: { type: 'string' },
    out: { type: 'string', default: 'artifacts/inspect' },
    script: { type: 'string', default: 'dist/yomu.user.js' },
    selector: { type: 'string' },
    limit: { type: 'string' },
    'min-words': { type: 'string', default: '1' },
    help: { type: 'boolean' },
} });
if (values.help) {
    console.log('npm run inspect -- --url URL [--record artifacts/capture] [--selector CSS] [--limit 20]\n'
        + 'npm run inspect -- --replay artifacts/capture [--script /absolute/dist/yomu.user.js] [--out artifacts/replay]\n'
        + 'Reports visible base-text hover outcomes. Recording is opt-in. Replay blocks uncaptured requests.\n'
        + 'This uses a GM bridge, not an installed extension or userscript manager.');
    process.exit(0);
}
if (values.record && values.replay) throw new Error('Choose --record or --replay.');
const replay = values.replay && path.resolve(values.replay);
const record = values.record && path.resolve(values.record);
const capture = replay && JSON.parse(await readFile(path.join(replay, 'capture.json'), 'utf8'));
const selector = values.selector ?? capture?.selector ?? 'body';
const limit = Number(values.limit ?? capture?.limit ?? 20), minWords = Number(values['min-words']);
if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(minWords) || minWords < 0) {
    throw new Error('--limit must be 1–200 and --min-words a nonnegative integer.');
}
const url = values.url || capture?.url;
if (!url || !/^https?:\/\//u.test(url)) throw new Error('Provide an http(s) --url or a recorded --replay directory.');
if (capture && url !== capture.url) throw new Error('--url must match the recording.');
const out = path.resolve(values.out), script = path.resolve(values.script);
const css = await readFile(path.join(path.dirname(script), 'yomu.css'), 'utf8');
const scriptBytes = await readFile(script);
await mkdir(out, { recursive: true });
if (record) await mkdir(record, { recursive: true });
const cassette = capture?.requests || {};
const report = {
    url, capturedAt: new Date().toISOString(), mode: replay ? 'recorded-page replay' : 'live page',
    runtime: 'built userscript with simulated GM storage/network; no installed-manager or extension proof',
    scriptSha256: createHash('sha256').update(scriptBytes).digest('hex'),
    selector, viewport: { width: 1365, height: 900 }, words: [], errors: [], missingRequests: [],
};
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
let context;
try {
    context = await browser.newContext({
        viewport: report.viewport, serviceWorkers: 'block',
        ...(record && { recordHar: { path: path.join(record, 'page.har'), mode: 'full', content: 'embed' } }),
    });
    if (replay) {
        // HAR's fallback reaches this aborting route, never the live network.
        // Ordinary CSP/network failures are separate from absent recordings.
        await context.route('**/*', async route => {
            report.missingRequests.push(`${route.request().method()} ${route.request().url()}`);
            await route.abort();
        });
        await context.routeFromHAR(path.join(replay, 'page.har'), { notFound: 'fallback' });
    }
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    page.on('requestfailed', request => {
        report.errors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
    });
    let pendingRequests = 0, lastRequestAt = Date.now();
    const handleReaderRequest = async request => {
        const key = requestKey(request);
        if (replay) {
            if (!Object.hasOwn(cassette, key)) {
                report.missingRequests.push(`${request.method} ${request.url}`);
                return { status: 599, responseText: 'Request absent from recording.' };
            }
            const recorded = cassette[key];
            await delay(recorded.elapsedMs || 0);
            if (recorded.error) throw new Error(recorded.error);
            return recorded.result;
        }
        if (typeof request.data !== 'string' && request.data != null) {
            throw new Error('Inspection supports text GM requests; record binary/OCR journeys with their dedicated harness.');
        }
        const started = performance.now();
        try {
            const response = await context.request.fetch(request.url, {
                method: request.method, headers: request.headers,
                ...(request.data && { data: request.data }), timeout: 15_000,
            });
            const result = { status: response.status(), bytes: [...await response.body()] };
            if (record) cassette[key] = { result, elapsedMs: Math.round(performance.now() - started) };
            return result;
        } catch (error) {
            if (record) cassette[key] = { error: error.message, elapsedMs: Math.round(performance.now() - started) };
            throw error;
        }
    };
    await page.exposeFunction('__yomuInspectRequest', async request => {
        pendingRequests++; lastRequestAt = Date.now();
        try { return await handleReaderRequest(request); }
        finally { pendingRequests--; lastRequestAt = Date.now(); }
    });
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY, css, requestBridgeName: '__yomuInspectRequest', value: {
            onboardingSeen: true, learningTargetChosen: true, interfaceLanguage: 'en',
            apiKey: '', jitenApiKey: '', ankiEnabled: false, audioEnabled: false,
            autoPlayAudio: false, jpdbMiningEnabled: false, enableReviews: false,
            ocrEnabled: false, ocrAutoScanImages: false, subtitleAutoDetect: false,
            showFloatingButton: false, lookupOnHover: true, hoverOpenDelayMs: 0,
            popupActivationMode: 'hover', enableLogging: false,
        },
    });
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    try { await page.waitForLoadState('networkidle', { timeout: 10_000 }); }
    catch { report.errors.push('Page network did not settle before reader injection.'); }
    if (record) await writeFile(path.join(record, 'before-reader.html'), await page.content());
    await addScriptTagWithCspFallback(page, script);
    const words = page.locator(selector).locator('.jpdb-reader-word:visible');
    try { await words.first().waitFor({ state: 'visible', timeout: 15_000 }); }
    catch { report.errors.push('No visible annotated words appeared within 15 seconds.'); }
    const count = await words.count();
    report.annotatedWordCount = count;
    await page.screenshot({ path: path.join(out, 'page.png') });
    for (let index = 0; index < Math.min(count, limit); index++) {
        const word = words.nth(index);
        const geometry = await word.evaluate(element => {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                if (!node.textContent?.trim() || node.parentElement?.closest('rt, rp')) continue;
                const range = document.createRange(); range.selectNodeContents(node);
                const rect = range.getBoundingClientRect();
                if (rect.width && rect.height) return {
                    text: element.getAttribute('data-expression') || node.textContent,
                    reading: element.getAttribute('data-reading'),
                    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                };
            }
            return null;
        });
        if (!geometry || geometry.rect.y < 0 || geometry.rect.y + geometry.rect.height > report.viewport.height) continue;
        await page.keyboard.press('Escape');
        await page.mouse.move(0, 0);
        try {
            await page.locator('.jpdb-reader-popover:visible').waitFor({ state: 'hidden', timeout: 2_000 });
        } catch {
            report.errors.push(`Previous popup did not close before ${geometry.text}; remaining samples skipped.`);
            process.exitCode = 1;
            break;
        }
        const { x, y, width, height } = geometry.rect;
        await page.mouse.move(x + width / 2, y + height * 0.75);
        const popup = page.locator('.jpdb-reader-popover:visible').last();
        let opened = false, popupText = '';
        try {
            await popup.waitFor({ state: 'visible', timeout: 2_000 });
            opened = true;
            try { await popup.locator('[data-card-details-loading]').waitFor({ state: 'hidden', timeout: 8_000 }); }
            catch { report.errors.push(`${geometry.text}: dictionary details still loading after 8 seconds.`); }
            popupText = (await popup.innerText()).slice(0, 4000);
        } catch { /* Recorded as an outcome, not silently counted as a pass. */ }
        report.words.push({ ...geometry, point: { x: x + width / 2, y: y + height * 0.75 }, opened, popupText });
    }
    const requestDeadline = Date.now() + 20_000;
    while ((pendingRequests || Date.now() - lastRequestAt < 500) && Date.now() < requestDeadline) await delay(100);
    if (pendingRequests) {
        report.errors.push(`${pendingRequests} reader requests did not finish; recording may be incomplete.`);
        process.exitCode = 1;
    }
    await writeFile(path.join(out, 'annotated.html'), await page.content());
    report.finalUrl = page.url();
    if (count < minWords || (minWords > 0 && report.words.length === 0) || report.words.some(word => !word.opened) || report.missingRequests.length) process.exitCode = 1;
} catch (error) {
    report.errors.push(error.stack || String(error)); process.exitCode = 1;
} finally {
    await context?.close(); // Flush the HAR before recording its manifest.
    await browser.close();
    if (record) await writeFile(path.join(record, 'capture.json'), JSON.stringify({ url, selector, limit, requests: cassette }, null, 2));
    await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await writeFile(path.join(out, 'index.html'), inspectReportHtml(report));
    console.log(`${report.mode}: ${report.annotatedWordCount ?? 0} annotated DOM words; ${report.words.filter(word => word.opened).length}/${report.words.length} sampled popups opened.\n${path.join(out, 'index.html')}`);
}
