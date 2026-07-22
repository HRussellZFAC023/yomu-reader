import { getUserscriptHttpRequest, isUserscriptEventBridgeRequest } from '../userscript';

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

function requestViaUserscript(request: UserscriptHttpRequest, url: string, init: RequestInit): Promise<Response> {
    return new Promise((resolve, reject) => {
        const headers = new Headers(init.headers);
        const details: Parameters<UserscriptHttpRequest>[0] = {
            method: init.method ?? 'GET',
            url,
            headers: Object.fromEntries(headers.entries()),
            data: typeof init.body === 'string' ? init.body : undefined,
            responseType: 'text',
            anonymous: true,
            withCredentials: false,
            onload: response => resolve(new Response(
                String(response.responseText ?? response.response ?? ''),
                { status: response.status },
            )),
            onerror: error => reject(error instanceof Error ? error : new Error('Reader account request failed.')),
            ontimeout: () => reject(new Error('Reader account request timed out.')),
        };
        try {
            const result = request(details);
            if (result && typeof (result as Promise<UserscriptHttpResponse>).then === 'function') {
                (result as Promise<UserscriptHttpResponse>).then(details.onload, details.onerror);
            }
        } catch (error) {
            reject(error);
        }
    });
}
