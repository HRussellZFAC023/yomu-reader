// Counts the dictionary Port messages one annotated page costs in the built
// Chrome extension (ADR-0023). It imports JMdict (en), KANJIDIC (en) and JPDB
// v2.2 kana frequency from the published catalogue into the extension's Shared
// Dictionary Host over the real operation Port, opens a 945-character page with
// the network blocked, and fails when the page sends more Port messages than
// the ceilings below. 2.0.11 sent 475; 2.0.12 sends about 67.
//
//   npm run build:extension && npm run manual:extension-port-census
//
// EXT_DIR overrides the package (a .zip or an unpacked directory).
// YOMU_DICTIONARY_CACHE_DIR keeps the downloaded archives between runs; it
// defaults to the multilingual parity recorder's cache, which names them alike.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { closeServer, startLoopbackServer } from '../lib/smoke-harness.mjs';
import {
    chromiumExtensionSmokeConfig,
    createChromiumExtensionSmokeScope,
} from '../lib/chromium-extension-smoke.mjs';

const MAX_PORT_MESSAGES = 80;
const MAX_PARSE_PORT_MESSAGES = 8;
const PARSE_METHODS = new Set(['hasTermDictionaries', 'findTermMatches', 'lookupExactTermCandidates', 'lookupKanji']);
const PORT_NAME = 'yomu.dictionary-store.v2.operation';
const RPC = { channel: 'yomu.dictionary-store.v2', version: 2 };
const DICTIONARIES = [
    { id: 'jmdict-en', type: 'terms' },
    { id: 'drive-japanese-kanji-kanjidic-english-2026-07-22-fgu8qrhgct', type: 'kanji' },
    { id: 'drive-japanese-ja-freq-jpdb-v2-2-frequency-kana-2024-10-13-p5yytox4s0', type: 'frequency' },
];
// The dictionary engine spike's corpus (19 paragraphs, 945 characters).
const PARAGRAPHS = [
    '週末の京都旅行について',
    '先週の土曜日、私は友達と一緒に京都へ旅行に行きました。朝早く東京駅から新幹線に乗って、二時間ほどで到着しました。',
    '駅を出ると、空はとても晴れていて、気持ちのいい天気でした。まず最初に、有名なお寺を見に行くことにしました。',
    'お寺の庭には大きな池があり、たくさんの観光客が写真を撮っていました。私たちも静かな場所を探して、しばらく景色を眺めていました。',
    '昼ごはんは、駅の近くにある小さな食堂で食べました。店の主人はとても親切で、地元の料理について詳しく説明してくれました。',
    '午後は町を散歩しながら、古い建物や伝統的なお店を見て回りました。お土産に、抹茶のお菓子と手作りの茶碗を買いました。',
    '夕方になると、少し疲れてきたので、川沿いの喫茶店で休憩しました。窓から見える夕日がとてもきれいでした。',
    '夜はホテルの近くの居酒屋に行き、日本酒を飲みながら一日の思い出を話しました。友達は来年もまた来たいと言っていました。',
    '次の日は雨が降っていたので、博物館に行くことにしました。展示されている絵や着物はどれも美しく、時間があっという間に過ぎてしまいました。',
    '帰りの新幹線の中で、撮った写真を見返しながら、次はどこへ行こうかと相談しました。',
    '今回の旅行で一番印象に残ったのは、地元の人々の温かさでした。道に迷ったときも、知らない人が丁寧に道を教えてくれました。',
    '日本語の勉強を始めてからまだ一年しか経っていませんが、少しずつ会話ができるようになってきたと感じています。',
    '特に、駅の案内や店のメニューを自分で読めたことが、とても嬉しかったです。',
    'これからも毎日少しずつ漢字を覚えて、もっと難しい本や新聞が読めるようになりたいと思っています。',
    '最近は、寝る前に短い小説を読むことを習慣にしています。分からない言葉があれば、辞書で調べてノートに書いておきます。',
    '先生からは、声に出して読むと発音の練習にもなると教えてもらいました。',
    '来月は日本語能力試験を受ける予定なので、文法の復習と聞き取りの練習に力を入れています。',
    '試験に合格したら、日本の会社で働くという夢に一歩近づけると信じています。',
    '読者の皆さんも、もし京都に行く機会があれば、ぜひ朝早くお寺を訪れてみてください。人が少なくて、とても落ち着いた雰囲気を楽しめます。',
];

const config = chromiumExtensionSmokeConfig(import.meta.url, 'manual-extension-port-census');
const cacheDir = process.env.YOMU_DICTIONARY_CACHE_DIR || '/private/tmp/yomu-multilingual-parity-cache';
const escapeHtml = text => text.replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]);
const PAGE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>census</title></head>
<body><main id="corpus">${PARAGRAPHS.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('\n')}</main></body></html>`;

async function publishedArchive(id) {
    const catalog = JSON.parse(readFileSync(path.join(config.root, 'config/dictionaries/published/v1/catalog.json'), 'utf8'));
    const entry = catalog.entries.find(candidate => candidate.id === id);
    if (entry?.distribution?.state !== 'published') throw new Error(`${id} is not published in the catalogue.`);
    const { key, sha256 } = entry.distribution.object;
    const file = path.join(cacheDir, `${id}-${sha256.slice(0, 12)}.zip`);
    if (!existsSync(file)) {
        const response = await fetch(new URL(key, catalog.objectsBaseUrl));
        if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    }
    const bytes = readFileSync(file);
    if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error(`${file} does not match the catalogue's SHA-256.`);
    return bytes;
}

/** Imports one archive through the host's operation Port, as Study's importer does. */
function importThroughPort({ url, name, portName, rpc }) {
    return (async () => {
        const ping = await chrome.runtime.sendMessage({ ...rpc, kind: 'ping' });
        if (!ping?.ok) throw new Error(`ping failed ${JSON.stringify(ping)}`);
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        const port = chrome.runtime.connect({ name: portName });
        const outcome = new Promise((resolve, reject) => {
            port.onMessage.addListener(message => {
                if (message?.kind === 'result') resolve(message.value);
                if (message?.kind === 'error') reject(new Error(JSON.stringify(message.error)));
            });
            port.onDisconnect.addListener(() => reject(new Error('import port disconnected')));
        });
        port.postMessage({
            ...rpc, kind: 'invoke', method: 'importFile', epoch: ping.epoch,
            args: [
                { __yomuDictionaryRpcValue: 'binary', id: 'binary-1', binaryKind: 'file', size: bytes.length, type: 'application/zip', name, lastModified: 1 },
                { __yomuDictionaryRpcValue: 'undefined' },
                '',
                { persistArchive: false },
            ],
        });
        const CHUNK = 256 * 1024;
        for (let offset = 0; offset < bytes.length; offset += CHUNK) {
            const slice = bytes.subarray(offset, Math.min(bytes.length, offset + CHUNK));
            let binary = '';
            for (let index = 0; index < slice.length; index += 0x8000) binary += String.fromCharCode(...slice.subarray(index, index + 0x8000));
            port.postMessage({ kind: 'binary', id: 'binary-1', data: btoa(binary), final: offset + CHUNK >= bytes.length });
        }
        const value = await outcome;
        port.disconnect();
        return value;
    })();
}

/** Runs in the service worker: records every page -> host Port invoke and blocks the network. */
function installCensus(portName) {
    const census = globalThis.__yomuPortCensus = { invokes: [], blockedFetches: 0 };
    chrome.runtime.onConnect.addListener(port => {
        if (port.name !== portName) return;
        port.onMessage.addListener(message => {
            if (message?.kind !== 'invoke') return;
            census.invokes.push(message.method === 'readBatch' ? message.args.map(call => call[0]) : [message.method]);
        });
    });
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = (input, init) => {
        if (!/^(https?:\/\/127\.0\.0\.1[:/]|chrome-extension:)/.test(String(input?.url ?? input))) {
            census.blockedFetches += 1;
            return Promise.reject(new TypeError('census: network blocked'));
        }
        return nativeFetch(input, init);
    };
}

const archives = await Promise.all(DICTIONARIES.map(dictionary => publishedArchive(dictionary.id)));
const scope = createChromiumExtensionSmokeScope();
const report = { package: config.extensionPackage, paragraphs: PARAGRAPHS.length, characters: PARAGRAPHS.join('').length, pageErrors: [] };
let context;
let fixture;
try {
    const extensionDirectory = scope.extensionDirectory(config.extensionPackage);
    fixture = await startLoopbackServer((request, response) => {
        const archive = /^\/a(\d)\.zip$/.exec(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
        if (archive) {
            response.writeHead(200, { 'content-type': 'application/zip', 'access-control-allow-origin': '*' });
            response.end(archives[Number(archive[1])]);
            return;
        }
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(PAGE);
    }, 'Could not bind the Port census fixture server');
    context = await chromium.launchPersistentContext(scope.createDirectory('yomu-port-census-'), {
        headless: !process.env.HEADED,
        channel: 'chromium',
        viewport: { width: 1280, height: 1600 },
        // Playwright's --disable-extensions would suppress the content script.
        ignoreDefaultArgs: ['--disable-extensions'],
        args: [`--disable-extensions-except=${extensionDirectory}`, `--load-extension=${extensionDirectory}`, '--no-first-run'],
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 15_000 });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    const preferences = [];
    for (const [index, dictionary] of DICTIONARIES.entries()) {
        const summary = await popup.evaluate(importThroughPort, {
            url: `${fixture.origin}/a${index}.zip`, name: `${dictionary.id}.zip`, portName: PORT_NAME, rpc: RPC,
        });
        for (const name of summary.dictionaries) {
            preferences.push({ name, alias: name, enabled: true, priority: preferences.length, allowSecondarySearches: false, type: dictionary.type });
        }
    }
    await popup.evaluate(value => chrome.runtime.sendMessage({
        channel: 'userscript-compiler', type: 'GM_setValue', payload: { name: 'jpdb-popup-reader-settings', value },
    }), {
        onboardingSeen: true, learningTargetChosen: true, interfaceLanguage: 'en', apiKey: '', jitenApiKey: '',
        parserProvider: 'local', localDictionariesEnabled: true, showPitchAccent: true, showFurigana: true, furiganaMode: 'all',
        ankiEnabled: false, audioEnabled: false, autoPlayAudio: false, showFloatingButton: false, enableLogging: false,
        wordUnderlineColorSource: 'pitch', dictionaryPreferences: preferences,
    });
    await popup.close();
    await worker.evaluate(installCensus, PORT_NAME);
    await context.route(url => !/^(https?:\/\/127\.0\.0\.1|chrome-extension:|data:|blob:)/.test(url.toString()), route => route.abort());

    const page = await context.newPage();
    page.on('pageerror', error => report.pageErrors.push(error.message.slice(0, 200)));
    const opened = Date.now();
    // A non-root path, so the page is a third-party site, not a local Yomu app.
    await page.goto(`${fixture.origin}/article/read.html`, { waitUntil: 'domcontentloaded' });
    // Settled: words are annotated, and neither their count nor the Port
    // count moved for 8 s.
    let last = '';
    let stableSince = Date.now();
    while (Date.now() - opened < 120_000) {
        await page.waitForTimeout(500);
        report.words = await page.evaluate(() => document.querySelectorAll('#corpus .jpdb-reader-word').length);
        const messages = await worker.evaluate(() => globalThis.__yomuPortCensus.invokes.length);
        if (`${report.words}:${messages}` !== last) {
            last = `${report.words}:${messages}`;
            stableSince = Date.now();
        }
        if (report.words > 0 && Date.now() - stableSince >= 8_000) break;
    }
    report.settledMs = Date.now() - opened;
    const census = await worker.evaluate(() => globalThis.__yomuPortCensus);
    report.portMessages = census.invokes.length;
    report.parsePortMessages = census.invokes.filter(methods => methods.some(method => PARSE_METHODS.has(method))).length;
    report.storeCalls = census.invokes.flat().length;
    report.blockedFetches = census.blockedFetches;
} finally {
    if (context) await Promise.race([context.close(), new Promise(resolve => setTimeout(resolve, 5_000))]).catch(() => undefined);
    if (fixture) await closeServer(fixture.server);
    scope.cleanup();
}

const failures = [
    !(report.words > 0) && 'the page was not annotated',
    report.portMessages > MAX_PORT_MESSAGES && `${report.portMessages} Port messages, more than ${MAX_PORT_MESSAGES}`,
    report.parsePortMessages > MAX_PARSE_PORT_MESSAGES && `${report.parsePortMessages} parse Port messages, more than ${MAX_PARSE_PORT_MESSAGES}`,
].filter(Boolean);
mkdirSync(config.artifactDirectory, { recursive: true });
writeFileSync(path.join(config.artifactDirectory, 'report.json'), JSON.stringify({ ...report, failures }, null, 1));
console.log(JSON.stringify({ ...report, failures }, null, 1));
if (failures.length) {
    console.error(`FAIL extension Port census: ${failures.join('; ')}`);
    process.exit(1);
}
console.log(`PASS extension Port census: ${report.portMessages} Port messages (${report.parsePortMessages} for the parse), ${report.storeCalls} store calls`);
