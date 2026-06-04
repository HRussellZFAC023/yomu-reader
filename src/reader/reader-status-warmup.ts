import { shouldLookupAnkiStatus } from './settings';
import type { ReaderSettings } from './types';

const ANKI_STATUS_WARMUP_DELAY_MS = 1_000;
const ANKI_STATUS_WARMUP_IDLE_TIMEOUT_MS = 5_000;

export interface ReaderAnkiStatusWarmupOptions {
    getSettings: () => ReaderSettings;
    isDestroyed: () => boolean;
    onRecolorError: (error: unknown) => void;
    recolorRenderedAnkiWordsFromCache: () => Promise<unknown>;
    warmStatusIndex: () => Promise<unknown | null>;
}

export function scheduleReaderAnkiStatusWarmup(options: ReaderAnkiStatusWarmupOptions): void {
    if (!shouldLookupAnkiStatus(options.getSettings())) return;
    const run = () => {
        if (options.isDestroyed() || !shouldLookupAnkiStatus(options.getSettings())) return;
        void options.warmStatusIndex().then(index => {
            if (!index || options.isDestroyed() || !shouldLookupAnkiStatus(options.getSettings())) return;
            void options.recolorRenderedAnkiWordsFromCache().catch(options.onRecolorError);
        });
    };
    window.setTimeout(() => {
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
