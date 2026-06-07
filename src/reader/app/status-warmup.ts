import { shouldLookupAnkiStatus } from '../settings/index';
import type { AnkiLookupResult } from '../anki/types';
import type { JPDBCard, ReaderSettings } from './types';

const ANKI_STATUS_WARMUP_DELAY_MS = 1_000;
const ANKI_STATUS_WARMUP_IDLE_TIMEOUT_MS = 5_000;

export interface ReaderAnkiStatusWarmupOptions {
    getSettings: () => ReaderSettings;
    isDestroyed: () => boolean;
    onRecolorError?: (error: unknown) => void;
    onWarmupError?: (error: unknown) => void;
    recolorRenderedAnkiWordsFromCache?: () => Promise<unknown>;
    warmStatusIndex: () => Promise<unknown | null>;
}

export interface RefreshRenderedAnkiStatusOptions {
    getSettings: () => ReaderSettings;
    isDestroyed: () => boolean;
    findExistingCards: (card: JPDBCard) => Promise<AnkiLookupResult>;
    applyAnkiLookupToRenderedWords: (card: JPDBCard, lookup: AnkiLookupResult) => void;
    onLookupError: (error: unknown) => void | Promise<void>;
}

export function scheduleReaderAnkiStatusWarmup(options: ReaderAnkiStatusWarmupOptions): void {
    if (!shouldLookupAnkiStatus(options.getSettings())) return;
    const run = () => {
        if (options.isDestroyed() || !shouldLookupAnkiStatus(options.getSettings())) return;
        void warmStatusIndex(options).then(index => {
            if (!index || options.isDestroyed() || !shouldLookupAnkiStatus(options.getSettings())) return;
            recolorRenderedAnkiWordsFromCache(options);
        });
    };
    window.setTimeout(() => {
        if (options.isDestroyed() || !shouldLookupAnkiStatus(options.getSettings())) return;
        const requestIdle = (window as Window & {
            requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
        }).requestIdleCallback;
        if (typeof requestIdle === 'function') requestIdle(run, { timeout: ANKI_STATUS_WARMUP_IDLE_TIMEOUT_MS });
        else run();
    }, ANKI_STATUS_WARMUP_DELAY_MS);
}

export function scheduleReaderAnkiStatusRefresh(
    settings: ReaderSettings,
    refresh: () => void | Promise<void>,
): void {
    if (!shouldLookupAnkiStatus(settings)) return;
    window.setTimeout(() => {
        void refresh();
    }, 0);
}

function warmStatusIndex(options: ReaderAnkiStatusWarmupOptions): Promise<unknown | null> {
    const promise = options.warmStatusIndex();
    if (!options.onWarmupError) return promise;
    return promise.catch(error => {
        options.onWarmupError?.(error);
        return null;
    });
}

function recolorRenderedAnkiWordsFromCache(options: ReaderAnkiStatusWarmupOptions): void {
    if (!options.recolorRenderedAnkiWordsFromCache) return;
    const promise = options.recolorRenderedAnkiWordsFromCache();
    if (options.onRecolorError) void promise.catch(options.onRecolorError);
}

export async function refreshRenderedAnkiStatusAfterMutation(
    card: JPDBCard,
    options: RefreshRenderedAnkiStatusOptions,
): Promise<void> {
    if (options.isDestroyed() || !shouldLookupAnkiStatus(options.getSettings())) return;
    try {
        const lookup = await options.findExistingCards(card);
        if (options.isDestroyed() || !shouldLookupAnkiStatus(options.getSettings())) return;
        options.applyAnkiLookupToRenderedWords(card, lookup);
    } catch (error) {
        await options.onLookupError(error);
    }
}
