import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flushPersistedOcrCache, loadPersistedOcrCache, persistOcrCacheSoon } from '../../src/reader/ocr/ocr-cache-store';
import { OcrAnswerCache } from '../../src/reader/ocr/ocr-scan-outcome';
import type { OcrResult } from '../../src/reader/ocr/response-shared';
import { ensureManagedWebStorageCurrent, managedLocalStorage } from '../../src/reader/app/storage';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';

const result = (text: string): OcrResult => ({
    width: 800, height: 1200,
    lines: [{ text, box: { left: 10, top: 20, width: 300, height: 60 }, vertical: false }],
});
const asIs = (key: string) => key;
// GM writes go through an async epoch check before they land.
const settled = async () => {
    for (let turn = 0; turn < 8; turn += 1) await new Promise(resolve => setTimeout(resolve, 0));
};

let gmValues: Map<string, unknown>;

function stubOrigin(origin: string): void {
    const url = new URL(origin);
    vi.stubGlobal('location', { hostname: url.hostname, href: `${origin}/reader`, origin, protocol: url.protocol });
}

async function persistNow(cache: Map<string, OcrResult | null>): Promise<void> {
    persistOcrCacheSoon(cache, 1000);
    flushPersistedOcrCache();
    await settled();
}

function pageKeysContaining(text: string): string[] {
    return [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter(key => key.includes(text));
}

beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await ensureManagedWebStorageCurrent();
    gmValues = installGmStorageFixture().values;
    stubOrigin('https://manga.example');
});

afterEach(() => {
    flushPersistedOcrCache();
    localStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('persistent OCR answers (survive a page refresh)', () => {
    it('keeps answers with text in Yomu\'s private storage, never in the page\'s', async () => {
        await persistNow(new Map<string, OcrResult | null>([
            ['https://manga.example/p1.png|800x1200', result('日本語を読む')],
            ['https://manga.example/p2.png|800x1200', null],
            ['cv:bookwalker-text:255:16:1846x2625', result('ページ移動方向')],
        ]));

        const loaded = await loadPersistedOcrCache(asIs);
        expect(loaded.get('https://manga.example/p1.png|800x1200')?.lines[0].text).toBe('日本語を読む');
        expect(loaded.get('cv:bookwalker-text:255:16:1846x2625')?.lines[0].text).toBe('ページ移動方向');
        // An empty answer lasts for the page visit only: a reload asks again.
        expect(loaded.has('https://manga.example/p2.png|800x1200')).toBe(false);
        // The site's own scripts cannot read which images were read, or their text.
        expect(pageKeysContaining('ocr-cache')).toEqual([]);
        const shards = [...gmValues.keys()].map(decodeURIComponent).filter(key => key.includes('ocr-cache'));
        expect(shards).toHaveLength(1);
        expect(shards[0]).not.toContain('manga.example');
    });

    it('keeps one shard per site', async () => {
        await persistNow(new Map([['https://manga.example/p1.png|800x1200', result('一')]]));
        stubOrigin('https://other.example');
        expect((await loadPersistedOcrCache(asIs)).size).toBe(0);
        await persistNow(new Map([['https://other.example/p1.png|800x1200', result('二')]]));
        stubOrigin('https://manga.example');
        expect([...(await loadPersistedOcrCache(asIs)).keys()]).toEqual(['https://manga.example/p1.png|800x1200']);
    });

    it('moves the old page-storage cache in once, keeping only answers with text', async () => {
        managedLocalStorage.setItem('yomu-ocr-cache-v2', JSON.stringify({
            'https://manga.example/good.png|800x1200': { r: result('良い'), at: 1000 },
            // 2.1.x stored a failed Lens call as "no text" for good.
            'https://manga.example/poisoned.png|800x1200': { r: null, at: 1001 },
        }));
        managedLocalStorage.setItem('yomu-ocr-cache-v1', JSON.stringify({ stale: { r: result('古い'), at: 1 } }));

        const loaded = await loadPersistedOcrCache(key => `${key}\n@ocr-provider:google-lens`);

        expect([...loaded.keys()]).toEqual(['https://manga.example/good.png|800x1200\n@ocr-provider:google-lens']);
        expect(managedLocalStorage.getItem('yomu-ocr-cache-v2')).toBeNull();
        expect(managedLocalStorage.getItem('yomu-ocr-cache-v1')).toBeNull();
        flushPersistedOcrCache();
        await settled();
        expect((await loadPersistedOcrCache(asIs)).has('https://manga.example/good.png|800x1200\n@ocr-provider:google-lens')).toBe(true);
    });

    it('never persists transient data: or blob: frame keys', async () => {
        await persistNow(new Map<string, OcrResult | null>([
            ['data:image/jpeg;base64,AAAA|960x540', result('frame')],
            ['blob:https://reader.mokuro.app/page-6|800x1200', result('blob')],
            ['https://manga.example/p1.png|800x1200', result('keep me')],
        ]));

        expect([...(await loadPersistedOcrCache(asIs)).keys()]).toEqual(['https://manga.example/p1.png|800x1200']);
    });

    it('flushes pending writes on pagehide so quick refreshes keep their answers', async () => {
        const key = 'https://manga.example/p3.png|800x1200';
        persistOcrCacheSoon(new Map([[key, result('読む')]]), 2000);

        window.dispatchEvent(new Event('pagehide'));
        await settled();

        expect((await loadPersistedOcrCache(asIs)).get(key)?.lines[0].text).toBe('読む');
    });

    it('returns an empty map when nothing was persisted', async () => {
        expect((await loadPersistedOcrCache(asIs)).size).toBe(0);
    });
});

describe('OCR answers in memory', () => {
    it('keeps each provider\'s answers apart', async () => {
        let provider = 'google-lens';
        const answers = new OcrAnswerCache(() => provider);
        await answers.ready();
        answers.remember('img|800x1200\n@yomu-target:ja', null);
        expect(answers.get('img|800x1200\n@yomu-target:ja')).toBeNull();
        // Lens found nothing; that says nothing about the learner's own OCR server.
        provider = 'local-service';
        expect(answers.has('img|800x1200\n@yomu-target:ja')).toBe(false);
    });

    it('drops a remembered empty answer for a press, but keeps text', async () => {
        const answers = new OcrAnswerCache(() => 'google-lens');
        await answers.ready();
        answers.remember('empty', null);
        answers.remember('text', result('読む'));
        answers.forgetEmpty('empty');
        answers.forgetEmpty('text');
        expect(answers.has('empty')).toBe(false);
        expect(answers.get('text')?.lines[0].text).toBe('読む');
    });

    it('starts from the answers an earlier visit stored', async () => {
        const first = new OcrAnswerCache(() => 'google-lens');
        await first.ready();
        first.remember('https://manga.example/p1.png|800x1200', result('前回'));
        flushPersistedOcrCache();
        await settled();

        const reloaded = new OcrAnswerCache(() => 'google-lens');
        await reloaded.ready();
        expect(reloaded.get('https://manga.example/p1.png|800x1200')?.lines[0].text).toBe('前回');
    });
});
