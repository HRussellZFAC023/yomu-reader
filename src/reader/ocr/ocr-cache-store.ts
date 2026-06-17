// Persistent OCR result cache. The controller keeps an in-memory Map of OCR
// results keyed by image (src + natural size); this module mirrors that Map to
// localStorage so a page refresh re-renders recognized text instantly instead of
// re-running every recognizer request. Keyed by the same stable image key, so it
// only persists stable-`src` images (manga reader pages, article images) — not
// data: frames (paused-video / canvas snapshots), which the controller already
// excludes. Bounded by entry count and serialized byte size so it can't grow the
// origin's storage without limit.
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
            if (key.startsWith('data:')) continue;
            map.set(key, entry?.r ?? null);
        }
    } catch {
        // Corrupt cache — drop it rather than block OCR.
        try { store.removeItem(STORE_KEY); } catch { /* ignore */ }
    }
    return map;
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;

/** Schedule a write of the cache to storage; coalesces bursts of remember() calls. */
export function persistOcrCacheSoon(cache: Map<string, OcrResult | null>, now: number): void {
    if (!storage()) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        persistTimer = undefined;
        writeOcrCache(cache, now);
    }, PERSIST_DELAY_MS);
}

function writeOcrCache(cache: Map<string, OcrResult | null>, now: number): void {
    const store = storage();
    if (!store) return;
    try {
        // Newest entries first (Map preserves insertion order), capped by count and
        // total bytes so the cache stays small even after long reading sessions.
        const keys = [...cache.keys()].filter(key => !key.startsWith('data:')).reverse().slice(0, MAX_ENTRIES);
        const out: Record<string, StoredEntry> = {};
        let bytes = 0;
        for (const key of keys) {
            const result = cache.get(key) ?? null;
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
