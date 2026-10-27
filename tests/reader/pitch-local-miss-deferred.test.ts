import { registerYomuCompanion, yomuLocalDictionaries } from '../../src/reader/companions/registry';
import '../../src/reader/companions/register-build-companions';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import { setRenderedWordCardIdentity } from '../../src/reader/dom/rendered-word-state';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import type { PitchEnrichmentOptions } from '../../src/reader/app/main-helpers';
import { boundedPublicPitchLookupReservation, pitchEnrichmentPriority } from "../../src/reader/lookup/text-helpers";
import { LOCAL_PITCH_ENRICHMENT_CONCURRENCY, PITCH_ENRICHMENT_LIMIT } from "../../src/reader/app/main-helpers";

interface AppInternals {
    settings: ReaderSettings;
    dictionaries: { hasPitchMetaDictionaries?: () => Promise<boolean> };
    enrichPitchWords(tokens: JPDBToken[], options?: PitchEnrichmentOptions): Promise<void>;
    enrichPitchToken(token: JPDBToken, options?: unknown): Promise<void>;
    scheduleDeferredPublicPitchEnrichment(tokens: JPDBToken[]): void;
    queueDeferredPublicPitchTokens(tokens: JPDBToken[]): void;
    drainDeferredPublicPitchQueue(): Promise<void>;
    deferredPublicPitchQueue: JPDBToken[];
    waitForIdle(timeoutMs?: number): Promise<void>;
    jpdbPublicPitch: { lookup: (spelling: string, reading: string) => Promise<string[]> };
    toast(message: string): void;
}

function makeApp(overrides: Partial<ReaderSettings> = {}): AppInternals {
    const app = new ReaderApp() as unknown as AppInternals;
    // The underline paints pitch: without a pitch channel the paced lane
    // fetches no jpdb.io pitch at all (enrichment-policy.ts).
    app.settings = { ...DEFAULT_SETTINGS, showPitchAccent: true, wordUnderlineColorSource: 'pitch', ...overrides };
    app.toast = vi.fn();
    return app;
}

function withLocalPitchDictionary(app: AppInternals): void {
    app.settings.localDictionariesEnabled = true;
    app.dictionaries = { hasPitchMetaDictionaries: async () => true };
}

function card(vid: number, spelling: string, reading: string, pitchAccent: string[] = [], source: JPDBCard['source'] = 'jpdb'): JPDBCard {
    return {
        vid, sid: vid, rid: 0, spelling, reading, frequencyRank: null,
        partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent, wordWithReading: null, source,
    };
}

function token(wordCard: JPDBCard): JPDBToken {
    return {
        card: wordCard,
        start: 0, end: wordCard.spelling.length, length: wordCard.spelling.length,
        rubies: [], pitchClass: '', sentence: wordCard.spelling,
    };
}

afterEach(() => {
    document.body.innerHTML = '';
});

// Class F: with a local pitch dictionary installed (the 1.6.0+ default), the
// at-rest pass was forced local-ONLY and silently dropped every word the
// local bank missed — pitch appeared only after a click. Local must mean
// local-FIRST: misses feed the paced deferred public jpdb.io lane (bounded:
// per-URL cap, dedupe, idle-gated chunks, client TTL cache + backoff) on ALL
// surfaces, and resolved pitch repaints the rendered words.
describe('local pitch misses feed the deferred public lane (class F)', () => {
    it('schedules the deferred public retry for words the local bank missed', async () => {
        const app = makeApp();
        withLocalPitchDictionary(app);
        app.enrichPitchToken = vi.fn(async () => undefined); // local bank misses
        const scheduled = vi.fn();
        app.scheduleDeferredPublicPitchEnrichment = scheduled;

        const miss = token(card(1, '財源', 'ざいげん'));
        await app.enrichPitchWords([miss], { publicLookupLimit: 10 });

        expect(scheduled).toHaveBeenCalledTimes(1);
        expect(scheduled.mock.calls[0][0]).toEqual([miss]);
    });

    it('respects a caller that explicitly demanded no public lookups', async () => {
        const app = makeApp();
        withLocalPitchDictionary(app);
        app.enrichPitchToken = vi.fn(async () => undefined);
        const scheduled = vi.fn();
        app.scheduleDeferredPublicPitchEnrichment = scheduled;

        await app.enrichPitchWords([token(card(2, '財源', 'ざいげん'))], { publicLookup: false });

        expect(scheduled).not.toHaveBeenCalled();
    });

    it('does not defer words the local bank actually resolved', async () => {
        const app = makeApp();
        withLocalPitchDictionary(app);
        // "Local hit": the enrichment pass fills a contextual pattern.
        app.enrichPitchToken = vi.fn(async (t: JPDBToken) => {
            t.card.pitchAccent = ['LHHHH'];
        });
        const scheduled = vi.fn();
        app.scheduleDeferredPublicPitchEnrichment = scheduled;

        await app.enrichPitchWords([token(card(3, '財源', 'ざいげん'))], { publicLookupLimit: 10 });

        expect(scheduled).not.toHaveBeenCalled();
    });

    it('treats non-fitting stored patterns as un-enriched (classifiability, not pattern presence)', async () => {
        const app = makeApp();
        withLocalPitchDictionary(app);
        const enriched = vi.fn(async (_token: JPDBToken) => undefined);
        app.enrichPitchToken = enriched;
        app.scheduleDeferredPublicPitchEnrichment = vi.fn();

        // 'HL' (a shorter base form's atamadaka) cannot classify the 4-mora
        // contextual reading ざいげん: permanently "unknown" under the old
        // pitchAccent.length filter.
        const unfitting = token(card(4, '財源', 'ざいげん', ['HL']));
        // 'LHHHH' fits ざいげん — legitimately classified, never re-enriched.
        const fitting = token(card(5, '財源', 'ざいげん', ['LHHHH']));
        await app.enrichPitchWords([unfitting, fitting], { publicLookupLimit: 10 });

        const enrichedVids = enriched.mock.calls.map(call => call[0].card.vid);
        expect(enrichedVids).toContain(4);
        expect(enrichedVids).not.toContain(5);
    });

    it('drains the deferred lane with PUBLIC lookups and repaints the rendered word', async () => {
        const app = makeApp({ localDictionariesEnabled: false });
        app.waitForIdle = async () => undefined;
        app.jpdbPublicPitch = { lookup: vi.fn(async () => ['LHHH']) };
        const miss = token(card(6, '財源', 'ざいげん'));
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-pitch-unknown';
        word.dataset.pitchClass = 'unknown';
        word.textContent = miss.card.spelling;
        setRenderedWordCardIdentity(word, miss.card);
        document.body.append(word);
        app.queueDeferredPublicPitchTokens([miss]);
        expect(app.deferredPublicPitchQueue).toHaveLength(1);
        await app.drainDeferredPublicPitchQueue();

        expect(app.jpdbPublicPitch.lookup).toHaveBeenCalled();
        expect(word.dataset.pitchClass).toBeTruthy();
        expect(word.dataset.pitchClass).not.toBe('unknown');
        expect(Array.from(word.classList).some(name => name.startsWith('jpdb-pitch-') && name !== 'jpdb-pitch-unknown')).toBe(true);
        // The repaint must carry the resolved pattern too — a class with no
        // data-pitch-accent left popups and the underline disagreeing.
        expect(word.dataset.pitchAccent).toBe('LHHH');
    });

    it('fetches no jpdb.io pitch for a parsed word when no colour channel paints pitch', async () => {
        const app = makeApp({ localDictionariesEnabled: false, wordUnderlineColorSource: 'status' });
        app.waitForIdle = async () => undefined;
        app.jpdbPublicPitch = { lookup: vi.fn(async () => ['LHHH']) };

        app.scheduleDeferredPublicPitchEnrichment([token(card(8, '財源', 'ざいげん'))]);
        await app.drainDeferredPublicPitchQueue();

        expect(app.deferredPublicPitchQueue).toHaveLength(0);
        expect(app.jpdbPublicPitch.lookup).not.toHaveBeenCalled();
    });

    it('drains the deferred lane publicly even when a local dictionary is installed (the class-F no-op)', async () => {
        const app = makeApp();
        withLocalPitchDictionary(app);
        app.waitForIdle = async () => undefined;
        app.jpdbPublicPitch = { lookup: vi.fn(async () => ['LHHH']) };

        const miss = token(card(7, '財源', 'ざいげん'));
        app.queueDeferredPublicPitchTokens([miss]);
        await app.drainDeferredPublicPitchQueue();

        // Before the fix the drain re-entered enrichPitchWords without an
        // explicit publicLookup, the local-dictionary override forced it
        // offline again, and the lane never issued the public retry.
        expect(app.jpdbPublicPitch.lookup).toHaveBeenCalled();
    });
});

describe('bounded page annotation enrichment', () => {
    function token(source: JPDBCard['source'], reading: string): JPDBToken {
        return {
            card: {
                vid: 1,
                sid: 1,
                rid: 0,
                spelling: '語',
                reading,
                frequencyRank: null,
                partOfSpeech: [],
                meanings: [],
                cardState: ['not-in-deck'],
                pitchAccent: [],
                wordWithReading: reading ? `語[${reading}]` : null,
                source,
            },
            start: 0,
            end: 1,
            length: 1,
            rubies: [],
            pitchClass: '',
            sentence: '語',
        };
    }


    it('completes reading-less spans before cards that already have readable evidence', () => {
        const readableFallback = token('fallback', 'ご');
        const readableJiten = token('jiten', 'ご');
        const bareJiten = token('jiten', '');

        expect([readableJiten, readableFallback, bareJiten]
            .sort((left, right) => pitchEnrichmentPriority(left) - pitchEnrichmentPriority(right)))
            .toEqual([bareJiten, readableFallback, readableJiten]);
    });

    it('reserves only candidates present in a small scan batch', () => {
        expect(boundedPublicPitchLookupReservation(3, 24, 24)).toBe(3);
        expect(boundedPublicPitchLookupReservation(40, 24, 24)).toBe(24);
        expect(boundedPublicPitchLookupReservation(10, 4, 8)).toBe(8);
    });
});

describe('background local pitch reads', () => {
    // Mark the real fixture store, just as the extension client marks its reads.

    interface AppInternals {
        settings: ReaderSettings;
        enrichPitchWords(tokens: JPDBToken[], options?: PitchEnrichmentOptions): Promise<void>;
        enrichPitchToken(token: JPDBToken, options?: unknown): Promise<void>;
        scheduleDeferredPublicPitchEnrichment(tokens: JPDBToken[]): void;
        waitForIdle(timeoutMs?: number): Promise<void>;
    }

    const WORDS = Array.from({ length: 20 }, (_, index) => `語彙${index}`);

    function makeApp(coalescesReads: boolean): AppInternals {
        const companion = yomuLocalDictionaries()!;
        registerYomuCompanion('localDictionaries', {
            ...companion,
            createLocalDictionaryStore(...args) {
                const store = companion.createLocalDictionaryStore(...args);
                Object.defineProperty(store, 'coalescesReads', { value: coalescesReads });
                return store;
            },
        });
        let app: AppInternals;
        try {
            // Read concurrency is captured while ReaderApp constructs its store.
            app = new ReaderApp() as unknown as AppInternals;
        } finally {
            registerYomuCompanion('localDictionaries', companion);
        }
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
