import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObjectUrlCache } from '../../src/reader/core/object-url-cache';

describe('ObjectUrlCache lifecycle', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('expires a cached URL after the page window has been torn down', async () => {
        vi.useFakeTimers();
        const revoke = vi.fn();
        const cache = new ObjectUrlCache(60_000, revoke);
        const createUrl = vi.fn()
            .mockResolvedValueOnce('blob:first')
            .mockResolvedValueOnce('blob:second');

        await expect(cache.getOrCreate('audio', createUrl)).resolves.toBe('blob:first');
        vi.stubGlobal('window', undefined);
        vi.advanceTimersByTime(60_000);

        expect(revoke).toHaveBeenCalledOnce();
        expect(revoke).toHaveBeenCalledWith('blob:first');
        await expect(cache.getOrCreate('audio', createUrl)).resolves.toBe('blob:second');
        expect(createUrl).toHaveBeenCalledTimes(2);
    });
});
