// Network Ledger: every request the BUILT product makes while a recorded page
// is replayed, from both channels a userscript has — GM_xmlhttpRequest (the
// manager's privileged bridge) and the page itself (fetch, XHR, <img>, <audio>).
//
// Each entry carries the host, method, body size, a timestamp, whether a
// trusted user activation (pointerdown, mousedown, touchstart, keydown, click
// with isTrusted) had happened before the request left, and the latest such
// activation before it (lastInteraction: type, time, target). GM requests and
// the page's fetch and XHR calls are stamped in the page as they leave; any
// other page request (<img>, <audio>, CSS) is stamped when Playwright routes
// it, a few milliseconds later. Privacy rules are written against this: "no
// cloud OCR request before a tap" is
// `requests({ host: 'googleapis.com', beforeInteraction: true })` being empty,
// and "no upload long after the last tap" (a background upload once the
// learner has pressed any key) is
// `requests({ host: 'googleapis.com', noInteractionWithinMs: 3000 })` being empty.
//
// A frozen recorded page runs no site script, so every fetch and XHR the page
// channel stamps is the product's own; queries always count those, even when
// the page's HAR answered them.
//
// Pure Node: recorded-page.mjs feeds it, tests read it.

/** Interactions that count as a learner acting on purpose. Hover does not. */
const TRUSTED_ACTIVATION_EVENTS = Object.freeze(['pointerdown', 'mousedown', 'touchstart', 'keydown', 'click']);

/**
 * The in-page probe numbers each GM request and passes the number to the GM
 * bridge in this request header, so the bridge's answer is paired with the
 * right ledger entry. answerGmRequest strips it before anything else sees it.
 */
export const LEDGER_ID_HEADER = 'x-yomu-ledger-id';

export function createNetworkLedger({ startedAt = Date.now() } = {}) {
    const entries = [];
    const interactions = [];
    const pageStamps = [];
    const firstInteractionAt = () => interactions[0]?.at ?? null;
    const settled = () => {
        entries.forEach(entry => claimPageStamp(entry, pageStamps));
        return entries.map(entry => withInteractionState(entry, interactions));
    };

    return {
        startedAt,
        recordRequest(request) {
            const entry = ledgerEntry(request, startedAt);
            entries.push(entry);
            return entry;
        },
        /** The page's own stamp for a fetch or XHR it sent: { url, at, trustedInteractionBefore }. */
        recordPageStamp(stamp) {
            pageStamps.push({ url: withoutFragment(stamp.url), at: Number(stamp.at), trustedInteractionBefore: Boolean(stamp.trustedInteractionBefore) });
        },
        /**
         * The GM bridge learns how a request was answered after the page
         * reported it. request.ledgerId (the in-page probe's id, carried in the
         * LEDGER_ID_HEADER) pairs it exactly; without one, the oldest pending
         * request with the same method and URL is taken.
         */
        markServed(request, served) {
            const entry = entries.find(item => isPendingMatch(item, request));
            if (entry) entry.served = served;
        },
        recordInteraction({ type, at = Date.now(), target = '' }) {
            interactions.push({ type: String(type), at: Number(at), target: String(target) });
            interactions.sort((left, right) => left.at - right.at);
        },
        firstInteractionAt,
        interactions: () => interactions.map(interaction => ({ ...interaction })),
        entries: settled,
        requests: (filter = {}) => settled().filter(entry => ledgerEntryMatches(entry, filter)),
        summary: (filter = {}) => summarizeLedgerEntries(settled().filter(entry => ledgerEntryMatches(entry, filter))),
    };
}

function isPendingMatch(entry, request) {
    if (entry.served !== 'pending') return false;
    return request.ledgerId === undefined ? isSameRequest(entry, request) : entry.ledgerId === String(request.ledgerId);
}

function isSameRequest(entry, { channel = 'gm', method = 'GET', url }) {
    return [entry.channel === channel, entry.method === String(method).toUpperCase(), entry.url === url].every(Boolean);
}

// A routed page request takes the first unclaimed stamp the page wrote for
// its URL, so it is judged by when it left the page, not when it was routed.
function claimPageStamp(entry, stamps) {
    if (entry.channel !== 'page' || typeof entry.trustedInteractionBefore === 'boolean') return;
    const index = stamps.findIndex(stamp => stamp.url === withoutFragment(entry.url));
    if (index < 0) return;
    const [stamp] = stamps.splice(index, 1);
    Object.assign(entry, { at: stamp.at, sinceStartMs: entry.sinceStartMs + stamp.at - entry.at, trustedInteractionBefore: stamp.trustedInteractionBefore, sentByScript: true });
}

function withoutFragment(url) {
    return String(url).split('#')[0];
}

// The page's own flag wins where it has one; lastInteraction is the latest
// trusted activation at or before the request, and none when the page said
// none had happened yet.
function withInteractionState(entry, interactions) {
    const latest = interactionAtOrBefore(interactions, entry.at);
    const trustedInteractionBefore = typeof entry.trustedInteractionBefore === 'boolean' ? entry.trustedInteractionBefore : latest !== null;
    return { ...entry, trustedInteractionBefore, lastInteraction: trustedInteractionBefore ? latest ?? interactionAtOrBefore(interactions, Infinity, 'first') : null };
}

// A copy of the latest interaction at or before `at` ('first': the earliest), or null.
function interactionAtOrBefore(interactions, at, which = 'latest') {
    const earlier = interactions.filter(interaction => interaction.at <= at);
    const found = which === 'first' ? earlier[0] : earlier.at(-1);
    return found ? { ...found } : null;
}

function ledgerEntry({ url, channel, method = 'GET', bodyBytes = 0, at = Date.now(), served = 'unknown', ...rest }, startedAt) {
    return {
        channel: channel === 'gm' ? 'gm' : 'page',
        method: String(method).toUpperCase(),
        url: String(url),
        host: hostOf(String(url)),
        bodyBytes: Math.max(0, Number(bodyBytes)),
        at,
        sinceStartMs: at - startedAt,
        served,
        ...optionalFields(rest),
    };
}

function optionalFields(request) {
    const fields = {};
    if (typeof request.trustedInteractionBefore === 'boolean') fields.trustedInteractionBefore = request.trustedInteractionBefore;
    if (request.resourceType) fields.resourceType = String(request.resourceType);
    if (request.ledgerId !== undefined) fields.ledgerId = String(request.ledgerId);
    return fields;
}

export function hostOf(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return '';
    }
}

// One predicate per filter field; an absent field matches everything.
const FILTER_TESTS = [
    (entry, filter) => Boolean(filter.includeRecording) || !isPageOwnResource(entry),
    (entry, filter) => filter.host === undefined || hostMatches(entry.host, filter.host),
    (entry, filter) => !filter.method || entry.method === String(filter.method).toUpperCase(),
    (entry, filter) => !filter.channel || entry.channel === filter.channel,
    (entry, filter) => filter.path === undefined || pathMatches(entry.url, filter.path),
    (entry, filter) => typeof filter.beforeInteraction !== 'boolean' || filter.beforeInteraction !== entry.trustedInteractionBefore,
    (entry, filter) => filter.noInteractionWithinMs === undefined || !interactionWithin(entry, filter.noInteractionWithinMs),
];

function interactionWithin(entry, ms) {
    return entry.lastInteraction !== null && entry.at - entry.lastInteraction.at <= Number(ms);
}

/**
 * host: exact host or a parent domain ('googleapis.com' matches
 * 'lensfrontend-pa.googleapis.com'), or a RegExp tested against the host.
 * The page channel's requests the recording answered (the page's own document,
 * CSS and images) are left out unless includeRecording is set: they are the
 * page, not the product. GM requests, and the fetch and XHR calls the page
 * stamped (no site script runs on a recorded page), are the product's own and
 * always count, whoever answered them.
 * noInteractionWithinMs: requests with no trusted activation in that many ms
 * before them (or none at all).
 */
function ledgerEntryMatches(entry, filter) {
    return FILTER_TESTS.every(test => test(entry, filter));
}

function isPageOwnResource(entry) {
    return entry.channel === 'page' && entry.served === 'recording' && !entry.sentByScript;
}

export function hostMatches(host, pattern) {
    if (pattern instanceof RegExp) return pattern.test(host);
    const wanted = String(pattern).toLowerCase();
    return host === wanted || host.endsWith(`.${wanted}`);
}

function pathMatches(url, pattern) {
    const pathname = new URL(url).pathname;
    return pattern instanceof RegExp ? pattern.test(pathname) : pathname.startsWith(String(pattern));
}

function summarizeLedgerEntries(entries) {
    const hosts = {};
    for (const entry of entries) addToHostSummary(hosts[entry.host] ??= { requests: 0, bodyBytes: 0, beforeInteraction: 0, methods: {} }, entry);
    return { requests: entries.length, hosts };
}

function addToHostSummary(row, entry) {
    row.requests += 1;
    row.bodyBytes += entry.bodyBytes;
    row.beforeInteraction += entry.trustedInteractionBefore ? 0 : 1;
    row.methods[entry.method] = (row.methods[entry.method] ?? 0) + 1;
}

/** Throws with the offending requests listed when the count is out of range. */
export function assertLedgerCount(ledger, filter, { min = 0, max = Number.POSITIVE_INFINITY, label = describeFilter(filter) } = {}) {
    const matches = ledger.requests(filter);
    if (matches.length >= min && matches.length <= max) return matches;
    const range = max === Number.POSITIVE_INFINITY ? `at least ${min}` : `${min}..${max}`;
    const sample = matches.slice(0, 8).map(describeEntry);
    throw new Error(`[network-ledger] ${label}: expected ${range} request(s), saw ${matches.length}${sample.map(line => `\n  ${line}`).join('')}`);
}

function describeEntry(entry) {
    const after = entry.trustedInteractionBefore ? ', after interaction' : '';
    return `${entry.method} ${entry.url.slice(0, 160)} (+${entry.sinceStartMs} ms, ${entry.channel}${after})`;
}

export function assertNoRequestsBeforeInteraction(ledger, host, label = `requests to ${host} before a trusted interaction`) {
    return assertLedgerCount(ledger, { host, beforeInteraction: true }, { max: 0, label });
}

function describeFilter(filter) {
    const parts = Object.entries(filter).map(([key, value]) => `${key}=${value instanceof RegExp ? value : JSON.stringify(value)}`);
    return parts.length ? `requests where ${parts.join(', ')}` : 'requests';
}

/**
 * The in-page half: a program string that reports trusted activations, every
 * GM_xmlhttpRequest call and a stamp for every fetch and XHR the page sends to
 * the Node bindings named here. It must run after the GM bridge is installed
 * and before the userscript graph, so it is concatenated into the same init
 * program (Playwright does not order separately registered init scripts).
 */
export function networkLedgerPageProgram({ requestBinding, interactionBinding, pageStampBinding }) {
    const options = JSON.stringify({ requestBinding, interactionBinding, pageStampBinding, events: TRUSTED_ACTIVATION_EVENTS, idHeader: LEDGER_ID_HEADER });
    return `(${installLedgerProbes.toString()})(${options}, ${stampPageRequests.toString()});`;
}

// fetch() and XHR send() report when they leave, with the trusted state then.
function stampPageRequests(stamp) {
    const absolute = url => {
        try {
            return new URL(String(url), location.href).href;
        } catch {
            return String(url);
        }
    };
    const originalFetch = window.fetch;
    window.fetch = function fetch(input) {
        stamp(absolute(input instanceof Request ? input.url : input));
        return originalFetch.apply(this, arguments);
    };
    const urls = new WeakMap();
    const { open: originalOpen, send: originalSend } = XMLHttpRequest.prototype;
    XMLHttpRequest.prototype.open = function open(method, url) {
        urls.set(this, absolute(url));
        return Reflect.apply(originalOpen, this, arguments);
    };
    XMLHttpRequest.prototype.send = function send() {
        if (urls.has(this)) stamp(urls.get(this));
        return Reflect.apply(originalSend, this, arguments);
    };
}

function installLedgerProbes({ requestBinding, interactionBinding, pageStampBinding, events, idHeader }, stampPageRequests) {
    let trusted = false;
    let nextId = 0;
    const report = (name, payload) => {
        // The ledger must never change what the product sees.
        try {
            window[name]?.(payload);
        } catch {
            // A binding that is gone (closing page) has nothing to record.
        }
    };
    // 'img.thumbimage', 'button#close': enough to tell a tap on a picture from a key press.
    const describeTarget = node => {
        if (!(node instanceof Element)) return 'document';
        return [node.localName, node.id && `#${node.id}`, node.classList[0] && `.${node.classList[0]}`].filter(Boolean).join('');
    };
    const onActivation = event => {
        if (!event.isTrusted) return;
        trusted = true;
        report(interactionBinding, { type: event.type, at: Date.now(), target: describeTarget(event.composedPath()[0]) });
    };
    events.forEach(type => window.addEventListener(type, onActivation, { capture: true, passive: true }));
    const encodedLength = text => new TextEncoder().encode(String(text)).byteLength;
    const formDataBytes = data => [...data.entries()].reduce((total, [name, value]) => total + name.length + (value instanceof Blob ? value.size : String(value).length), 0);
    const sizers = [
        [data => data === null || data === undefined, () => 0],
        [data => data instanceof Blob, data => data.size],
        [data => data instanceof ArrayBuffer || ArrayBuffer.isView(data), data => data.byteLength],
        [data => data instanceof FormData, formDataBytes],
    ];
    const bodyBytes = data => (sizers.find(([matches]) => matches(data))?.[1] ?? encodedLength)(data);
    const describe = ({ method = 'GET', url = '', data } = {}) => ({
        ledgerId: String((nextId += 1)),
        channel: 'gm',
        method,
        url: String(url),
        bodyBytes: bodyBytes(data),
        at: Date.now(),
        trustedInteractionBefore: trusted,
        served: 'pending',
    });
    // The product's own details object is left as it is; the bridge gets a copy with the id.
    const wrap = original => function ledgerGmRequest(details, ...rest) {
        const entry = describe(details);
        report(requestBinding, entry);
        const tagged = details && typeof details === 'object' ? { ...details, headers: { ...details.headers, [idHeader]: entry.ledgerId } } : details;
        return original.call(this, tagged, ...rest);
    };
    const wrapMethod = (owner, name) => {
        if (typeof owner?.[name] === 'function') owner[name] = wrap(owner[name]);
    };
    wrapMethod(window, 'GM_xmlhttpRequest');
    wrapMethod(window.GM, 'xmlHttpRequest');
    wrapMethod(window.GM, 'xmlhttpRequest');
    stampPageRequests(url => report(pageStampBinding, { url, at: Date.now(), trustedInteractionBefore: trusted }));
}
