import { monkeyWindow } from 'vite-plugin-monkey/dist/client';
type UserscriptRequestSource = {
    GM_xmlhttpRequest?: UserscriptHttpRequest;
    GM?: {
        xmlHttpRequest?: UserscriptHttpRequest;
        xmlhttpRequest?: UserscriptHttpRequest;
    };
};

type UserscriptRequestCandidate = {
    request: unknown;
    thisArg: unknown;
    source: string;
    path: string;
};

export function getUserscriptHttpRequest(): UserscriptHttpRequest | undefined {
    for (const candidate of userscriptRequestCandidates()) {
        const request = asUserscriptRequest(candidate.request);
        if (request) {
            return request.bind(candidate.thisArg);
        }
    }
    return undefined;
}

function userscriptRequestCandidates(): UserscriptRequestCandidate[] {
    const candidates: UserscriptRequestCandidate[] = [];
    const add = (request: unknown, thisArg: unknown, source: string, path: string) => {
        candidates.push({ request, thisArg, source, path });
    };

    const direct = directUserscriptGlobals();
    add(direct.GM_xmlhttpRequest, globalThis, 'directGlobal', 'GM_xmlhttpRequest');
    add(direct.GM?.xmlHttpRequest, direct.GM, 'directGlobal', 'GM.xmlHttpRequest');
    add(direct.GM?.xmlhttpRequest, direct.GM, 'directGlobal', 'GM.xmlhttpRequest');

    for (const source of userscriptRequestSources()) {
        const label = sourceLabel(source);
        add(readSourceProperty(source, 'GM_xmlhttpRequest'), source, label, 'GM_xmlhttpRequest');
        const gm = readSourceProperty(source, 'GM');
        add(readSourceProperty(gm, 'xmlHttpRequest'), gm, label, 'GM.xmlHttpRequest');
        add(readSourceProperty(gm, 'xmlhttpRequest'), gm, label, 'GM.xmlhttpRequest');
    }
    return candidates;
}

function directUserscriptGlobals(): UserscriptRequestSource {
    return {
        GM_xmlhttpRequest: typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : undefined,
        GM: typeof GM === 'object' && GM ? GM : undefined,
    };
}

function userscriptRequestSources(): UserscriptRequestSource[] {
    const sources: UserscriptRequestSource[] = [];
    const seen = new Set<unknown>();
    const add = (value: unknown) => {
        if (!isRequestSource(value) || seen.has(value)) return;
        seen.add(value);
        sources.push(value);
    };

    for (const mounted of mountedMonkeyWindows()) add(mounted);
    add(monkeyWindow);
    add(globalThis);
    if (typeof window !== 'undefined') add(window);
    return sources;
}

function mountedMonkeyWindows(): unknown[] {
    if (typeof document === 'undefined') return [];
    const windows = Object.getOwnPropertyNames(document)
        .filter(key => key.startsWith('__monkeyWindow-'))
        .map(key => readSourceProperty(document, key))
        .filter(isRequestSource);
    return windows;
}

function isRequestSource(value: unknown): value is UserscriptRequestSource {
    return Boolean(value) && (typeof value === 'object' || typeof value === 'function');
}

function readSourceProperty(source: unknown, key: string): unknown {
    if (!isRequestSource(source)) return undefined;
    try {
        return (source as Record<string, unknown>)[key];
    } catch {
        return undefined;
    }
}

function asUserscriptRequest(value: unknown): UserscriptHttpRequest | undefined {
    return typeof value === 'function' ? value as UserscriptHttpRequest : undefined;
}

function sourceLabel(source: UserscriptRequestSource): string {
    if (typeof window !== 'undefined' && source === window) return 'window';
    if (source === globalThis) return 'globalThis';
    if (source === (monkeyWindow as unknown)) return 'monkeyWindow';
    return 'mountedMonkeyWindow';
}
