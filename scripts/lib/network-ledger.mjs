// Network Ledger: every request the BUILT product makes while a recorded page
// is replayed, from both channels a userscript has — GM_xmlhttpRequest (the
// manager's privileged bridge) and the page itself (fetch, XHR, <img>, <audio>).
//
// Each entry carries the host, method, body size, a timestamp and whether a
// trusted user activation (pointerdown, mousedown, touchstart, keydown, click
// with isTrusted) had happened before the request left. That last bit is what
// privacy rules are written against: "no cloud OCR request without a tap" is
// `requests({ host: 'googleapis.com', beforeInteraction: true })` being empty.
//
// Pure Node: recorded-page.mjs feeds it, tests read it.

/** Interactions that count as a learner acting on purpose. Hover does not. */
const TRUSTED_ACTIVATION_EVENTS = Object.freeze(['pointerdown', 'mousedown', 'touchstart', 'keydown', 'click']);

export function createNetworkLedger({ startedAt = Date.now() } = {}) {
    const entries = [];
    const interactions = [];
    const firstInteractionAt = () => interactions[0]?.at ?? null;
    const settled = () => entries.map(entry => withInteractionState(entry, firstInteractionAt()));

    return {
        startedAt,
        recordRequest(request) {
            const entry = ledgerEntry(request, startedAt);
            entries.push(entry);
            return entry;
        },
        /** The GM bridge learns how a request was answered after the page reported it. */
        markServed(request, served) {
            const entry = entries.find(item => isPendingMatch(item, request));
            if (entry) entry.served = served;
        },
        recordInteraction({ type, at = Date.now() }) {
            interactions.push({ type: String(type), at: Number(at) });
            interactions.sort((left, right) => left.at - right.at);
        },
        firstInteractionAt,
        interactions: () => interactions.map(interaction => ({ ...interaction })),
        entries: settled,
        requests: (filter = {}) => settled().filter(entry => ledgerEntryMatches(entry, filter)),
        summary: (filter = {}) => summarizeLedgerEntries(settled().filter(entry => ledgerEntryMatches(entry, filter))),
    };
}

function isPendingMatch(entry, { channel = 'gm', method = 'GET', url }) {
    return entry.served === 'pending' && entry.channel === channel && entry.method === String(method).toUpperCase() && entry.url === url;
}

function withInteractionState(entry, firstInteraction) {
    if (typeof entry.trustedInteractionBefore === 'boolean') return entry;
    return { ...entry, trustedInteractionBefore: firstInteraction !== null && firstInteraction <= entry.at };
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
];

/**
 * host: exact host or a parent domain ('googleapis.com' matches
 * 'lensfrontend-pa.googleapis.com'), or a RegExp tested against the host.
 * The page channel's requests the recording answered (the page's own document,
 * CSS and images) are left out unless includeRecording is set: they are the
 * page, not the product. GM requests are the product's own and always count,
 * whoever answered them.
 */
function ledgerEntryMatches(entry, filter) {
    return FILTER_TESTS.every(test => test(entry, filter));
}

function isPageOwnResource(entry) {
    return entry.channel === 'page' && entry.served === 'recording';
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
 * The in-page half: a program string that reports trusted activations and
 * every GM_xmlhttpRequest call to the Node bindings named here. It must run
 * after the GM bridge is installed and before the userscript graph, so it is
 * concatenated into the same init program (Playwright does not order
 * separately registered init scripts).
 */
export function networkLedgerPageProgram({ requestBinding, interactionBinding }) {
    return `(${installLedgerProbes.toString()})(${JSON.stringify({ requestBinding, interactionBinding, events: TRUSTED_ACTIVATION_EVENTS })});`;
}

function installLedgerProbes({ requestBinding, interactionBinding, events }) {
    let trusted = false;
    const report = (name, payload) => {
        // The ledger must never change what the product sees.
        try {
            window[name]?.(payload);
        } catch {
            // A binding that is gone (closing page) has nothing to record.
        }
    };
    const onActivation = event => {
        if (!event.isTrusted) return;
        trusted = true;
        report(interactionBinding, { type: event.type, at: Date.now() });
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
        channel: 'gm',
        method,
        url: String(url),
        bodyBytes: bodyBytes(data),
        at: Date.now(),
        trustedInteractionBefore: trusted,
        served: 'pending',
    });
    const wrap = original => function ledgerGmRequest(details) {
        report(requestBinding, describe(details));
        return original.apply(this, arguments);
    };
    const wrapMethod = (owner, name) => {
        if (typeof owner?.[name] === 'function') owner[name] = wrap(owner[name]);
    };
    wrapMethod(window, 'GM_xmlhttpRequest');
    wrapMethod(window.GM, 'xmlHttpRequest');
    wrapMethod(window.GM, 'xmlhttpRequest');
}
