// ADR-0003: tests exercise core + companions together, like the
// self-contained build; populate the companion registry up front.
import '../../src/reader/companions/register-build-companions';
import { afterAll, afterEach, beforeEach, vi } from 'vitest';
import { applyPreferredJapaneseSiteLanguage } from '../../src/reader/app/preferred-site-language-impl';
import { resetMediaActivationForTests } from '../../src/reader/audio/media-activation';
import { resetOcrCacheStoreForTests } from '../../src/reader/ocr/ocr-cache-store';
import { recaptureInitialWindowMethodsForTests } from '../../src/reader/platform/window-events';
import {
    MANAGED_STATE_EPOCH_KEY,
    resetManagedStateEpochSessionsForTests,
} from '../../src/reader/app/managed-state-epoch';
import {
    MANAGED_STATE_SLOT_KEY_PREFIX,
    MANAGED_WEB_STORAGE_SLOT_KEY_PREFIX,
} from '../../src/reader/app/managed-storage-keys';
import { resetManagedWebStorageForTests } from '../../src/reader/app/managed-web-storage';
import { allowSyntheticReaderInteractionsForTests } from '../../src/reader/ui/trusted-interaction';
import {
    MANAGED_STATE_EPOCH_LEASE_KEY_PREFIX,
    STORAGE_LEASE_KEY_PREFIX,
} from '../../src/reader/app/gm-storage-lease';

// Historical isolate:false runs allowed module/global state to cross file and
// jsdom boundaries. They exposed location overrides that later surfaced as
// "reading 'hostname' of undefined". Snapshot the pristine descriptor and keep
// each case self-contained even though the release runner now isolates files.
// (vi.unstubAllGlobals only covers vi.stubGlobal.)
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

// Historical non-isolated runs proved that a leaked BroadcastChannel can reject
// a later cross-realm MessageEvent (ERR_INVALID_ARG_TYPE). Track every channel a
// file opens and force-close leftovers; this remains correct case ownership.
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
const MANAGED_WEB_STORAGE_EPOCH_KEYS = new Set([
    'yomu:web-storage-epoch:v1:local',
    'yomu:web-storage-epoch:v1:session',
    'yomu:local-storage-provenance:v1',
]);
const MANAGED_EPOCH_CONTROL_PREFIXES = [
    MANAGED_STATE_SLOT_KEY_PREFIX,
    MANAGED_WEB_STORAGE_SLOT_KEY_PREFIX,
    MANAGED_STATE_EPOCH_LEASE_KEY_PREFIX,
    STORAGE_LEASE_KEY_PREFIX,
] as const;
let mediaMethodRestorers: Array<() => void> = [];

// Every Vitest case models a fresh browser realm unless it explicitly builds
// several realms inside that case. Fork reuse keeps jsdom storage alive across
// files, so an epoch committed by one reset test otherwise makes the next
// legacy fixture look stale even after its in-memory session was reset.
function resetPersistedManagedEpochForTests(): void {
    for (const area of ['localStorage', 'sessionStorage'] as const) {
        try {
            const storage = globalThis[area];
            const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
                .filter((key): key is string => key !== null);
            for (const key of keys) {
                if (key === MANAGED_STATE_EPOCH_KEY
                    || MANAGED_WEB_STORAGE_EPOCH_KEYS.has(key)
                    || MANAGED_EPOCH_CONTROL_PREFIXES.some(prefix => key.startsWith(prefix))) {
                    storage.removeItem(key);
                }
            }
        } catch {
            // A few failure-path tests intentionally replace Storage. Their
            // own assertions cover that backend; the next beforeEach retries
            // against the pristine jsdom areas after unstubbing globals.
        }
    }
}

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
    // Historical non-isolated runs showed that a getter-only `languages` on the
    // shared prototype can make a replacement environment's `new Navigator`
    // throw during setup. Defining it on the current object is self-contained.
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
    // Clear any global stubbed by a prior case (location, navigator, fetch, …)
    // before re-establishing our own. This also preserves the cleanup learned
    // from historical non-isolated runs.
    vi.unstubAllGlobals();
    allowSyntheticReaderInteractionsForTests(true);
    if (typeof document !== 'undefined' && document.documentElement) delete document.documentElement.dataset.yomuHosted;
    resetPersistedManagedEpochForTests();
    resetManagedStateEpochSessionsForTests();
    resetManagedWebStorageForTests();
    restorePristineLocation();
    // Re-read pristine window methods and clear the sticky media-activation flag
    // before each case so no earlier capture or flag can bleed into this test.
    recaptureInitialWindowMethodsForTests();
    resetMediaActivationForTests();
    resetLocaleState();
    resetPersistedOcrCache();
    // Locale cleanup can touch the storage facade with the preceding test's
    // backend. Clear that capture last so each test starts as a fresh realm.
    resetManagedStateEpochSessionsForTests();
    resetManagedWebStorageForTests();
    stubJsdomMediaElementMethods();
    vi.stubGlobal('GM_xmlhttpRequest', undefined);
    vi.stubGlobal('GM', undefined);
    vi.stubGlobal('fetch', hermeticFetch);
});

afterEach(() => {
    allowSyntheticReaderInteractionsForTests(false);
    if (typeof document !== 'undefined' && document.documentElement) delete document.documentElement.dataset.yomuHosted;
    resetManagedStateEpochSessionsForTests();
    resetManagedWebStorageForTests();
    resetLocaleState();
    resetPersistedOcrCache();
    resetManagedStateEpochSessionsForTests();
    resetManagedWebStorageForTests();
    restoreJsdomMediaElementMethods();
    // Stop a test that left fake timers (or stubbed globals) on from leaking into
    // the next one, which otherwise surfaces as flaky failures in unrelated tests.
    vi.useRealTimers();
});
