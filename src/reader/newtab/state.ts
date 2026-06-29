import type { UiCopyKey } from '../app/i18n';
import { Logger } from '../app/logger';
import { gmStorageGetSync, gmStorageSetSync } from '../app/storage';
import type { CardState, NewTabWordSource } from '../app/types';

const log = Logger.scope('NewTab');
const STATE_STORAGE_KEY = 'jpdb-reader-newtab-ui';
const STATE_CHANNEL_NAME = 'jpdb-reader-newtab-ui';

export type NewTabMode = 'word' | 'recall' | 'kanji' | 'search' | 'stats' | 'listen';
// Listen mode runs one of three audio-first sub-modes over a single pitch-accent
// SRS deck: Perceive (hear -> identify the downstep), Recall (retrieve from memory),
// and Shadow (produce/mimic the contour). All three advance the same scheduled item.
export type NewTabListenSubMode = 'perceive' | 'recall' | 'shadow';
export type NewTabSort = 'random' | 'frequency' | 'state';
export type NewTabFilter = 'all' | 'study' | 'local' | CardState;

export interface NewTabUiState {
    mode: NewTabMode;
    // Active Listen sub-mode (persisted so the learner returns to the drill they prefer).
    listenSubMode: NewTabListenSubMode;
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

// fallow-ignore-next-line unused-export
export const DEFAULT_NEW_TAB_UI_STATE: NewTabUiState = {
    mode: 'word',
    listenSubMode: 'perceive',
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
        mode: normalizeNewTabMode(value?.mode),
        listenSubMode: normalizeNewTabListenSubMode(value?.listenSubMode),
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
        return frontFacingNewTabUiState(normalizeNewTabUiState(gmStorageGetSync<Partial<NewTabUiState> | null>(STATE_STORAGE_KEY, null)));
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

export function createNewTabStateChannel(onState: (state: NewTabUiState) => void): { publish: (state: NewTabUiState) => void; close: () => void } {
    if (typeof BroadcastChannel !== 'function') return { publish: () => {}, close: () => {} };
    const channel = new BroadcastChannel(STATE_CHANNEL_NAME);
    let isClosed = false;
    channel.onmessage = event => {
        if (!isPlainRecord(event.data) || event.data.type !== 'state') return;
        onState(normalizeNewTabUiState(event.data.state as Partial<NewTabUiState>));
    };
    return {
        publish(state) {
            if (isClosed) return;
            try {
                channel.postMessage({ type: 'state', state: normalizeNewTabUiState(state) });
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

function normalizeNewTabMode(value: unknown): NewTabMode {
    return value === 'recall' || value === 'kanji' || value === 'search' || value === 'stats' || value === 'listen' ? value : DEFAULT_NEW_TAB_UI_STATE.mode;
}

function normalizeNewTabListenSubMode(value: unknown): NewTabListenSubMode {
    return value === 'recall' || value === 'shadow' ? value : DEFAULT_NEW_TAB_UI_STATE.listenSubMode;
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
    return value === 'auto' || value === 'jpdb' || value === 'anki' || value === 'dictionary';
}

function isNewTabSort(value: unknown): value is NewTabSort {
    return value === 'random' || value === 'frequency' || value === 'state';
}

function isNewTabFilter(value: unknown): value is NewTabFilter {
    return NEW_TAB_FILTERS.some(filter => filter.value === value);
}
