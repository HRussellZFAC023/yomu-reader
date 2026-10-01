import type { JpdbKanjiClient } from '../jpdb/jpdb-kanji';
import type { KanjiVGClient } from '../kanji/vg';
import type { RtkClient } from '../kanji/rtk';

// Study's stand-ins while the Kanji/Study companion is not loaded: kanji
// lookups find nothing, and a JPDB kanji action says why it cannot run.

export function createNoopJpdbKanjiClient(): JpdbKanjiClient {
    return {
        lookup: () => Promise.resolve(null),
        performAction: () => Promise.reject(new Error('Yomu Kanji/Study companion is missing.')),
    } as unknown as JpdbKanjiClient;
}

export function createNoopKanjiVGClient(): KanjiVGClient {
    return {
        lookup: () => Promise.resolve(null),
    } as unknown as KanjiVGClient;
}

export function createNoopRtkClient(): RtkClient {
    return {
        lookup: () => Promise.resolve(null),
    } as unknown as RtkClient;
}

export function noopKanjiPracticeDoodle(): { reassess: () => void; clear: () => void } {
    const noop = (): void => undefined;
    return { reassess: noop, clear: noop };
}
