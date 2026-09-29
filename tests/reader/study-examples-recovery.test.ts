import { afterEach, describe, expect, it, vi } from 'vitest';
import * as http from '../../src/reader/network/http';
import { ImmersionKitClient } from '../../src/reader/immersion/kit';
import { StudyExamples } from '../../src/reader/newtab/study-examples';
import { DEFAULT_SETTINGS, newTabTestCard } from './new-tab-review/fixtures';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

describe('Study examples transport recovery', () => {
    it('keeps usable partial results separate from a complete empty response', async () => {
        let now = 100_000; vi.spyOn(Date, 'now').mockImplementation(() => now);
        const transport = vi.spyOn(http, 'requestJson').mockImplementation(async url => {
            if (String(url).includes('nadeshiko')) throw new Error('Temporary Nadeshiko failure');
            return { examples: [{ id: 'one', sentence: '私は中学生です。' }] };
        });
        const client = new ImmersionKitClient();
        const settings = { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitExampleSource: 'combined' as const,
            nadeshikoApiKey: 'test-key', immersionKitMinLength: 0 };
        const partial = await client.searchResult('中学生', settings);
        expect(partial.status).toBe('partial'); expect(partial.examples).toHaveLength(1);
        const firstCalls = transport.mock.calls.length;
        await client.searchResult('中学生', settings); expect(transport).toHaveBeenCalledTimes(firstCalls);
        now += 1_001;
        transport.mockResolvedValue({ examples: [] });
        expect(await client.searchResult('中学生', settings)).toEqual({ examples: [], status: 'complete' });
        expect(transport.mock.calls.length).toBeGreaterThan(firstCalls);
    });

    it('retains client rate-limit backoff while allowing a later successful retry', async () => {
        let now = 100_000; vi.spyOn(Date, 'now').mockImplementation(() => now);
        const transport = vi.spyOn(http, 'requestJson').mockRejectedValue(new Error('Immersion Kit failed (429)'));
        const client = new ImmersionKitClient();
        const settings = { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitExampleSource: 'immersion-kit' as const, immersionKitMinLength: 0 };
        await expect(client.searchResult('中学生', settings)).rejects.toThrow(/429/);
        const failedCalls = transport.mock.calls.length;
        now += 500; await expect(client.searchResult('中学生', settings)).rejects.toThrow();
        expect(transport).toHaveBeenCalledTimes(failedCalls);
        now += 1_001; transport.mockResolvedValue({ examples: [{ sentence: '私は中学生です。' }] });
        expect((await client.searchResult('中学生', settings)).examples).toHaveLength(1);
        expect(transport.mock.calls.length).toBeGreaterThan(failedCalls);
    });

    it('retries the same card after a transient transport failure across both cache layers', async () => {
        const transport = vi.spyOn(http, 'requestJson').mockRejectedValue(new Error('Temporary network failure'));
        const client = new ImmersionKitClient();
        const settings = { ...DEFAULT_SETTINGS,
            immersionKitEnabled: true, immersionKitExampleSource: 'immersion-kit',
            immersionKitMinLength: 0, jpdbDefinitionsEnabled: false, immersionKitShowImages: false,
        } as typeof DEFAULT_SETTINGS;
        const examples = new StudyExamples({ getSettings: () => settings, immersionKit: client,
            parser: { canParse: () => false } as never,
            sentences: { peek: () => undefined, prepare: async () => [], enrich: async () => false, highlight() {} },
        });
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const mount = document.createElement('div');
        mount.dataset.newtabMeaning = 'true';
        document.body.append(mount);
        try {
            examples.present({ mount, card, mode: 'word', revealed: true });
            expect(await examples.examples(card)).toEqual([]);
            const failedRequests = transport.mock.calls.length;
            expect(failedRequests).toBeGreaterThan(0);
            transport.mockResolvedValue({ examples: [{ id: 'recovered', sentence: '私は中学生です。', translation: 'I am a middle school student.' }] });
            window.dispatchEvent(new Event('online'));
            await vi.waitFor(() => expect(mount.querySelector('.jpdb-reader-newtab-immersion')?.textContent).toContain('私は中学生です。'));
            expect(transport.mock.calls.length).toBeGreaterThan(failedRequests);
        } finally { examples.dispose(); }
    });
});
