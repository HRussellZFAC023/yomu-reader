// Who answers a Recorded Page's requests. Each answerer returns an answer or
// null; the first answer wins, and every request lands in the Network Ledger
// with the name of whoever answered it.
//
// Page requests: the recorded document, the host adapter (YouTube's player
// mechanism fixture), the recording's HAR, this build's docs/public for
// yomureader.com, then the network ('live') or a dropped connection.
// GM requests: a test's own answer (to model a failing service), the product
// traffic recorded for this page, the page's HAR (a manager fetching the
// page's own picture gets the bytes the page got), docs/public, then the
// network ('live'/'record') or a failure like a dropped connection.
import { hostMatches, hostOf } from './network-ledger.mjs';
import { mimeTypeOf } from './recorded-har.mjs';
import { hostedAnswer, hostedFile } from './recorded-products.mjs';

const PAGE_ANSWERERS = [
    async (request, scope) => (request.isNavigationRequest() && sameDocument(request.url(), scope.recording.manifest.url)
        ? { served: 'recording', fulfill: { status: 200, contentType: 'text/html; charset=utf-8', body: scope.host.documentHtml(scope.recording.documentHtml()) } }
        : null),
    async (request, scope) => {
        const answer = await scope.host.answer(request);
        return answer && { served: answer.served, fulfill: answer.response };
    },
    async (request, scope) => {
        const hit = scope.har.lookup(request.method(), request.url(), request.postData());
        return hit && { served: 'recording', fulfill: { status: hit.status, headers: { 'content-type': hit.contentType, 'access-control-allow-origin': '*' }, body: hit.body } };
    },
    async (request, scope) => {
        const file = scope.product && scope.hosted ? hostedFile(scope.product, request.url()) : null;
        return file && { served: 'hosted', fulfill: hostedAnswer(file) };
    },
    async (request, scope) => (scope.pageNetwork === 'live' ? { served: 'live', fulfill: null } : null),
];

const OFFLINE = { served: 'offline', fulfill: null };
const UNFULFILLED = {
    live: route => route.continue(),
    offline: route => route.abort('internetdisconnected'),
};

export async function routePageRequest(route, scope) {
    const request = route.request();
    const answer = await firstAnswer(PAGE_ANSWERERS, request, scope) ?? OFFLINE;
    scope.ledger.recordRequest(pageLedgerEntry(request, answer.served));
    return answer.fulfill ? route.fulfill(answer.fulfill) : UNFULFILLED[answer.served](route);
}

function pageLedgerEntry(request, served) {
    const body = request.postDataBuffer();
    return { channel: 'page', method: request.method(), url: request.url(), bodyBytes: body ? body.length : 0, served, resourceType: request.resourceType() };
}

async function firstAnswer(answerers, request, scope) {
    for (const answerer of answerers) {
        const answer = await answerer(request, scope);
        if (answer) return answer;
    }
    return null;
}

function sameDocument(url, documentUrl) {
    return url.split('#')[0] === documentUrl.split('#')[0];
}

async function overrideAnswer(request, scope) {
    const override = scope.onGmRequest ? await scope.onGmRequest(request) : undefined;
    return override ? { served: 'override', status: 200, contentType: 'text/plain', ...override, body: Buffer.from(override.body ?? '') } : null;
}

function recordedAnswer(request, scope) {
    const hit = scope.productTraffic?.lookup(request.method, request.url, request.bodyText) ?? scope.har.lookup(request.method, request.url, request.bodyText);
    return hit && { served: 'recording', status: hit.status, body: hit.body, contentType: hit.contentType };
}

function hostedGmAnswer(request, scope) {
    const file = scope.hosted ? hostedFile(scope.product, request.url) : null;
    return file && { served: 'hosted', ...hostedAnswer(file) };
}

const GM_ANSWERERS = [
    overrideAnswer,
    async (request, scope) => recordedAnswer(request, scope),
    async (request, scope) => hostedGmAnswer(request, scope),
    async (request, scope) => (['live', 'record'].includes(scope.gmNetwork) ? liveGmAnswer(request, scope) : null),
];

export async function answerGmRequest(raw, scope) {
    const request = { ...raw, method: String(raw.method || 'GET').toUpperCase(), bodyText: gmBodyText(raw.data) };
    const answer = await firstAnswer(GM_ANSWERERS, request, scope);
    scope.ledger.markServed({ channel: 'gm', method: request.method, url: request.url }, answer ? answer.served : 'offline');
    if (!answer) throw new Error(`Recorded page: no recorded answer for ${request.method} ${request.url}`);
    return bridgeResponse(answer.status, answer.body, answer.contentType);
}

const BODYLESS = new Set(['GET', 'HEAD']);

async function liveGmAnswer(request, scope) {
    const response = await scope.context.request.fetch(request.url, {
        method: request.method,
        headers: request.headers ?? {},
        data: BODYLESS.has(request.method) ? undefined : request.bodyText,
        failOnStatusCode: false,
        timeout: 30_000,
    });
    const answer = { served: 'live', status: response.status(), body: await response.body(), contentType: response.headers()['content-type'] ?? 'application/octet-stream' };
    keepRecordable(request, answer, scope);
    return answer;
}

// Only hosts whose answers may be committed (recording-targets.mjs names them).
function keepRecordable(request, answer, scope) {
    if (!scope.recorder || !scope.recordHosts.some(host => hostMatches(hostOf(request.url), host))) return;
    scope.recorder.add({ method: request.method, url: request.url, status: answer.status, contentType: answer.contentType, body: answer.body, requestBody: request.bodyText });
}

function gmBodyText(data) {
    if (typeof data === 'string') return data;
    return data ? JSON.stringify(data) : '';
}

const TEXTUAL = /^(text\/|application\/(json|javascript|xml|x-www-form-urlencoded))|\+json$|\+xml$/u;

function bridgeResponse(status, bytes, contentType) {
    return TEXTUAL.test(mimeTypeOf(contentType))
        ? { status, responseText: bytes.toString('utf8'), contentType }
        : { status, bytes: [...bytes], contentType };
}
