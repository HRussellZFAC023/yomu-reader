import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appMocks = vi.hoisted(() => ({
    destroy: vi.fn(),
    init: vi.fn(),
}));

const settingsMocks = vi.hoisted(() => {
    const mocks = {
        loadSettings: vi.fn(),
        onSettingsChange: undefined as ((settings: unknown) => void) | undefined,
        subscribeToSettingsStorageChanges: vi.fn(),
        unsubscribe: vi.fn(),
    };
    mocks.subscribeToSettingsStorageChanges.mockImplementation((listener: (settings: unknown) => void) => {
        mocks.onSettingsChange = listener;
        return mocks.unsubscribe;
    });
    return mocks;
});

vi.mock('../../src/reader/app/main', () => ({
    ReaderApp: vi.fn(() => ({
        destroy: appMocks.destroy,
        init: appMocks.init,
    })),
}));

vi.mock('../../src/reader/settings/index', async importOriginal => ({
    ...await importOriginal<typeof import('../../src/reader/settings/index')>(),
    loadSettings: settingsMocks.loadSettings,
    subscribeToSettingsStorageChanges: settingsMocks.subscribeToSettingsStorageChanges,
}));

import { bootReaderApp, resetReaderBootStateForTests } from '../../src/reader/app/boot';
import { addWindowEventListener, createWindowCustomEvent, dispatchWindowEvent, normalizedPropertyDescriptor, pageCompartmentDescriptor, removeWindowEventListener, safeWindowPropertyDescriptor, shouldTemporarilyUnshadowWindowProperty } from '../../src/reader/platform/window-events';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

type BootWindow = Window & {
    __yomuReaderAppInitialized?: boolean;
    __yomuRealApp?: unknown;
    __yomuRuntimeKind?: unknown;
    __yomuRuntimeOwnerId?: unknown;
    __yomuDevRuntime?: boolean;
};

const bootWindow = window as BootWindow;

function settingsForStoredTarget(targetLanguage: string | null) {
    return {
        ...DEFAULT_SETTINGS,
        learningTargetChosen: targetLanguage !== null,
        languageProfiles: DEFAULT_SETTINGS.languageProfiles.map((profile, index) => index === 0 && targetLanguage
            ? { ...profile, targetLanguage }
            : { ...profile }),
    };
}

function reinjectAfterRuntimeMarkerMutation(
    mutateMarker: (marker: HTMLElement) => void,
): HTMLElement {
    bootReaderApp();
    const marker = document.getElementById('jpdb-reader-runtime-owner')!;
    mutateMarker(marker);
    appMocks.destroy.mockClear();

    bootReaderApp();

    const replacement = document.getElementById('jpdb-reader-runtime-owner');
    expect(appMocks.destroy).toHaveBeenCalledOnce();
    expect(appMocks.init).toHaveBeenCalledTimes(2);
    expect(replacement).not.toBeNull();
    return replacement!;
}

async function startDormantEmbeddedFrame(): Promise<void> {
    bootReaderApp();
    await vi.waitFor(() => expect(settingsMocks.loadSettings).toHaveBeenCalledOnce());
    expect(appMocks.init).not.toHaveBeenCalled();
}

async function bootEmbeddedFrameAndWait(): Promise<void> {
    bootReaderApp();
    await vi.waitFor(() => {
        expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: true, showWelcome: true });
    });
}

describe('reader boot', () => {
    beforeEach(() => {
        resetReaderBootStateForTests();
        appMocks.destroy.mockReset();
        appMocks.init.mockReset();
        appMocks.init.mockResolvedValue(undefined);
        settingsMocks.loadSettings.mockReset();
        settingsMocks.loadSettings.mockResolvedValue(settingsForStoredTarget(null));
        settingsMocks.onSettingsChange = undefined;
        settingsMocks.subscribeToSettingsStorageChanges.mockReset();
        settingsMocks.subscribeToSettingsStorageChanges.mockImplementation((listener: (settings: unknown) => void) => {
            settingsMocks.onSettingsChange = listener;
            return settingsMocks.unsubscribe;
        });
        settingsMocks.unsubscribe.mockClear();
        document.head.innerHTML = '';
        document.body.innerHTML = '';
        vi.stubGlobal('GM_getValue', vi.fn());
    });

    afterEach(() => {
        cleanupBootWindow();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('boots when a page shadows window.dispatchEvent', () => {
        withWindowProperty('dispatchEvent', undefined, () => {
            expect(() => bootReaderApp()).not.toThrow();
        });

        expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: false, showWelcome: true });
        expect(document.getElementById('jpdb-reader-runtime-owner')?.dataset.yomuRuntimeKind).toBe('userscript');
    });

    it('releases a failed runtime so the same userscript can initialize on retry', async () => {
        const failure = new Error('transient startup failure');
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        appMocks.init.mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);

        bootReaderApp();

        await vi.waitFor(() => {
            expect(appMocks.destroy).toHaveBeenCalledWith({ preservePageWords: true });
        });
        expect(document.getElementById('jpdb-reader-runtime-owner')).toBeNull();
        expect(bootWindow.__yomuReaderAppInitialized).toBe(false);
        expect(bootWindow.__yomuRealApp).toBeUndefined();
        expect(consoleError).toHaveBeenCalledWith('[Yomu Reader] Failed to initialize', failure);

        bootReaderApp();

        expect(appMocks.init).toHaveBeenCalledTimes(2);
        expect(document.getElementById('jpdb-reader-runtime-owner')?.dataset.yomuRuntimeKind).toBe('userscript');
    });

    it('releases a runtime whose marker was removed before reinjection', () => {
        let firstOwner: string | undefined;
        const replacement = reinjectAfterRuntimeMarkerMutation(marker => {
            firstOwner = marker.dataset.yomuRuntimeOwner;
            marker.remove();
        });

        expect(replacement.dataset.yomuRuntimeOwner).toBeTruthy();
        expect(replacement.dataset.yomuRuntimeOwner).not.toBe(firstOwner);
        expect(bootWindow.__yomuRuntimeOwnerId).toBe(replacement.dataset.yomuRuntimeOwner);
        expect(bootWindow.__yomuReaderAppInitialized).toBe(true);

        bootReaderApp();

        expect(appMocks.init).toHaveBeenCalledTimes(2);
        expect(document.getElementById('jpdb-reader-runtime-owner')).toBe(replacement);
    });

    it('reclaims a marker rewritten without a matching runtime owner', () => {
        const replacement = reinjectAfterRuntimeMarkerMutation(marker => {
            marker.dataset.yomuRuntimeOwner = 'page-rewritten-owner';
        });

        expect(replacement.dataset.yomuRuntimeOwner).not.toBe('page-rewritten-owner');
        expect(bootWindow.__yomuRuntimeOwnerId).toBe(replacement.dataset.yomuRuntimeOwner);
    });

    it('reclaims an ownerless rewritten marker after its observer has released the runtime', async () => {
        bootReaderApp();
        const marker = document.getElementById('jpdb-reader-runtime-owner')!;
        marker.dataset.yomuRuntimeOwner = 'page-rewritten-owner';

        await vi.waitFor(() => {
            expect(appMocks.destroy).toHaveBeenCalledWith({ preservePageWords: true });
        });
        expect(marker.isConnected).toBe(false);
        expect(bootWindow.__yomuReaderAppInitialized).toBe(false);
        appMocks.destroy.mockClear();

        bootReaderApp();

        const replacement = document.getElementById('jpdb-reader-runtime-owner');
        expect(appMocks.destroy).not.toHaveBeenCalled();
        expect(appMocks.init).toHaveBeenCalledTimes(2);
        expect(replacement?.dataset.yomuRuntimeOwner).toBeTruthy();
        expect(replacement?.dataset.yomuRuntimeOwner).not.toBe('page-rewritten-owner');
        expect(bootWindow.__yomuRuntimeOwnerId).toBe(replacement?.dataset.yomuRuntimeOwner);
    });

    it('prefers native extension detection before compiled GM shims', () => {
        vi.stubGlobal('chrome', { runtime: { id: 'compiled-yomu-extension' } });

        bootReaderApp();

        expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: false, showWelcome: true });
        expect(document.getElementById('jpdb-reader-runtime-owner')?.dataset.yomuRuntimeKind).toBe('extension');
    });

    it('detects modern userscript managers that expose GM.getValue without legacy GM_getValue', () => {
        vi.stubGlobal('GM_getValue', undefined);
        vi.stubGlobal('GM', { getValue: vi.fn() });

        bootReaderApp();

        expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: false, showWelcome: true });
        expect(document.getElementById('jpdb-reader-runtime-owner')?.dataset.yomuRuntimeKind).toBe('userscript');
    });

    it('does not boot ordinary embedded frames', () => {
        withWindowProperty('top', {} as Window, () => {
            bootReaderApp();
        });

        expect(appMocks.init).not.toHaveBeenCalled();
        expect(document.getElementById('jpdb-reader-runtime-owner')).toBeNull();
    });

    it('does not probe or watch target text in a fresh embedded frame', async () => {
        document.body.textContent = 'Google で続ける';

        await withWindowPropertyAsync('top', {} as Window, async () => {
            await startDormantEmbeddedFrame();

            document.body.textContent = '日本語に変わりました';
            await new Promise(resolve => window.setTimeout(resolve, 0));
            expect(appMocks.init).not.toHaveBeenCalled();
        });
    });

    it('wakes an existing Korean frame when another frame persists the first target choice', async () => {
        document.body.textContent = '한국어로 계속';

        await withWindowPropertyAsync('top', {} as Window, async () => {
            await startDormantEmbeddedFrame();

            settingsMocks.onSettingsChange?.(settingsForStoredTarget('ko'));

            await vi.waitFor(() => {
                expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: true, showWelcome: true });
            });
        });
    });

    it('boots embedded frames that already contain the stored Japanese target in restricted mode', async () => {
        settingsMocks.loadSettings.mockResolvedValue(settingsForStoredTarget('ja'));
        document.body.textContent = 'Google で続ける';

        await withWindowPropertyAsync('top', {} as Window, async () => {
            await bootEmbeddedFrameAndWait();
        });
    });

    it('boots an embedded frame when a Latin control localises to Japanese', async () => {
        settingsMocks.loadSettings.mockResolvedValue(settingsForStoredTarget('ja'));
        await withWindowPropertyAsync('top', {} as Window, async () => {
            const button = document.createElement('button');
            button.textContent = 'Continue with Google';
            document.body.append(button);
            bootReaderApp();
            expect(appMocks.init).not.toHaveBeenCalled();

            button.textContent = 'Google で続ける';
            await vi.waitFor(() => {
                expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: true, showWelcome: true });
            });
        });
    });

    it('boots a Korean-only embedded frame for a stored Korean target', async () => {
        settingsMocks.loadSettings.mockResolvedValue(settingsForStoredTarget('ko'));
        document.body.textContent = '한국어로 계속';

        await withWindowPropertyAsync('top', {} as Window, async () => {
            await bootEmbeddedFrameAndWait();
        });
    });

    it('boots embedded frames that already contain a video in restricted mode', () => {
        document.body.append(document.createElement('video'));

        withWindowProperty('top', {} as Window, () => {
            bootReaderApp();
        });

        expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: true, showWelcome: true });
    });

    it('restarts an already-open fresh video frame when the first target choice is persisted', async () => {
        document.body.append(document.createElement('video'));

        await withWindowPropertyAsync('top', {} as Window, async () => {
            bootReaderApp();
            expect(appMocks.init).toHaveBeenCalledTimes(1);
            await vi.waitFor(() => expect(settingsMocks.loadSettings).toHaveBeenCalledOnce());

            settingsMocks.onSettingsChange?.(settingsForStoredTarget('ko'));

            await vi.waitFor(() => expect(appMocks.init).toHaveBeenCalledTimes(2));
            expect(appMocks.destroy).toHaveBeenCalledWith({ preservePageWords: true });
        });
    });

    it('boots an embedded frame once a video appears after document-start', async () => {
        await withWindowPropertyAsync('top', {} as Window, async () => {
            bootReaderApp();
            expect(appMocks.init).not.toHaveBeenCalled();

            document.body.append(document.createElement('video'));
            await vi.waitFor(() => {
                expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: true, showWelcome: true });
            });
        });
    });

    it('boots YouTube embedded frames in restricted mode', () => {
        withWindowProperty('top', {} as Window, () => {
            withWindowProperty('location', new URL('https://www.youtube.com/embed/abc123') as unknown as Location, () => {
                bootReaderApp();
            });
        });

        expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: true, showWelcome: true });
        expect(document.getElementById('jpdb-reader-runtime-owner')?.dataset.yomuRuntimeKind).toBe('userscript');
    });

    it('boots YouTube live chat frames in restricted mode', () => {
        withWindowProperty('top', {} as Window, () => {
            withWindowProperty('location', new URL('https://www.youtube.com/live_chat?continuation=test') as unknown as Location, () => {
                bootReaderApp();
            });
        });

        expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: true, showWelcome: true });
        expect(document.getElementById('jpdb-reader-runtime-owner')?.dataset.yomuRuntimeKind).toBe('userscript');
    });

    it('boots YouTube live chat REPLAY frames in restricted mode (class Z: VOD chat panel)', () => {
        withWindowProperty('top', {} as Window, () => {
            withWindowProperty('location', new URL('https://www.youtube.com/live_chat_replay?continuation=test') as unknown as Location, () => {
                bootReaderApp();
            });
        });

        expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: true, showWelcome: true });
        expect(document.getElementById('jpdb-reader-runtime-owner')?.dataset.yomuRuntimeKind).toBe('userscript');
    });

    it('boots privacy-enhanced YouTube embedded frames in restricted mode', () => {
        withWindowProperty('top', {} as Window, () => {
            withWindowProperty('location', new URL('https://www.youtube-nocookie.com/embed/abc123') as unknown as Location, () => {
                bootReaderApp();
            });
        });

        expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: true, showWelcome: true });
        expect(document.getElementById('jpdb-reader-runtime-owner')?.dataset.yomuRuntimeKind).toBe('userscript');
    });

    it('registers runtime claim listeners when a page shadows window.addEventListener', () => {
        withWindowProperty('addEventListener', undefined, () => {
            expect(() => bootReaderApp()).not.toThrow();
        });

        window.dispatchEvent(new CustomEvent('yomu-reader-runtime-claim', {
            detail: { ownerId: 'replacement-runtime', kind: 'userscript', priority: 2 },
        }));

        expect(appMocks.destroy).toHaveBeenCalledWith({ preservePageWords: true });
    });

    it('removes the page extension fallback when a runtime claim replaces it', () => {
        vi.stubGlobal('GM_getValue', undefined);
        const addListener = vi.spyOn(window, 'addEventListener');
        const removeListener = vi.spyOn(window, 'removeEventListener');
        bootReaderApp();
        const fallbackListener = addListener.mock.calls.find(([type]) => type === 'yomu-extension-loaded')?.[1];
        expect(fallbackListener).toBeTruthy();
        appMocks.destroy.mockClear();

        window.dispatchEvent(new CustomEvent('yomu-reader-runtime-claim', {
            detail: { ownerId: 'external-extension', kind: 'extension', priority: 3 },
        }));

        expect(appMocks.destroy).toHaveBeenCalledTimes(1);
        expect(document.getElementById('jpdb-reader-runtime-owner')).toBeNull();
        expect(bootWindow.__yomuReaderAppInitialized).toBe(false);
        expect(removeListener.mock.calls).toContainEqual(['yomu-extension-loaded', fallbackListener, undefined]);

        appMocks.destroy.mockClear();
        window.dispatchEvent(new CustomEvent('yomu-extension-loaded'));
        expect(appMocks.destroy).not.toHaveBeenCalled();
    });

    it('preserves parsed page words when a real runtime boots after the page runtime', () => {
        vi.stubGlobal('GM_getValue', undefined);

        bootReaderApp();
        vi.stubGlobal('GM_getValue', vi.fn());
        bootReaderApp();

        expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: false, showWelcome: false });
        expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: false, showWelcome: true });
        expect(appMocks.destroy).toHaveBeenCalledWith({ preservePageWords: true });
        expect(document.getElementById('jpdb-reader-runtime-owner')?.dataset.yomuRuntimeKind).toBe('userscript');
    });

    it('preserves parsed page words when the extension replaces a userscript runtime', () => {
        bootReaderApp();
        appMocks.destroy.mockClear();

        vi.stubGlobal('chrome', { runtime: { id: 'compiled-yomu-extension' } });
        bootReaderApp();

        expect(appMocks.destroy).toHaveBeenCalledWith({ preservePageWords: true });
        expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: false, showWelcome: true });
        expect(document.getElementById('jpdb-reader-runtime-owner')?.dataset.yomuRuntimeKind).toBe('extension');
    });

    it('lets the local hosted docs runtime replace a stale installed userscript', () => {
        bootReaderApp();
        appMocks.destroy.mockClear();

        bootWindow.__yomuDevRuntime = true;
        bootReaderApp();

        expect(appMocks.destroy).toHaveBeenCalledWith({ preservePageWords: true });
        expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: false, showWelcome: false });
        expect(document.getElementById('jpdb-reader-runtime-owner')?.dataset.yomuRuntimeKind).toBe('dev');
    });

    it('reclaims a stale local hosted docs marker when no reader app is alive', () => {
        const marker = document.createElement('meta');
        marker.id = 'jpdb-reader-runtime-owner';
        marker.dataset.yomuRuntimeKind = 'dev';
        marker.dataset.yomuRuntimeOwner = 'dev-stale';
        document.head.append(marker);
        bootWindow.__yomuDevRuntime = true;

        bootReaderApp();

        expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: false, showWelcome: false });
        expect(document.getElementById('jpdb-reader-runtime-owner')?.dataset.yomuRuntimeOwner).not.toBe('dev-stale');
    });

    it('lets a refreshed local hosted docs runtime replace an older local hosted docs runtime', () => {
        vi.stubGlobal('GM_getValue', undefined);
        bootWindow.__yomuDevRuntime = true;
        bootReaderApp();
        appMocks.destroy.mockClear();
        appMocks.init.mockClear();

        bootReaderApp();

        expect(appMocks.destroy).toHaveBeenCalledWith({ preservePageWords: true });
        expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: false, showWelcome: false });
        expect(document.getElementById('jpdb-reader-runtime-owner')?.dataset.yomuRuntimeKind).toBe('dev');
    });

    it('preserves parsed page words when the page runtime hears an extension-loaded signal', () => {
        vi.stubGlobal('GM_getValue', undefined);
        bootReaderApp();
        appMocks.destroy.mockClear();

        window.dispatchEvent(new CustomEvent('yomu-extension-loaded'));

        expect(appMocks.destroy).toHaveBeenCalledWith({ preservePageWords: true });
        expect(document.getElementById('jpdb-reader-runtime-owner')).toBeNull();
        expect(bootWindow.__yomuReaderAppInitialized).toBe(false);
        expect(bootWindow.__yomuRuntimeOwnerId).toBeUndefined();

        appMocks.destroy.mockClear();
        window.dispatchEvent(new CustomEvent('yomu-extension-loaded'));
        expect(appMocks.destroy).not.toHaveBeenCalled();

        bootReaderApp();
        expect(appMocks.init).toHaveBeenCalledTimes(2);
        expect(document.getElementById('jpdb-reader-runtime-owner')?.dataset.yomuRuntimeKind).toBe('page');
    });

    it('keeps the local hosted docs runtime active when an extension-loaded signal fires', () => {
        vi.stubGlobal('GM_getValue', undefined);
        bootWindow.__yomuDevRuntime = true;
        bootReaderApp();
        appMocks.destroy.mockClear();

        window.dispatchEvent(new CustomEvent('yomu-extension-loaded'));

        expect(appMocks.destroy).not.toHaveBeenCalled();
        expect(document.getElementById('jpdb-reader-runtime-owner')?.dataset.yomuRuntimeKind).toBe('dev');
    });

    it('removes listeners when a page shadows window.removeEventListener', () => {
        const listener = vi.fn();
        const eventName = 'yomu-reader-shadowed-remove-listener-test';

        expect(addWindowEventListener(eventName, listener)).toBe(true);
        withWindowProperty('removeEventListener', undefined, () => {
            expect(removeWindowEventListener(eventName, listener)).toBe(true);
        });
        dispatchWindowEvent(createWindowCustomEvent(eventName));

        expect(listener).not.toHaveBeenCalled();
    });

    it('normalizes Firefox userscript window descriptors before restoring them', () => {
        const descriptor = {
            configurable: true,
            enumerable: true,
            get: () => undefined,
            value: undefined,
            writable: true,
        } as PropertyDescriptor;
        const target: Record<string, unknown> = {};

        expect(() => Object.defineProperty(target, 'dispatchEvent', descriptor)).toThrow(TypeError);
        expect(() => Object.defineProperty(target, 'dispatchEvent', normalizedPropertyDescriptor(descriptor))).not.toThrow();
        expect(Object.getOwnPropertyDescriptor(target, 'dispatchEvent')).toMatchObject({
            configurable: true,
            enumerable: true,
            value: undefined,
            writable: true,
        });
    });

    it('ignores Firefox userscript descriptor read failures on window event methods', () => {
        const original = Object.getOwnPropertyDescriptor;
        vi.spyOn(Object, 'getOwnPropertyDescriptor').mockImplementation((target, key) => {
            if (target === window && key === 'dispatchEvent') {
                throw new TypeError('property descriptors must not specify a value or be writable when a getter or setter has been specified');
            }
            return original(target, key);
        });

        expect(safeWindowPropertyDescriptor('dispatchEvent')).toBeUndefined();
        expect(() => dispatchWindowEvent(createWindowCustomEvent('yomu-reader-descriptor-read-failure-test'))).not.toThrow();
    });

    it('ignores Firefox userscript descriptors whose value getter throws', () => {
        const descriptor = Object.defineProperty({
            configurable: true,
            enumerable: true,
        }, 'value', {
            get() {
                throw new TypeError('property descriptors must not specify a value or be writable when a getter or setter has been specified');
            },
        }) as PropertyDescriptor;
        const original = Object.getOwnPropertyDescriptor;
        vi.spyOn(Object, 'getOwnPropertyDescriptor').mockImplementation((target, key) => {
            if (target === window && key === 'dispatchEvent') return descriptor;
            return original(target, key);
        });

        expect(shouldTemporarilyUnshadowWindowProperty(descriptor)).toBe(false);
        expect(() => dispatchWindowEvent(createWindowCustomEvent('yomu-reader-descriptor-value-failure-test'))).not.toThrow();
    });

    it('clones restored window property descriptors into the page compartment on Firefox', () => {
        // Restoring a shadowed page window property must go through cloneInto
        // or Firefox rejects it ("Not allowed to define cross-origin object
        // as property"), which also left dispatchEvent deleted and broke
        // popover loads (e.g. Immersion Kit examples) on the extension.
        const cloned = { configurable: true, cloned: true };
        const cloneInto = vi.fn(() => cloned);
        vi.stubGlobal('cloneInto', cloneInto);
        const descriptor: PropertyDescriptor = { configurable: true, value: vi.fn() };

        const result = pageCompartmentDescriptor(descriptor, {});

        expect(cloneInto).toHaveBeenCalledWith(descriptor, window, { cloneFunctions: true, wrapReflectors: true });
        expect(result).toBe(cloned);

        vi.unstubAllGlobals();
        expect(pageCompartmentDescriptor(descriptor, {})).toBe(descriptor);
    });

    it('clones custom event details into Firefox userscript page scope when available', () => {
        const detail = { settings: { theme: 'dark' } };
        const cloned = { settings: { theme: 'dark' }, cloned: true };
        const cloneInto = vi.fn(() => cloned);
        vi.stubGlobal('cloneInto', cloneInto);

        const event = createWindowCustomEvent('yomu-reader-firefox-clone-detail-test', detail);

        expect(cloneInto).toHaveBeenCalledWith(detail, window, { cloneFunctions: false, wrapReflectors: true });
        expect(event.detail).toBe(cloned);
    });
});

function withWindowProperty(key: keyof Window, value: unknown, callback: () => void): void {
    const descriptor = Object.getOwnPropertyDescriptor(window, key);
    Object.defineProperty(window, key, {
        configurable: true,
        value,
    });
    try {
        callback();
    } finally {
        if (descriptor) Object.defineProperty(window, key, descriptor);
        else delete (window as unknown as Record<string, unknown>)[key as string];
    }
}

async function withWindowPropertyAsync(key: keyof Window, value: unknown, callback: () => Promise<void>): Promise<void> {
    const descriptor = Object.getOwnPropertyDescriptor(window, key);
    Object.defineProperty(window, key, {
        configurable: true,
        value,
    });
    try {
        await callback();
    } finally {
        if (descriptor) Object.defineProperty(window, key, descriptor);
        else delete (window as unknown as Record<string, unknown>)[key as string];
    }
}

function cleanupBootWindow(): void {
    document.getElementById('jpdb-reader-runtime-owner')?.remove();
    delete bootWindow.__yomuReaderAppInitialized;
    delete bootWindow.__yomuRealApp;
    delete bootWindow.__yomuRuntimeKind;
    delete bootWindow.__yomuRuntimeOwnerId;
    delete bootWindow.__yomuDevRuntime;
}
