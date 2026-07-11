// ADR-0003: tests exercise core + companions together, like the
// self-contained build; populate the companion registry up front.
import '../../src/reader/companions/register-build-companions';
import { afterAll, afterEach, beforeEach, vi } from 'vitest';
import { applyPreferredJapaneseSiteLanguage } from '../../src/reader/app/preferred-site-language';

if (typeof document !== 'undefined' && !document.elementFromPoint) {
    document.elementFromPoint = () => null;
}

// Do NOT blanket-stub matchMedia here: the codebase feature-detects its absence
// (e.g. review-controls advertises keyboard hints when matchMedia is missing),
// so a global always-false stub silently flips those keyboard-first paths.

// A BroadcastChannel leaked past its test file can receive the next file's
// postMessage from a different jsdom realm inside the same reused fork; Node's
// dispatch then rejects the cross-realm MessageEvent (ERR_INVALID_ARG_TYPE) as
// an unhandled error attributed to whichever file happens to be running.
// Track every channel a file opens and force-close the leftovers at file end.
const NativeBroadcastChannel = globalThis.BroadcastChannel;
if (typeof NativeBroadcastChannel === 'function') {
    const openChannels = new Set<BroadcastChannel>();
    globalThis.BroadcastChannel = class extends NativeBroadcastChannel {
        constructor(name: string) {
            super(name);
            openChannels.add(this);
        }

        close(): void {
            openChannels.delete(this);
            super.close();
        }
    } as typeof BroadcastChannel;
    afterAll(() => {
        for (const channel of openChannels) {
            try {
                channel.close();
            } catch {
                // Already closed by the runtime; only the leak matters here.
            }
        }
        openChannels.clear();
    });
}


const TEST_LANGUAGE = 'en-US';
const TEST_LANGUAGES = ['en-US', 'en'] as const;
const PREFERRED_SITE_LANGUAGE_CACHE_KEY = 'yomu:prefer-japanese-site-language';
const OCR_CACHE_STORE_KEYS = ['yomu-ocr-cache-v1', 'yomu-ocr-cache-v2'] as const;
let mediaMethodRestorers: Array<() => void> = [];

// The OCR controller hydrates its result cache from localStorage at construction
// and persists on a 1200ms debounce. Stubbed test canvases all share one pixel
// signature, so a flush from an earlier test short-circuits a later test's scan
// (recognizeImage never fires) — only on runners slow enough for the debounce to
// elapse mid-file, which is why it surfaced as a loaded-CI-only release flake.
function resetPersistedOcrCache(): void {
    try {
        for (const key of OCR_CACHE_STORE_KEYS) localStorage.removeItem(key);
    } catch {
        // jsdom storage may be unavailable in a few isolated setup failures.
    }
}

function resetPreferredSiteLanguage(): void {
    applyPreferredJapaneseSiteLanguage(false);
    try {
        localStorage.removeItem(PREFERRED_SITE_LANGUAGE_CACHE_KEY);
    } catch {
        // jsdom storage may be unavailable in a few isolated setup failures.
    }
}

function setDefaultNavigatorLanguage(): void {
    const navigatorObject = globalThis.navigator;
    if (!navigatorObject) return;
    defineNavigatorLanguage(navigatorObject);
    defineNavigatorLanguage(Object.getPrototypeOf(navigatorObject));
}

function defineNavigatorLanguage(target: object | null): void {
    if (!target) return;
    Object.defineProperty(target, 'language', {
        configurable: true,
        get: () => TEST_LANGUAGE,
    });
    Object.defineProperty(target, 'languages', {
        configurable: true,
        get: () => TEST_LANGUAGES.slice(),
    });
}

function resetLocaleState(): void {
    resetPreferredSiteLanguage();
    setDefaultNavigatorLanguage();
}

function stubJsdomMediaElementMethods(): void {
    if (typeof HTMLMediaElement === 'undefined') return;
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    mediaMethodRestorers = [
        () => playSpy.mockRestore(),
        () => pauseSpy.mockRestore(),
        () => loadSpy.mockRestore(),
    ];
}

function restoreJsdomMediaElementMethods(): void {
    for (const restore of mediaMethodRestorers) restore();
    mediaMethodRestorers = [];
}

beforeEach(() => {
    resetLocaleState();
    resetPersistedOcrCache();
    stubJsdomMediaElementMethods();
    vi.stubGlobal('GM_xmlhttpRequest', undefined);
    vi.stubGlobal('GM', undefined);
});

afterEach(() => {
    resetLocaleState();
    resetPersistedOcrCache();
    restoreJsdomMediaElementMethods();
    // Stop a test that left fake timers (or stubbed globals) on from leaking into
    // the next one, which otherwise surfaces as flaky failures in unrelated tests.
    vi.useRealTimers();
});
