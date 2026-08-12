import { appendToDocumentHead } from '../dom/index';
import { isTargetLanguageText } from '../lookup/target-text';
import { ReaderApp } from './main';
import type { ReaderAppInitOptions } from './startup';
import { addWindowEventListener, createWindowCustomEvent, dispatchWindowEvent, removeWindowEventListener } from '../platform/window-events';
import {
    clearReaderRuntimeHealth,
    publishReaderRuntimeHealth,
    READER_RUNTIME_MARKER_ID,
} from './runtime-health';
import { ensureManagedWebStorageCurrent, ensureManagedWebStorageCurrentSync } from './storage';
import { detectInstalledReaderRuntime } from './runtime-presence';
import { loadSettings, subscribeToSettingsStorageChanges } from '../settings/index';
import { adoptLearningTargetFromSettings } from '../languages/target-selection';
import type { ReaderSettings } from './types';

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
    startupSettings?: ReaderSettings;
    initialization?: Promise<boolean>;
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
let storageBootInFlight: Promise<boolean> | undefined;
let retainedStartupSettings: ReaderSettings | undefined;

// Vitest can deliberately reuse one jsdom module graph across cases. Production
// gets one graph per document; this reset makes that same ownership boundary
// explicit for focused lifecycle tests instead of leaking observers or a
// simulated frame's target policy into the next case.
export function resetReaderBootStateForTests(): void {
    if (activeRuntime) releaseActiveRuntime(activeRuntime);
    embeddedFrameEligibilityObserver?.disconnect();
    embeddedFrameEligibilityObserver = undefined;
    disposeEmbeddedFrameTargetPolicySubscription();
    embeddedFrameTargetTextEligible = false;
    embeddedFrameLearningTargetChosen = false;
    embeddedFrameTargetPolicyRevision += 1;
    embeddedFrameTargetPolicyInFlight = undefined;
    storageBootInFlight = undefined;
    retainedStartupSettings = undefined;
}

export function bootReaderApp(): void {
    void requestReaderBoot();
}

/**
 * Boot a first-party packaged Reader from its authoritative in-memory settings.
 * The snapshot is retained for every later retry in this document and supersedes
 * an ordinary boot that may already be waiting on the managed-storage gate.
 */
export function bootReaderAppWithStartupSettings(startupSettings: ReaderSettings): Promise<boolean> {
    retainedStartupSettings = startupSettings;
    return requestReaderBoot(true);
}

function requestReaderBoot(replaceMismatchedRuntime = false): Promise<boolean> {
    const existingRequest = reusableBootRequest(replaceMismatchedRuntime);
    if (existingRequest) return existingRequest;
    const synchronousBoot = bootReaderAppThroughSynchronousStorageGate();
    if (synchronousBoot) return synchronousBoot;
    return startStorageGatedBoot();
}

function reusableBootRequest(replaceMismatchedRuntime: boolean): Promise<boolean> | undefined {
    if (!replaceMismatchedRuntime) return storageBootInFlight;
    const runtime = activeRuntime;
    if (!runtime) return storageBootInFlight;
    return packagedRuntimeRequest(runtime);
}

function packagedRuntimeRequest(runtime: ActiveRuntime): Promise<boolean> | undefined {
    if (runtime.startupSettings === retainedStartupSettings) return runtime.initialization;
    releaseActiveRuntime(runtime);
    const gate = storageBootInFlight;
    if (!gate) return undefined;
    return gate.then(() => requestReaderBoot(true));
}

function startStorageGatedBoot(): Promise<boolean> {
    storageBootInFlight = bootReaderAppAfterStorageGate()
        .catch(error => {
            console.error('[Yomu Reader] Failed to initialize managed web storage', error);
            return false;
        })
        .finally(() => {
            storageBootInFlight = undefined;
        });
    return storageBootInFlight;
}

function bootReaderAppThroughSynchronousStorageGate(): Promise<boolean> | null {
    try {
        if (!ensureManagedWebStorageCurrentSync()) return null;
        return bootReaderAppAfterStorageBarrier();
    } catch (error) {
        console.error('[Yomu Reader] Failed to initialize managed web storage', error);
        return Promise.resolve(false);
    }
}

async function bootReaderAppAfterStorageGate(): Promise<boolean> {
    await ensureManagedWebStorageCurrent();
    return bootReaderAppAfterStorageBarrier();
}

function bootReaderAppAfterStorageBarrier(): Promise<boolean> {
    reconcileActiveRuntimeMarker();
    const context = resolveBootContext();
    if (!context) return Promise.resolve(false);
    return bootResolvedContext(context);
}

function bootResolvedContext(context: BootContext): Promise<boolean> {
    const runtime = createOwnedRuntime(context);
    if (!runtime) return Promise.resolve(false);

    registerRuntime(context.bootWindow, runtime, isInstalledRuntime(runtime.kind));
    runtime.startupSettings = retainedStartupSettings;
    runtime.initialization = startRuntime(runtime, context.embeddedFrame);
    return runtime.initialization;
}

function resolveBootContext(): BootContext | undefined {
    const embeddedFrame = isEmbeddedFrameWindow();
    if (embeddedFrame) {
        ensureEmbeddedFrameTargetPolicySubscription();
        prepareEmbeddedFrameTargetTextEligibility();
    }
    if (embeddedFrame && !embeddedFrameHasImmediateMediaSignal()) {
        watchEmbeddedFrameForEligibleContent();
        return undefined;
    }
    return claimableBootContext(embeddedFrame);
}

function claimableBootContext(embeddedFrame: boolean): BootContext | undefined {
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

    const app = createReaderApp();
    const runtime: ActiveRuntime = { app, kind: runtimeKind, ownerId };
    activeRuntime = runtime;
    writeBootWindowOwner(bootWindow, runtime);
    runtime.release = bindClaims(runtime);
    return runtime;
}

function createReaderApp(): ReaderApp {
    if (retainedStartupSettings) return new ReaderApp(retainReaderSettingsInMemory, false);
    return new ReaderApp();
}

function retainReaderSettingsInMemory(): Promise<void> {
    return Promise.resolve();
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

function startRuntime(runtime: ActiveRuntime, embeddedFrame: boolean): Promise<boolean> {
    const { app, ownerId, kind: runtimeKind, startupSettings } = runtime;
    const initOptions: ReaderAppInitOptions = {
        embeddedFrame,
        // Both real installs (userscript manager and browser extension) get the
        // first-run welcome/onboarding. The page/dev runtimes never do.
        showWelcome: runtimeKind === 'userscript' || runtimeKind === 'extension',
        ...(startupSettings ? { startupSettings } : {}),
    };
    return app.init(initOptions).then(() => {
        if (activeRuntime !== runtime) return false;
        // A claim marker only means this runtime won ownership. Publish the
        // typed service contract after initialization so hosted consumers do
        // not mistake a claimed shell for a usable Reader.
        const health = publishReaderRuntimeHealth(ownerId);
        if (health) return true;
        releaseActiveRuntime(runtime);
        return false;
    }).catch(error => {
        // A failed initialization must relinquish every ownership signal, not
        // only the DOM marker. Otherwise the initialized window flag and
        // module-local runtime make a same-priority reinjection look redundant,
        // so a transient startup error leaves Yomu absent until the whole tab
        // is recreated.
        if (activeRuntime === runtime) releaseActiveRuntime(runtime);
        console.error('[Yomu Reader] Failed to initialize', error);
        return false;
    });
}

function isEmbeddedFrameWindow(): boolean {
    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}

function embeddedFrameHasImmediateMediaSignal(): boolean {
    return isYouTubeMediaFrame() || embeddedFrameHasVideo();
}

function embeddedFrameHasVideo(): boolean {
    return Boolean(document.querySelector('video'));
}

function embeddedFrameHasTargetText(): boolean {
    // Keep the document-start gate cheap. This is only a wake-up verdict; the
    // Reader's ordinary visible-surface collector applies the precise
    // visibility, annotation-scope, and text budgets after boot.
    const root = document.body || document.documentElement;
    const text = root ? root.textContent : '';
    return isTargetLanguageText(String(text ?? '').slice(0, 200_000));
}

// Streaming sites (kaa.lt et al.) host their player in a third-party iframe
// that has no <video> at document-start. Sign-in and payment widgets likewise
// start with a Latin placeholder and localise their control label later.
// Booting the full reader in every ad/analytics frame would waste work, so keep
// only this tiny wake-up observer until either eligible signal appears.
let embeddedFrameEligibilityObserver: MutationObserver | undefined;
let embeddedFrameTargetTextEligible = false;
let embeddedFrameTargetPolicyInFlight: Promise<void> | undefined;
let embeddedFrameSettingsUnsubscribe: (() => void) | undefined;
let embeddedFrameLearningTargetChosen = false;
let embeddedFrameTargetPolicyRevision = 0;

function ensureEmbeddedFrameTargetPolicySubscription(): void {
    if (embeddedFrameSettingsUnsubscribe) return;
    embeddedFrameSettingsUnsubscribe = subscribeToSettingsStorageChanges(settings => {
        embeddedFrameTargetPolicyRevision += 1;
        applyEmbeddedFrameTargetPolicy(settings, true);
    });
}

function prepareEmbeddedFrameTargetTextEligibility(): void {
    if (embeddedFrameTargetPolicyInFlight) return;
    const revision = embeddedFrameTargetPolicyRevision;
    embeddedFrameTargetPolicyInFlight = loadSettings()
        .then(settings => {
            if (revision === embeddedFrameTargetPolicyRevision) {
                applyEmbeddedFrameTargetPolicy(settings, false);
            }
        })
        .catch(error => console.error('[Yomu Reader] Failed to resolve embedded-frame learning target', error))
        .finally(() => {
            embeddedFrameTargetPolicyInFlight = undefined;
        });
}

function applyEmbeddedFrameTargetPolicy(settings: ReaderSettings, persistedChange: boolean): void {
    if (!embeddedFramePolicyContextIsLive()) return;
    const previouslyChosen = embeddedFrameLearningTargetChosen;
    embeddedFrameLearningTargetChosen = settings.learningTargetChosen;
    if (!settings.learningTargetChosen) {
        embeddedFrameTargetTextEligible = false;
        return;
    }

    adoptLearningTargetFromSettings(settings);
    embeddedFrameTargetTextEligible = true;
    if (reconcileActiveEmbeddedFrameRuntime(persistedChange, previouslyChosen)) return;
    bootEmbeddedFrameIfEligible();
}

function embeddedFramePolicyContextIsLive(): boolean {
    if (isEmbeddedFrameWindow()) return true;
    disposeEmbeddedFrameTargetPolicySubscription();
    return false;
}

function reconcileActiveEmbeddedFrameRuntime(persistedChange: boolean, previouslyChosen: boolean): boolean {
    if (!activeRuntime) return false;
    // A video/YouTube frame can create its restricted Reader before the top
    // frame's first chooser completes. That Reader intentionally returned
    // inert and installed no settings subscription, so replace it exactly on
    // the persisted false -> true transition; dormant text-only frames simply
    // take their first ownership claim below.
    if (persistedChange && !previouslyChosen) {
        releaseActiveRuntime(activeRuntime);
        return false;
    }
    disposeEmbeddedFrameTargetPolicySubscription();
    return true;
}

function bootEmbeddedFrameIfEligible(): void {
    if (embeddedFrameHasImmediateMediaSignal() || embeddedFrameHasTargetText()) bootPreparedEmbeddedFrame();
}

function disposeEmbeddedFrameTargetPolicySubscription(): void {
    embeddedFrameSettingsUnsubscribe?.();
    embeddedFrameSettingsUnsubscribe = undefined;
}

function watchEmbeddedFrameForEligibleContent(): void {
    if (embeddedFrameEligibilityObserver) return;
    const observer = new MutationObserver(mutations => {
        // Inspect only the changed text/subtree. Serializing the whole body on
        // every ad-frame mutation would turn this cheap dormant wake-up gate
        // into permanent work on frames that never become eligible.
        if (!mutations.some(mutationContainsEmbeddedFrameEligibilitySignal)) return;
        observer.disconnect();
        embeddedFrameEligibilityObserver = undefined;
        embeddedFrameTargetTextEligible = false;
        bootPreparedEmbeddedFrame();
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
    if (mutationAddsVideo(mutation)) return true;
    if (!embeddedFrameTargetTextEligible) return false;
    return mutationContainsTargetText(mutation);
}

function mutationAddsVideo(mutation: MutationRecord): boolean {
    if (mutation.type !== 'childList') return false;
    return [...mutation.addedNodes].some(nodeAddsVideo);
}

function nodeAddsVideo(node: Node): boolean {
    if (!(node instanceof Element)) return false;
    return node.matches('video') || Boolean(node.querySelector('video'));
}

function mutationContainsTargetText(mutation: MutationRecord): boolean {
    if (mutation.type === 'characterData') {
        return isTargetLanguageText((mutation.target.textContent ?? '').slice(0, 200_000));
    }
    return [...mutation.addedNodes].some(nodeContainsTargetText);
}

function nodeContainsTargetText(node: Node): boolean {
    return isTargetLanguageText((node.textContent ?? '').slice(0, 200_000));
}

function bootPreparedEmbeddedFrame(): void {
    if (!isEmbeddedFrameWindow()) return;
    reconcileActiveRuntimeMarker();
    const context = claimableBootContext(true);
    if (!context) return;
    embeddedFrameEligibilityObserver?.disconnect();
    embeddedFrameEligibilityObserver = undefined;
    void bootResolvedContext(context);
    disposeEmbeddedFrameTargetPolicyAfterChosenBoot();
}

function disposeEmbeddedFrameTargetPolicyAfterChosenBoot(): void {
    if (activeRuntime && embeddedFrameLearningTargetChosen) disposeEmbeddedFrameTargetPolicySubscription();
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
