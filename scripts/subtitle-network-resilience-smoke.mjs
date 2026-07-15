import { build } from 'esbuild';
import { chromium } from 'playwright';
import { assert, closeSmokeBrowserAndServer, startLoopbackServer } from './lib/smoke-harness.mjs';

const COMPLETE_VTT = `WEBVTT

00:00:01.000 --> 00:00:03.000
列車でも字幕を読み込めます。
`;
const requestCounts = new Map();

const bundle = await build({
    stdin: {
        contents: `
            import { requestSubtitleText } from './src/reader/subtitles/subtitle-request.ts';
            import { loadSubtitleTrackCues } from './src/reader/subtitles/subtitle-track-loader.ts';
            globalThis.__yomuSubtitleNetworkSmoke = { requestSubtitleText, loadSubtitleTrackCues };
        `,
        resolveDir: process.cwd(),
        sourcefile: 'subtitle-network-smoke-entry.ts',
        loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome120'],
    write: false,
});
const browserBundle = bundle.outputFiles[0].text;
const fixtureHandlers = new Map([
    ['/', serveFixturePage],
    ['/slow.vtt', (_request, response) => writeThrottledVtt(response)],
    ['/interrupted.vtt', interruptFirstResponse],
    ['/truncated.vtt', truncateFirstResponse],
    ['/timeout.vtt', timeoutFirstResponse],
    ['/partial.vtt', partialFirstResponse],
    ['/missing.vtt', serveMissingResponse],
    ['/cached.vtt', failCachedRefetch],
]);

const fixture = await startLoopbackServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const count = (requestCounts.get(url.pathname) ?? 0) + 1;
    requestCounts.set(url.pathname, count);
    (fixtureHandlers.get(url.pathname) ?? serveCompleteResponse)(request, response, count);
});

const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage();
    await page.goto(fixture.origin, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: browserBundle });

    const slow = await requestText(page, fixture.origin, '/slow.vtt');
    assert(slow.includes('列車でも字幕'), 'Throttled subtitle response did not load', { requests: count('/slow.vtt') });
    assert(count('/slow.vtt') === 1, 'Throttled response was retried unnecessarily', { requests: count('/slow.vtt') });

    for (const path of ['/interrupted.vtt', '/truncated.vtt', '/partial.vtt', '/timeout.vtt']) {
        const text = await requestText(page, fixture.origin, path);
        assert(text.includes('列車でも字幕'), `Subtitle request did not recover after ${path}`, { requests: count(path) });
        assert(count(path) === 2, `Subtitle request was not bounded to one retry for ${path}`, { requests: count(path) });
    }

    const permanent = await page.evaluate(async url => {
        try {
            await globalThis.__yomuSubtitleNetworkSmoke.requestSubtitleText(url);
            return { message: '' };
        } catch (error) {
            return { message: error instanceof Error ? error.message : String(error) };
        }
    }, `${fixture.origin}/missing.vtt`);
    assert(permanent.message.includes('(404)'), 'Permanent subtitle error was hidden', permanent);
    assert(count('/missing.vtt') === 1, 'Permanent subtitle error was retried', { requests: count('/missing.vtt') });

    const cached = await page.evaluate(async url => {
        const api = globalThis.__yomuSubtitleNetworkSmoke;
        const track = { id: 'cached', kind: 'remote', label: 'Cached Japanese', url };
        const options = { tracks: [track], transcriptEligible: true, requestText: api.requestSubtitleText };
        const first = await api.loadSubtitleTrackCues(track, options);
        const second = await api.loadSubtitleTrackCues(track, options);
        return { first: first.cues.length, second: second.cues.length, same: first.cues === second.cues };
    }, `${fixture.origin}/cached.vtt`);
    assert(cached.first > 0 && cached.second === cached.first && cached.same, 'Loaded subtitle cues were not reused offline', cached);
    assert(count('/cached.vtt') === 1, 'Cached subtitle cues triggered another network request', { requests: count('/cached.vtt') });

    console.log(JSON.stringify({ ok: true, requestCounts: Object.fromEntries(requestCounts), cached }, null, 2));
} finally {
    await closeSmokeBrowserAndServer(browser, fixture.server);
}

function requestText(page, origin, path) {
    return page.evaluate(url => globalThis.__yomuSubtitleNetworkSmoke.requestSubtitleText(url), `${origin}${path}`);
}

function count(path) {
    return requestCounts.get(path) ?? 0;
}

function writeCompleteVtt(response) {
    response.writeHead(200, {
        'content-type': 'text/vtt; charset=utf-8',
        'content-length': Buffer.byteLength(COMPLETE_VTT),
    });
    response.end(COMPLETE_VTT);
}

function serveCompleteResponse(_request, response) {
    writeCompleteVtt(response);
}

function serveFixturePage(_request, response) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>Yomu subtitle network smoke</title>');
}

function interruptFirstResponse(request, _response, count) {
    if (count === 1) request.socket.destroy();
    else writeCompleteVtt(_response);
}

function truncateFirstResponse(_request, response, count) {
    if (count !== 1) {
        writeCompleteVtt(response);
        return;
    }
    response.writeHead(200, {
        'content-type': 'text/vtt; charset=utf-8',
        'content-length': Buffer.byteLength(COMPLETE_VTT),
    });
    response.write(COMPLETE_VTT.slice(0, 24));
    setTimeout(() => response.destroy(), 25);
}

function timeoutFirstResponse(request, response, count) {
    if (count === 1) request.once('close', () => response.destroy());
    else writeCompleteVtt(response);
}

function partialFirstResponse(_request, response, count) {
    if (count === 1) {
        response.writeHead(206, { 'content-type': 'text/vtt; charset=utf-8' });
        response.end(COMPLETE_VTT.slice(0, 24));
    } else writeCompleteVtt(response);
}

function serveMissingResponse(_request, response) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
}

function failCachedRefetch(_request, response, count) {
    if (count <= 1) writeCompleteVtt(response);
    else {
        response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Offline after initial load');
    }
}

function writeThrottledVtt(response) {
    const chunks = [];
    for (let offset = 0; offset < COMPLETE_VTT.length; offset += 12) {
        chunks.push(COMPLETE_VTT.slice(offset, offset + 12));
    }
    response.writeHead(200, {
        'content-type': 'text/vtt; charset=utf-8',
        'content-length': Buffer.byteLength(COMPLETE_VTT),
    });
    const timer = setInterval(() => {
        const chunk = chunks.shift();
        if (chunk === undefined) {
            clearInterval(timer);
            response.end();
            return;
        }
        response.write(chunk);
    }, 80);
    response.once('close', () => clearInterval(timer));
}
