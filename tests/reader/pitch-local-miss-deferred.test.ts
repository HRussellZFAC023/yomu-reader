import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import { setRenderedWordCardIdentity } from '../../src/reader/dom/rendered-word-state';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import type { PitchEnrichmentOptions } from '../../src/reader/app/main-helpers';

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
    app.settings = { ...DEFAULT_SETTINGS, showPitchAccent: true, ...overrides };
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
