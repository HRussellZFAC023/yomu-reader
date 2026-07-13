/** Request/response plumbing: JSON bodies, cookies, and browser-origin gates. */

export class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly headers: Readonly<Record<string, string>> = {},
    ) {
        super(message);
        this.name = 'HttpError';
    }
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            ...headers,
        },
    });
}

export function errorResponse(error: unknown): Response {
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, { ...error.headers });
    // Never echo internals: unexpected failures collapse to an opaque 500.
    return jsonResponse({ error: 'Internal error.' }, 500);
}

/**
 * Mutating browser endpoints require an exact same-origin request: the Origin
 * header must equal ACADEMY_ORIGIN and, when the browser sends fetch metadata,
 * it must confirm a same-origin initiator. This blocks cross-site POSTs even
 * with SameSite-exempt clients.
 */
export function requireSameOriginMutation(request: Request, academyOrigin: string): void {
    const origin = request.headers.get('origin');
    if (!origin || origin !== academyOrigin) throw new HttpError(403, 'Cross-origin request rejected.');
    const fetchSite = request.headers.get('sec-fetch-site');
    if (fetchSite && fetchSite !== 'same-origin') throw new HttpError(403, 'Cross-site request rejected.');
}

export async function readJsonBody(request: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
        throw new HttpError(415, 'Expected application/json.');
    }
    const text = await readBoundedText(request, maxBytes);
    try {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new HttpError(400, 'Expected a JSON object.');
        }
        return parsed as Record<string, unknown>;
    } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, 'Request body is not valid JSON.');
    }
}

export async function readBoundedText(request: Request, maxBytes: number): Promise<string> {
    return new TextDecoder().decode(await readBoundedBytes(request, maxBytes));
}

export async function readBoundedBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
    const declaredLength = request.headers.get('content-length');
    if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
        throw new HttpError(413, 'Request body too large.');
    }
    if (!request.body) return new Uint8Array();

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) throw new HttpError(413, 'Request body too large.');
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return body;
}

export function readCookie(request: Request, name: string): string | null {
    const header = request.headers.get('cookie');
    if (!header) return null;
    for (const part of header.split(';')) {
        const separator = part.indexOf('=');
        if (separator === -1) continue;
        if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
    }
    return null;
}

/** __Host- cookies pin Secure + Path=/ + no Domain, so they cannot be shadowed. */
export function hostCookie(name: string, value: string, maxAgeSeconds: number): string {
    return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`;
}

export function clearHostCookie(name: string): string {
    return hostCookie(name, '', 0);
}
