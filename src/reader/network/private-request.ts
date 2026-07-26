import { getUserscriptHttpRequest, isUserscriptEventBridgeRequest, requestViaUserscriptManager } from '../userscript';

/**
 * Direct, raw-response transport for account bearer traffic. It never uses a
 * configured/public proxy and prefers GM_xmlhttpRequest so strict page CSPs do
 * not break sync. Native fetch is only the hosted/no-userscript fallback.
 */
export async function requestPrivateApi(url: string, init: RequestInit = {}): Promise<Response> {
    let userscriptRequest = getUserscriptHttpRequest();
    // The DOM-event bridge is page-observable and must never carry a bearer.
    if (userscriptRequest && isUserscriptEventBridgeRequest(userscriptRequest)) userscriptRequest = undefined;
    if (userscriptRequest) return requestViaUserscript(userscriptRequest, url, init);
    return fetch(url, {
        ...init,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
    });
}

// No `timeout` is sent: bearer sync deliberately names no budget, and adding one
// would change what the manager does. The budget it lacked was a LOCAL one — this
// path always runs on a raw GM call (the bridge is excluded above), and a manager
// that drops the callback left every account/sync await pending forever. The
// shared helper's dropped-callback backstop is that local floor.
function requestViaUserscript(request: UserscriptHttpRequest, url: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    return requestViaUserscriptManager<Response>(request, {
        details: {
            method: init.method ?? 'GET',
            url,
            headers: Object.fromEntries(headers.entries()),
            data: typeof init.body === 'string' ? init.body : undefined,
            responseType: 'text',
            anonymous: true,
            withCredentials: false,
        },
        readResponse: response => new Response(
            String(response.responseText ?? response.response ?? ''),
            { status: response.status },
        ),
        onError: error => error instanceof Error ? error : new Error('Reader account request failed.'),
        onTimeout: () => new Error('Reader account request timed out.'),
    });
}
