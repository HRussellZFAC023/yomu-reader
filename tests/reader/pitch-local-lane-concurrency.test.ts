import { describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import { LOCAL_PITCH_ENRICHMENT_CONCURRENCY, PITCH_ENRICHMENT_LIMIT, type PitchEnrichmentOptions } from '../../src/reader/app/main-helpers';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';

// The extension's store client marks itself `coalescesReads` (ADR-0023). The
// fixture store keeps its real methods and only gains that mark.
const reader = vi.hoisted(() => ({ coalescesReads: false }));
vi.mock('../../src/reader/dictionaries/local-store', async importOriginal => {
    const actual = await importOriginal<typeof import('../../src/reader/dictionaries/local-store')>();
    return {
        ...actual,
        createReaderDictionaryStore: (...args: Parameters<typeof actual.createReaderDictionaryStore>) => {
            const store = actual.createReaderDictionaryStore(...args);
            if (reader.coalescesReads) Object.defineProperty(store, 'coalescesReads', { value: true });
            return store;
        },
    };
});

interface AppInternals {
    settings: ReaderSettings;
    enrichPitchWords(tokens: JPDBToken[], options?: PitchEnrichmentOptions): Promise<void>;
    enrichPitchToken(token: JPDBToken, options?: unknown): Promise<void>;
    scheduleDeferredPublicPitchEnrichment(tokens: JPDBToken[]): void;
    waitForIdle(timeoutMs?: number): Promise<void>;
}

const WORDS = Array.from({ length: 20 }, (_, index) => `語彙${index}`);

function makeApp(coalescesReads: boolean): AppInternals {
    reader.coalescesReads = coalescesReads;
    const app = new ReaderApp() as unknown as AppInternals;
    app.settings = { ...DEFAULT_SETTINGS, showPitchAccent: true };
    app.scheduleDeferredPublicPitchEnrichment = vi.fn();
    app.waitForIdle = async () => undefined;
    return app;
}

function token(vid: number, spelling: string): JPDBToken {
    const card: JPDBCard = {
        vid, sid: vid, rid: 0, spelling, reading: 'ごい', frequencyRank: null,
        partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
    };
    return { card, start: 0, end: spelling.length, length: spelling.length, rubies: [], pitchClass: '', sentence: spelling };
}

/** Holds each local pitch read open, and returns the most that were open at once. */
async function peakLocalPitchReads(app: AppInternals, options: PitchEnrichmentOptions): Promise<number> {
    let open = 0;
    let peak = 0;
    const held: Array<() => void> = [];
    app.enrichPitchToken = vi.fn(async () => {
        open += 1;
        peak = Math.max(peak, open);
        await new Promise<void>(resolve => held.push(resolve));
        open -= 1;
    });
    let done = false;
    const enriching = app.enrichPitchWords(WORDS.map((word, index) => token(index + 1, word)), options)
        .finally(() => { done = true; });
    for (let turn = 0; !done && turn < 200; turn++) {
        await new Promise(resolve => setTimeout(resolve, 0));
        held.splice(0).forEach(release => release());
    }
    await enriching;
    expect(app.enrichPitchToken).toHaveBeenCalledTimes(WORDS.length);
    return peak;
}

describe('background local pitch reads', () => {
    it('go out together to a store that coalesces reads', async () => {
        // The budget-denied lane: every word is local-only.
        expect(await peakLocalPitchReads(makeApp(true), { publicLookupLimit: 0 })).toBe(WORDS.length);
        // The idle-paced lane: one chunk at a time, the whole chunk at once.
        expect(await peakLocalPitchReads(makeApp(true), { publicLookup: false })).toBe(PITCH_ENRICHMENT_LIMIT);
    });

    it('stay 8 at a time against a store in the page realm', async () => {
        expect(await peakLocalPitchReads(makeApp(false), { publicLookupLimit: 0 })).toBe(LOCAL_PITCH_ENRICHMENT_CONCURRENCY);
        expect(await peakLocalPitchReads(makeApp(false), { publicLookup: false })).toBe(LOCAL_PITCH_ENRICHMENT_CONCURRENCY);
    });
});
