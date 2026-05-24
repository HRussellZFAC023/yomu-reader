import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBToken } from '../../src/reader/types';
import { VisiblePageScanner } from '../../src/reader/visible-page-scanner';

describe('VisiblePageScanner', () => {
    it('parses large page scans in batches so the first targets can render sooner', async () => {
        const originalRect = HTMLElement.prototype.getBoundingClientRect;
        HTMLElement.prototype.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            width: 100,
            height: 20,
            top: 0,
            right: 100,
            bottom: 20,
            left: 0,
            toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = Array.from({ length: 170 }, (_, index) => `<p>日本語の文${index}</p>`).join('');
        const parseJapanese = vi.fn(async (paragraphs: string[], _options?: unknown) => paragraphs.map(() => [] as JPDBToken[]));
        const pauseMutationObserver = vi.fn(callback => callback());
        const scanner = new VisiblePageScanner({
            getSettings: () => DEFAULT_SETTINGS,
            parseJapanese,
            pauseMutationObserver,
            preloadParsedTokens: vi.fn(),
            preloadImmersionTokens: vi.fn(),
            enrichPitchWords: vi.fn(),
            enrichAnkiWords: vi.fn(),
            toast: vi.fn(),
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            expect(parseJapanese.mock.calls.map(call => call[0])).toHaveLength(3);
            expect(parseJapanese.mock.calls[0]?.[0]).toHaveLength(80);
            expect(parseJapanese.mock.calls[1]?.[0]).toHaveLength(80);
            expect(parseJapanese.mock.calls[2]?.[0]).toHaveLength(10);
            expect(parseJapanese.mock.calls[0]?.[1]).toEqual({ jpdbTimeoutMs: 1200, includeLocalPitch: true });
            expect(pauseMutationObserver).toHaveBeenCalledTimes(11);
        } finally {
            HTMLElement.prototype.getBoundingClientRect = originalRect;
            document.body.innerHTML = '';
        }
    });
});
