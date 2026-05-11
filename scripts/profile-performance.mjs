#!/usr/bin/env node
import { chromium } from 'playwright';
import process from 'node:process';

const ORIGIN = process.env.YOMU_PROFILE_ORIGIN || 'http://127.0.0.1:5175';
const SLOW_MS = Number(process.env.YOMU_PROFILE_SLOW_MS || 4500);
const LIVE = process.env.YOMU_PROFILE_LIVE === '1';
const API_KEY = process.env.YOMU_PROFILE_API_KEY || process.env.YOMU_TEST_API_KEY || '';

if (LIVE && !API_KEY) {
    console.error('Live profiling needs YOMU_PROFILE_API_KEY or YOMU_TEST_API_KEY so JPDB parse can run against the real API.');
    process.exit(2);
}

const settings = {
    apiKey: API_KEY || 'profile-key',
    onboardingSeen: true,
    enableLogging: true,
    jpdbDefinitionsEnabled: true,
    rtkEnabled: true,
    kanjivgEnabled: true,
    kanjiOriginsEnabled: true,
    kanjiOriginKanjiMapEnabled: true,
    kanjiOriginGraphEnabled: true,
    similarKanjiWords: true,
    similarKanjiWordLimit: 8,
    audioEnabled: true,
    autoPlayAudio: true,
    audioViaBlob: true,
    audioTimeoutMs: 8000,
    audioSelectionMode: 'first',
    audioSources: LIVE
        ? [
            { type: 'jpod101', url: '', voice: '', enabled: true },
            { type: 'language-pod-101', url: '', voice: '', enabled: true },
            { type: 'jisho', url: '', voice: '', enabled: true },
        ]
        : [{ type: 'custom-json', url: 'https://audio.profile.test/source?term={term}&reading={reading}', voice: '', enabled: true }],
    audioEnableDefaultSources: LIVE,
    immersionKitEnabled: true,
    immersionKitLimit: 3,
    immersionKitMinLength: 4,
    immersionKitMaxLength: 80,
    immersionKitCategory: 'all',
    immersionKitSort: 'sentence_length:asc',
    immersionKitExactMatch: false,
    immersionKitShowTranslation: false,
    immersionKitShowImages: true,
    immersionKitAutoPlayAudio: true,
    immersionKitPlaybackRate: 1,
    localDictionariesEnabled: false,
    localDictionaryShowKanji: true,
    lookupOnClick: true,
    lookupOnHover: true,
    popupActivationMode: 'click',
    scanVisiblePage: true,
    autoScanJapanese: true,
    showFloatingButton: false,
    interfaceLanguage: 'auto',
    accentColor: '#5ea780',
    theme: 'auto',
    popupMode: 'auto',
    ankiEnabled: false,
    enableReviews: true,
    shortcuts: {
        scanPage: 'Alt+J',
        hoverLookup: '',
        openSettings: 'Alt+Shift+J',
        playAudio: 'A',
        closePopup: 'Escape',
        previousSubtitle: 'Alt+ArrowLeft',
        nextSubtitle: 'Alt+ArrowRight',
        copySubtitle: 'Alt+C',
        toggleOcr: 'Alt+O',
        toggleYoutubeImmersion: 'Alt+Y',
        scanImages: 'Alt+I',
        gradeNothing: '1',
        gradeSomething: '2',
        gradeHard: '3',
        gradeOkay: '4',
        gradeEasy: '5',
        gradeFail: '1',
        gradePass: '2',
    },
};

const vocabulary = [
    ['今日', 'きょう', 'today', ['n'], 100],
    ['静か', 'しずか', 'quiet', ['adj-na'], 1700],
    ['喫茶店', 'きっさてん', 'coffee shop', ['n'], 2400],
    ['新しい', 'あたらしい', 'new', ['adj-i'], 700],
    ['本', 'ほん', 'book', ['n'], 350],
    ['読みました', 'よみました', 'read', ['v5m'], 401, '読む'],
    ['読む', 'よむ', 'to read', ['v5m'], 400],
    ['日本語', 'にほんご', 'Japanese language', ['n'], 250],
].map(([surface, reading, gloss, partOfSpeech, frequency, spelling]) => ({ surface, spelling: spelling ?? surface, reading, gloss, partOfSpeech, frequency }));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const requests = [];
const logs = [];

page.on('console', message => logs.push({ type: message.type(), text: message.text() }));
page.on('request', request => requests.push({ url: request.url(), method: request.method(), start: performance.now() }));
page.on('response', response => {
    const entry = requests.find(item => item.url === response.url() && item.status === undefined);
    if (entry) {
        entry.status = response.status();
        entry.end = performance.now();
    }
});

await page.exposeFunction('__yomuProfileRequest', async request => {
    const started = performance.now();
    let body = request.data;
    if (body?.kind === 'arraybuffer') {
        body = Buffer.from(body.bytes ?? []);
    } else if (body?.kind === 'formdata') {
        const formData = new FormData();
        for (const entry of body.entries ?? []) {
            if (entry.blob) {
                formData.append(entry.name, new Blob([Buffer.from(entry.blob.bytes ?? [])], { type: entry.blob.type || 'application/octet-stream' }), entry.blob.filename || 'file');
            } else {
                formData.append(entry.name, entry.value ?? '');
            }
        }
        body = formData;
    }
    const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body,
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    requests.push({
        method: request.method,
        url: request.url,
        status: response.status,
        start: started,
        end: performance.now(),
        viaUserscriptBridge: true,
    });
    return {
        status: response.status,
        responseText: buffer.toString('utf8'),
        bytes: [...buffer],
        contentType: response.headers.get('content-type') ?? '',
    };
});

await page.addInitScript(({ settings, live }) => {
    localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify(settings));
    window.__yomuProfileEvents = [];
    const push = (name, detail = {}) => window.__yomuProfileEvents.push({ name, t: performance.now(), detail });
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function play() {
        push('audio.play', { src: this.currentSrc || this.src || '' });
        return originalPlay.call(this).catch(error => {
            push('audio.play.failed', { message: String(error?.message || error) });
            throw error;
        });
    };
    if (!live) return;

    const serializeBody = async data => {
        if (data instanceof ArrayBuffer) return { kind: 'arraybuffer', bytes: [...new Uint8Array(data)] };
        if (data instanceof Blob) return { kind: 'arraybuffer', bytes: [...new Uint8Array(await data.arrayBuffer())] };
        if (data instanceof FormData) {
            const entries = [];
            for (const [name, value] of data.entries()) {
                if (value instanceof Blob) {
                    entries.push({ name, blob: { bytes: [...new Uint8Array(await value.arrayBuffer())], type: value.type, filename: value.name || 'blob' } });
                } else {
                    entries.push({ name, value: String(value) });
                }
            }
            return { kind: 'formdata', entries };
        }
        return data;
    };
    window.GM_xmlhttpRequest = options => {
        Promise.resolve(serializeBody(options.data)).then(data => window.__yomuProfileRequest({
            method: options.method || 'GET',
            url: options.url,
            headers: options.headers || {},
            data,
        })).then(result => {
            const bytes = new Uint8Array(result.bytes);
            const response = options.responseType === 'arraybuffer'
                ? bytes.buffer
                : options.responseType === 'blob'
                    ? new Blob([bytes], { type: result.contentType })
                    : options.responseType === 'json'
                        ? JSON.parse(result.responseText || 'null')
                        : result.responseText;
            options.onload?.({ status: result.status, response, responseText: result.responseText });
        }).catch(error => options.onerror?.(error));
    };
}, { settings, live: LIVE });

if (!LIVE) await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'jpdb.io' && url.pathname === '/api/v1/parse') {
        const body = JSON.parse(route.request().postData() || '{}');
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockParse(body)) });
    }
    if (url.hostname === 'jpdb.io' && url.pathname.startsWith('/kanji/')) {
        await delay(SLOW_MS);
        const kanji = decodeURIComponent(url.pathname.split('/').pop() || '読');
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: mockKanjiHtml(kanji) });
    }
    if (url.hostname === 'raw.githubusercontent.com') {
        return route.fulfill({ status: 200, contentType: url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'application/json', body: url.pathname.endsWith('.svg') ? mockKanjiVgSvg() : JSON.stringify(mockKanjiMap()) });
    }
    if (url.hostname === 'hrussellzfac023.github.io') {
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<html><body><div class="entry"><h2>read</h2><p>Elements: 言, 売</p></div></body></html>' });
    }
    if (url.hostname === 'apiv2.immersionkit.com' && url.pathname === '/search') {
        await delay(SLOW_MS);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ examples: [{ id: 'anime_profile_1', title: 'profile', sentence: '今日は本を読みました。', image: 'profile.jpg', sound: 'profile.mp3' }] }) });
    }
    if (url.hostname === 'apiv2.immersionkit.com' && url.pathname === '/download_media') {
        return route.fulfill({ status: 200, contentType: url.search.includes('.mp3') ? 'audio/mpeg' : 'image/png', body: 'media' });
    }
    if (url.hostname === 'audio.profile.test') {
        await delay(SLOW_MS);
        if (url.pathname === '/source') {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ audioSources: [{ url: 'https://audio.profile.test/file.mp3' }] }) });
        }
        return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: 'audio' });
    }
    return route.continue();
});

await page.goto(`${ORIGIN}/reader-test.html?apiKey=${encodeURIComponent(API_KEY || 'profile-key')}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.jpdb-reader-word', { timeout: 10000 });

const firstWord = page.locator('.jpdb-reader-word').filter({ hasText: '読みました' }).first();
const clickAt = await page.evaluate(() => performance.now());
await firstWord.click();
await page.waitForSelector('.jpdb-reader-popover', { timeout: 10000 });
const popoverAt = await page.evaluate(() => performance.now());
await page.waitForFunction(() => window.__yomuProfileEvents.some(event => event.name === 'audio.play' || event.name === 'audio.play.failed'), null, { timeout: 12000 }).catch(() => {});
const audioAt = await page.evaluate(() => window.__yomuProfileEvents.find(event => event.name.startsWith('audio.play'))?.t ?? null);

const kanjiClickAt = await page.evaluate(() => performance.now());
await page.locator('.jpdb-reader-kanji-inline').first().click();
await page.waitForSelector('.jpdb-reader-kanji-display', { timeout: 5000 });
const kanjiShellAt = await page.evaluate(() => performance.now());
await page.waitForFunction(() => !/Loading kanji details/.test(document.querySelector('[data-kanji-keyword-mount]')?.textContent || ''), null, { timeout: SLOW_MS + 6000 }).catch(() => {});
const kanjiDetailsAt = await page.evaluate(() => performance.now());

const yomuLogs = logs.filter(log => log.text.includes('[Yomu]'));
const logCounts = yomuLogs.reduce((counts, log) => {
    const key = log.text.replace(/^.*?\[Yomu\]\s*/, '').slice(0, 90);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
}, {});

const slowRequests = requests
    .filter(request => request.end && request.end - request.start > 500)
    .map(request => ({ url: request.url.replace(/profile-key/g, '[redacted]'), ms: Math.round(request.end - request.start), status: request.status }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 12);

console.log(JSON.stringify({
    origin: ORIGIN,
    injectedDelayMs: SLOW_MS,
    timingsMs: {
        clickToPopover: Math.round(popoverAt - clickAt),
        clickToAudioPlayAttempt: audioAt ? Math.round(audioAt - clickAt) : null,
        kanjiClickToShell: Math.round(kanjiShellAt - kanjiClickAt),
        kanjiClickToDetailsNotLoading: Math.round(kanjiDetailsAt - kanjiClickAt),
    },
    console: {
        total: logs.length,
        yomu: yomuLogs.length,
        topYomuMessages: Object.entries(logCounts).sort(([, a], [, b]) => b - a).slice(0, 10),
    },
    slowRequests,
}, null, 2));

await browser.close();

function mockParse(body) {
    const paragraphs = Array.isArray(body.text) ? body.text.map(String) : [];
    const vocab = [];
    const byKey = new Map();
    const tokens = paragraphs.map(text => {
        const paragraph = [];
        for (let index = 0; index < text.length;) {
            const entry = vocabulary.filter(item => text.startsWith(item.surface, index)).sort((a, b) => b.surface.length - a.surface.length)[0];
            if (!entry) {
                index += 1;
                continue;
            }
            let vocabIndex = byKey.get(entry.spelling);
            if (vocabIndex === undefined) {
                vocabIndex = vocab.length;
                byKey.set(entry.spelling, vocabIndex);
                vocab.push([100000 + vocabIndex, 200000 + vocabIndex, 0, entry.spelling, entry.reading, entry.frequency, entry.partOfSpeech, [[entry.gloss]], [entry.partOfSpeech], ['not-in-deck'], ['LHHL']]);
            }
            paragraph.push([vocabIndex, index, entry.surface.length, /[\u3400-\u9fff]/u.test(entry.surface) ? [[entry.surface, entry.reading]] : null]);
            index += entry.surface.length;
        }
        return paragraph;
    });
    return { vocabulary: vocab, tokens };
}

function mockKanjiHtml(kanji) {
    return `<!doctype html><html><head><meta name="description" content="${kanji} - read"></head><body>
        <div><h6 class="subsection-label">Keyword</h6><div class="subsection">read</div></div>
        <table class="cross-table"><tr><td>Frequency</td><td>Top 400-500</td></tr><tr><td>Type</td><td>Jouyou grade 2</td></tr><tr><td>Kanken</td><td>Level 9</td></tr><tr><td>Heisig</td><td>372</td></tr></table>
        <div class="subsection-composed-of-kanji"><h6 class="subsection-label">Composed of</h6><div class="subsection"><div><div class="spelling"><a href="/kanji/言">言</a></div><div class="description">say</div></div></div></div>
        <div class="subsection-used-in"><div class="used-in"><div class="jp"><a href="/vocabulary/1456360/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80#a">読む</a></div><div class="en">to read</div></div></div>
    </body></html>`;
}

function mockKanjiVgSvg() {
    return '<svg xmlns="http://www.w3.org/2000/svg"><g id="kvg:StrokePaths_profile"><path d="M10 10L80 80"/></g></svg>';
}

function mockKanjiMap() {
    return { kanjialiveData: { grade: 2, kstroke: 14, radical: { character: '言', meaning: { english: 'speech' } } }, jishoData: { jlpt: 'N4', taughtIn: 'grade 2', strokeCount: 14, parts: ['言', '売'], radical: { symbol: '言', meaning: 'speech' } }, source: 'profile' };
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
