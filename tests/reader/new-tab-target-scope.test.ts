import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JPDBToken } from '../../src/reader/app/types';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/target-runtime';
import { NewTabTargetParseCache } from '../../src/reader/newtab/target-parse-cache';
import { NewTabLookupTargetScope } from '../../src/reader/newtab/target-scope';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

beforeEach(() => resetActiveLearningTargetLanguage());
afterEach(() => resetActiveLearningTargetLanguage());

describe('New Tab target scope modules', () => {
    it('keeps an away-and-back target switch outside the previous render epoch', () => {
        const scope = new NewTabLookupTargetScope();
        const request = scope.nextRender();
        expect(scope.isCurrentRender(request)).toBe(true);

        setActiveLearningTargetLanguage('ko');
        setActiveLearningTargetLanguage('ja');

        expect(scope.isCurrentRender(request)).toBe(false);
    });

    it('does not reuse parsed cards across target generations', async () => {
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

        setActiveLearningTargetLanguage('ko');
        setActiveLearningTargetLanguage('ja');
        await cache.load(['同じ']);

        expect(parse).toHaveBeenCalledTimes(2);
    });
});
