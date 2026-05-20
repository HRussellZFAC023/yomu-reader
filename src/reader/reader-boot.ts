import { appendToDocumentHead } from './dom';
import { Logger } from './logger';
import { ReaderApp } from './main';
import { addWindowEventListener, createWindowCustomEvent, dispatchWindowEvent } from './window-events';

type YomuRuntimeKind = 'demo' | 'userscript' | 'extension';

type YomuBootWindow = typeof window & {
    __yomuReaderAppInitialized?: boolean;
    __jpdbPopupReaderInitialized?: boolean;
    __yomuDemoApp?: ReaderApp;
    __yomuRealApp?: ReaderApp;
    __yomuRuntimeKind?: YomuRuntimeKind;
    __yomuRuntimeOwnerId?: string;
};

const log = Logger.scope('ReaderBoot');
const RUNTIME_MARKER_ID = 'jpdb-reader-runtime-owner';

export function bootReaderApp(): void {
    const bootWindow = window as YomuBootWindow;
    const runtimeKind = detectYomuRuntimeKind();
    const ownerId = claimYomuRuntime(runtimeKind);
    if (!ownerId) return;
    const isRealRuntime = runtimeKind !== 'demo';

    discardDemoRuntimeForRealBoot(bootWindow, isRealRuntime);
    if (!canReplaceExistingRuntime(bootWindow, runtimeKind)) return;
    destroyExistingRuntimeApps(bootWindow);

    bootWindow.__yomuReaderAppInitialized = true;
    bootWindow.__jpdbPopupReaderInitialized = true;
    bootWindow.__yomuRuntimeKind = runtimeKind;
    bootWindow.__yomuRuntimeOwnerId = ownerId;
    const app = new ReaderApp();
    bindRuntimeClaims(app, ownerId, runtimeKind);
    registerBootedRuntime(bootWindow, app, isRealRuntime);
    startBootedRuntime(app, ownerId, runtimeKind, isRealRuntime);
}

function discardDemoRuntimeForRealBoot(bootWindow: YomuBootWindow, isRealRuntime: boolean): void {
    if (!bootWindow.__yomuReaderAppInitialized || !bootWindow.__yomuDemoApp || !isRealRuntime) return;
    bootWindow.__yomuDemoApp.destroy();
    delete bootWindow.__yomuDemoApp;
    bootWindow.__yomuReaderAppInitialized = false;
}

function canReplaceExistingRuntime(bootWindow: YomuBootWindow, runtimeKind: YomuRuntimeKind): boolean {
    if (!bootWindow.__yomuReaderAppInitialized) return true;
    const existingPriority = runtimePriority(bootWindow.__yomuRuntimeKind ?? 'demo');
    return existingPriority < runtimePriority(runtimeKind);
}

function destroyExistingRuntimeApps(bootWindow: YomuBootWindow): void {
    if (!bootWindow.__yomuReaderAppInitialized) return;
    bootWindow.__yomuRealApp?.destroy();
    bootWindow.__yomuDemoApp?.destroy();
}

function registerBootedRuntime(bootWindow: YomuBootWindow, app: ReaderApp, isRealRuntime: boolean): void {
    if (isRealRuntime) {
        bootWindow.__yomuRealApp = app;
        dispatchWindowEvent(createWindowCustomEvent('yomu-extension-loaded'));
        return;
    }
    bootWindow.__yomuDemoApp = app;
    addWindowEventListener('yomu-extension-loaded', () => {
        if (bootWindow.__yomuDemoApp === app) {
            app.destroy();
            delete bootWindow.__yomuDemoApp;
        }
    });
}

function startBootedRuntime(app: ReaderApp, ownerId: string, runtimeKind: YomuRuntimeKind, isRealRuntime: boolean): void {
    void app.init({
        isDemo: !isRealRuntime,
        showWelcome: runtimeKind === 'userscript',
    }).catch(error => {
        releaseYomuRuntime(ownerId);
        log.error('Initialization failed', error);
        throw error;
    });
}

function detectYomuRuntimeKind(): YomuRuntimeKind {
    const global = globalThis as {
        chrome?: { runtime?: { id?: string } };
        browser?: { runtime?: { id?: string } };
        GM?: {
            getValue?: unknown;
            xmlHttpRequest?: unknown;
            xmlhttpRequest?: unknown;
        };
        GM_info?: unknown;
    };
    if (global.chrome?.runtime?.id || global.browser?.runtime?.id) return 'extension';
    if (typeof GM_getValue === 'function'
        || typeof global.GM?.getValue === 'function'
        || typeof global.GM?.xmlHttpRequest === 'function'
        || typeof global.GM?.xmlhttpRequest === 'function'
        || Boolean(global.GM_info)) return 'userscript';
    return 'demo';
}

function runtimePriority(kind: YomuRuntimeKind): number {
    if (kind === 'extension') return 3;
    if (kind === 'userscript') return 2;
    return 1;
}

function claimYomuRuntime(kind: YomuRuntimeKind): string | null {
    const ownerId = `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const existing = document.getElementById(RUNTIME_MARKER_ID) as HTMLElement | null;
    const existingKind = normalizeRuntimeKind(existing?.dataset.yomuRuntimeKind);
    if (existing && runtimePriority(existingKind) >= runtimePriority(kind)) {
        return null;
    }

    dispatchWindowEvent(createWindowCustomEvent('yomu-reader-runtime-claim', { ownerId, kind, priority: runtimePriority(kind) }));
    const marker = existing ?? document.createElement('meta');
    marker.id = RUNTIME_MARKER_ID;
    marker.dataset.yomuRuntimeKind = kind;
    marker.dataset.yomuRuntimeOwner = ownerId;
    marker.setAttribute('name', RUNTIME_MARKER_ID);
    marker.setAttribute('content', kind);
    if (!marker.isConnected) appendToDocumentHead(marker);
    return ownerId;
}

function bindRuntimeClaims(app: ReaderApp, ownerId: string, kind: YomuRuntimeKind): void {
    addWindowEventListener('yomu-reader-runtime-claim', event => {
        const detail = (event as CustomEvent).detail as Partial<{ ownerId: string; kind: YomuRuntimeKind; priority: number }> | undefined;
        if (!detail || detail.ownerId === ownerId) return;
        const nextKind = normalizeRuntimeKind(detail.kind);
        if (runtimePriority(nextKind) < runtimePriority(kind)) return;
        log.info('Yielding to another Yomu runtime', { current: kind, next: nextKind });
        app.destroy();
        releaseYomuRuntime(ownerId);
        clearBootWindowOwner(app, ownerId);
    });
}

function clearBootWindowOwner(app: ReaderApp, ownerId: string): void {
    const bootWindow = window as YomuBootWindow;
    if (bootWindow.__yomuRuntimeOwnerId !== ownerId) return;
    bootWindow.__yomuReaderAppInitialized = false;
    delete bootWindow.__yomuRuntimeOwnerId;
    delete bootWindow.__yomuRuntimeKind;
    if (bootWindow.__yomuDemoApp === app) delete bootWindow.__yomuDemoApp;
    if (bootWindow.__yomuRealApp === app) delete bootWindow.__yomuRealApp;
}

function releaseYomuRuntime(ownerId: string): void {
    const marker = document.getElementById(RUNTIME_MARKER_ID) as HTMLElement | null;
    if (marker?.dataset.yomuRuntimeOwner === ownerId) marker.remove();
}

function normalizeRuntimeKind(value: unknown): YomuRuntimeKind {
    return value === 'extension' || value === 'userscript' || value === 'demo' ? value : 'demo';
}
