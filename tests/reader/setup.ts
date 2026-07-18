// ADR-0003: tests exercise core + companions together, like the
// self-contained build; populate the companion registry up front.
import '../../src/reader/companions/register-build-companions';
import { afterAll, afterEach, beforeEach, vi } from 'vitest';
import { applyPreferredJapaneseSiteLanguage } from '../../src/reader/app/preferred-site-language';
import { resetMediaActivationForTests } from '../../src/reader/audio/media-activation';
import { resetOcrCacheStoreForTests } from '../../src/reader/ocr/ocr-cache-store';
import { recaptureInitialWindowMethodsForTests } from '../../src/reader/platform/window-events';

// Under fork reuse (isolate:false), module/global state can outlive a file even
// as Vitest prepares the next jsdom realm. Tests that replace window.location
// without restoring it can therefore surface later as "reading 'hostname' of
// undefined" in suites that never touched location. Snapshot the pristine
// descriptor and restore it before each test. (vi.unstubAllGlobals only covers
// vi.stubGlobal.)
const pristineLocationDescriptor = typeof window !== 'undefined'
    ? Object.getOwnPropertyDescriptor(window, 'location')
    : undefined;

function restorePristineLocation(): void {
    if (!pristineLocationDescriptor || typeof window === 'undefined') return;
    const current = Object.getOwnPropertyDescriptor(window, 'location');
    if (current && current.value === pristineLocationDescriptor.value
        && current.get === pristineLocationDescriptor.get) return;
    try {
        Object.defineProperty(window, 'location', pristineLocationDescriptor);
    } catch {
        // A non-reconfigurable override from a prior test can't be restored;
        // that test is responsible for its own cleanup.
    }
}

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
    resetOcrCacheStoreForTests();
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
    // Define the getters on the navigator OBJECT only, never on Navigator.prototype.
    // Under fork reuse (isolate:false) vitest recreates the jsdom environment per
    // file; a getter-only `languages` left on the shared prototype makes the next
    // environment's `new Navigator` throw "Cannot set property languages" during
    // setup (127 unhandled errors → non-zero exit even with all tests passing).
    // A fresh navigator object per environment does not inherit the stale getter.
    defineNavigatorLanguage(navigatorObject);
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

// Unit tests must stay hermetic: the reader's built-in public-proxy fallback
// gives keyless cross-origin lookups REAL fetch candidates (edge.yomureader.com),
// so an unstubbed fetch in jsdom would hit the live proxy and leak network
// nondeterminism (and load) into the suite. Fail remote requests the way a down
// network would; tests that need fetch behavior stub it themselves (their stub
// is applied after this beforeEach and wins for that test).
const nativeFetch = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undefined;
const REMOTE_URL_RE = /^https?:\/\//i;
const LOCAL_URL_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i;

function hermeticFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (REMOTE_URL_RE.test(url) && !LOCAL_URL_RE.test(url)) {
        return Promise.reject(new TypeError(`fetch blocked in unit tests: ${url}`));
    }
    if (!nativeFetch) return Promise.reject(new TypeError('fetch unavailable'));
    return nativeFetch(input as RequestInfo, init);
}

beforeEach(() => {
    // Clear any global stubbed by a prior test (location, navigator, fetch, …)
    // before re-establishing our own. Under fork reuse (isolate:false) a leaked
    // vi.stubGlobal('location', …) otherwise bleeds across files and surfaces as
    // "Cannot read properties of undefined (reading 'hostname')" in unrelated
    // suites. This is the fork-reuse equivalent of Vitest's unstubGlobals.
    vi.unstubAllGlobals();
    restorePristineLocation();
    // Re-read pristine window methods and clear the sticky media-activation flag
    // from the current jsdom realm before any test runs, so a prior file's leaked
    // capture/flag under fork reuse (isolate:false) can't bleed into this test.
    recaptureInitialWindowMethodsForTests();
    resetMediaActivationForTests();
    resetLocaleState();
    resetPersistedOcrCache();
    stubJsdomMediaElementMethods();
    vi.stubGlobal('GM_xmlhttpRequest', undefined);
    vi.stubGlobal('GM', undefined);
    vi.stubGlobal('fetch', hermeticFetch);
});

afterEach(() => {
    resetLocaleState();
    resetPersistedOcrCache();
    restoreJsdomMediaElementMethods();
    // Stop a test that left fake timers (or stubbed globals) on from leaking into
    // the next one, which otherwise surfaces as flaky failures in unrelated tests.
    vi.useRealTimers();
});
