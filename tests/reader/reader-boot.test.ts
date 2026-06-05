import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appMocks = vi.hoisted(() => ({
    destroy: vi.fn(),
    init: vi.fn(),
}));

vi.mock('../../src/reader/main', () => ({
    ReaderApp: vi.fn(() => ({
        destroy: appMocks.destroy,
        init: appMocks.init,
    })),
}));

import { bootReaderApp } from '../../src/reader/reader-boot';
import { addWindowEventListener, createWindowCustomEvent, dispatchWindowEvent, normalizedPropertyDescriptor, removeWindowEventListener, safeWindowPropertyDescriptor, shouldTemporarilyUnshadowWindowProperty } from '../../src/reader/window-events';

type BootWindow = Window & {
    __yomuReaderAppInitialized?: boolean;
    __yomuRealApp?: unknown;
    __yomuRuntimeKind?: unknown;
    __yomuRuntimeOwnerId?: unknown;
    __yomuDevRuntime?: boolean;
};

const bootWindow = window as BootWindow;

describe('reader boot', () => {
    beforeEach(() => {
        appMocks.destroy.mockReset();
        appMocks.init.mockReset();
        appMocks.init.mockResolvedValue(undefined);
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

    it('prefers native extension detection before compiled GM shims', () => {
        vi.stubGlobal('chrome', { runtime: { id: 'compiled-yomu-extension' } });

        bootReaderApp();

        expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: false, showWelcome: false });
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

    it('boots YouTube embedded frames in restricted mode', () => {
        withWindowProperty('top', {} as Window, () => {
            withWindowProperty('location', new URL('https://www.youtube.com/embed/abc123') as unknown as Location, () => {
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
        expect(appMocks.init).toHaveBeenCalledWith({ embeddedFrame: false, showWelcome: false });
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

function cleanupBootWindow(): void {
    document.getElementById('jpdb-reader-runtime-owner')?.remove();
    delete bootWindow.__yomuReaderAppInitialized;
    delete bootWindow.__yomuRealApp;
    delete bootWindow.__yomuRuntimeKind;
    delete bootWindow.__yomuRuntimeOwnerId;
    delete bootWindow.__yomuDevRuntime;
}
