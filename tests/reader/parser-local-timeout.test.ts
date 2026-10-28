import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { ReaderParser } from '../../src/reader/lookup/parser';

// The remote JPDB/Jiten parse paths were time-bounded, but the local
// (IndexedDB-backed) path was not. On iPad WebKit an IndexedDB request can
// silently never fire onsuccess/onerror, which left parse() pending forever and
// stranded every caller (study translation, hover lookups, body decoration) on
// a loading placeholder. parse() must always settle.
describe('ReaderParser local parse never hangs', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('degrades to the segmented parse when a local dictionary lookup never settles', async () => {
        vi.useFakeTimers();
        const findTermMatches = vi.fn(() => new Promise(() => undefined)); // never settles
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                parserProvider: 'local',
                localDictionariesEnabled: true,
                yomuLocalSrsEnabled: false,
            }),
            jpdb: {} as never,
            dictionaries: { findTermMatches, hasTermDictionaries: async () => true } as never,
        });

        const parsePromise = parser.parse(['r/mildlyinfuriating 5 時間前'], { allowSegmentedFallback: true });
        let settled = false;
        void parsePromise.then(() => { settled = true; }, () => { settled = true; });

        // Without a local timeout this stays pending forever — prove it is still
        // pending before the ceiling, then that it settles once the ceiling and
        // the reconciliation ceiling elapse.
        await vi.advanceTimersByTimeAsync(2_000);
        expect(settled).toBe(false);

        await vi.advanceTimersByTimeAsync(30_000);
        expect(settled).toBe(true);

        const result = await parsePromise;
        expect(result).toHaveLength(1);
        expect(Array.isArray(result[0])).toBe(true);
    });

    it('settles even when the local SRS card-state lookup never returns', async () => {
        vi.useFakeTimers();
        const findTermMatches = vi.fn(async () => [{
            entry: { expression: '日本語', reading: 'にほんご', glossary: ['Japanese'], dictionary: 'JMdict' },
            start: 0,
            end: 3,
            surface: '日本語',
            deinflected: true,
        }]);
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                parserProvider: 'local',
                localDictionariesEnabled: true,
                yomuLocalSrsEnabled: true,
                includeLocalPitch: false,
            }),
            jpdb: {} as never,
            dictionaries: {
                findTermMatches,
                hasTermDictionaries: async () => true,
                lookupTermMeta: async () => [],
                lookupKanji: async () => [],
            } as never,
            // The SRS card-state read is the LAST IndexedDB touch in parse();
            // a stalled lookupCards must not re-hang the whole pipeline.
            yomuLocalSrs: { lookupCards: () => new Promise(() => undefined) } as never,
        });

        const parsePromise = parser.parse(['日本語'], { includeLocalPitch: false, allowSegmentedFallback: true });
        let settled = false;
        void parsePromise.then(() => { settled = true; }, () => { settled = true; });

        await vi.advanceTimersByTimeAsync(2_000);
        expect(settled).toBe(false);

        await vi.advanceTimersByTimeAsync(30_000);
        expect(settled).toBe(true);

        const result = await parsePromise;
        expect(result).toHaveLength(1);
    });
});
