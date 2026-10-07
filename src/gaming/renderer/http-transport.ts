// The overlay hosts the real reader, and the reader's privileged network route is the one a
// userscript manager or the browser extension lends it: GM_xmlhttpRequest. Without one the
// reader treats the page as an ordinary website — it keeps a learner's Jiten or JPDB key
// off every proxy it does not own and cannot reach those APIs directly, so every
// authenticated request (grading, adding to a deck, the word's own status) failed in the
// overlay with "Action failed." while the same popup worked in the browser.
//
// In Yomu Gaming the overlay window IS the privileged page: main.ts turns web security off
// for that window alone, so a plain fetch() reaches api.jiten.moe and jpdb.io with the
// learner's key, bounded by the page's connect-src policy. This lends the reader that
// route under the name it already looks for, so every caller — Jiten, JPDB, audio,
// dictionaries — takes the same path it takes under a userscript manager.

type GamingFetch = (input: string, init: RequestInit) => Promise<Response>;
type GamingRequestDetails = Parameters<UserscriptHttpRequest>[0];
type GamingTransportWindow = Window & { GM_xmlhttpRequest?: unknown };

export function installGamingHttpTransport(target: Window, fetchImpl: GamingFetch = (input, init) => fetch(input, init)): void {
    const host = target as GamingTransportWindow;
    // A real manager (a developer running the overlay in a browser with a userscript
    // manager) knows better than this does.
    if (typeof host.GM_xmlhttpRequest === 'function') return;
    host.GM_xmlhttpRequest = gamingHttpRequest(fetchImpl);
}

function gamingHttpRequest(fetchImpl: GamingFetch): UserscriptHttpRequest {
    return details => {
        const controller = new AbortController();
        sendGamingRequest(fetchImpl, details, controller.signal).then(
            response => details.onload?.(response),
            error => {
                // The reader's own deadline aborted this and has already settled the call.
                if (!controller.signal.aborted) details.onerror?.(gamingTransportError(error));
            },
        );
        return { abort: () => controller.abort() };
    };
}

// Some hosts refuse a request straight from the overlay — jpdb.io drops the connection on
// its public search page — where Yomu's shared proxy would have answered. fetch() reports
// that as a bare "Failed to fetch"; named as the network failure it is, the reader falls
// back to its proxy route for public read-only requests, as it does for a userscript
// manager whose request failed. Requests carrying a key still never go to a proxy.
function gamingTransportError(error: unknown): Error {
    return new Error('Network request failed.', { cause: error });
}

async function sendGamingRequest(
    fetchImpl: GamingFetch,
    details: GamingRequestDetails,
    signal: AbortSignal,
): Promise<UserscriptHttpResponse> {
    const response = await fetchImpl(details.url, {
        method: details.method ?? 'GET',
        headers: details.headers,
        body: details.data,
        credentials: details.withCredentials ? 'include' : 'omit',
        signal,
    });
    const body = await readGamingResponseBody(response, details.responseType);
    return { status: response.status, finalUrl: response.url || details.url, ...body };
}

async function readGamingResponseBody(
    response: Response,
    responseType: GamingRequestDetails['responseType'],
): Promise<Pick<UserscriptHttpResponse, 'response' | 'responseText'>> {
    if (responseType === 'blob') return { response: await response.blob() };
    if (responseType === 'arraybuffer') return { response: await response.arrayBuffer() };
    const text = await response.text();
    // A manager hands back the parsed body for `json`, and null for an empty one (a 204
    // from a write), which the reader's response reader accepts as "no payload".
    if (responseType === 'json') return { response: parsedJson(text), responseText: text };
    return { response: text, responseText: text };
}

function parsedJson(text: string): unknown {
    if (!text.trim()) return null;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        // Leave the text for the reader to parse, so the malformed body surfaces as the
        // reader's own error rather than as a silent null.
        return undefined;
    }
}
