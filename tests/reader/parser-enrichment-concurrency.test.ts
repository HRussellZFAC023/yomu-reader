import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { ReaderParser } from '../../src/reader/lookup/parser';

// Keyless (no API key) local-dictionary parsing enriches each match with pitch
// (lookupTermMeta) and per-kanji readings (lookupKanji) from IndexedDB. The
// subtitle warmup parses several cues at once, each fanning out over many
// matches; without a shared gate that was thousands of concurrent IndexedDB
// requests at cold start, starving the main thread. This pins that the
// enrichment fan-out is bounded across concurrent parses.
describe('keyless local-dictionary enrichment concurrency', () => {
    function makeMatches(prefix: string, count: number) {
        return Array.from({ length: count }, (_, i) => ({
            entry: {
                expression: `${prefix}語${i}`,
                reading: `ご${i}`,
                glossary: ['word'],
                dictionary: 'JMdict',
            },
            start: i,
            end: i + 1,
            surface: `${prefix}語${i}`,
            deinflected: false,
        }));
    }

    it('caps concurrent IndexedDB enrichment lookups across many parallel cue parses', async () => {
        let active = 0;
        let maxActive = 0;
        // Release one synchronous launch wave per microtask. This is independent
        // of inherited fake clocks, while an unbounded fan-out still reaches 60.
        let releaseScheduled = false;
        const pending: Array<() => void> = [];
        const lookupTermMeta = vi.fn(async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise<void>(resolve => {
                pending.push(resolve);
                if (releaseScheduled) return;
                releaseScheduled = true;
                queueMicrotask(() => {
                    releaseScheduled = false;
                    pending.splice(0).forEach(release => release());
                });
            });
            active--;
            return [] as never[];
        });
        const findTermMatches = vi.fn(async (text: string) => makeMatches(text.slice(0, 2), 10));

        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: true,
                showPitchAccent: true,
            }),
            jpdb: {} as never,
            dictionaries: { findTermMatches, lookupTermMeta } as never,
        });

        // 6 distinct cues parsed concurrently, each 10 matches → 60 enrichment
        // tasks launched at once. The shared gate must keep in-flight IndexedDB
        // lookups bounded well below that.
        const cues = ['あい', 'うえ', 'おか', 'きく', 'けこ', 'さし'];
        await Promise.all(cues.map(text => parser.parse([`${text}文章`], {
            includeLocalPitch: true,
            allowSegmentedFallback: true,
        })));

        expect(lookupTermMeta).toHaveBeenCalled();
        expect(maxActive).toBeGreaterThan(0);
        // The ConcurrencyGate limit is 12; allow headroom but it must be far
        // below the unbounded 60 the old Promise.all fan-out produced.
        expect(maxActive).toBeLessThanOrEqual(12);
    });
});
