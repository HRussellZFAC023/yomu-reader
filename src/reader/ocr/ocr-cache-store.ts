// Persistent OCR answers. The controller keeps provider answers in memory
// (ocr-scan-outcome.ts); this module mirrors the ones with text to Yomu's own
// GM/extension storage so a page refresh re-renders recognized text without
// another provider request.
//
// The store is private: image URLs and recognized text never go into the page's
// own localStorage, where every script on the site could read them. It is
// sharded per origin under a key that names no site, and each shard is capped
// by entry count and serialized size so iOS userscript managers, whose GM
// storage is one message round trip per value, keep a small value per site.
// Only answers with text are kept. An empty answer is remembered for the page
// visit only, and a failed scan is never remembered at all.
import { managedStateWritesSuppressed } from '../app/managed-state-registry';
import { gmPrivateStorageGet, gmPrivateStorageSet, managedLocalStorage } from '../app/storage';
import { sensitiveFingerprint } from '../core/sensitive-fingerprint';
import type { OcrResult } from './response-shared';

const OCR_CACHE_SHARD_PREFIX = 'yomu:private:ocr-cache:v3:';
// Earlier releases kept one cache in the host page's localStorage.
const LEGACY_PAGE_KEY = 'yomu-ocr-cache-v2';
const LEGACY_PAGE_KEYS = ['yomu-ocr-cache-v1', LEGACY_PAGE_KEY] as const;
const MAX_ENTRIES = 36;
const MAX_SHARD_BYTES = 256_000;
const PERSIST_DELAY_MS = 1200;

interface StoredEntry { r: OcrResult; at: number }
type StoredShard = Record<string, StoredEntry>;

function shardKey(): string {
    return `${OCR_CACHE_SHARD_PREFIX}${sensitiveFingerprint(location.origin)}`;
}

function isPersistableKey(key: string): boolean {
    return !key.startsWith('data:') && !key.startsWith('blob:');
}

function hasLines(result: OcrResult | null | undefined): result is OcrResult {
    return Boolean(result?.lines?.length);
}

/**
 * This origin's remembered answers, oldest first. The first load after an
 * upgrade moves the old page-storage cache in (answers with text only, under
 * `legacyKey`) and deletes it from the page.
 */
export async function loadPersistedOcrCache(legacyKey: (key: string) => string): Promise<Map<string, OcrResult>> {
    const map = new Map<string, OcrResult>();
    let stored: StoredShard = {};
    try {
        stored = await gmPrivateStorageGet<StoredShard>(shardKey(), {}) ?? {};
    } catch {
        // Without private storage the cache lasts for this page visit.
    }
    const legacy = takeLegacyPageCache();
    const migrated = Object.entries(legacy).map(([key, entry]) => [legacyKey(key), entry] as const);
    const entries = [...Object.entries(stored), ...migrated]
        .filter(([key, entry]) => isPersistableKey(key) && hasLines(entry?.r))
        .sort((a, b) => (a[1].at ?? 0) - (b[1].at ?? 0));
    for (const [key, entry] of entries) map.set(key, entry.r);
    if (migrated.some(([, entry]) => hasLines(entry?.r))) persistOcrCacheSoon(map, Date.now());
    return map;
}

function takeLegacyPageCache(): StoredShard {
    let legacy: StoredShard = {};
    try {
        const raw = managedLocalStorage.getItem(LEGACY_PAGE_KEY);
        if (raw) legacy = JSON.parse(raw) as StoredShard;
    } catch {
        // Unreadable or corrupt: there is nothing worth moving.
    }
    for (const key of LEGACY_PAGE_KEYS) {
        try {
            managedLocalStorage.removeItem(key);
        } catch {
            // Storage barrier not passed or storage blocked; the next load retries.
        }
    }
    return legacy && typeof legacy === 'object' ? legacy : {};
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;
let pendingCache: ReadonlyMap<string, OcrResult | null> | undefined;
let pendingNow = 0;
let flushListenersInstalled = false;

/** Schedule a write of the cache to storage; coalesces bursts of answers. */
export function persistOcrCacheSoon(cache: ReadonlyMap<string, OcrResult | null>, now: number): void {
    installFlushListeners();
    pendingCache = cache;
    pendingNow = now;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        flushPersistedOcrCache();
    }, PERSIST_DELAY_MS);
}

export function flushPersistedOcrCache(): void {
    if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = undefined;
    }
    const cache = pendingCache;
    if (!cache) return;
    const now = pendingNow || Date.now();
    pendingCache = undefined;
    pendingNow = 0;
    void writeOcrCache(cache, now);
}

// Test-only: cancel any pending debounced write and clear the install-once
// flag so the pagehide/visibilitychange flush listeners re-attach to each test
// file's fresh jsdom window under Vitest fork reuse (isolate:false).
export function resetOcrCacheStoreForTests(): void {
    if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = undefined;
    }
    pendingCache = undefined;
    pendingNow = 0;
    flushListenersInstalled = false;
}

function installFlushListeners(): void {
    if (flushListenersInstalled) return;
    flushListenersInstalled = true;
    try {
        if (typeof window !== 'undefined') {
            window.addEventListener('pagehide', flushPersistedOcrCache, { capture: true });
        }
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') flushPersistedOcrCache();
            }, { capture: true });
        }
    } catch {
        // Event listener setup is best-effort; the debounce timer still persists.
    }
}

/** Newest answers with text first, capped by count and bytes. */
function ocrCacheShard(cache: ReadonlyMap<string, OcrResult | null>, now: number): StoredShard {
    const out: StoredShard = {};
    let bytes = 0;
    let count = 0;
    for (const key of [...cache.keys()].reverse()) {
        const result = cache.get(key);
        if (!isPersistableKey(key) || !hasLines(result)) continue;
        bytes += key.length + JSON.stringify(result).length + 24;
        if (bytes > MAX_SHARD_BYTES || count >= MAX_ENTRIES) break;
        out[key] = { r: result, at: now };
        count += 1;
    }
    return out;
}

async function writeOcrCache(cache: ReadonlyMap<string, OcrResult | null>, now: number): Promise<void> {
    // A factory-reset reload fires pagehide/visibilitychange; a flush here would
    // re-create the just-cleared shard.
    if (managedStateWritesSuppressed()) return;
    try {
        await gmPrivateStorageSet(shardKey(), ocrCacheShard(cache, now));
    } catch {
        // No private storage, quota or reset in progress: best-effort, never throw into OCR.
    }
}
