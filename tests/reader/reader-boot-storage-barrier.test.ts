import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const EPOCH_KEY = 'yomu:state-epoch';

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.head.replaceChildren();
    document.body.replaceChildren();
    vi.resetModules();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
    delete (window as Window & { __yomuReaderAppInitialized?: boolean }).__yomuReaderAppInitialized;
    delete (window as Window & { __yomuRuntimeOwnerId?: string }).__yomuRuntimeOwnerId;
    delete (window as Window & { __yomuRuntimeKind?: string }).__yomuRuntimeKind;
    delete (window as Window & { __yomuRealApp?: unknown }).__yomuRealApp;
});

describe('reader boot managed web-storage barrier', () => {
    it('waits for an async shared reset epoch before runtime construction and preserves startup options', async () => {
        let resolveEpoch!: (value: unknown) => void;
        const delayedEpoch = new Promise<unknown>(resolve => { resolveEpoch = resolve; });
        const cacheSeenByConstructor: Array<string | null> = [];
        const initOptionsSeen: unknown[] = [];
        localStorage.setItem('yomu-ocr-cache-v2', '{"stale-before-reset":true}');
        localStorage.setItem('foreign-host-token', 'keep');

        vi.stubGlobal('GM_getValue', undefined);
        vi.stubGlobal('GM', {
            getValue: vi.fn((key: string, fallback: unknown) => (
                key === EPOCH_KEY ? delayedEpoch : Promise.resolve(fallback)
            )),
        });
        vi.doMock('../../src/reader/app/main', () => ({
            ReaderApp: class {
                constructor() {
                    // OcrController hydrates in ReaderApp construction. Seeing
                    // this raw key here would prove construction outran reset
                    // epoch reconciliation.
                    cacheSeenByConstructor.push(localStorage.getItem('yomu-ocr-cache-v2'));
                }
                init(options: unknown): Promise<void> {
                    initOptionsSeen.push(options);
                    return Promise.resolve();
                }
                destroy(): void { /* no-op test runtime */ }
            },
        }));

        const { installFreshManagedStateEpochSessionForTests } = await import('../../src/reader/app/managed-state-epoch');
        installFreshManagedStateEpochSessionForTests();
        const { DEFAULT_SETTINGS } = await import('../../src/reader/settings/index');
        const { bootReaderApp, bootReaderAppWithStartupSettings } = await import('../../src/reader/app/boot');
        const startupSettings = { ...DEFAULT_SETTINGS, learningTargetChosen: true };
        bootReaderApp();
        const packagedBoot = bootReaderAppWithStartupSettings(startupSettings);
        await Promise.resolve();
        expect(cacheSeenByConstructor).toEqual([]);
        expect(initOptionsSeen).toEqual([]);

        resolveEpoch({ version: 1, generation: 1, resetId: 'remote-reset', committedAt: 1_000 });
        await vi.waitFor(() => expect(cacheSeenByConstructor).toEqual([null]));
        await expect(packagedBoot).resolves.toBe(true);
        expect(initOptionsSeen).toEqual([{
            embeddedFrame: false,
            showWelcome: true,
            startupSettings,
        }]);

        expect(localStorage.getItem('foreign-host-token')).toBe('keep');
    });
});
