import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadPersistedOcrCache, persistOcrCacheSoon } from '../../src/reader/ocr/ocr-cache-store';
import type { OcrResult } from '../../src/reader/ocr/response-shared';

const result = (text: string): OcrResult => ({
    width: 800, height: 1200,
    lines: [{ text, box: { left: 10, top: 20, width: 300, height: 60 }, vertical: false }],
});

afterEach(() => { localStorage.clear(); vi.useRealTimers(); });

describe('persistent OCR cache (survives page refresh)', () => {
    it('round-trips recognized results (and empty results) to storage', () => {
        vi.useFakeTimers();
        const cache = new Map<string, OcrResult | null>([
            ['https://manga.example/p1.png|800x1200', result('日本語を読む')],
            ['https://manga.example/p2.png|800x1200', null],
        ]);
        persistOcrCacheSoon(cache, 1000);
        vi.advanceTimersByTime(1300);

        const loaded = loadPersistedOcrCache();
        expect(loaded.get('https://manga.example/p1.png|800x1200')?.lines[0].text).toBe('日本語を読む');
        // A remembered "no text" result is preserved so refresh doesn't re-OCR it.
        expect(loaded.has('https://manga.example/p2.png|800x1200')).toBe(true);
        expect(loaded.get('https://manga.example/p2.png|800x1200')).toBeNull();
    });

    it('never persists data: frame keys (paused-video / canvas snapshots)', () => {
        vi.useFakeTimers();
        const cache = new Map<string, OcrResult | null>([
            ['data:image/jpeg;base64,AAAA|960x540', result('frame')],
            ['https://manga.example/p1.png|800x1200', result('keep me')],
        ]);
        persistOcrCacheSoon(cache, 1000);
        vi.advanceTimersByTime(1300);

        const loaded = loadPersistedOcrCache();
        expect(loaded.size).toBe(1);
        expect([...loaded.keys()][0]).toBe('https://manga.example/p1.png|800x1200');
    });

    it('returns an empty map when nothing was persisted', () => {
        expect(loadPersistedOcrCache().size).toBe(0);
    });
});
