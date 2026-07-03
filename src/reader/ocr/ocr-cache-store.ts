// Persistent OCR result cache. The controller keeps an in-memory Map of OCR
// results keyed by image (src + natural size); this module mirrors that Map to
// localStorage so a page refresh re-renders recognized text instantly instead of
// re-running every recognizer request. Keyed by the same stable image key, so it
// only persists stable-`src` images (manga reader pages, article images) — not
// data: frames (paused-video / canvas snapshots), which the controller already
// excludes. Bounded by entry count and serialized byte size so it can't grow the
// origin's storage without limit.
import { managedStateWritesSuppressed } from '../app/managed-state-registry';
import type { OcrResult } from './response-shared';

const STORE_KEY = 'yomu-ocr-cache-v1';
const MAX_ENTRIES = 300;
const MAX_BYTES = 1_500_000;
const PERSIST_DELAY_MS = 1200;

interface StoredEntry { r: OcrResult | null; at: number }

function storage(): Storage | null {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
        return null; // localStorage can throw in sandboxed/3rd-party contexts
    }
}

function isPersistableOcrCacheKey(key: string): boolean {
    return !key.startsWith('data:') && !key.startsWith('blob:');
}

function isPersistableOcrCacheEntry(key: string, result: OcrResult | null): boolean {
    if (!isPersistableOcrCacheKey(key)) return false;
    if (result === null && (key.startsWith('cv:') || key.startsWith('src:'))) return false;
    return true;
}

/** Hydrate the controller's in-memory cache from a previous session. */
export function loadPersistedOcrCache(): Map<string, OcrResult | null> {
    const map = new Map<string, OcrResult | null>();
    const store = storage();
    if (!store) return map;
    try {
        const raw = store.getItem(STORE_KEY);
        if (!raw) return map;
        const parsed = JSON.parse(raw) as Record<string, StoredEntry>;
        // Oldest first so Map insertion order tracks recency (newest last) — the
        // controller's own eviction keeps the freshest entries.
        for (const [key, entry] of Object.entries(parsed).sort((a, b) => (a[1]?.at ?? 0) - (b[1]?.at ?? 0))) {
            const result = entry?.r ?? null;
            if (!isPersistableOcrCacheEntry(key, result)) continue;
            map.set(key, result);
        }
    } catch {
        // Corrupt cache — drop it rather than block OCR.
        try { store.removeItem(STORE_KEY); } catch { /* ignore */ }
    }
    return map;
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;
let pendingCache: Map<string, OcrResult | null> | undefined;
let pendingNow = 0;
let flushListenersInstalled = false;

/** Schedule a write of the cache to storage; coalesces bursts of remember() calls. */
export function persistOcrCacheSoon(cache: Map<string, OcrResult | null>, now: number): void {
    if (!storage()) return;
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
    writeOcrCache(cache, now);
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

function writeOcrCache(cache: Map<string, OcrResult | null>, now: number): void {
    // A factory-reset reload fires pagehide/visibilitychange; a flush here would
    // re-create the just-cleared OCR cache key.
    if (managedStateWritesSuppressed()) return;
    const store = storage();
    if (!store) return;
    try {
        // Newest entries first (Map preserves insertion order), capped by count and
        // total bytes so the cache stays small even after long reading sessions.
        const keys = [...cache.keys()].filter(isPersistableOcrCacheKey).reverse().slice(0, MAX_ENTRIES);
        const out: Record<string, StoredEntry> = {};
        let bytes = 0;
        for (const key of keys) {
            const result = cache.get(key) ?? null;
            if (!isPersistableOcrCacheEntry(key, result)) continue;
            const serialized = JSON.stringify(result);
            bytes += key.length + serialized.length + 24;
            if (bytes > MAX_BYTES) break;
            out[key] = { r: result, at: now };
        }
        store.setItem(STORE_KEY, JSON.stringify(out));
    } catch {
        // Quota exceeded / disabled — best-effort, never throw into OCR.
    }
}
