import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JPDBCard } from '../../src/reader/app/types';
import { NewTabRuntime } from '../../src/reader/newtab/runtime';

const CARD = { spelling: '猫', reading: 'ねこ', source: 'fallback' } as JPDBCard;

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('New Tab lookup currency', () => {
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
