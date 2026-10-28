import { beforeEach, describe, expect, it } from 'vitest';
import {
    announceInstalledReaderRuntime,
    detectInstalledReaderRuntime,
    INSTALLED_READER_RUNTIME_MARKER_ID,
    isHostedReaderRuntime,
    markInstalledReaderRuntime,
    shouldInstallHostedReaderRuntime,
} from '../../src/reader/app/runtime-presence';

describe('installed reader runtime presence', () => {
    beforeEach(() => {
        document.head.innerHTML = '';
        document.body.innerHTML = '';
        delete document.documentElement.dataset.yomuHosted;
    });

    it('announces a userscript at document-start through shared DOM state', () => {
        expect(announceInstalledReaderRuntime({ GM_getValue: () => undefined })).toBe('userscript');

        const marker = document.getElementById(INSTALLED_READER_RUNTIME_MARKER_ID);
        expect(marker?.dataset.yomuInstalledRuntimeKind).toBe('userscript');
    });

    it('does not make the page-injected hosted bundle look installed', () => {
        expect(detectInstalledReaderRuntime({})).toBeNull();
        expect(announceInstalledReaderRuntime({})).toBeNull();
        expect(document.getElementById(INSTALLED_READER_RUNTIME_MARKER_ID)).toBeNull();
    });

    it('prefers an extension when a compiled GM shim is also present', () => {
        expect(detectInstalledReaderRuntime({
            chrome: { runtime: { id: 'installed-yomu' } },
            GM_getValue: () => undefined,
        })).toBe('extension');
    });

    it('blocks the production hosted fallback while preserving local runtime QA', () => {
        markInstalledReaderRuntime('userscript');

        expect(shouldInstallHostedReaderRuntime(false)).toBe(false);
        expect(shouldInstallHostedReaderRuntime(true)).toBe(true);
    });

    it('keeps the page application hosted beside an installed DOM storage bridge', () => {
        markInstalledReaderRuntime('userscript');
        document.documentElement.dataset.yomuHosted = '';

        expect(document.getElementById(INSTALLED_READER_RUNTIME_MARKER_ID)?.dataset.yomuInstalledRuntimeKind)
            .toBe('userscript');
        expect(isHostedReaderRuntime()).toBe(true);
    });
});
