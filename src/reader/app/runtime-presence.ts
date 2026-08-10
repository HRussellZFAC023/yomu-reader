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
    if (globals.chrome?.runtime?.id || globals.browser?.runtime?.id) return 'extension';
    if ((globals === globalThis && typeof GM_getValue === 'function')
        || typeof globals.GM_getValue === 'function'
        || typeof globals.GM?.getValue === 'function'
        || typeof globals.GM?.xmlHttpRequest === 'function'
        || typeof globals.GM?.xmlhttpRequest === 'function'
        || Boolean(globals.GM_info)) {
        return 'userscript';
    }
    return null;
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

export function markInstalledReaderRuntime(
    kind: InstalledReaderRuntimeKind,
    root: Document = document,
): void {
    const existing = root.getElementById(INSTALLED_READER_RUNTIME_MARKER_ID);
    const marker = existing instanceof HTMLElement ? existing : root.createElement('meta');
    marker.id = INSTALLED_READER_RUNTIME_MARKER_ID;
    marker.dataset.yomuInstalledRuntimeKind = kind;
    if (!marker.isConnected) appendInstalledRuntimeMarker(marker, root);
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
