// The live half of recording: load a page in Chromium, bring it to the state a
// learner reads it in, measure it, freeze it and (for a copyrighted site)
// redact it in place. Nothing is written here; recording-writer.mjs does that.
import { captureGeometrySignature, selectGeometryKeys } from './geometry-signature.mjs';
import { blankPicturesInPage, collectTextSlotsInPage, freezePageInPage, serializePageInPage } from './page-freeze.mjs';
import { prepareTtsuBook } from './record-ttsu-host.mjs';
import { prepareYouTubeWatch, youtubeHostFiles, youtubeHostOriginalRuns } from './record-youtube-host.mjs';
import { loadRecording } from './recorded-page.mjs';
import { VISIBLE_ATTRIBUTES, normalizeTextRun, redactionHashList } from './recorded-redaction.mjs';
import { loadLazyContent, rejectConsent } from './recording-targets.mjs';
import { CHARACTER_CLASS_RULES, aozoraLetterStreams, createTextRedactor, redactTextSlotsInPage } from './text-redactor.mjs';

// Stored signatures keep each paragraph's first lines; a novel's 4,000 lines are not a baseline.
export const STORED_LINES = 24;
export const BLANK_PREFIX_PATH = '/__yomu-recorded/blank/';
const RECORDED_RESOURCE_TYPES = new Set(['stylesheet', 'image', 'font']);

// How each target reaches its reading state. A paged reader turns pages on
// scroll, so only flowing documents are scrolled through.
const PREPARERS = {
    youtubeWatch: async (page, observed, options) => {
        const host = await prepareYouTubeWatch(page, observed, options);
        await loadLazyContent(page);
        return host;
    },
    ttsuVertical: page => prepareTtsuBook(page, { writingMode: 'vertical' }).then(() => null),
    ttsuHorizontal: page => prepareTtsuBook(page, { writingMode: 'horizontal' }).then(() => null),
    document: page => loadLazyContent(page).then(() => null),
};

/** options.captionsFrom: see prepareYouTubeWatch. */
export async function captureLivePage(browser, target, options = {}) {
    const context = await browser.newContext({ viewport: target.viewport, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
    try {
        const page = await context.newPage();
        const capture = captureResponses(page);
        await openTarget(page, target);
        const host = await PREPARERS[target.prepare ?? 'document'](page, capture.observed, options);
        if (page.url() !== target.url) throw new Error(`[record-pages] ${target.slug} ended on ${page.url()}, not ${target.url}`);
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
        return await freezeLivePage(page, target, { host, responses: capture.responses });
    } finally {
        await context.close();
    }
}

function captureResponses(page) {
    const responses = new Map();
    const observed = [];
    page.on('response', async response => {
        observed.push(response);
        if (!isRecordedResource(response)) return;
        const body = await response.body().catch(() => null);
        if (body) responses.set(response.url(), { contentType: response.headers()['content-type'] ?? 'application/octet-stream', body, resourceType: response.request().resourceType() });
    });
    return { responses, observed };
}

function isRecordedResource(response) {
    const request = response.request();
    return RECORDED_RESOURCE_TYPES.has(request.resourceType()) && request.method() === 'GET' && response.status() === 200;
}

async function openTarget(page, target) {
    await page.goto(target.startUrl ?? target.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await rejectConsent(page);
    // A consent wall may have sent us elsewhere; a target with a start page navigates itself.
    if (!target.startUrl && page.url().split('#')[0] !== target.url.split('#')[0]) await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('load', { timeout: 30_000 }).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
}

async function freezeLivePage(page, target, { host, responses }) {
    const keys = await selectGeometryKeys(page);
    const liveSignature = await captureGeometrySignature(page, { keys, maxLines: STORED_LINES });
    const frozen = await page.evaluate(freezePageInPage);
    const texts = await page.evaluate(collectTextSlotsInPage, { visibleAttributes: VISIBLE_ATTRIBUTES });
    const originalHtml = await page.evaluate(serializePageInPage);
    const originalRuns = [...texts, ...(host ? youtubeHostOriginalRuns(host) : [])].map(normalizeTextRun).filter(Boolean);
    const redacted = target.content === 'redacted' ? await redactLivePage(page, target, originalRuns, host) : null;
    console.log(`[record-pages]   live: ${keys.length} geometry keys, ${responses.size} resources, ${texts.length} text slots, ${frozen.shadowRoots} shadow roots`);
    return { title: frozen.title, keys, liveSignature, responses, originalHtml, redacted, host, originalRuns };
}

async function redactLivePage(page, target, originalRuns, host) {
    const streams = aozoraStreams();
    await page.evaluate(redactTextSlotsInPage, { streams, rules: CHARACTER_CLASS_RULES, avoidRuns: [...new Set(originalRuns)] });
    const blankSizes = await page.evaluate(blankPicturesInPage, { blankPrefix: `${new URL(target.url).origin}${BLANK_PREFIX_PATH}` });
    return {
        html: await page.evaluate(serializePageInPage),
        hashList: redactionHashList(originalRuns),
        blankSizes,
        hostFiles: host ? youtubeHostFiles(host, { redact: createTextRedactor({ streams, avoidRuns: originalRuns }), captionSeconds: target.captionSeconds }) : null,
    };
}

/** The redaction's source text: 『こころ』 from the aozora-kokoro recording, readings dropped. */
function aozoraStreams() {
    const html = loadRecording('aozora-kokoro').documentHtml();
    const main = /<div class="main_text">([\s\S]*?)<div class="bibliographical_information">/u.exec(html)?.[1] ?? '';
    const streams = aozoraLetterStreams(main.replace(/<rt>[\s\S]*?<\/rt>|<rp>[\s\S]*?<\/rp>/gu, '').replace(/<[^>]+>/gu, ''));
    if (streams.han.length < 10_000) throw new Error('Record aozora-kokoro first: its text is the redaction source.');
    return streams;
}
