import { describe, expect, it, vi } from 'vitest';

import type { JPDBToken } from '../../src/reader/app/types';
import { NewTabTargetParseCache } from '../../src/reader/newtab/target-parse-cache';
import { NewTabLookupTargetScope } from '../../src/reader/newtab/target-scope';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import "../../src/reader/companions/register-build-companions";
import { afterEach } from "vitest";
import type { JPDBCard } from "../../src/reader/app/types";
import { NewTabRuntime } from "../../src/reader/newtab/runtime";

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

describe('New Tab lookup currency', () => {
    const CARD = { spelling: '猫', reading: 'ねこ', source: 'fallback' } as JPDBCard;

    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });


    it('resolves New Tab text lookups through the Japanese target', async () => {
        const showLookupCard = vi.fn();
        const runtime = new NewTabRuntime() as unknown as {
            lookupText(text: string): Promise<void>;
            lookupCard(term: string, reading: string, target: unknown): Promise<JPDBCard>;
            showLookupCard(...args: unknown[]): unknown;
            destroy(): void;
        };
        runtime.lookupCard = vi.fn(async () => CARD);
        runtime.showLookupCard = showLookupCard;

        await runtime.lookupText('猫');

        expect(runtime.lookupCard).toHaveBeenCalledWith('猫', '猫', expect.objectContaining({
            target: expect.objectContaining({ language: 'ja' }),
        }));
        expect(showLookupCard).toHaveBeenCalledWith(CARD, '猫', undefined, expect.objectContaining({
            previousNavigationEntry: undefined,
        }));
        runtime.destroy();
    });

    it('lets only the newest connected lookup render paint', () => {
        const runtime = new NewTabRuntime() as unknown as {
            activeLookupPopover?: HTMLElement;
            nextLookupRenderRequest(): number;
            isCurrentLookupRender(popover: HTMLElement, requestId: number): boolean;
            destroy(): void;
        };
        const lookup = document.createElement('section');
        document.body.append(lookup);
        runtime.activeLookupPopover = lookup;

        const first = runtime.nextLookupRenderRequest();
        expect(runtime.isCurrentLookupRender(lookup, first)).toBe(true);

        const second = runtime.nextLookupRenderRequest();
        expect(runtime.isCurrentLookupRender(lookup, first)).toBe(false);
        expect(runtime.isCurrentLookupRender(lookup, second)).toBe(true);

        lookup.remove();
        expect(runtime.isCurrentLookupRender(lookup, second)).toBe(false);
        runtime.destroy();
    });
});
