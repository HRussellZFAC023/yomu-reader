import { userscriptGmApi, userscriptGmInfo } from '../userscript/gm-api';
import { extensionRuntimeMayBeYomu } from './runtime-env';

export type InstalledReaderRuntimeKind = 'userscript' | 'extension';

interface RuntimeDetectionGlobals {
    chrome?: { runtime?: { id?: string } };
    browser?: { runtime?: { id?: string } };
    GM?: {
        getValue?: unknown;
        xmlHttpRequest?: unknown;
        xmlhttpRequest?: unknown;
    };
    GM_getValue?: unknown;
    GM_info?: unknown;
}

export const INSTALLED_READER_RUNTIME_MARKER_ID = 'jpdb-reader-installed-runtime';

export function detectInstalledReaderRuntime(
    globals: RuntimeDetectionGlobals = globalThis as RuntimeDetectionGlobals,
): InstalledReaderRuntimeKind | null {
    if (extensionRuntimeMayBeYomu() && (globals.chrome?.runtime?.id || globals.browser?.runtime?.id)) return 'extension';
    return userscriptManagerApi(globals) ? 'userscript' : null;
}

function userscriptManagerApi(globals: RuntimeDetectionGlobals): boolean {
    // The ambient realm also reads the manager's lexical bindings (gm-api.ts).
    const ambient = globals === globalThis;
    const gm = ambient ? userscriptGmApi() : globals.GM;
    return (ambient && typeof GM_getValue === 'function')
        || typeof globals.GM_getValue === 'function'
        || typeof gm?.getValue === 'function'
        || typeof gm?.xmlHttpRequest === 'function'
        || typeof gm?.xmlhttpRequest === 'function'
        || Boolean(ambient ? userscriptGmInfo() : globals.GM_info);
}

export function announceInstalledReaderRuntime(
    globals: RuntimeDetectionGlobals = globalThis as RuntimeDetectionGlobals,
    root: Document = document,
): InstalledReaderRuntimeKind | null {
    const kind = detectInstalledReaderRuntime(globals);
    if (!kind) return null;
    markInstalledReaderRuntime(kind, root);
    return kind;
}

/**
 * The installed extension outranks a userscript manager on the same page. Its
 * packaged content script announces itself synchronously at document start
 * (scripts/lib/extension-runtime-hardening.mjs), so a userscript that runs
 * later never demotes that announcement.
 */
export function markInstalledReaderRuntime(
    kind: InstalledReaderRuntimeKind,
    root: Document = document,
): void {
    const existing = root.getElementById(INSTALLED_READER_RUNTIME_MARKER_ID);
    const marker = existing instanceof HTMLElement ? existing : root.createElement('meta');
    marker.id = INSTALLED_READER_RUNTIME_MARKER_ID;
    if (marker.dataset.yomuInstalledRuntimeKind !== 'extension') marker.dataset.yomuInstalledRuntimeKind = kind;
    if (!marker.isConnected) appendInstalledRuntimeMarker(marker, root);
}

/** The highest-priority installed Reader announced in this document, if any. */
export function announcedInstalledReaderRuntime(root: Pick<Document, 'getElementById'> = document): InstalledReaderRuntimeKind | null {
    const kind = (root.getElementById(INSTALLED_READER_RUNTIME_MARKER_ID) as HTMLElement | null)?.dataset?.yomuInstalledRuntimeKind;
    return kind === 'extension' || kind === 'userscript' ? kind : null;
}

export function isHostedReaderRuntime(): boolean {
    return document.documentElement?.dataset.yomuHosted !== undefined;
}

export function shouldInstallHostedReaderRuntime(
    forceLocalRuntime = false,
    root: Pick<Document, 'getElementById'> = document,
): boolean {
    return forceLocalRuntime || !root.getElementById(INSTALLED_READER_RUNTIME_MARKER_ID);
}

function appendInstalledRuntimeMarker(marker: HTMLElement, root: Document): void {
    const parent = root.head || root.documentElement;
    if (parent) {
        parent.append(marker);
        return;
    }
    const observer = new MutationObserver(() => {
        const readyParent = root.head || root.documentElement;
        if (!readyParent) return;
        readyParent.append(marker);
        observer.disconnect();
    });
    observer.observe(root, { childList: true, subtree: true });
}
