import { afterEach, describe, expect, it, vi } from 'vitest';

import { USERSCRIPT_STORAGE_BRIDGE_READY_EVENT } from '../../src/reader/app/constants';
import { writeLocalManagedValueOrThrow } from '../../src/reader/app/local-mirror-provenance';
import { subscribeToReaderSettingsChanges } from '../../src/reader/app/settings-storage-subscription';
import type { ReaderSettings } from '../../src/reader/app/types';
import {
    DEFAULT_SETTINGS,
    SETTINGS_STORAGE_KEY,
    loadSettings,
    loadSettingsWithWitnessedAuthority,
    saveSettings,
} from '../../src/reader/settings';
import { readSettingsPersistenceViewStrictFrom } from '../../src/reader/settings/settings-persistence-transaction';

const HOSTED_STUDY = new URL('https://yomureader.com/study/');
const LOCAL_PROVENANCE_KEY = 'yomu:local-storage-provenance:v1';

function storedSettingsBytes(): string | null {
    return localStorage.getItem(SETTINGS_STORAGE_KEY);
}

function expectNoStoredSettingsAuthority(): void {
    expect(storedSettingsBytes()).toBeNull();
    const provenance = JSON.parse(localStorage.getItem(LOCAL_PROVENANCE_KEY) ?? '{"values":{}}');
    expect(provenance.values).not.toHaveProperty(SETTINGS_STORAGE_KEY);
}

describe('hosted settings authority availability', () => {
    afterEach(() => {
        delete document.documentElement.dataset.yomuUserscriptStorageBridge;
        localStorage.clear();
        sessionStorage.clear();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('does not turn a fresh standalone default snapshot into stored learner data', async () => {
        vi.stubGlobal('location', HOSTED_STUDY);

        await expect(loadSettings()).resolves.toMatchObject({
            learningTargetChosen: false,
            onboardingSeen: false,
        });

        expectNoStoredSettingsAuthority();
    });

    it('promotes only the learner change after an unwritten standalone default snapshot', async () => {
        vi.stubGlobal('location', HOSTED_STUDY);
        const settings = await loadSettings();

        await saveSettings({ ...settings, theme: 'dark' }, {
            explicitUserChoiceKeys: ['theme'],
        });

        const stored = JSON.parse(storedSettingsBytes() ?? '{}') as Record<string, unknown>;
        expect(stored.__yomuHostedPendingGmPatch).toEqual({ theme: 'dark' });
    });

    it('does not mirror defaults when an advertised authority rejects every read', async () => {
        vi.stubGlobal('location', HOSTED_STUDY);
        const getValue = vi.fn(() => {
            throw new Error('hosted storage authority rejected the request');
        });
        vi.stubGlobal('GM_getValue', getValue);

        await expect(loadSettings()).resolves.toMatchObject({
            learningTargetChosen: false,
            onboardingSeen: false,
        });

        expect(getValue).toHaveBeenCalled();
        expectNoStoredSettingsAuthority();
    });

    it('treats a marker with no responder as unavailable after the bridge deadline', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('location', HOSTED_STUDY);
        document.documentElement.dataset.yomuUserscriptStorageBridge = 'true';
        const outcome = loadSettingsWithWitnessedAuthority().then(
            () => ({ error: null as Error | null }),
            error => ({ error: error as Error }),
        );

        await vi.advanceTimersByTimeAsync(10_000);

        await expect(outcome).resolves.toMatchObject({
            error: expect.objectContaining({ message: 'Storage bridge request timed out.' }),
        });
        expect(storedSettingsBytes()).toBeNull();
    });

    it('preserves physically present bytes when their provenance cannot attest them', async () => {
        vi.stubGlobal('location', HOSTED_STUDY);
        const chosen = {
            ...DEFAULT_SETTINGS,
            learningTargetChosen: true,
            onboardingSeen: true,
            theme: 'dark',
        } satisfies ReaderSettings;
        const before = JSON.stringify(chosen);
        localStorage.setItem(SETTINGS_STORAGE_KEY, before);
        localStorage.setItem(LOCAL_PROVENANCE_KEY, JSON.stringify({
            version: 1,
            values: {
                [SETTINGS_STORAGE_KEY]: {
                    epoch: '0:legacy',
                    fingerprint: 'mismatched-even-when-the-value-bytes-are-stable',
                },
            },
        }));

        await expect(loadSettings()).resolves.toMatchObject({
            learningTargetChosen: false,
            onboardingSeen: false,
        });

        expect(storedSettingsBytes()).toBe(before);
        expect(JSON.parse(storedSettingsBytes() ?? 'null')).toMatchObject({
            learningTargetChosen: true,
            onboardingSeen: true,
            theme: 'dark',
        });
    });

    it('does not publish a default remote snapshot after a chosen tab loses authority', async () => {
        vi.stubGlobal('location', HOSTED_STUDY);
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            ...DEFAULT_SETTINGS,
            learningTargetChosen: true,
            onboardingSeen: true,
            theme: 'dark',
        }));
        const onSettings = vi.fn<[ReaderSettings], void>();
        const unsubscribe = subscribeToReaderSettingsChanges(onSettings);
        await vi.waitFor(() => expect(onSettings).toHaveBeenCalledTimes(1));
        expect(onSettings.mock.calls[0]?.[0]).toMatchObject({
            learningTargetChosen: true,
            onboardingSeen: true,
            theme: 'dark',
        });

        localStorage.clear();
        const getValue = vi.fn(() => {
            throw new Error('late bridge authority is unavailable');
        });
        vi.stubGlobal('GM_getValue', getValue);
        window.dispatchEvent(new CustomEvent(USERSCRIPT_STORAGE_BRIDGE_READY_EVENT));

        await vi.waitFor(() => expect(getValue).toHaveBeenCalled());
        await Promise.resolve();
        expect(onSettings).toHaveBeenCalledTimes(1);
        unsubscribe();
    });
});

describe('settings persistence witness', () => {
    it('rejects three unstable samples instead of presenting an empty profile', async () => {
        let settingsRead = 0;
        const read = vi.fn(async <T>(key: string, fallback: T): Promise<T> => {
            if (key !== SETTINGS_STORAGE_KEY) return fallback;
            return { theme: settingsRead++ % 2 ? 'dark' : 'light' } as T;
        });

        await expect(readSettingsPersistenceViewStrictFrom(read))
            .rejects.toThrow('stable committed snapshot');
        expect(read).toHaveBeenCalledTimes(12);
    });
});

describe('hosted local mirror publication', () => {
    afterEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('restores the previous value and provenance when provenance publication fails', () => {
        const epoch = { version: 1, generation: 1, resetId: 'atomic-mirror', committedAt: 1 } as const;
        const before = { theme: 'dark', onboardingSeen: true };
        writeLocalManagedValueOrThrow(SETTINGS_STORAGE_KEY, before, epoch);
        const beforeBytes = storedSettingsBytes();
        const beforeProvenance = localStorage.getItem(LOCAL_PROVENANCE_KEY);
        const nativeSetItem = Storage.prototype.setItem;
        let rejectNextProvenanceWrite = true;
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
            this: Storage,
            key: string,
            value: string,
        ) {
            if (key === LOCAL_PROVENANCE_KEY && rejectNextProvenanceWrite) {
                rejectNextProvenanceWrite = false;
                throw new Error('provenance publication rejected');
            }
            nativeSetItem.call(this, key, value);
        });

        expect(() => writeLocalManagedValueOrThrow(
            SETTINGS_STORAGE_KEY,
            { theme: 'light', onboardingSeen: false },
            epoch,
        )).toThrow(/provenance publication rejected/);

        expect(storedSettingsBytes()).toBe(beforeBytes);
        expect(localStorage.getItem(LOCAL_PROVENANCE_KEY)).toBe(beforeProvenance);
    });
});
