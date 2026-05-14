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

type BootWindow = Window & {
    __jpdbPopupReaderInitialized?: boolean;
    __yomuDemoApp?: unknown;
    __yomuReaderAppInitialized?: boolean;
    __yomuRealApp?: unknown;
    __yomuRuntimeKind?: unknown;
    __yomuRuntimeOwnerId?: unknown;
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
        const prototypeDispatch = vi.spyOn(window.EventTarget.prototype, 'dispatchEvent');

        withWindowProperty('dispatchEvent', undefined, () => {
            expect(() => bootReaderApp()).not.toThrow();
        });

        expect(prototypeDispatch).toHaveBeenCalled();
        expect(appMocks.init).toHaveBeenCalledWith({ isDemo: false, showWelcome: true });
        expect(document.getElementById('jpdb-reader-runtime-owner')?.dataset.yomuRuntimeKind).toBe('userscript');
    });

    it('registers runtime claim listeners when a page shadows window.addEventListener', () => {
        const prototypeAdd = vi.spyOn(window.EventTarget.prototype, 'addEventListener');

        withWindowProperty('addEventListener', undefined, () => {
            expect(() => bootReaderApp()).not.toThrow();
        });

        window.dispatchEvent(new CustomEvent('yomu-reader-runtime-claim', {
            detail: { ownerId: 'replacement-runtime', kind: 'userscript', priority: 2 },
        }));

        expect(prototypeAdd).toHaveBeenCalled();
        expect(appMocks.destroy).toHaveBeenCalled();
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
    delete bootWindow.__jpdbPopupReaderInitialized;
    delete bootWindow.__yomuDemoApp;
    delete bootWindow.__yomuReaderAppInitialized;
    delete bootWindow.__yomuRealApp;
    delete bootWindow.__yomuRuntimeKind;
    delete bootWindow.__yomuRuntimeOwnerId;
}
