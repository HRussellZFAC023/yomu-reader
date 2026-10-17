// HAR 1.2 files for Recorded Pages. Bodies live beside the HAR as plain files
// (Playwright's `content._file` extension, so context.routeFromHAR can replay a
// recording too), which keeps diffs readable and lets the redaction check read
// every committed body without decoding base64.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const EXTENSIONS = new Map([
    ['text/css', 'css'],
    ['text/html', 'html'],
    ['application/json', 'json'],
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/gif', 'gif'],
    ['image/webp', 'webp'],
    ['image/avif', 'avif'],
    ['image/svg+xml', 'svg'],
    ['image/x-icon', 'ico'],
    ['image/vnd.microsoft.icon', 'ico'],
    ['font/woff2', 'woff2'],
    ['font/woff', 'woff'],
    ['font/ttf', 'ttf'],
    ['font/otf', 'otf'],
    ['application/font-woff2', 'woff2'],
    ['video/webm', 'webm'],
    ['video/mp4', 'mp4'],
    ['text/xml', 'xml'],
    ['text/plain', 'txt'],
]);

export function mimeTypeOf(contentType) {
    return String(contentType || '').split(';')[0].trim().toLowerCase();
}

function bodyKey(body) {
    if (body === undefined || body === null || body === '') return '';
    return createHash('sha256').update(body).digest('hex').slice(0, 16);
}

function requestKey(method, url, body) {
    return `${String(method || 'GET').toUpperCase()} ${url} ${bodyKey(body)}`;
}

/**
 * Collects entries in memory; write() lays them out under dir. unique keeps
 * the first answer per method, URL and request body, so several runs of the
 * product can be merged into one HAR; add() says whether the entry was new,
 * and lookup() answers a request already kept, as a replay would.
 */
export function createHarWriter({ creator = 'yomu record-pages', unique = false } = {}) {
    const entries = [];
    const byKey = new Map();
    return {
        add(fields) {
            const entry = harWriterEntry(fields);
            const key = requestKey(entry.method, entry.url, entry.requestBody);
            if (unique && byKey.has(key)) return false;
            if (!byKey.has(key)) byKey.set(key, entry);
            entries.push(entry);
            return true;
        },
        lookup(method, url, requestBody) {
            const entry = byKey.get(requestKey(method, url, requestBody));
            return entry ? { status: entry.status, headers: { 'content-type': entry.contentType }, body: entry.body, contentType: entry.contentType } : null;
        },
        size: () => entries.length,
        write(dir, harName, resourceDir = 'resources') {
            mkdirSync(path.join(dir, resourceDir), { recursive: true });
            const log = {
                version: '1.2',
                creator: { name: creator, version: '1' },
                pages: [],
                entries: entries.map(entry => harEntry(entry, dir, resourceDir)),
            };
            writeFileSync(path.join(dir, harName), `${JSON.stringify({ log }, null, 1)}\n`);
            return log.entries.length;
        },
    };
}

const HAR_ENTRY_DEFAULTS = Object.freeze({ method: 'GET', status: 200, contentType: 'application/octet-stream', body: '', headers: [] });

function harWriterEntry(fields) {
    const given = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null));
    const entry = { ...HAR_ENTRY_DEFAULTS, ...given };
    return { ...entry, method: entry.method.toUpperCase(), body: Buffer.from(entry.body) };
}

function writeBody(entry, dir, resourceDir) {
    const extension = EXTENSIONS.get(mimeTypeOf(entry.contentType)) ?? 'bin';
    const relative = `${resourceDir}/${createHash('sha1').update(entry.body).digest('hex')}.${extension}`;
    if (!existsSync(path.join(dir, relative))) writeFileSync(path.join(dir, relative), entry.body);
    return relative;
}

function harRequest(entry) {
    const request = { method: entry.method, url: entry.url, httpVersion: 'HTTP/1.1', headers: [], queryString: [], cookies: [], headersSize: -1, bodySize: 0 };
    if (!entry.requestBody) return request;
    return { ...request, bodySize: Buffer.byteLength(entry.requestBody), postData: { mimeType: 'application/octet-stream', text: Buffer.from(entry.requestBody).toString('utf8') } };
}

function harEntry(entry, dir, resourceDir) {
    return {
        startedDateTime: new Date(0).toISOString(),
        time: 0,
        request: harRequest(entry),
        response: {
            status: entry.status,
            statusText: '',
            httpVersion: 'HTTP/1.1',
            headers: [{ name: 'content-type', value: entry.contentType }, ...entry.headers],
            cookies: [],
            content: { size: entry.body.length, mimeType: entry.contentType, _file: writeBody(entry, dir, resourceDir) },
            redirectURL: '',
            headersSize: -1,
            bodySize: entry.body.length,
        },
        cache: {},
        timings: { send: 0, wait: 0, receive: 0 },
    };
}

/**
 * Reads a HAR into a lookup by method, URL and request body. Repeated keys
 * answer in recorded order and then keep answering with the last one, which
 * is how a polling client sees a server that stopped changing.
 */
export function readHarIndex(harPath) {
    const baseDir = path.dirname(harPath);
    const har = JSON.parse(readFileSync(harPath, 'utf8'));
    const byKey = new Map();
    for (const entry of har.log.entries) {
        const key = requestKey(entry.request.method, entry.request.url, entry.request.postData?.text);
        const list = byKey.get(key) ?? [];
        list.push(entry);
        byKey.set(key, list);
    }
    const served = new Map();
    return {
        entries: har.log.entries,
        has: (method, url, body) => byKey.has(requestKey(method, url, body)),
        lookup(method, url, body) {
            const key = requestKey(method, url, body);
            const list = byKey.get(key);
            if (!list) return null;
            const index = served.get(key) ?? 0;
            served.set(key, index + 1);
            const entry = list[Math.min(index, list.length - 1)];
            return harResponse(entry, baseDir);
        },
    };
}

function harBody(content, baseDir) {
    if (content._file) return readFileSync(path.resolve(baseDir, content._file));
    return Buffer.from(content.text ?? '', content.encoding === 'base64' ? 'base64' : 'utf8');
}

function harResponse({ response }, baseDir) {
    const { content = {}, headers: headerList = [] } = response;
    const headers = Object.fromEntries(headerList.map(header => [header.name.toLowerCase(), header.value]));
    const contentType = headers['content-type'] ?? content.mimeType ?? 'application/octet-stream';
    return { status: response.status, headers, body: harBody(content, baseDir), contentType };
}
