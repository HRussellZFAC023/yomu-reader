export interface PortableStudyCardRoute {
    readonly kind: 'portable';
    readonly key: string;
    readonly spelling: string;
    readonly reading: string;
}

export interface ConcealedStudyCardRoute {
    readonly kind: 'concealed';
    readonly token: string;
}

export type StudyCardRoute = PortableStudyCardRoute | ConcealedStudyCardRoute;

export interface StudyCardHistoryUpdate {
    readonly action: 'push' | 'replace';
    readonly url: string;
    readonly selectionKey: string;
    readonly routeSignature: string;
}

const CONCEALED_CARD_TOKEN = /^study-card-\d+$/u;
const SAFE_CONTEXT = /^[a-z0-9:_-]{1,80}$/iu;
const SAFE_MODE = /^(?:word|recall|kanji|listen)$/u;

/** Parse only the two card-route shapes Study owns. Hostile or stale shapes fail closed. */
export function readStudyCardRoute(href: string): StudyCardRoute | null {
    try {
        const url = new URL(href);
        const hash = new URLSearchParams(url.hash.replace(/^#/u, ''));
        const token = hash.get('review') ?? '';
        if (CONCEALED_CARD_TOKEN.test(token)) return { kind: 'concealed', token };

        const key = boundedRouteText(hash.get('card') || legacyCardKey(url.hash) || url.searchParams.get('card') || '', 512);
        if (!key) return null;
        const canonical = canonicalIdentityFromKey(key);
        return {
            kind: 'portable',
            key,
            spelling: routeIdentityText(hash.get('w') ?? hash.get('word') ?? url.searchParams.get('w') ?? url.searchParams.get('word') ?? canonical.spelling),
            reading: routeIdentityText(hash.get('r') ?? hash.get('reading') ?? url.searchParams.get('r') ?? url.searchParams.get('reading') ?? canonical.reading),
        };
    } catch {
        return null;
    }
}

/**
 * Build one standalone Study history entry. Unrevealed cards expose only an
 * in-memory token; revealed cards deliberately become portable share links.
 */
export function buildStudyCardHistoryUrl(href: string, route: StudyCardRoute): string | null {
    try {
        const url = new URL(href);
        keepSafeStudyQuery(url);
        const hash = new URLSearchParams();
        if (route.kind === 'concealed') {
            if (!CONCEALED_CARD_TOKEN.test(route.token)) return null;
            hash.set('review', route.token);
        } else {
            const key = boundedRouteText(route.key, 512);
            if (!key) return null;
            hash.set('card', key);
            const spelling = routeIdentityText(route.spelling);
            const reading = routeIdentityText(route.reading);
            if (spelling) hash.set('w', spelling);
            if (reading && reading !== spelling) hash.set('r', reading);
        }
        url.hash = hash.toString();
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return null;
    }
}

export function studyCardRouteSignature(route: StudyCardRoute | null): string {
    if (!route) return '';
    return route.kind === 'concealed'
        ? `concealed:${route.token}`
        : `portable:${route.key}:${route.spelling}:${route.reading}`;
}

/** Decide the one history mutation needed for a card render, if any. */
export function planStudyCardHistoryUpdate(input: {
    readonly href: string;
    readonly route: StudyCardRoute;
    readonly selectionKey: string;
    readonly previousSelectionKey: string;
    readonly previousRouteSignature: string;
    readonly handlingPopstate: boolean;
}): StudyCardHistoryUpdate | null {
    const routeSignature = studyCardRouteSignature(input.route);
    if (routeSignature === input.previousRouteSignature) return null;
    const url = buildStudyCardHistoryUrl(input.href, input.route);
    if (!url) return null;
    const replacesCurrentEntry = !input.previousRouteSignature
        || input.handlingPopstate
        || input.selectionKey === input.previousSelectionKey;
    return {
        action: replacesCurrentEntry ? 'replace' : 'push',
        url,
        selectionKey: input.selectionKey,
        routeSignature,
    };
}

function keepSafeStudyQuery(url: URL): void {
    const kept = new URLSearchParams();
    const returnTarget = url.searchParams.get('return');
    const context = url.searchParams.get('context') ?? '';
    const mode = url.searchParams.get('mode') ?? '';
    const view = url.searchParams.get('view') ?? '';
    if (returnTarget === 'academy') kept.set('return', 'academy');
    if (SAFE_CONTEXT.test(context)) kept.set('context', context);
    if (SAFE_MODE.test(mode)) kept.set('mode', mode);
    if (SAFE_MODE.test(view)) kept.set('view', view);
    url.search = kept.toString();
}

function routeIdentityText(value: string): string {
    return boundedRouteText(value.replace(/\s+/gu, ' '), 80);
}

function boundedRouteText(value: string, maxLength: number): string {
    return value.normalize('NFKC').trim().slice(0, maxLength);
}

function canonicalIdentityFromKey(key: string): { spelling: string; reading: string } {
    const separator = key.indexOf('\u0000');
    if (separator < 1) return { spelling: '', reading: '' };
    return {
        spelling: key.slice(0, separator),
        reading: key.slice(separator + 1),
    };
}

function legacyCardKey(hash: string): string {
    try {
        const match = /[#&]card=([^&]+)/u.exec(hash);
        return match ? decodeURIComponent(match[1] ?? '') : '';
    } catch {
        return '';
    }
}
