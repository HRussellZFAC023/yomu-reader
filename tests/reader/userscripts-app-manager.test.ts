import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectInstalledReaderRuntime, announceInstalledReaderRuntime, INSTALLED_READER_RUNTIME_MARKER_ID } from '../../src/reader/app/runtime-presence';
import { asyncGmGetValue, asyncGmSetValue, rawExtensionStorageGetValue } from '../../src/reader/app/gm-storage-adapters';
import { legacyExtensionManagedStorageAvailable } from '../../src/reader/app/extension-legacy-storage';
import { runningAsBrowserExtension } from '../../src/reader/app/runtime-env';
import {
    installUserscriptGmStorageBridge,
    uninstallUserscriptGmStorageBridge,
} from '../../src/reader/userscript/storage-bridge';

// The Userscripts app for Safari (Yomu's iPhone/iPad install path) runs the
// userscript in its own extension's content world: `browser.runtime.id` and
// `browser.storage` there are the MANAGER's, and its only storage API is the
// promise-based GM.* object. Since 1.9.1 Yomu took that runtime id for its own
// browser extension, read the manager's extension storage instead of GM, and
// never answered Study's storage requests, so first-run setup never reached
// the Reader and "Finish setup in Study" came back on every page.
// (The parameter-only `GM` binding itself is proven against the built bundle by
// scripts/userscripts-app-storage-smoke.mjs.)

const MANAGER_RUNTIME_ID = 'com.userscripts.macos.Userscripts-Extension (J74Q8V8V8N)';

function stubUserscriptsAppContentWorld(values = new Map<string, unknown>()): Map<string, unknown> {
    const managerStorage = new Map<string, unknown>([['jpdb-popup-reader-settings', { stranded: true }]]);
    vi.stubGlobal('__YOMU_EXTENSION_BUILD__', false);
    vi.stubGlobal('browser', {
        runtime: { id: MANAGER_RUNTIME_ID },
        storage: {
            local: {
                get: async (key: string) => (managerStorage.has(key) ? { [key]: managerStorage.get(key) } : {}),
                set: async (record: Record<string, unknown>) => {
                    for (const [key, value] of Object.entries(record)) managerStorage.set(key, value);
                },
                remove: async (key: string) => { managerStorage.delete(key); },
            },
        },
    });
    vi.stubGlobal('GM', {
        info: { scriptHandler: 'Userscripts' },
        getValue: async (key: string, fallback: unknown) => (values.has(key) ? values.get(key) : fallback),
        setValue: async (key: string, value: unknown) => { values.set(key, value); },
        deleteValue: async (key: string) => { values.delete(key); },
        listValues: async () => [...values.keys()],
    });
    return values;
}

describe('Userscripts app for Safari', () => {
    beforeEach(() => {
        document.head.innerHTML = '';
        delete document.documentElement.dataset.yomuStorageBridgeKind;
    });

    afterEach(() => {
        uninstallUserscriptGmStorageBridge();
        delete document.documentElement.dataset.yomuUserscriptStorageBridge;
        vi.unstubAllGlobals();
    });

    it('is a userscript manager, not Yomu\'s browser extension', () => {
        stubUserscriptsAppContentWorld();

        expect(detectInstalledReaderRuntime()).toBe('userscript');
        expect(runningAsBrowserExtension()).toBe(false);
        expect(announceInstalledReaderRuntime()).toBe('userscript');
        expect(document.getElementById(INSTALLED_READER_RUNTIME_MARKER_ID)?.dataset.yomuInstalledRuntimeKind)
            .toBe('userscript');
    });

    it('keeps settings in the manager\'s GM store, never in the manager\'s own extension storage', async () => {
        const values = stubUserscriptsAppContentWorld(new Map([['jpdb-popup-reader-settings', { learningTargetChosen: true }]]));

        expect(rawExtensionStorageGetValue()).toBeNull();
        expect(legacyExtensionManagedStorageAvailable()).toBe(false);
        await expect(asyncGmGetValue()?.('jpdb-popup-reader-settings', null)).resolves.toEqual({ learningTargetChosen: true });
        await asyncGmSetValue()?.('yomu:enable-logs', true);
        expect(values.get('yomu:enable-logs')).toBe(true);
    });

    it('answers hosted Study\'s storage requests as the userscript Reader it announced', () => {
        stubUserscriptsAppContentWorld();
        vi.stubGlobal('location', {
            href: 'https://yomureader.com/study/',
            hostname: 'yomureader.com',
            pathname: '/study/',
            origin: 'https://yomureader.com',
        });

        installUserscriptGmStorageBridge();

        expect(document.documentElement.dataset.yomuUserscriptStorageBridge).toBe('true');
        expect(document.documentElement.dataset.yomuStorageBridgeKind).toBe('userscript');
    });

    it('still identifies the packaged extension build by its runtime id', () => {
        vi.stubGlobal('__YOMU_EXTENSION_BUILD__', true);

        expect(detectInstalledReaderRuntime({
            chrome: { runtime: { id: 'yomu-extension' } },
            GM_getValue: () => undefined,
        })).toBe('extension');
    });
});
