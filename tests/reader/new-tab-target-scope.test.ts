import { describe, expect, it, vi } from 'vitest';

import type { JPDBToken } from '../../src/reader/app/types';
import { NewTabTargetParseCache } from '../../src/reader/newtab/target-parse-cache';
import { NewTabLookupTargetScope } from '../../src/reader/newtab/target-scope';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

describe('New Tab target scope modules', () => {
    it('lets only the latest lookup render paint, and none after an invalidation', () => {
        const scope = new NewTabLookupTargetScope();
        const first = scope.nextRender();
        expect(scope.isCurrentRender(first)).toBe(true);
        expect(scope.currentRenderRequest()).toBe(first);

        const second = scope.nextRender();
        expect(scope.isCurrentRender(first)).toBe(false);
        expect(scope.isCurrentRender(second)).toBe(true);

        scope.invalidateRender();
        expect(scope.isCurrentRender(second)).toBe(false);
        expect(scope.currentRenderRequest()).not.toBe(second);
    });

    it('reuses parsed cards for the same text', async () => {
        const parse = vi.fn(async (): Promise<JPDBToken[][]> => []);
        const cache = new NewTabTargetParseCache({
            getSettings: () => DEFAULT_SETTINGS,
            parse,
            defaultTimeoutMs: 1_200,
            ttlMs: 30_000,
            limit: 10,
        });

        await cache.load(['同じ']);
        await cache.load(['同じ']);

        expect(parse).toHaveBeenCalledTimes(1);
    });
});
