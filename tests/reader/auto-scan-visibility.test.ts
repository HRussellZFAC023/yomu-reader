import { afterEach, describe, expect, it, vi } from 'vitest';

import '../../src/reader/companions/settings-surface';
import { ReaderApp } from '../../src/reader/app/main';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { ReaderSettings } from '../../src/reader/app/types';

// Cluster G2 (iPad heat / battery): when the tab is hidden the annotation loop
// must reach a true zero-timer idle — the MutationObserver disconnected, every
// pending debounce/sweep timer cleared, the scanner's geometry sweeps parked —
// and it must rebuild itself and run one settle scan when the tab is shown
// again. This pins that behaviour for the auto-scan loop and for the body-swap
// watcher that shares the app's lifetime.
//
// The class is NOT closed: the OCR controller's documentElement media observer
// and its 1200 ms raster poll, and the subtitle controller's body observer, are
// still always-on and still deliver at full rate in a hidden tab. Anything that
// claims otherwise here is a claim about the reader app alone.

interface AppInternals {
    isDestroyed: boolean;
    autoScanObserver?: { disconnect: () => void; observe: () => void };
    autoScanTimer?: number;
    autoScanDeadline: number;
    autoScanForced: boolean;
    autoScanDebounced: boolean;
    asbScanTimer?: number;
    pageScanner: { pauseGeometrySweeps: () => void; repointGeometrySettleTarget: () => void };
    observeAutoScanMutations: () => void;
    scheduleAutoScan: (delay: number, options?: { force?: boolean }) => void;
    hasVisibleAutoScanWork: () => boolean;
    handleAutoScanVisibilityChange: () => void;
    documentBodyObserver?: { dispose: () => void };
    documentBodyRecoveryPending: boolean;
    setupDocumentBodyRecovery: () => void;
    handleDocumentBodyReplacement: () => void;
    recoverAfterDocumentBodyReplacement: () => void;
    canParseJapanese: () => boolean;
    installFab: () => void;
    settings: ReaderSettings;
}

function stubVisibility(initial: 'visible' | 'hidden'): { set: (value: 'visible' | 'hidden') => void; restore: () => void } {
    let value = initial;
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value === 'hidden' });
    return {
        set: next => { value = next; },
        restore: () => {
            if (visibilityDescriptor) Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
            else delete (document as unknown as Record<string, unknown>).visibilityState;
            if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor);
            else delete (document as unknown as Record<string, unknown>).hidden;
        },
    };
}

function makeApp(): AppInternals {
    const app = new ReaderApp() as unknown as AppInternals;
    app.settings = { ...DEFAULT_SETTINGS };
    app.autoScanObserver = { disconnect: vi.fn(), observe: vi.fn() };
    app.autoScanDeadline = 0;
    app.autoScanForced = false;
    app.autoScanDebounced = false;
    app.pageScanner = { pauseGeometrySweeps: vi.fn(), repointGeometrySettleTarget: vi.fn() };
    app.observeAutoScanMutations = vi.fn();
    app.scheduleAutoScan = vi.fn();
    app.hasVisibleAutoScanWork = () => true;
    return app;
}

async function deliverMutationObserverRecords(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('auto-scan visibility gating', () => {
    it('disconnects the observer and clears every pending timer when the tab is hidden', () => {
        const app = makeApp();
        const visibility = stubVisibility('hidden');
        app.autoScanTimer = window.setTimeout(() => undefined, 60_000);
        app.asbScanTimer = window.setTimeout(() => undefined, 60_000);
        app.autoScanForced = true;
        app.autoScanDebounced = true;
        app.autoScanDeadline = Date.now() + 60_000;

        try {
            app.handleAutoScanVisibilityChange();

            expect(app.autoScanObserver!.disconnect).toHaveBeenCalledTimes(1);
            expect(app.autoScanTimer).toBeUndefined();
            expect(app.asbScanTimer).toBeUndefined();
            expect(app.autoScanForced).toBe(false);
            expect(app.autoScanDebounced).toBe(false);
            expect(app.autoScanDeadline).toBe(0);
            expect(app.pageScanner.pauseGeometrySweeps).toHaveBeenCalledTimes(1);
            // Nothing is re-observed or re-scheduled while still hidden.
            expect(app.observeAutoScanMutations).not.toHaveBeenCalled();
            expect(app.scheduleAutoScan).not.toHaveBeenCalled();
        } finally {
            visibility.restore();
        }
    });

    it('re-observes and schedules one settle scan when the tab is shown again', () => {
        const app = makeApp();
        const visibility = stubVisibility('visible');

        try {
            app.handleAutoScanVisibilityChange();

            expect(app.observeAutoScanMutations).toHaveBeenCalledTimes(1);
            expect(app.scheduleAutoScan).toHaveBeenCalledTimes(1);
            expect(app.pageScanner.pauseGeometrySweeps).not.toHaveBeenCalled();
        } finally {
            visibility.restore();
        }
    });
});

describe('document body replacement recovery', () => {
    it('re-points the scanner geometry-settle observer at the replacement body', () => {
        const app = makeApp();
        const visibility = stubVisibility('visible');
        app.installFab = vi.fn();
        app.canParseJapanese = () => false;
        app.documentBodyRecoveryPending = true;

        try {
            app.recoverAfterDocumentBodyReplacement();

            // The settle observer is installed once and body-scoped, so without
            // this it keeps watching the detached body and no reflow of the
            // replacement ever reaches a geometry heal again.
            expect(app.pageScanner.repointGeometrySettleTarget).toHaveBeenCalledTimes(1);
        } finally {
            visibility.restore();
        }
    });

    it('parks the body-swap watcher and settles the whole hidden period in one call on wake', async () => {
        const app = makeApp();
        const visibility = stubVisibility('visible');
        app.handleDocumentBodyReplacement = vi.fn();
        const previous = document.body;
        const replacement = document.createElement('body');

        try {
            app.setupDocumentBodyRecovery();
            visibility.set('hidden');
            document.dispatchEvent(new Event('visibilitychange'));

            document.documentElement.replaceChild(replacement, previous);
            // MutationObserver delivery is a microtask checkpoint. A wall-clock
            // timer here races Vitest's hard deadline on a busy host, even
            // though no production timer is involved.
            await deliverMutationObserverRecords();
            expect(app.handleDocumentBodyReplacement).not.toHaveBeenCalled();

            visibility.set('visible');
            document.dispatchEvent(new Event('visibilitychange'));
            // The handler compares the live body against the remembered one, so
            // one call on wake settles however many swaps the host made.
            expect(app.handleDocumentBodyReplacement).toHaveBeenCalledTimes(1);
        } finally {
            app.documentBodyObserver?.dispose();
            if (replacement.isConnected) document.documentElement.replaceChild(previous, replacement);
            visibility.restore();
        }
    });
});
