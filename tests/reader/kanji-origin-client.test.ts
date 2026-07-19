import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../src/reader/network/http', () => ({ requestText: request }));

const settings = {
    ...DEFAULT_SETTINGS,
    kanjiOriginsEnabled: true,
    kanjiOriginKanjiMapEnabled: true,
};

describe('KanjiOriginClient Kanji Alive glosses', () => {
    beforeEach(() => {
        vi.resetModules();
        request.mockReset();
    });

    it('uses the bounded origin request and retries the shared asset after a transient failure', async () => {
        let assetAttempts = 0;
        request.mockImplementation(async url => {
            if (url?.includes('kanji-alive-primary-glosses.json')) {
                assetAttempts += 1;
                if (assetAttempts === 1) throw new Error('temporary failure');
                return JSON.stringify({ meanings: { 読: 'read' } });
            }
            return '{}';
        });

        const { KanjiOriginClient } = await import('../../src/reader/kanji/origin');
        const client = new KanjiOriginClient();
        const first = await client.lookup('生', settings);
        expect(first?.kanjiAliveKeyword).toBeUndefined();
        await expect(client.lookup('読', settings)).resolves.toMatchObject({ kanjiAliveKeyword: 'read' });

        const assetCalls = request.mock.calls.filter(([url]) => url?.includes('kanji-alive-primary-glosses.json'));
        expect(assetCalls).toHaveLength(2);
        expect(assetCalls[0]?.[1]).toMatchObject({ timeoutMs: 10_000 });
        expect(assetCalls[1]?.[1]).toMatchObject({ timeoutMs: 10_000 });
    });
});
