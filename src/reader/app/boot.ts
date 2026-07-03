import { appendToDocumentHead } from '../dom/index';
import { ReaderApp } from './main';
import { addWindowEventListener, createWindowCustomEvent, dispatchWindowEvent } from '../platform/window-events';

type YomuRuntimeKind = 'page' | 'dev' | 'userscript' | 'extension';

type YomuBootWindow = typeof window & {
    __yomuReaderAppInitialized?: boolean;
    __yomuRealApp?: ReaderApp;
    __yomuRuntimeKind?: YomuRuntimeKind;
    __yomuRuntimeOwnerId?: string;
    __yomuDevRuntime?: boolean;
};

interface ActiveRuntime {
    app: ReaderApp;
    isRealRuntime: boolean;
    kind: YomuRuntimeKind;
    ownerId: string;
}

const RUNTIME_MARKER_ID = 'jpdb-reader-runtime-owner';
const RUNTIME_MARKER_OBSERVER_OPTIONS: MutationObserverInit = {
    attributes: true,
    attributeFilter: ['data-yomu-runtime-kind', 'data-yomu-runtime-owner'],
};
const YOUTUBE_PLAYBACK_HOST_RE = /(^|\.)youtube(?:-nocookie)?\.com$/i;
const YOUTUBE_PLAYBACK_PATH_RE = /^\/(?:embed|watch|shorts|live_chat)(?:[/?#]|$)/i;
let activeRuntime: ActiveRuntime | undefined;

export function bootReaderApp(): void {
    reconcileActiveRuntimeMarker();
    const embeddedFrame = isEmbeddedFrameWindow();
    if (embeddedFrame && !shouldBootEmbeddedFrame()) return;
    const bootWindow = window as YomuBootWindow;
    const runtimeKind = detectRuntimeKind();
    const ownerId = claimRuntime(runtimeKind);
    if (!ownerId) return;
    const isRealRuntime = runtimeKind === 'userscript' || runtimeKind === 'extension';

    discardPageRuntimeForRealBoot(isRealRuntime);
    if (!canReplaceExistingRuntime(bootWindow, runtimeKind)) return;
    destroyExistingApps(bootWindow);

    const app = new ReaderApp();
    activeRuntime = { app, isRealRuntime, kind: runtimeKind, ownerId };
    writeBootWindowOwner(bootWindow, activeRuntime);
    bindClaims(app, ownerId, runtimeKind);
    registerRuntime(bootWindow, app, runtimeKind, isRealRuntime);
    startRuntime(app, ownerId, runtimeKind, embeddedFrame);
}

function reconcileActiveRuntimeMarker(): void {
    if (!activeRuntime) return;
    const marker = document.getElementById(RUNTIME_MARKER_ID) as HTMLElement | null;
    if (marker?.dataset.yomuRuntimeOwner === activeRuntime.ownerId) return;
    activeRuntime = undefined;
}

function discardPageRuntimeForRealBoot(isRealRuntime: boolean): void {
    if (activeRuntime && !activeRuntime.isRealRuntime && isRealRuntime) {
        const runtime = activeRuntime;
        runtime.app.destroy({ preservePageWords: true });
        clearBootWindowOwner(runtime.app, runtime.ownerId);
        return;
    }
}

function canReplaceExistingRuntime(bootWindow: YomuBootWindow, runtimeKind: YomuRuntimeKind): boolean {
    if (activeRuntime) return priority(activeRuntime.kind) < priority(runtimeKind);
    if (!bootWindow.__yomuReaderAppInitialized) return true;
    const existingPriority = priority(bootWindow.__yomuRuntimeKind ?? 'page');
    return existingPriority < priority(runtimeKind);
}

function destroyExistingApps(bootWindow: YomuBootWindow): void {
    if (activeRuntime) {
        activeRuntime.app.destroy({ preservePageWords: true });
        activeRuntime = undefined;
    }
    if (!bootWindow.__yomuReaderAppInitialized) return;
    bootWindow.__yomuRealApp?.destroy({ preservePageWords: true });
}

function writeBootWindowOwner(bootWindow: YomuBootWindow, runtime: ActiveRuntime): void {
    setBootWindowValue(bootWindow, '__yomuReaderAppInitialized', true);
    setBootWindowValue(bootWindow, '__yomuRuntimeKind', runtime.kind);
    setBootWindowValue(bootWindow, '__yomuRuntimeOwnerId', runtime.ownerId);
}

function setBootWindowValue<K extends keyof YomuBootWindow>(bootWindow: YomuBootWindow, key: K, value: YomuBootWindow[K]): void {
    try {
        bootWindow[key] = value;
    } catch {
        // Some hosted/dev browser contexts expose a non-extensible window. The module-local
        // activeRuntime state remains authoritative for this script instance.
    }
}

function registerRuntime(bootWindow: YomuBootWindow, app: ReaderApp, runtimeKind: YomuRuntimeKind, isRealRuntime: boolean): void {
    if (isRealRuntime) {
        setBootWindowValue(bootWindow, '__yomuRealApp', app);
        dispatchWindowEvent(createWindowCustomEvent('yomu-extension-loaded'));
        return;
    }
    if (runtimeKind === 'dev') return;
    addWindowEventListener('yomu-extension-loaded', () => {
        if (activeRuntime?.app === app) {
            app.destroy({ preservePageWords: true });
            clearActiveRuntime(app, activeRuntime?.ownerId);
        }
    });
}

function startRuntime(app: ReaderApp, ownerId: string, runtimeKind: YomuRuntimeKind, embeddedFrame: boolean): void {
    void app.init({
        embeddedFrame,
        // Both real installs (userscript manager and browser extension) get the
        // first-run welcome/onboarding. The page/dev runtimes never do.
        showWelcome: runtimeKind === 'userscript' || runtimeKind === 'extension',
    }).catch(error => {
        releaseRuntime(ownerId);
        throw error;
    });
}

function isEmbeddedFrameWindow(): boolean {
    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}

function shouldBootEmbeddedFrame(): boolean {
    return isYouTubeMediaFrame();
}

function isYouTubeMediaFrame(): boolean {
    return YOUTUBE_PLAYBACK_HOST_RE.test(location.hostname)
        && YOUTUBE_PLAYBACK_PATH_RE.test(location.pathname);
}

function detectRuntimeKind(): YomuRuntimeKind {
    const global = globalThis as {
        chrome?: { runtime?: { id?: string } };
        browser?: { runtime?: { id?: string } };
        GM?: {
            getValue?: unknown;
            xmlHttpRequest?: unknown;
            xmlhttpRequest?: unknown;
        };
        GM_info?: unknown;
        __yomuDevRuntime?: unknown;
    };
    if (isDevRuntime(global)) return 'dev';
    if (isExtensionRuntime(global)) return 'extension';
    if (isUserscriptRuntime(global)) return 'userscript';
    return 'page';
}

function isDevRuntime(global: { __yomuDevRuntime?: unknown }): boolean {
    return global.__yomuDevRuntime === true;
}

function isExtensionRuntime(global: { chrome?: { runtime?: { id?: string } }; browser?: { runtime?: { id?: string } } }): boolean {
    return Boolean(global.chrome?.runtime?.id || global.browser?.runtime?.id);
}

function isUserscriptRuntime(global: {
    GM?: {
        getValue?: unknown;
        xmlHttpRequest?: unknown;
        xmlhttpRequest?: unknown;
    };
    GM_info?: unknown;
}): boolean {
    return typeof GM_getValue === 'function'
        || typeof global.GM?.getValue === 'function'
        || typeof global.GM?.xmlHttpRequest === 'function'
        || typeof global.GM?.xmlhttpRequest === 'function'
        || Boolean(global.GM_info);
}

function priority(kind: unknown): number {
    if (kind === 'dev') return 4;
    if (kind === 'extension') return 3;
    if (kind === 'userscript') return 2;
    return 1;
}

function claimRuntime(kind: YomuRuntimeKind): string | null {
    const ownerId = `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const existing = liveOrClearedRuntimeMarker();
    if (existing && !canClaimOverExistingRuntime(existing.dataset.yomuRuntimeKind, kind)) {
        return null;
    }

    dispatchWindowEvent(createWindowCustomEvent('yomu-reader-runtime-claim', { ownerId, kind, priority: priority(kind) }));
    const marker = existing ?? document.createElement('meta');
    marker.id = RUNTIME_MARKER_ID;
    marker.dataset.yomuRuntimeKind = kind;
    marker.dataset.yomuRuntimeOwner = ownerId;
    if (!marker.isConnected) appendToDocumentHead(marker);
    return ownerId;
}

function canClaimOverExistingRuntime(existingKind: unknown, nextKind: YomuRuntimeKind): boolean {
    const existingPriority = priority(existingKind);
    const nextPriority = priority(nextKind);
    if (existingPriority < nextPriority) return true;
    return existingKind === 'dev' && nextKind === 'dev';
}

function liveOrClearedRuntimeMarker(): HTMLElement | null {
    const existing = document.getElementById(RUNTIME_MARKER_ID) as HTMLElement | null;
    if (!existing || !isStaleRuntimeMarker(existing)) return existing;
    existing.remove();
    return null;
}

function isStaleRuntimeMarker(marker: HTMLElement): boolean {
    const bootWindow = window as YomuBootWindow;
    if (activeRuntime) return false;
    if (bootWindow.__yomuReaderAppInitialized || bootWindow.__yomuRealApp) return false;
    if (marker.dataset.yomuRuntimeKind === 'dev') return true;
    return Boolean(bootWindow.__yomuRuntimeOwnerId && marker.dataset.yomuRuntimeOwner === bootWindow.__yomuRuntimeOwnerId);
}

function bindClaims(app: ReaderApp, ownerId: string, kind: YomuRuntimeKind): void {
    let released = false;
    const release = () => {
        if (released) return;
        released = true;
        markerObserver?.disconnect();
        app.destroy({ preservePageWords: true });
        releaseRuntime(ownerId);
        clearActiveRuntime(app, ownerId);
        clearBootWindowOwner(app, ownerId);
    };
    const markerObserver = observeRuntimeMarker(ownerId, kind, release);
    addWindowEventListener('yomu-reader-runtime-claim', event => {
        const detail = (event as CustomEvent).detail as Partial<{ ownerId: string; kind: YomuRuntimeKind; priority: number }> | undefined;
        if (!detail || detail.ownerId === ownerId) return;
        if (priority(detail.kind) < priority(kind)) return;
        release();
    });
}

function observeRuntimeMarker(ownerId: string, kind: YomuRuntimeKind, release: () => void): MutationObserver | undefined {
    if (typeof MutationObserver === 'undefined') return undefined;
    const marker = document.getElementById(RUNTIME_MARKER_ID) as HTMLElement | null;
    if (!marker) return undefined;
    const observer = new MutationObserver(() => {
        if (marker.dataset.yomuRuntimeOwner === ownerId) return;
        if (priority(marker.dataset.yomuRuntimeKind) < priority(kind)) return;
        release();
    });
    observer.observe(marker, RUNTIME_MARKER_OBSERVER_OPTIONS);
    return observer;
}

function clearBootWindowOwner(app: ReaderApp, ownerId: string): void {
    const bootWindow = window as YomuBootWindow;
    clearActiveRuntime(app, ownerId);
    if (bootWindow.__yomuRuntimeOwnerId !== ownerId) return;
    setBootWindowValue(bootWindow, '__yomuReaderAppInitialized', false);
    delete bootWindow.__yomuRuntimeOwnerId;
    delete bootWindow.__yomuRuntimeKind;
    if (bootWindow.__yomuRealApp === app) delete bootWindow.__yomuRealApp;
}

function clearActiveRuntime(app: ReaderApp, ownerId: string | undefined): void {
    if (activeRuntime?.app === app && (!ownerId || activeRuntime.ownerId === ownerId)) activeRuntime = undefined;
}

function releaseRuntime(ownerId: string): void {
    const marker = document.getElementById(RUNTIME_MARKER_ID) as HTMLElement | null;
    if (marker?.dataset.yomuRuntimeOwner === ownerId) marker.remove();
}
