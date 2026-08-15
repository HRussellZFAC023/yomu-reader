import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const settingsSubscriptionMocks = vi.hoisted(() => ({
    activeListeners: new Set<(settings: unknown) => void>(),
    subscribe: vi.fn(),
    unsubscribers: [] as unknown[],
    loadSnapshot: undefined as ReaderSettings | undefined,
}));

vi.mock('../../src/reader/settings/index', async importOriginal => {
    const original = await importOriginal<typeof import('../../src/reader/settings/index')>();
    const loadSnapshot = async (): Promise<ReaderSettings> => settingsSubscriptionMocks.loadSnapshot
        ?? original.loadSettings();
    return {
        ...original,
        subscribeToSettingsStorageChanges: settingsSubscriptionMocks.subscribe,
        loadSettings: loadSnapshot,
        loadSettingsWithWitnessedAuthority: loadSnapshot,
    };
});

import { ReaderApp } from '../../src/reader/app/main';
import type { ReaderSettings } from '../../src/reader/app/types';
import {
    activeLearningTargetLanguage,
    resetActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';
import {
    DEFAULT_SETTINGS,
    SETTINGS_STORAGE_KEY,
} from '../../src/reader/settings';

interface WakeInternals {
    settings: ReaderSettings;
    installStyles: () => void;
    installFab: () => void;
    installBunproTokenImporter: () => Promise<void>;
    setupAutoScan: () => void;
    initJpdbPageEnhancements: () => void;
    installCardStateSignalSubscription: () => void;
    scheduleInitialReaderWork: (shadowDiscoveryUncertain: boolean) => void;
    scheduleDictionaryRescan: () => void;
    refreshDictionaryStyles: () => Promise<void>;
    registerMenuCommands: () => void;
    bindEvents: () => void;
    subtitles: { init: () => void; refresh: () => void };
    ocr: { init: () => void; refresh: () => void };
    youtube: { init: () => void; refresh: () => void };
}

function emitPersistedSettings(settings: ReaderSettings): void {
    for (const listener of [...settingsSubscriptionMocks.activeListeners]) listener(settings);
}

function chosenKoreanSettings(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
    return {
        ...DEFAULT_SETTINGS,
        ...overrides,
        learningTargetChosen: true,
        onboardingSeen: true,
        languageProfiles: DEFAULT_SETTINGS.languageProfiles.map((profile, index) => index === 0
            ? { ...profile, targetLanguage: 'ko' }
            : { ...profile }),
    };
}

function resetTestPage(): void {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    document.head.replaceChildren();
    document.body.replaceChildren();
}

function prepareWakeHarness(app: ReaderApp) {
    const internals = app as unknown as WakeInternals;
    internals.installStyles = vi.fn();
    internals.installFab = vi.fn();
    internals.installBunproTokenImporter = vi.fn(async () => undefined);
    internals.setupAutoScan = vi.fn();
    internals.initJpdbPageEnhancements = vi.fn();
    internals.installCardStateSignalSubscription = vi.fn();
    internals.scheduleInitialReaderWork = vi.fn();
    internals.scheduleDictionaryRescan = vi.fn();
    internals.refreshDictionaryStyles = vi.fn(async () => undefined);
    internals.registerMenuCommands = vi.fn();
    internals.bindEvents = vi.fn();
    return {
        internals,
        subtitleInit: vi.spyOn(internals.subtitles, 'init').mockImplementation(() => undefined),
        ocrInit: vi.spyOn(internals.ocr, 'init').mockImplementation(() => undefined),
        youtubeInit: vi.spyOn(internals.youtube, 'init').mockImplementation(() => undefined),
        subtitleRefresh: vi.spyOn(internals.subtitles, 'refresh').mockImplementation(() => undefined),
        ocrRefresh: vi.spyOn(internals.ocr, 'refresh').mockImplementation(() => undefined),
        youtubeRefresh: vi.spyOn(internals.youtube, 'refresh').mockImplementation(() => undefined),
    };
}

async function expectChosenTargetStarted(
    harness: ReturnType<typeof prepareWakeHarness>,
    chosen: ReaderSettings,
): Promise<void> {
    await vi.waitFor(() => expect(harness.subtitleInit).toHaveBeenCalledOnce());
    expect(harness.internals.settings).toBe(chosen);
    expect(activeLearningTargetLanguage()).toBe('ko');
    expect(harness.ocrInit).toHaveBeenCalledOnce();
    expect(harness.youtubeInit).toHaveBeenCalledOnce();
}

describe('top-level learning-target wake policy', () => {
    let app: ReaderApp | undefined;

    beforeEach(() => {
        settingsSubscriptionMocks.activeListeners.clear();
        settingsSubscriptionMocks.unsubscribers = [];
        settingsSubscriptionMocks.loadSnapshot = undefined;
        settingsSubscriptionMocks.subscribe.mockReset();
        settingsSubscriptionMocks.subscribe.mockImplementation((listener: (settings: unknown) => void) => {
            settingsSubscriptionMocks.activeListeners.add(listener);
            const unsubscribe = vi.fn(() => {
                settingsSubscriptionMocks.activeListeners.delete(listener);
            });
            settingsSubscriptionMocks.unsubscribers.push(unsubscribe);
            return unsubscribe;
        });
        resetTestPage();
        vi.stubGlobal('location', new URL('https://www.youtube.com/watch?v=fresh-target'));
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
            fillStyle: '#ffffff',
        } as never);
    });

    afterEach(() => {
        app?.destroy();
        resetActiveLearningTargetLanguage();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        resetTestPage();
    });

    it('stays target-neutral after dismissal, then starts once when another tab persists a target', async () => {
        app = new ReaderApp();
        const harness = prepareWakeHarness(app);
        const {
            internals,
            subtitleInit, ocrInit, youtubeInit,
            subtitleRefresh, ocrRefresh, youtubeRefresh,
        } = harness;
        const expectTargetSurfacesInert = (): void => {
            expect(internals.installFab).not.toHaveBeenCalled();
            expect(subtitleInit).not.toHaveBeenCalled();
            expect(ocrInit).not.toHaveBeenCalled();
            expect(youtubeInit).not.toHaveBeenCalled();
            expect(subtitleRefresh).not.toHaveBeenCalled();
            expect(ocrRefresh).not.toHaveBeenCalled();
            expect(youtubeRefresh).not.toHaveBeenCalled();
        };

        const initializing = app.init({ showWelcome: true });
        const closeSetup = await vi.waitUntil(() => document.querySelector<HTMLButtonElement>('[data-onboarding-action="close"]'));
        closeSetup.click();
        await initializing;

        expect(settingsSubscriptionMocks.subscribe).toHaveBeenCalledOnce();
        expect(settingsSubscriptionMocks.activeListeners.size).toBe(1);
        expectTargetSurfacesInert();
        expect(internals.registerMenuCommands).not.toHaveBeenCalled();
        expect(internals.bindEvents).not.toHaveBeenCalled();

        emitPersistedSettings({ ...DEFAULT_SETTINGS, theme: 'dark', learningTargetChosen: false });
        await Promise.resolve();

        expect(internals.settings.learningTargetChosen).toBe(false);
        expect(internals.settings.theme).toBe('auto');
        expectTargetSurfacesInert();

        const chosen = chosenKoreanSettings({ theme: 'dark' });
        emitPersistedSettings(chosen);

        await expectChosenTargetStarted(harness, chosen);
        expect(internals.installFab).toHaveBeenCalledOnce();
        expect(subtitleRefresh).not.toHaveBeenCalled();
        expect(ocrRefresh).not.toHaveBeenCalled();
        expect(youtubeRefresh).not.toHaveBeenCalled();
        expect(internals.setupAutoScan).toHaveBeenCalledOnce();
        expect(internals.scheduleInitialReaderWork).toHaveBeenCalledOnce();
        expect(internals.refreshDictionaryStyles).toHaveBeenCalledOnce();
        expect(internals.scheduleDictionaryRescan).not.toHaveBeenCalled();
        expect(internals.registerMenuCommands).toHaveBeenCalledOnce();
        expect(internals.bindEvents).toHaveBeenCalledOnce();
        expect(settingsSubscriptionMocks.subscribe).toHaveBeenCalledTimes(2);
        expect(settingsSubscriptionMocks.unsubscribers[0]).toHaveBeenCalledOnce();
        expect(settingsSubscriptionMocks.activeListeners.size).toBe(1);

        emitPersistedSettings({ ...chosen, subtitleFontSize: chosen.subtitleFontSize + 1 });
        await Promise.resolve();

        expect(internals.installFab).toHaveBeenCalledTimes(2);
        expect(subtitleInit).toHaveBeenCalledOnce();
        expect(ocrInit).toHaveBeenCalledOnce();
        expect(youtubeInit).toHaveBeenCalledOnce();
        expect(subtitleRefresh).toHaveBeenCalledOnce();
        expect(ocrRefresh).toHaveBeenCalledOnce();
        expect(youtubeRefresh).toHaveBeenCalledOnce();
        expect(internals.refreshDictionaryStyles).toHaveBeenCalledTimes(2);
        expect(internals.scheduleDictionaryRescan).toHaveBeenCalledOnce();
    });

    it('reconciles a target persisted while the welcome dialog was still open', async () => {
        app = new ReaderApp();
        const harness = prepareWakeHarness(app);
        const chosen = chosenKoreanSettings();

        const initializing = app.init({ showWelcome: true });
        const closeSetup = await vi.waitUntil(() => document.querySelector<HTMLButtonElement>('[data-onboarding-action="close"]'));
        expect(settingsSubscriptionMocks.subscribe).not.toHaveBeenCalled();

        settingsSubscriptionMocks.loadSnapshot = chosen;
        closeSetup.click();
        await initializing;

        await expectChosenTargetStarted(harness, chosen);
        expect(settingsSubscriptionMocks.subscribe).toHaveBeenCalledTimes(2);
        expect(settingsSubscriptionMocks.activeListeners.size).toBe(1);
    });

    it('wakes on visibility reconciliation when the userscript manager has no change listener', async () => {
        app = new ReaderApp();
        const harness = prepareWakeHarness(app);
        const initializing = app.init({ showWelcome: true });
        const closeSetup = await vi.waitUntil(() => document.querySelector<HTMLButtonElement>('[data-onboarding-action="close"]'));
        closeSetup.click();
        await initializing;

        const chosen = chosenKoreanSettings();
        settingsSubscriptionMocks.loadSnapshot = chosen;
        document.dispatchEvent(new Event('visibilitychange'));

        await expectChosenTargetStarted(harness, chosen);
    });
});
