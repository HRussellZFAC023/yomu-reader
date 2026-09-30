import type { UiCopyKey } from '../app/i18n';
import { Logger } from '../app/logger';
import { gmStorageGetSync, gmStorageSetSync } from '../app/storage';
import type { CardState, NewTabWordSource } from '../app/types';

const log = Logger.scope('NewTab');
const STATE_STORAGE_KEY = 'jpdb-reader-newtab-ui';
const STATE_CHANNEL_NAME = 'jpdb-reader-newtab-ui';

export type NewTabRoute = 'study' | 'search' | 'stats';
export type NewTabSort = 'random' | 'frequency' | 'state';
export type NewTabFilter = 'all' | 'study' | 'local' | CardState;

export interface NewTabUiState {
    route: NewTabRoute;
    sort: NewTabSort;
    filter: NewTabFilter;
    source: NewTabWordSource;
    revealAnswer: boolean;
    // JPDB deck scope for the study queue ('' = follow the settings default).
    jpdbDeck: string;
    // Anki deck scope ('' = all enabled decks).
    ankiDeck: string;
    // UT-34: once any study keyboard shortcut has been used, the inline kbd
    // hints disappear for good (shortcuts stay discoverable in settings).
    keyHintsDismissed: boolean;
}

export type SharedNewTabViewState = Omit<NewTabUiState, 'revealAnswer'>;

export const DEFAULT_NEW_TAB_UI_STATE: NewTabUiState = {
    route: 'study',
    sort: 'random',
    filter: 'study',
    source: 'auto',
    revealAnswer: false,
    jpdbDeck: '',
    ankiDeck: '',
    keyHintsDismissed: false,
};

export const NEW_TAB_FILTERS: Array<{ value: NewTabFilter; labelKey: UiCopyKey }> = [
    { value: 'study', labelKey: 'filterStudy' },
    { value: 'all', labelKey: 'filterAll' },
    { value: 'new', labelKey: 'stateNew' },
    { value: 'learning', labelKey: 'stateLearning' },
    { value: 'due', labelKey: 'stateDue' },
    { value: 'failed', labelKey: 'stateFailed' },
    { value: 'known', labelKey: 'stateKnown' },
    { value: 'never-forget', labelKey: 'stateNeverForget' },
    { value: 'suspended', labelKey: 'stateSuspended' },
    { value: 'locked', labelKey: 'stateLocked' },
    { value: 'blacklisted', labelKey: 'stateBlacklisted' },
    { value: 'redundant', labelKey: 'stateRedundant' },
    { value: 'local', labelKey: 'dictionary' },
];

export function normalizeNewTabUiState(value: Partial<NewTabUiState> | null | undefined): NewTabUiState {
    return {
        route: value?.route === 'search' || value?.route === 'stats' ? value.route : 'study',
        sort: normalizeNewTabSort(value?.sort),
        filter: normalizeNewTabFilter(value?.filter),
        source: normalizeNewTabSource(value?.source),
        revealAnswer: normalizeNewTabRevealAnswer(value?.revealAnswer),
        jpdbDeck: typeof value?.jpdbDeck === 'string' ? value.jpdbDeck : '',
        ankiDeck: typeof value?.ankiDeck === 'string' ? value.ankiDeck : '',
        keyHintsDismissed: value?.keyHintsDismissed === true,
    };
}

export function loadNewTabUiState(): NewTabUiState {
    try {
        const stored = gmStorageGetSync<unknown>(STATE_STORAGE_KEY, null);
        return isCurrentNewTabUiState(stored)
            ? frontFacingNewTabUiState(normalizeNewTabUiState(stored)) : { ...DEFAULT_NEW_TAB_UI_STATE };
    } catch {
        return { ...DEFAULT_NEW_TAB_UI_STATE };
    }
}

export function saveNewTabUiState(state: NewTabUiState): void {
    try {
        gmStorageSetSync(STATE_STORAGE_KEY, frontFacingNewTabUiState(normalizeNewTabUiState(state)));
    } catch {
        // Storage may be blocked in hardened browser contexts; the page still works in memory.
    }
}

export function createNewTabStateChannel(onState: (state: SharedNewTabViewState) => void): { publish: (state: NewTabUiState) => void; close: () => void } {
    if (typeof BroadcastChannel !== 'function') return { publish: () => {}, close: () => {} };
    const channel = new BroadcastChannel(STATE_CHANNEL_NAME);
    let isClosed = false;
    channel.onmessage = event => {
        if (!isPlainRecord(event.data) || event.data.type !== 'state' || !isCurrentNewTabUiState(event.data.state)) return;
        onState(sharedNewTabViewState(event.data.state));
    };
    return {
        publish(state) {
            if (isClosed) return;
            try {
                channel.postMessage({ type: 'state', state: sharedNewTabViewState(state) });
            } catch (error) {
                isClosed = true;
                log.warn('Failed to publish new tab state update', error);
                try {
                    channel.close();
                } catch {
                    // Ignore secondary cleanup failure to avoid cascading runtime errors.
                }
            }
        },
        close() {
            if (isClosed) return;
            isClosed = true;
            channel.close();
        },
    };
}

function frontFacingNewTabUiState(state: NewTabUiState): NewTabUiState {
    return { ...state, revealAnswer: false };
}

function sharedNewTabViewState(state: Partial<NewTabUiState>): SharedNewTabViewState {
    const { revealAnswer: _localAnswer, ...shared } = normalizeNewTabUiState(state);
    return shared;
}

function isCurrentNewTabUiState(value: unknown): value is NewTabUiState {
    return isPlainRecord(value) && !('mode' in value) && !('listenSubMode' in value)
        && (value.route === 'study' || value.route === 'search' || value.route === 'stats');
}

function normalizeNewTabSort(value: unknown): NewTabSort {
    return isNewTabSort(value) ? value : DEFAULT_NEW_TAB_UI_STATE.sort;
}

function normalizeNewTabFilter(value: unknown): NewTabFilter {
    return isNewTabFilter(value) ? value : DEFAULT_NEW_TAB_UI_STATE.filter;
}

function normalizeNewTabSource(value: unknown): NewTabWordSource {
    return isNewTabSource(value) ? value : DEFAULT_NEW_TAB_UI_STATE.source;
}

function normalizeNewTabRevealAnswer(value: unknown): boolean {
    return typeof value === 'boolean' ? value : DEFAULT_NEW_TAB_UI_STATE.revealAnswer;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isNewTabSource(value: unknown): value is NewTabWordSource {
    return value === 'auto' || value === 'jpdb' || value === 'bunpro' || value === 'yomu-local' || value === 'anki' || value === 'dictionary';
}

function isNewTabSort(value: unknown): value is NewTabSort {
    return value === 'random' || value === 'frequency' || value === 'state';
}

function isNewTabFilter(value: unknown): value is NewTabFilter {
    return NEW_TAB_FILTERS.some(filter => filter.value === value);
}
