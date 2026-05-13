import { monkeyWindow } from 'vite-plugin-monkey/dist/client';
import { Logger } from './logger';

const log = Logger.scope('Userscript');

type UserscriptRequestSource = {
    GM_xmlhttpRequest?: UserscriptHttpRequest;
    GM?: {
        xmlHttpRequest?: UserscriptHttpRequest;
        xmlhttpRequest?: UserscriptHttpRequest;
    };
};

export function getUserscriptHttpRequest(): UserscriptHttpRequest | undefined {
    for (const source of userscriptRequestSources()) {
        const directRequest = asUserscriptRequest(source.GM_xmlhttpRequest);
        if (directRequest) {
            log.debugThrottled('resolved-request', 5000, 'Userscript HTTP request resolved', { source: sourceLabel(source), path: 'GM_xmlhttpRequest' });
            return directRequest.bind(source);
        }

        const gm = source.GM;
        const gmRequest = asUserscriptRequest(gm?.xmlHttpRequest) ?? asUserscriptRequest(gm?.xmlhttpRequest);
        if (gmRequest) {
            log.debugThrottled('resolved-request', 5000, 'Userscript HTTP request resolved', { source: sourceLabel(source), path: gm?.xmlHttpRequest ? 'GM.xmlHttpRequest' : 'GM.xmlhttpRequest' });
            return gmRequest.bind(gm);
        }
    }
    log.debugThrottled('missing-userscript-request', 5000, 'Userscript HTTP request unavailable');
    return undefined;
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
    const record = document as unknown as Record<string, unknown>;
    const windows = Object.getOwnPropertyNames(document)
        .filter(key => key.startsWith('__monkeyWindow-'))
        .map(key => record[key]);
    log.debugThrottled('mounted-monkey-windows', 5000, 'Mounted monkey windows inspected', { count: windows.length });
    return windows;
}

function isRequestSource(value: unknown): value is UserscriptRequestSource {
    return Boolean(value) && (typeof value === 'object' || typeof value === 'function');
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
