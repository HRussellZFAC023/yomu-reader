import {
    createNewTabStateChannel,
    loadNewTabUiStateWithLegacyIntent,
    type LegacyNewTabStudyIntent,
    type NewTabRoute,
} from './index';
import { normalizeSearchQuery } from './card-selection';
import { createStudySessionClock, type StudySessionClock } from './session-clock';
import type { NewTabUiState } from './state';
import type { NewTabStudyStepId } from './study-session';

const NEW_TAB_ROUTE_NAMES = new Set<string>(['study', 'word', 'search', 'stats']);

interface NewTabControllerStartupOptions {
    readonly source: NewTabUiState['source'];
    readonly sessionClock?: StudySessionClock;
    readonly initialStudyStepId?: NewTabStudyStepId;
}

export interface NewTabControllerStartup {
    readonly state: NewTabUiState;
    readonly legacyStudyIntent: LegacyNewTabStudyIntent | null;
    readonly routeSearchQuery: string;
    readonly sessionClock: StudySessionClock;
    readonly ownsSessionClock: boolean;
    readonly initialStudyStepId: NewTabStudyStepId | null;
}

export type NewTabControllerStateChannel = ReturnType<typeof createNewTabStateChannel>;

/** Owns the persisted/location/session inputs needed to start one controller. */
export function newTabControllerStartup(options: NewTabControllerStartupOptions): NewTabControllerStartup {
    const loaded = loadNewTabUiStateWithLegacyIntent();
    const route = currentNewTabRoute();
    return {
        state: initialNewTabState(loaded.state, options.source, route),
        legacyStudyIntent: loaded.legacyStudyIntent,
        routeSearchQuery: route === 'search' ? currentNewTabSearchQuery() : '',
        ...newTabSessionClock(options.sessionClock),
        initialStudyStepId: options.initialStudyStepId ?? null,
    };
}

export function newTabControllerStateChannel(
    surface: 'standalone' | 'academy' | undefined,
    onState: (state: NewTabUiState) => void,
): NewTabControllerStateChannel {
    if (surface === 'academy') return { publish: () => {}, close: () => {} };
    return createNewTabStateChannel(onState);
}

export function currentNewTabRoute(): NewTabRoute | null {
    try {
        return newTabRouteFromUrl(new URL(location.href));
    } catch {
        return null;
    }
}

export function currentNewTabSearchQuery(): string {
    try {
        return newTabRouteSearchQuery(new URL(location.href));
    } catch {
        return '';
    }
}

function newTabSessionClock(sessionClock: StudySessionClock | undefined): Pick<NewTabControllerStartup, 'sessionClock' | 'ownsSessionClock'> {
    return {
        sessionClock: sessionClock ?? createStudySessionClock({
            visibility: typeof document === 'undefined' ? undefined : document,
        }),
        ownsSessionClock: !sessionClock,
    };
}

function initialNewTabState(
    saved: NewTabUiState,
    source: NewTabUiState['source'],
    route: NewTabRoute | null,
): NewTabUiState {
    return {
        ...saved,
        ...(route ? { route } : {}),
        source,
    };
}

function newTabRouteFromUrl(url: URL): NewTabRoute | null {
    const mode = requestedNewTabRoute(url);
    if (isNewTabRouteName(mode)) return mode === 'word' ? 'study' : mode;
    return newTabRouteSearchQuery(url) ? 'search' : null;
}

function requestedNewTabRoute(url: URL): string {
    return url.searchParams.get('mode')
        || url.searchParams.get('view')
        || url.hash.replace(/^#/u, '');
}

function isNewTabRouteName(value: string | undefined | null): value is NewTabRoute | 'word' {
    return Boolean(value && NEW_TAB_ROUTE_NAMES.has(value));
}

function newTabRouteSearchQuery(url: URL): string {
    for (const key of ['q', 'query', 'search']) {
        const value = normalizeSearchQuery(url.searchParams.get(key) ?? '');
        if (value) return value;
    }
    return '';
}
