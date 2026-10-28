import { describe, expect, it, vi } from 'vitest';

import { assertPopupNestedParseOverlap } from '../../scripts/lib/popup-nested-parse-probe.mjs';

function pageFixture() {
    const page = { on: vi.fn(), off: vi.fn(), evaluate: vi.fn() };
    return page;
}

function healthySnapshot() {
    return {
        initialLoadingId: 'owned-ticket', overlapLoadingId: 'owned-ticket',
        pendingRequests: 1, requests: [['桜の本を読む'], ['毎朝桜を読む']],
        localWords: ['桜', '本', '読む'], providerWords: ['毎朝', '桜', '読む'],
        targetExpression: '桜',
    };
}

// Contract tests for the QA harness itself (page.evaluate is mocked). They
// guard the probe against false greens; the Reader fix is proven by
// popup-japanese-parse-lifecycle.test.ts and the built-browser QA case.
describe('popup overlap browser probe', () => {
    it('checks the native snapshot and removes its scoped error listener', async () => {
        const page = pageFixture();
        page.evaluate.mockResolvedValue(healthySnapshot());

        await expect(assertPopupNestedParseOverlap(page)).resolves.toBeUndefined();
        expect(page.off).toHaveBeenCalledWith('pageerror', page.on.mock.calls[0]?.[1]);
    });

    it.each([
        [{ initialLoadingId: undefined }, 'Generic parse must own'],
        [{ overlapLoadingId: 'stolen-ticket' }, 'Provider commit stole'],
        [{ pendingRequests: 2 }, 'Provider parse started'],
        [{ requests: [] }, 'Each parse plan must run'],
        [{ localWords: [] }, 'Local definition lost'],
        [{ providerWords: [] }, 'Provider example lost'],
        [{ targetExpression: undefined }, 'Provider target mark was lost'],
        [{ loadingKey: 'still-loading' }, 'Completed parse kept a loading key'],
        [{ loadingId: 'still-loading' }, 'Completed parse kept a loading ID'],
    ])('rejects a broken native invariant: %s', async (invalid, message) => {
        const page = pageFixture();
        page.evaluate.mockResolvedValue({ ...healthySnapshot(), ...invalid });

        await expect(assertPopupNestedParseOverlap(page)).rejects.toThrow(message);
        expect(page.off).toHaveBeenCalledWith('pageerror', page.on.mock.calls[0]?.[1]);
    });

    it('does not report a green snapshot when the probe raises a browser error', async () => {
        const page = pageFixture();
        page.evaluate.mockImplementation(async () => {
            page.on.mock.calls[0]?.[1](new Error('broken parser contract'));
            return { overlapProtected: true };
        });

        await expect(assertPopupNestedParseOverlap(page)).rejects.toThrow('broken parser contract');
        expect(page.off).toHaveBeenCalledWith('pageerror', page.on.mock.calls[0]?.[1]);
    });

    it('fails on a browser error raised by enrichment after its snapshot', async () => {
        const page = pageFixture();
        page.evaluate
            .mockResolvedValueOnce(healthySnapshot())
            .mockImplementationOnce(async () => { page.on.mock.calls[0]?.[1](new Error('late enrichment failure')); });

        await expect(assertPopupNestedParseOverlap(page)).rejects.toThrow('late enrichment failure');
        expect(page.off).toHaveBeenCalledWith('pageerror', page.on.mock.calls[0]?.[1]);
    });

    it('preserves native evaluation failures and still removes its error listener', async () => {
        const page = pageFixture();
        page.evaluate.mockRejectedValue(new Error('No installed Reader popup'));

        await expect(assertPopupNestedParseOverlap(page)).rejects.toThrow('No installed Reader popup');
        expect(page.off).toHaveBeenCalledWith('pageerror', page.on.mock.calls[0]?.[1]);
    });
});
