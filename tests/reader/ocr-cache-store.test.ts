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
        const shards = [...gmValues.keys()].map(decodeURIComponent).filter(key => key.includes('ocr-cache') && !key.endsWith(':index'));
        expect(shards).toHaveLength(1);
        expect(shards[0]).not.toContain('manga.example');
    });

    it('caps a shard of Japanese answers at 64 KB of UTF-8, keeping the newest', async () => {
        const page = (index: number): OcrResult => ({
            width: 800, height: 1200,
            lines: Array.from({ length: 45 }, (_, line) => ({
                text: '日本語を読む'.repeat(12), box: { left: 10, top: line * 20, width: 300, height: 20 }, vertical: false,
            })).map((line, at) => (at ? line : { ...line, text: `${index}頁` })),
        });
        const keys = Array.from({ length: 36 }, (_, index) => `https://manga.example/${index}.png|800x1200`);
        persistOcrCacheSoon(new Map(keys.map((key, index) => [key, page(index)])), Date.now());
        flushPersistedOcrCache();
        await settled();

        const [stored] = [...gmValues.entries()]
            .filter(([key]) => decodeURIComponent(key).includes('ocr-cache:v3:') && !decodeURIComponent(key).endsWith(':index'))
            .map(([, value]) => (typeof value === 'string' ? value : JSON.stringify(value)));
        expect(new TextEncoder().encode(stored).byteLength).toBeLessThanOrEqual(64_000);
        const loaded = [...(await loadPersistedOcrCache(asIs)).keys()];
        expect(loaded.length).toBeGreaterThan(0);
        expect(loaded.at(-1)).toBe(keys.at(-1));
    });

    it('keeps one shard per site', async () => {
        await persistNow(new Map([['https://manga.example/p1.png|800x1200', result('一')]]));
        stubOrigin('https://other.example');
        expect((await loadPersistedOcrCache(asIs)).size).toBe(0);
        await persistNow(new Map([['https://other.example/p1.png|800x1200', result('二')]]));
        stubOrigin('https://manga.example');
        expect([...(await loadPersistedOcrCache(asIs)).keys()]).toEqual(['https://manga.example/p1.png|800x1200']);
    });

    it('reloads answers oldest first, so the next eviction drops the oldest', async () => {
        const keys = ['https://manga.example/1.png|1', 'https://manga.example/2.png|1', 'https://manga.example/3.png|1'];
        await persistNow(new Map(keys.map(key => [key, result(key)])));
        const loaded = await loadPersistedOcrCache(asIs);
        expect([...loaded.keys()]).toEqual(keys);
        // A second round trip keeps the same order.
        await persistNow(loaded);
        expect([...(await loadPersistedOcrCache(asIs)).keys()]).toEqual(keys);
    });

    it('keeps both sites in the index when two tabs flush at the same moment', async () => {
        // The GM claims that serialize tabs need the manager's value listing.
        vi.stubGlobal('GM_listValues', () => [...gmValues.keys()]);
        stubOrigin('https://first.example');
        persistOcrCacheSoon(new Map([['https://first.example/p.png|1', result('一')]]), 5_000);
        flushPersistedOcrCache();
        stubOrigin('https://second.example');
        persistOcrCacheSoon(new Map([['https://second.example/p.png|1', result('二')]]), 5_001);
        flushPersistedOcrCache();
        const indexed = () => {
            const indexKey = [...gmValues.keys()].find(key => decodeURIComponent(key).endsWith('ocr-cache:v3:index'));
            return Object.keys((indexKey && gmValues.get(indexKey)) ?? {});
        };
        await vi.waitFor(() => expect(indexed()).toHaveLength(2));
    });

    it('keeps the shards of the 20 sites read most recently', async () => {
        for (let site = 0; site < 22; site += 1) {
            stubOrigin(`https://site${site}.example`);
            persistOcrCacheSoon(new Map([[`https://site${site}.example/p.png|1`, result('読')]]), 10_000 + site);
            flushPersistedOcrCache();
            await settled();
        }
        const shardCount = [...gmValues.keys()].map(decodeURIComponent)
            .filter(key => key.includes('ocr-cache') && !key.endsWith(':index')).length;
        expect(shardCount).toBe(20);
        stubOrigin('https://site0.example');
        expect((await loadPersistedOcrCache(asIs)).size).toBe(0);
        stubOrigin('https://site21.example');
        expect((await loadPersistedOcrCache(asIs)).size).toBe(1);
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
        answers.remember('img|800x1200\n@yomu-target:ja', null, provider);
        expect(answers.get('img|800x1200\n@yomu-target:ja')).toBeNull();
        // Lens found nothing; that says nothing about the learner's own OCR server.
        provider = 'local-service';
        expect(answers.has('img|800x1200\n@yomu-target:ja')).toBe(false);
    });

    it.each([null, result('レンズ')])('keeps an in-flight answer under its starting provider: %j', async answer => {
        let provider = 'google-lens';
        const answers = new OcrAnswerCache(() => provider);
        await answers.ready();
        const scanProvider = provider;
        provider = 'local-service';
        answers.remember('https://manga.example/in-flight.png|800x1200', answer, scanProvider);
        expect(answers.has('https://manga.example/in-flight.png|800x1200')).toBe(false);
        provider = 'google-lens';
        expect(answers.get('https://manga.example/in-flight.png|800x1200')).toEqual(answer);
        flushPersistedOcrCache();
        await settled();
        const reloaded = new OcrAnswerCache(() => provider);
        await reloaded.ready();
        expect(reloaded.get('https://manga.example/in-flight.png|800x1200')).toEqual(answer ?? undefined);
        provider = 'local-service';
        expect(reloaded.has('https://manga.example/in-flight.png|800x1200')).toBe(false);
    });

    it('drops a remembered empty answer for a press, but keeps text', async () => {
        const answers = new OcrAnswerCache(() => 'google-lens');
        await answers.ready();
        answers.remember('empty', null, 'google-lens');
        answers.remember('text', result('読む'), 'google-lens');
        answers.forgetEmpty('empty');
        answers.forgetEmpty('text');
        expect(answers.has('empty')).toBe(false);
        expect(answers.get('text')?.lines[0].text).toBe('読む');
    });

    it('starts from the answers an earlier visit stored', async () => {
        const first = new OcrAnswerCache(() => 'google-lens');
        await first.ready();
        first.remember('https://manga.example/p1.png|800x1200', result('前回'), 'google-lens');
        flushPersistedOcrCache();
        await settled();

        const reloaded = new OcrAnswerCache(() => 'google-lens');
        await reloaded.ready();
        expect(reloaded.get('https://manga.example/p1.png|800x1200')?.lines[0].text).toBe('前回');
    });
});
