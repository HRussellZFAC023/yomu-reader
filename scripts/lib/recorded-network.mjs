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
// network ('live', or 'record' for the hosts being recorded) or a failure like
// a dropped connection.
import { LEDGER_ID_HEADER, hostMatches, hostOf } from './network-ledger.mjs';
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

// 'recorded-product': this page's recorded product traffic (while recording,
// what earlier runs kept, so later runs take a replay's timing and reach the
// requests only a replay makes); 'recording': the page's own HAR.
const productTrafficOf = scope => scope.productTraffic ?? scope.recorder;

function recordedAnswer(request, scope) {
    const product = productTrafficOf(scope)?.lookup(request.method, request.url, request.bodyText);
    const hit = product ?? scope.har.lookup(request.method, request.url, request.bodyText);
    return hit && { served: product ? 'recorded-product' : 'recording', status: hit.status, body: hit.body, contentType: hit.contentType };
}

function hostedGmAnswer(request, scope) {
    const file = scope.hosted ? hostedFile(scope.product, request.url) : null;
    return file && { served: 'hosted', ...hostedAnswer(file) };
}

const GM_ANSWERERS = [
    overrideAnswer,
    async (request, scope) => recordedAnswer(request, scope),
    async (request, scope) => hostedGmAnswer(request, scope),
    async (request, scope) => (goesLive(request, scope) ? liveGmAnswer(request, scope) : null),
];

// 'record' sends only the hosts whose answers it keeps: a recording run must
// not upload a page's pictures to an OCR service or ask jpdb.io for anything.
function goesLive(request, scope) {
    if (scope.gmNetwork === 'live') return true;
    return scope.gmNetwork === 'record' && isRecordHost(request.url, scope);
}

function isRecordHost(url, scope) {
    return scope.recordHosts.some(host => hostMatches(hostOf(url), host));
}

export async function answerGmRequest(raw, scope) {
    const { request, ledgerId } = gmRequest(raw);
    const answer = await firstAnswer(GM_ANSWERERS, request, scope);
    scope.ledger.markServed({ channel: 'gm', method: request.method, url: request.url, ledgerId }, answer ? answer.served : 'offline');
    if (!answer) throw new Error(`Recorded page: no recorded answer for ${request.method} ${request.url}`);
    return bridgeResponse(answer.status, answer.body, answer.contentType);
}

// The ledger id header is the harness's own; no answerer or service sees it.
function gmRequest({ headers: rawHeaders = {}, method = 'GET', ...raw }) {
    const { [LEDGER_ID_HEADER]: ledgerId, ...headers } = rawHeaders;
    return { ledgerId, request: { ...raw, headers, method: String(method).toUpperCase(), bodyText: gmBodyText(raw.data) } };
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

// Only hosts whose answers may be committed (recording-targets.mjs names them),
// and only answers the service meant: a 429 or 5xx kept would replay a rate
// limit as the page's answer, so it is counted (productTraffic().refused) instead.
function keepRecordable(request, answer, scope) {
    if (!scope.recorder || !isRecordHost(request.url, scope)) return;
    if (isRefusal(answer.status)) {
        scope.refusedAnswers += 1;
        return;
    }
    scope.recorder.add({ method: request.method, url: request.url, status: answer.status, contentType: answer.contentType, body: answer.body, requestBody: request.bodyText });
}

function isRefusal(status) {
    return status === 429 || status >= 500;
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
