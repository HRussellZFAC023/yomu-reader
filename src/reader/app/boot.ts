import { appendToDocumentHead } from '../dom/index';
import { isTargetLanguageText } from '../lookup/target-text';
import { ReaderApp } from './main';
import { addWindowEventListener, createWindowCustomEvent, dispatchWindowEvent, removeWindowEventListener } from '../platform/window-events';
import {
    clearReaderRuntimeHealth,
    publishReaderRuntimeHealth,
    READER_RUNTIME_MARKER_ID,
} from './runtime-health';
import { ensureManagedWebStorageCurrent, ensureManagedWebStorageCurrentSync } from './storage';
import { detectInstalledReaderRuntime } from './runtime-presence';

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
    kind: YomuRuntimeKind;
    ownerId: string;
    release?: () => void;
}

interface BootContext {
    bootWindow: YomuBootWindow;
    embeddedFrame: boolean;
    runtimeKind: YomuRuntimeKind;
}

const RUNTIME_MARKER_ID = READER_RUNTIME_MARKER_ID;
const RUNTIME_MARKER_OBSERVER_OPTIONS: MutationObserverInit = {
    attributes: true,
    attributeFilter: ['data-yomu-runtime-kind', 'data-yomu-runtime-owner'],
};
const YOUTUBE_PLAYBACK_HOST_RE = /(^|\.)youtube(?:-nocookie)?\.com$/i;
// live_chat_replay is the VOD chat panel: same-origin frame, no <video>, so
// without an explicit path match it never booted (class Z).
const YOUTUBE_PLAYBACK_PATH_RE = /^\/(?:embed|watch|shorts|live_chat(?:_replay)?)(?:[/?#]|$)/i;
let activeRuntime: ActiveRuntime | undefined;
let bootInFlight: Promise<void> | undefined;

export function bootReaderApp(): void {
    if (bootInFlight) return;
    try {
        if (ensureManagedWebStorageCurrentSync()) {
            bootReaderAppAfterStorageBarrier();
            return;
        }
    } catch (error) {
        console.error('[Yomu Reader] Failed to initialize managed web storage', error);
        return;
    }
    bootInFlight ??= bootReaderAppAfterStorageGate()
        .catch(error => console.error('[Yomu Reader] Failed to initialize managed web storage', error))
        .finally(() => {
            bootInFlight = undefined;
        });
}

async function bootReaderAppAfterStorageGate(): Promise<void> {
    await ensureManagedWebStorageCurrent();
    bootReaderAppAfterStorageBarrier();
}

function bootReaderAppAfterStorageBarrier(): void {
    reconcileActiveRuntimeMarker();
    const context = resolveBootContext();
    if (!context) return;
    const runtime = createOwnedRuntime(context);
    if (!runtime) return;

    registerRuntime(context.bootWindow, runtime, isInstalledRuntime(runtime.kind));
    startRuntime(
        runtime.app,
        runtime.ownerId,
        runtime.kind,
        context.embeddedFrame,
        () => releaseActiveRuntime(runtime),
    );
}

function resolveBootContext(): BootContext | undefined {
    const embeddedFrame = isEmbeddedFrameWindow();
    if (embeddedFrame && !shouldBootEmbeddedFrame()) {
        watchEmbeddedFrameForEligibleContent();
        return undefined;
    }
    const bootWindow = window as YomuBootWindow;
    const runtimeKind = detectRuntimeKind();
    if (!canReplaceExistingRuntime(bootWindow, runtimeKind)) return undefined;
    return { bootWindow, embeddedFrame, runtimeKind };
}

function createOwnedRuntime(context: BootContext): ActiveRuntime | undefined {
    const { bootWindow, runtimeKind } = context;
    destroyExistingApps(bootWindow);
    const ownerId = claimRuntime(runtimeKind);
    if (!ownerId) return undefined;

    const app = new ReaderApp();
    const runtime: ActiveRuntime = { app, kind: runtimeKind, ownerId };
    activeRuntime = runtime;
    writeBootWindowOwner(bootWindow, runtime);
    runtime.release = bindClaims(runtime);
    return runtime;
}

function isInstalledRuntime(runtimeKind: YomuRuntimeKind): boolean {
    return runtimeKind === 'userscript' || runtimeKind === 'extension';
}

function reconcileActiveRuntimeMarker(): void {
    const runtime = activeRuntime;
    if (!runtime) return;
    const marker = document.getElementById(RUNTIME_MARKER_ID) as HTMLElement | null;
    if (marker?.dataset.yomuRuntimeOwner === runtime.ownerId) return;
    releaseActiveRuntime(runtime);
    removeOwnerlessDisplacedMarker(marker);
}

function removeOwnerlessDisplacedMarker(marker: HTMLElement | null): void {
    if (!marker?.isConnected) return;
    const bootWindow = window as YomuBootWindow;
    // A live conforming replacement writes both its marker and window owner.
    // If only the marker changed, it was detached or rewritten by the page and
    // must not become an ownerless veto for the retry below.
    if (bootWindow.__yomuRuntimeOwnerId === marker.dataset.yomuRuntimeOwner) return;
    marker.remove();
}

function canReplaceExistingRuntime(bootWindow: YomuBootWindow, runtimeKind: YomuRuntimeKind): boolean {
    if (activeRuntime) return canClaimOverExistingRuntime(activeRuntime.kind, runtimeKind);
    if (!bootWindow.__yomuReaderAppInitialized) return true;
    return canClaimOverExistingRuntime(bootWindow.__yomuRuntimeKind ?? 'page', runtimeKind);
}

function destroyExistingApps(bootWindow: YomuBootWindow): void {
    if (activeRuntime) {
        releaseActiveRuntime(activeRuntime);
    }
    if (!bootWindow.__yomuReaderAppInitialized) return;
    bootWindow.__yomuRealApp?.destroy({ preservePageWords: true });
}

function releaseActiveRuntime(runtime: ActiveRuntime): void {
    if (runtime.release) {
        runtime.release();
        return;
    }
    runtime.app.destroy({ preservePageWords: true });
    releaseRuntime(runtime.ownerId);
    clearBootWindowOwner(runtime.app, runtime.ownerId);
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

function registerRuntime(bootWindow: YomuBootWindow, runtime: ActiveRuntime, isRealRuntime: boolean): void {
    const { app, kind: runtimeKind } = runtime;
    if (isRealRuntime) {
        setBootWindowValue(bootWindow, '__yomuRealApp', app);
        dispatchWindowEvent(createWindowCustomEvent('yomu-extension-loaded'));
        return;
    }
    if (runtimeKind === 'dev') return;
    const onExtensionLoaded = (): void => {
        if (activeRuntime === runtime) releaseActiveRuntime(runtime);
    };
    if (!addWindowEventListener('yomu-extension-loaded', onExtensionLoaded)) return;
    const releaseClaims = runtime.release;
    runtime.release = () => {
        removeWindowEventListener('yomu-extension-loaded', onExtensionLoaded);
        releaseClaims?.();
    };
}

function startRuntime(
    app: ReaderApp,
    ownerId: string,
    runtimeKind: YomuRuntimeKind,
    embeddedFrame: boolean,
    releaseClaims: () => void,
): void {
    void app.init({
        embeddedFrame,
        // Both real installs (userscript manager and browser extension) get the
        // first-run welcome/onboarding. The page/dev runtimes never do.
        showWelcome: runtimeKind === 'userscript' || runtimeKind === 'extension',
    }).then(() => {
        // A claim marker only means this runtime won ownership. Publish the
        // typed service contract after initialization so hosted consumers do
        // not mistake a claimed shell for a usable Reader.
        publishReaderRuntimeHealth(ownerId);
    }).catch(error => {
        // A failed initialization must relinquish every ownership signal, not
        // only the DOM marker. Otherwise the initialized window flag and
        // module-local runtime make a same-priority reinjection look redundant,
        // so a transient startup error leaves Yomu absent until the whole tab
        // is recreated.
        releaseClaims();
        console.error('[Yomu Reader] Failed to initialize', error);
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
    return isYouTubeMediaFrame() || embeddedFrameHasVideo() || embeddedFrameHasJapaneseText();
}

function embeddedFrameHasVideo(): boolean {
    return Boolean(document.querySelector('video'));
}

function embeddedFrameHasJapaneseText(): boolean {
    // Keep the document-start gate cheap. This is only a wake-up verdict; the
    // Reader's ordinary visible-surface collector applies the precise
    // visibility, annotation-scope, and text budgets after boot.
    const text = document.body?.textContent ?? document.documentElement?.textContent ?? '';
    return isTargetLanguageText(text.slice(0, 200_000));
}

// Streaming sites (kaa.lt et al.) host their player in a third-party iframe
// that has no <video> at document-start. Sign-in and payment widgets likewise
// start with a Latin placeholder and localise their control label later.
// Booting the full reader in every ad/analytics frame would waste work, so keep
// only this tiny wake-up observer until either eligible signal appears.
let embeddedFrameEligibilityObserver: MutationObserver | undefined;

function watchEmbeddedFrameForEligibleContent(): void {
    if (embeddedFrameEligibilityObserver) return;
    const observer = new MutationObserver(mutations => {
        // Inspect only the changed text/subtree. Serializing the whole body on
        // every ad-frame mutation would turn this cheap dormant wake-up gate
        // into permanent work on frames that never become eligible.
        if (!mutations.some(mutationContainsEmbeddedFrameEligibilitySignal)) return;
        observer.disconnect();
        embeddedFrameEligibilityObserver = undefined;
        if (isEmbeddedFrameWindow()) bootReaderApp();
    });
    embeddedFrameEligibilityObserver = observer;
    const observe = () => observer.observe(document.documentElement, {
        characterData: true,
        childList: true,
        subtree: true,
    });
    if (document.documentElement) observe();
    else document.addEventListener('DOMContentLoaded', observe, { once: true });
}

function mutationContainsEmbeddedFrameEligibilitySignal(mutation: MutationRecord): boolean {
    if (mutation.type === 'characterData') {
        return isTargetLanguageText((mutation.target.textContent ?? '').slice(0, 200_000));
    }
    return [...mutation.addedNodes].some(node => {
        if (node instanceof Element && (node.matches('video') || Boolean(node.querySelector('video')))) return true;
        return isTargetLanguageText((node.textContent ?? '').slice(0, 200_000));
    });
}

function isYouTubeMediaFrame(): boolean {
    return YOUTUBE_PLAYBACK_HOST_RE.test(location.hostname)
        && YOUTUBE_PLAYBACK_PATH_RE.test(location.pathname);
}

function detectRuntimeKind(): YomuRuntimeKind {
    if ((globalThis as { __yomuDevRuntime?: unknown }).__yomuDevRuntime === true) return 'dev';
    return detectInstalledReaderRuntime() ?? 'page';
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
    clearReaderRuntimeHealth(marker);
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

function bindClaims(runtime: ActiveRuntime): () => void {
    const { app, ownerId, kind } = runtime;
    let released = false;
    let markerObserver: MutationObserver | undefined;
    const onRuntimeClaim = (event: Event): void => {
        const detail = (event as CustomEvent).detail as Partial<{ ownerId: string; kind: YomuRuntimeKind; priority: number }> | undefined;
        if (!detail || detail.ownerId === ownerId) return;
        if (priority(detail.kind) < priority(kind)) return;
        // Always enter through the runtime's current top-level release. Other
        // ownership integrations can extend that release after claims are
        // bound (for example the page-runtime extension-loaded fallback).
        releaseActiveRuntime(runtime);
    };
    const release = () => {
        if (released) return;
        released = true;
        markerObserver?.disconnect();
        removeWindowEventListener('yomu-reader-runtime-claim', onRuntimeClaim);
        app.destroy({ preservePageWords: true });
        releaseRuntime(ownerId);
        clearActiveRuntime(app, ownerId);
        clearBootWindowOwner(app, ownerId);
    };
    markerObserver = observeRuntimeMarker(ownerId, kind, () => releaseActiveRuntime(runtime));
    addWindowEventListener('yomu-reader-runtime-claim', onRuntimeClaim);
    return release;
}

function observeRuntimeMarker(ownerId: string, kind: YomuRuntimeKind, release: () => void): MutationObserver | undefined {
    if (typeof MutationObserver === 'undefined') return undefined;
    const marker = document.getElementById(RUNTIME_MARKER_ID) as HTMLElement | null;
    if (!marker) return undefined;
    const observer = new MutationObserver(() => {
        if (marker.dataset.yomuRuntimeOwner === ownerId) return;
        if (priority(marker.dataset.yomuRuntimeKind) < priority(kind)) return;
        release();
        // A page can rewrite only the marker attributes. Once our release has
        // cleared its matching window owner, that displaced marker must not
        // remain as an ownerless same-priority veto against reinjection. A
        // conforming replacement has already written the same owner to window
        // state, so removeOwnerlessDisplacedMarker deliberately preserves it.
        removeOwnerlessDisplacedMarker(marker);
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
