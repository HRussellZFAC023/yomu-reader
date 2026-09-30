import { afterEach, describe, expect, it, vi } from 'vitest';

import { USERSCRIPT_STORAGE_BRIDGE_READY_EVENT } from '../../src/reader/app/constants';
import { writeLocalManagedValueOrThrow } from '../../src/reader/app/local-mirror-provenance';
import { resetManagedStateEpochSessionsForTests } from '../../src/reader/app/managed-state-epoch';
import { resetManagedWebStorageForTests } from '../../src/reader/app/managed-web-storage';
import { subscribeToReaderSettingsChanges } from '../../src/reader/app/settings-storage-subscription';
import { loadReaderStartupSettings } from '../../src/reader/app/startup';
import { ensureManagedWebStorageCurrent } from '../../src/reader/app/storage';
import type { ReaderSettings } from '../../src/reader/app/types';
import {
    DEFAULT_SETTINGS,
    SETTINGS_STORAGE_KEY,
    loadSettings,
    saveSettings,
} from '../../src/reader/settings';
import { saveHostedAppearance } from '../../src/reader/settings/hosted-appearance-settings';
import { SETTINGS_INTENT_LEDGER_STORAGE_KEY } from '../../src/reader/settings/intent-ledger';
import { readSettingsPersistenceViewStrictFrom } from '../../src/reader/settings/settings-persistence-transaction';
import { v193Corpus } from './helpers/upgrade-v193-corpus';

const HOSTED_STUDY = new URL('https://yomureader.com/study/');
const LOCAL_PROVENANCE_KEY = 'yomu:local-storage-provenance:v1';
const COMMIT_FIELD = '__yomuSettingsPersistenceCommitV1';

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

    it('saves a standalone choice without queuing transfer to installed storage', async () => {
        vi.stubGlobal('location', HOSTED_STUDY);
        const settings = await loadSettings();

        await saveSettings({ ...settings, theme: 'dark' }, {
            explicitUserChoiceKeys: ['theme'],
        });

        const stored = JSON.parse(storedSettingsBytes() ?? '{}') as Record<string, unknown>;
        expect(stored.theme).toBe('dark');
        expect(stored).not.toHaveProperty('__yomuHostedPendingGmPatch');
    });

    it('does not mirror defaults when an advertised authority rejects every read', async () => {
        vi.stubGlobal('location', HOSTED_STUDY);
        const getValue = vi.fn(() => {
            throw new Error('hosted storage authority rejected the request');
        });
        vi.stubGlobal('GM_getValue', getValue);

        await expect(loadSettings()).rejects.toThrow('hosted storage authority rejected the request');

        expect(getValue).toHaveBeenCalled();
        expectNoStoredSettingsAuthority();
    });

    it('treats a marker with no responder as unavailable after the bridge deadline', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('location', HOSTED_STUDY);
        document.documentElement.dataset.yomuUserscriptStorageBridge = 'true';
        const outcome = loadSettings().then(
            () => ({ error: null as Error | null }),
            error => ({ error: error as Error }),
        );

        await vi.advanceTimersByTimeAsync(10_000);

        await expect(outcome).resolves.toMatchObject({
            error: expect.objectContaining({ message: 'Storage bridge request timed out.' }),
        });
        expect(storedSettingsBytes()).toBeNull();
    });

    it.each([
        { epoch: '0:legacy', loads: true },
        { epoch: '1:an-earlier-reset', loads: false },
    ])('reads same-epoch bytes a v1.9.3 raw toggle rewrote, never another epoch\'s ($epoch)', async ({ epoch, loads }) => {
        vi.stubGlobal('location', HOSTED_STUDY);
        const chosen = {
            ...DEFAULT_SETTINGS,
            learningTargetChosen: true,
            onboardingSeen: true,
            theme: 'dark',
        } satisfies ReaderSettings;
        const before = JSON.stringify(chosen);
        localStorage.setItem(SETTINGS_STORAGE_KEY, before);
        // v1.9.3's docs theme toggle rewrote this record in place, so the bytes
        // no longer match the fingerprint its managed write recorded.
        localStorage.setItem(LOCAL_PROVENANCE_KEY, JSON.stringify({
            version: 1,
            values: {
                [SETTINGS_STORAGE_KEY]: {
                    epoch,
                    fingerprint: 'mismatched-even-when-the-value-bytes-are-stable',
                },
            },
        }));

        if (loads) await expect(loadSettings()).resolves.toMatchObject({ learningTargetChosen: true, onboardingSeen: true, theme: 'dark' });
        else await expect(loadSettings()).rejects.toThrow('without matching provenance');

        expect(storedSettingsBytes()).toBe(before);
    });

    it('does not publish a default remote snapshot after a chosen tab loses authority', async () => {
        vi.stubGlobal('location', HOSTED_STUDY);
        await saveSettings({
            ...DEFAULT_SETTINGS,
            learningTargetChosen: true,
            onboardingSeen: true,
            theme: 'dark',
        }, { explicitUserChoiceKeys: ['learningTargetChosen', 'onboardingSeen', 'theme'] });
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

// A v1.9.x factory reset on yomureader.com certified the page at generation 1
// and purged the settings record. Only that release's hosted raw writers could
// recreate it (Academy seed, homepage demo, theme and language toggles), and
// they wrote no provenance entry.
describe('yomureader.com after a v1.9.x factory reset', () => {
    const RESET = { version: 1, generation: 1, resetId: 'efbac998-0000-4000-8000-0000000000e5', committedAt: 1789895040000 };
    const RAW_WRITER_SCENARIOS = [
        'e1-hosted-homepage-demo',
        'e2-hosted-academy-seed',
        'e3-hosted-appearance-toggles',
    ].flatMap(scenario => ['https://yomureader.com/study/', 'https://yomureader.com/academy/'].map(href => ({ scenario, href })));

    afterEach(() => {
        localStorage.clear();
        vi.unstubAllGlobals();
    });

    function afterV193HostedReset(href: string, settingsBytes: string): void {
        resetManagedStateEpochSessionsForTests();
        resetManagedWebStorageForTests();
        vi.stubGlobal('location', new URL(href));
        localStorage.setItem('yomu:state-epoch', JSON.stringify(RESET));
        localStorage.setItem('yomu:web-storage-epoch:v1:local', `1:${RESET.resetId}`);
        localStorage.setItem(SETTINGS_STORAGE_KEY, settingsBytes);
    }

    function rawWriterFixture(scenario: string): { bytes: string; expected: Record<string, unknown> } {
        const fixture = v193Corpus<{
            webStorage: Record<string, Record<string, string>>;
            expected: Record<string, { settings: Record<string, unknown> }>;
        }>(`${scenario}.json`);
        return {
            bytes: fixture.webStorage['https://yomureader.com'][SETTINGS_STORAGE_KEY],
            expected: fixture.expected['https://yomureader.com/study/'].settings,
        };
    }

    function expectCommittedPair(): Record<string, unknown> {
        const settings = JSON.parse(storedSettingsBytes()!) as Record<string, unknown>;
        const ledger = JSON.parse(localStorage.getItem(SETTINGS_INTENT_LEDGER_STORAGE_KEY)!) as Record<string, unknown>;
        expect(settings[COMMIT_FIELD]).toEqual(expect.any(String));
        expect(ledger[COMMIT_FIELD]).toBe(settings[COMMIT_FIELD]);
        return settings;
    }

    it.each(RAW_WRITER_SCENARIOS)('boots $href from the record a v1.9.3 raw writer recreated ($scenario)', async ({ scenario, href }) => {
        const { bytes, expected } = rawWriterFixture(scenario);
        afterV193HostedReset(href, bytes);

        await ensureManagedWebStorageCurrent();
        await expect(loadReaderStartupSettings()).resolves.toMatchObject({ settings: expected });

        expect(storedSettingsBytes()).toBe(bytes);
    });

    it.each(RAW_WRITER_SCENARIOS)('saves a theme toggle and a Settings Save over it on $href ($scenario)', async ({ scenario, href }) => {
        const { bytes } = rawWriterFixture(scenario);
        afterV193HostedReset(href, bytes);
        await ensureManagedWebStorageCurrent();

        await expect(saveHostedAppearance({ key: 'theme', value: 'dark' })).resolves.toBeUndefined();
        expect(expectCommittedPair()).toMatchObject({ theme: 'dark' });

        const current = await loadSettings();
        await expect(saveSettings({ ...current, subtitleFontSize: 44 }, { explicitUserChoiceKeys: ['subtitleFontSize'] })).resolves.toBeUndefined();
        expect(expectCommittedPair()).toMatchObject({ theme: 'dark', subtitleFontSize: 44 });
    });

    it.each([
        { case: 'an unattested record that carries learner data', settings: { learningTargetChosen: false, theme: 'dark', apiKey: 'another-epoch-key' }, attestedTo: null },
        { case: 'a raw-writer record attested to another epoch', settings: { learningTargetChosen: false, theme: 'dark' }, attestedTo: '0:legacy' },
    ])('still refuses $case, bytes unchanged', async ({ settings, attestedTo }) => {
        const bytes = JSON.stringify(settings);
        afterV193HostedReset('https://yomureader.com/study/', bytes);
        if (attestedTo) {
            localStorage.setItem(LOCAL_PROVENANCE_KEY, JSON.stringify({
                version: 1,
                values: { [SETTINGS_STORAGE_KEY]: { epoch: attestedTo, fingerprint: 'from-before-the-reset' } },
            }));
        }
        await ensureManagedWebStorageCurrent();

        await expect(loadReaderStartupSettings()).rejects.toThrow('without matching provenance');
        await expect(saveHostedAppearance({ key: 'theme', value: 'light' })).rejects.toThrow('without matching provenance');

        expect(storedSettingsBytes()).toBe(bytes);
        expect(localStorage.getItem(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toBeNull();
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
