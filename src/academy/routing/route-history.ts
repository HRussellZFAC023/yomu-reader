const ACADEMY_ROUTE_DEFINITIONS = {
    access: 'enrollment',
    profile: 'enrollment',
    'rie-unlock': 'enrollment',
    start: 'enrollment',
    'manual-band': 'enrollment',
    'placement-mock': 'diagnostic-assessment',
    'placement-result': 'enrollment',
    'arrival-bridge': 'story-bridge',
    'band-entry': 'legacy-ungrounded-activity',
    'lesson-overview': 'lesson-overview',
    'lesson-fork': 'legacy-ungrounded-activity',
    'source-activity': 'legacy-ungrounded-activity',
    'aakash-meet': 'legacy-ungrounded-activity',
    'writing-practice': 'legacy-ungrounded-activity',
    campus: 'world',
    class: 'class',
    lab: 'legacy-ungrounded-activity',
    review: 'canonical-study',
    journal: 'world',
    'day-end': 'world',
} as const;

export type AcademyRoute = keyof typeof ACADEMY_ROUTE_DEFINITIONS;
export type AcademyRouteKind = typeof ACADEMY_ROUTE_DEFINITIONS[AcademyRoute];
export const ACADEMY_ROUTES: readonly AcademyRoute[] = Object.freeze(
    Object.keys(ACADEMY_ROUTE_DEFINITIONS) as AcademyRoute[],
);
export type AcademyPresentationMode = 'story' | 'course';
export type AcademyRouteBand = 'n5' | 'n4' | 'n3' | 'n2' | 'n1';
export type AcademyRouteFork = 'sound' | 'text' | 'speaking';

/** Route-local values that Back must restore. Authentication never belongs here. */
export interface AcademyRouteContextState {
    readonly selectedBand?: AcademyRouteBand;
    readonly selectedFork?: AcademyRouteFork;
    readonly placementOverride?: boolean;
    readonly lessonId?: string;
    readonly sectionId?: string;
    readonly activityId?: string;
}

export interface AcademyRouteFrame extends AcademyRouteContextState {
    readonly route: AcademyRoute;
}

/**
 * Persisted navigation state. `routeHistory` contains prior routes only; an
 * empty array is the safe floor and `route` is always the current screen.
 */
export interface AcademyRouteHistoryState extends AcademyRouteFrame {
    readonly routeHistory: readonly AcademyRouteFrame[];
    readonly presentationMode: AcademyPresentationMode;
}

export type AcademyRouteTransition =
    | { readonly kind: 'push'; readonly route: AcademyRoute; readonly context?: Partial<AcademyRouteContextState> }
    | { readonly kind: 'replace'; readonly route: AcademyRoute; readonly context?: Partial<AcademyRouteContextState> }
    | { readonly kind: 'back' }
    | { readonly kind: 'reset'; readonly route: AcademyRoute; readonly context?: Partial<AcademyRouteContextState> }
    | { readonly kind: 'presentation'; readonly mode: AcademyPresentationMode };

const MAX_BACK_ROUTES = 64;
type TransitionedRouteState<State extends AcademyRouteHistoryState> =
    Omit<State, keyof AcademyRouteHistoryState> & AcademyRouteHistoryState;

/**
 * The one navigation-state seam. Every transition is pure so persistence,
 * resume and browser UI all share identical history semantics.
 */
export function transitionAcademyRoute<State extends AcademyRouteHistoryState>(
    state: State,
    transition: AcademyRouteTransition,
): TransitionedRouteState<State> {
    switch (transition.kind) {
        case 'push':
            {
                const next = mergeRouteFrame(state, transition.route, transition.context);
                if (routeFramesAreEqual(state, next)) return state;
                return withRouteFrame(
                    state,
                    next,
                    [...state.routeHistory, routeFrame(state)].slice(-MAX_BACK_ROUTES),
                );
            }
        case 'replace':
            {
                const next = mergeRouteFrame(state, transition.route, transition.context);
                if (routeFramesAreEqual(state, next)) return state;
                return withRouteFrame(state, next, state.routeHistory);
            }
        case 'back': {
            const origin = state.routeHistory.at(-1);
            if (!origin) return state;
            return withRouteFrame(state, origin, state.routeHistory.slice(0, -1));
        }
        case 'reset':
            {
                const next = mergeRouteFrame(state, transition.route, transition.context);
                if (routeFramesAreEqual(state, next) && state.routeHistory.length === 0) return state;
                return withRouteFrame(state, next, []);
            }
        case 'presentation': {
            const route = transition.mode === 'course' && state.route === 'campus'
                ? 'class'
                : transition.mode === 'story' && state.route === 'class'
                    ? 'campus'
                    : state.route;
            if (transition.mode === state.presentationMode && route === state.route) return state;
            return { ...state, route, presentationMode: transition.mode } as TransitionedRouteState<State>;
        }
    }
}

const ROUTE_CONTEXT_KEYS = [
    'selectedBand',
    'selectedFork',
    'placementOverride',
    'lessonId',
    'sectionId',
    'activityId',
] as const satisfies readonly (keyof AcademyRouteContextState)[];

function routeFrame(state: AcademyRouteFrame): AcademyRouteFrame {
    return compactRouteFrame({
        route: state.route,
        selectedBand: state.selectedBand,
        selectedFork: state.selectedFork,
        placementOverride: state.placementOverride,
        lessonId: state.lessonId,
        sectionId: state.sectionId,
        activityId: state.activityId,
    });
}

function mergeRouteFrame(
    state: AcademyRouteFrame,
    route: AcademyRoute,
    context: Partial<AcademyRouteContextState> | undefined,
): AcademyRouteFrame {
    return compactRouteFrame({ ...routeFrame(state), route, ...context });
}

function compactRouteFrame(frame: AcademyRouteFrame): AcademyRouteFrame {
    const context = Object.fromEntries(
        ROUTE_CONTEXT_KEYS
            .filter(key => frame[key] !== undefined)
            .map(key => [key, frame[key]]),
    );
    return { route: frame.route, ...context } as AcademyRouteFrame;
}

function withRouteFrame<State extends AcademyRouteHistoryState>(
    state: State,
    frame: AcademyRouteFrame,
    routeHistory: readonly AcademyRouteFrame[],
): TransitionedRouteState<State> {
    const next = { ...state } as Record<string, unknown>;
    for (const key of ROUTE_CONTEXT_KEYS) delete next[key];
    return { ...next, ...frame, routeHistory } as TransitionedRouteState<State>;
}

function routeFramesAreEqual(left: AcademyRouteFrame, right: AcademyRouteFrame): boolean {
    return left.route === right.route && ROUTE_CONTEXT_KEYS.every(key => left[key] === right[key]);
}

export function isAcademyRoute(value: unknown): value is AcademyRoute {
    return typeof value === 'string' && (ACADEMY_ROUTES as readonly string[]).includes(value);
}

export function academyRouteKind(route: AcademyRoute): AcademyRouteKind {
    return ACADEMY_ROUTE_DEFINITIONS[route];
}

export function isAcademyPresentationMode(value: unknown): value is AcademyPresentationMode {
    return value === 'story' || value === 'course';
}
