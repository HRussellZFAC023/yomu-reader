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
import { applySettingsIntent, SETTINGS_INTENT_LEDGER_STORAGE_KEY } from '../../src/reader/settings/intent-ledger';
import { readSettingsPersistenceViewStrictFrom } from '../../src/reader/settings/settings-persistence-transaction';
import { v193Corpus } from './helpers/upgrade-v193-corpus';
import { readBackupSettingsPersistenceView, serializeSettingsPersistencePair, SETTINGS_STORAGE_KEY as SETTINGS_STORAGE_KEY2 } from "../../src/reader/settings/settings-persistence-transaction";
import { HOSTED_STUDY_LOCATION, installGmStorageFixture } from "./helpers/settings-persistence-fixture";
import { readFileSync } from "node:fs";
import { persistHostedSharedSettingsPatch } from "../../src/reader/settings/hosted-settings-provenance";

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

        await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);

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
        // v1.9.3 stored its onboarding flags in the same record; v2 drops them on read.
        const v193Record = {
            ...DEFAULT_SETTINGS,
            learningTargetChosen: true,
            onboardingSeen: true,
            theme: 'dark',
        };
        const before = JSON.stringify(v193Record);
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

        if (loads) {
            const loaded = await loadSettings();
            expect(loaded).toMatchObject({ theme: 'dark' });
            expect(loaded).not.toHaveProperty('learningTargetChosen');
            expect(loaded).not.toHaveProperty('onboardingSeen');
        } else {
            await expect(loadSettings()).rejects.toThrow('without matching provenance');
        }

        expect(storedSettingsBytes()).toBe(before);
    });

    it('does not publish a default remote snapshot after a tab with saved choices loses authority', async () => {
        vi.stubGlobal('location', HOSTED_STUDY);
        await saveSettings({
            ...DEFAULT_SETTINGS,
            showFurigana: false,
            theme: 'dark',
        }, { explicitUserChoiceKeys: ['showFurigana', 'theme'] });
        const onSettings = vi.fn<[ReaderSettings], void>();
        const unsubscribe = subscribeToReaderSettingsChanges(onSettings);
        await vi.waitFor(() => expect(onSettings).toHaveBeenCalledTimes(1));
        expect(onSettings.mock.calls[0]?.[0]).toMatchObject({
            showFurigana: false,
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
        // v1.9.3 showed its onboarding flags too; v2 drops them and keeps the rest.
        const expected = { ...fixture.expected['https://yomureader.com/study/'].settings };
        delete expected.learningTargetChosen;
        delete expected.onboardingSeen;
        // The stored bytes stay untouched, but 2.1 shows the retired green
        // default accent as the brand red.
        if (expected.accentColor === '#5ea780') expected.accentColor = '#b8324e';
        // These demo records never chose a size; 2.2 uses Auto instead of 28px.
        if (expected.subtitleFontSize === 28) expected.subtitleFontSize = 0;
        return {
            bytes: fixture.webStorage['https://yomureader.com'][SETTINGS_STORAGE_KEY],
            expected,
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
        const before = { theme: 'dark', showFurigana: false };
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
            { theme: 'light', showFurigana: true },
            epoch,
        )).toThrow(/provenance publication rejected/);

        expect(storedSettingsBytes()).toBe(beforeBytes);
        expect(localStorage.getItem(LOCAL_PROVENANCE_KEY)).toBe(beforeProvenance);
    });
});

describe('standalone appearance transaction', () => {
    afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });


    it('advances declared intent and preserves unrelated settings', async () => {
        const initial = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, theme: 'light', subtitleFontSize: 48 }, {
            revision: 7, records: { theme: { seq: 7, value: 'light' } },
        });
        const { values } = installGmStorageFixture(new Map(Object.entries(initial)));
        await saveHostedAppearance({ key: 'theme', value: 'dark' });
        expect(await readBackupSettingsPersistenceView(Object.fromEntries(values))).toMatchObject({
            settings: { theme: 'dark', subtitleFontSize: 48 },
            intentLedger: { revision: 8, records: { theme: { value: 'dark', seq: 8 } } },
        });
        expect(values.get(SETTINGS_STORAGE_KEY2)).not.toEqual(initial[SETTINGS_STORAGE_KEY2]);
    });

    it.each([
        'e1-hosted-homepage-demo',
        'e2-hosted-academy-seed',
        'e3-hosted-appearance-toggles',
    ])('saves over the page-local record v1.9.3 wrote for a no-install visitor (%s)', async scenario => {
        const fixture = v193Corpus<{ webStorage: Record<string, Record<string, string>> }>(`${scenario}.json`);
        resetManagedStateEpochSessionsForTests();
        resetManagedWebStorageForTests();
        vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
        for (const [key, value] of Object.entries(fixture.webStorage['https://yomureader.com'])) localStorage.setItem(key, value);
        const before = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY2)!) as Record<string, unknown>;

        await saveHostedAppearance({ key: 'theme', value: 'dark' });

        const view = await readBackupSettingsPersistenceView({
            [SETTINGS_STORAGE_KEY2]: JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY2)!),
            'yomu:settings-intent:v2': JSON.parse(localStorage.getItem('yomu:settings-intent:v2')!),
        });
        expect(view?.settings).toEqual({ ...before, theme: 'dark' });
        expect(view?.intentLedger.records).toMatchObject({ theme: { value: 'dark' } });
        expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY2)!).__yomuSettingsPersistenceCommitV1).toEqual(expect.any(String));
    });

    it('serializes concurrent theme and language choices into one witnessed authority', async () => {
        const { values } = installGmStorageFixture();
        await Promise.all([
            saveHostedAppearance({ key: 'theme', value: 'dark' }),
            saveHostedAppearance({ key: 'interfaceLanguage', value: 'ja' }),
        ]);
        expect(await readBackupSettingsPersistenceView(Object.fromEntries(values))).toMatchObject({
            settings: { theme: 'dark', interfaceLanguage: 'ja' },
            intentLedger: { revision: 2, records: {
                theme: { value: 'dark' }, interfaceLanguage: { value: 'ja' },
            } },
        });
    });

    it.each([
        { key: 'apiKey', value: 'unwanted' },
        { key: 'theme', value: 'blue' },
        { key: 'interfaceLanguage', value: 'invalid' },
        { key: 'theme', value: 'dark', apiKey: 'unwanted' },
        null,
    ])('rejects an invalid shell request without storage writes (%j)', async choice => {
        const { setValue } = installGmStorageFixture();
        await expect(saveHostedAppearance(choice as never)).rejects.toThrow('Invalid appearance choice');
        expect(setValue).not.toHaveBeenCalled();
    });

    it('rejects a failed publication and preserves the prior committed choice', async () => {
        const initial = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, theme: 'light' }, {
            revision: 7, records: { theme: { seq: 7, value: 'light' } },
        });
        let failed = false;
        const failure = new Error('Fixture write refused');
        const { values } = installGmStorageFixture(new Map(Object.entries(initial)), {
            beforeSet: (key, value) => {
                if (!failed && key === SETTINGS_STORAGE_KEY2 && (value as { theme?: unknown }).theme === 'dark') {
                    failed = true;
                    throw failure;
                }
            },
        });
        await expect(saveHostedAppearance({ key: 'theme', value: 'dark' })).rejects.toThrow('Fixture write refused');
        expect(failed).toBe(true);
        expect(await readBackupSettingsPersistenceView(Object.fromEntries(values))).toMatchObject({
            settings: { theme: 'light' }, intentLedger: { revision: 7 },
        });
        await saveHostedAppearance({ key: 'theme', value: 'dark' });
        expect(await readBackupSettingsPersistenceView(Object.fromEntries(values))).toMatchObject({
            settings: { theme: 'dark' }, intentLedger: { revision: 8 },
        });
    });
});

describe('VitePress hosted settings target provenance', () => {
    afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });


    it('persists a first explicit appearance choice as the only shared setting', async () => {
        const { values } = installGmStorageFixture();
        await persistHostedSharedSettingsPatch({ theme: 'dark' }, true);
        const view = await readBackupSettingsPersistenceView(Object.fromEntries(values));
        expect(view?.settings).toEqual({ theme: 'dark' });
        expect(view?.intentLedger).toMatchObject({ revision: 1, records: { theme: { seq: 1, value: 'dark' } } });
    });

    it('does not create shared learner settings from passive hosted appearance state', async () => {
        const { values } = installGmStorageFixture();
        await persistHostedSharedSettingsPatch({ theme: 'dark' }, false);
        expect(values.has(SETTINGS_STORAGE_KEY2)).toBe(false);
    });

    it('preserves existing shared preferences', async () => {
        const pair = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, subtitleFontSize: 48 }, { revision: 0, records: {} });
        const { values } = installGmStorageFixture(new Map(Object.entries(pair)));
        await persistHostedSharedSettingsPatch({ theme: 'dark' }, true);
        expect(values.get(SETTINGS_STORAGE_KEY2)).toMatchObject({ subtitleFontSize: 48, theme: 'dark' });
    });

    it('serializes the docs shared patch with the canonical settings transaction', () => {
        const theme = readFileSync('docs/.vitepress/theme/index.ts', 'utf8');
        expect(theme).toContain('persistHostedSharedSettingsPatch(patch, userChoice)');
        expect(theme).toContain('writeStoredSettingsPatch({ theme }, { userChoice: true })');
        expect(theme).not.toContain('gmStorageSet(SETTINGS_STORAGE_KEY');
        expect(theme).not.toContain('localStorage.setItem(SETTINGS_STORAGE_KEY');
        expect(theme).not.toContain('prepareHostedDemoVideoSettings');
    });
});

function extractFunction(source: string, name: string): string {
    const match = source.match(new RegExp(`^( +)(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^\\1\\}`, 'mu'));
    if (!match) throw new Error(`Missing hosted shell function: ${name}`);
    return match[0];
}

describe.each([
    ['PDF', 'docs/public/pdf-reader/index.html'],
    ['Video', 'docs/public/video-player/index.html'],
])('%s appearance authority', (_name, file) => {
    afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });
    it('starts with the automatic theme when reading browser storage throws', () => {
        const source = readFileSync(file, 'utf8');
        const functions = ['readLocalPreference', 'normalizeTheme', 'themePreference'].filter(name => source.includes(`function ${name}(`)).map(name => extractFunction(source, name)).join('\n');
        const storage = { getItem() { throw new Error('denied'); } };
        const read = Function('localStorage', `const themeKey = 'theme'; const readSettings = () => ({}); ${functions}; return themePreference;`)(storage);
        expect(read()).toBe('auto');
    });

    it.each(['dark', 'auto'])('applies an incoming %s theme when browser storage is denied', theme => {
        const source = readFileSync(file, 'utf8');
        const functions = ['themePreferenceFromEvent', 'syncFromSettingsEvent'].filter(name => source.includes(`function ${name}(`)).map(name => extractFunction(source, name)).join('\n');
        const paint = vi.fn(), accent = vi.fn();
        const storage = { setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
        const run = Function('localStorage', 'applyTheme', 'applyAccent', `const themeKey = 'theme'; ${functions}; return syncFromSettingsEvent;`)(storage, paint, accent);
        expect(() => run({ detail: { settings: { theme } } })).not.toThrow();
        expect(paint).toHaveBeenCalledWith(theme);
        expect(accent).toHaveBeenCalledOnce();
    });

    it.each(['en', 'ja'])('leaves the UI unchanged on failure, unlocks controls and allows retry (%s)', async language => {
        const source = readFileSync(file, 'utf8');
        const functions = ['saveAppearanceChoice', 'saveThemePreference'].map(name => extractFunction(source, name)).join('\n');
        const controls = { theme: { disabled: false }, language: { disabled: false } };
        const paint = vi.fn();
        const status = vi.fn();
        const dispatch = vi.fn();
        const save = vi.fn(async (): Promise<void> => { throw new Error('write failed'); });
        const create = Function('loadAppearanceModule', 'window', 'CustomEvent', 'controls', 'paint', 'setStatus', 'language', `
            const themeToggle = controls.theme, languageToggle = controls.language;
            const settingsChangeEvent = 'settings';
            const applyTheme = paint, applyAccent = () => {};
            const effectiveInterfaceLanguage = () => language;
            ${functions}
            return saveThemePreference;
        `);
        const change = create(async () => ({ saveHostedAppearance: save }), { dispatchEvent: dispatch }, CustomEvent, controls, paint, status, language);
        await change('dark');
        expect(paint).not.toHaveBeenCalled();
        expect(dispatch).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(expect.stringContaining(language === 'ja' ? '保存できません' : 'could not be saved'));
        expect(controls.theme.disabled || controls.language.disabled).toBe(false);
        save.mockImplementation(async () => undefined);
        await change('dark');
        expect(paint).toHaveBeenCalledWith('dark');
        expect(dispatch).toHaveBeenCalledOnce();
    });

    it.each([
        { key: 'theme' as const, before: 'light', after: 'dark', writer: 'saveThemePreference' },
        { key: 'interfaceLanguage' as const, before: 'en', after: 'ja', writer: 'saveInterfaceLanguage' },
    ])('persists an explicit $key choice before Reader startup', async ({ key, before, after, writer }) => {
        const pair = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, [key]: before }, {
            revision: 7, records: { [key]: { seq: 7, value: before } },
        });
        const { values } = installGmStorageFixture(new Map(Object.entries(pair)));
        const originalCommit = (values.get(SETTINGS_STORAGE_KEY) as Record<string, unknown>).__yomuSettingsPersistenceCommitV1;
        const source = readFileSync(file, 'utf8');
        const functions = ['saveAppearanceChoice', writer].map(name => extractFunction(source, name)).join('\n');
        const controls = { theme: { disabled: false }, language: { disabled: false } };
        const run = Function('loadAppearanceModule', 'window', 'CustomEvent', 'controls', `
            const settingsKey = ${JSON.stringify(SETTINGS_STORAGE_KEY)};
            const themeKey = 'yomu-page-theme', settingsChangeEvent = 'settings', languageEvent = 'language';
            const applyTheme = () => {}, applyAccent = () => {}, applyInterfaceLanguage = () => {};
            const themeToggle = controls.theme, languageToggle = controls.language;
            const effectiveInterfaceLanguage = () => 'en';
            const setStatus = message => { throw new Error(message); };
            ${functions}
            return ${writer}(${JSON.stringify(after)});
        `);
        await run(async () => ({ saveHostedAppearance }), { dispatchEvent() {} }, CustomEvent, controls);
        const view = await readBackupSettingsPersistenceView(Object.fromEntries(values));
        expect(view).not.toBeNull();
        expect(applySettingsIntent(view!.settings as Partial<ReaderSettings>, view!.intentLedger)[key]).toBe(after);
        expect(view!.intentLedger.records[key]).toMatchObject({ value: after });
        expect((values.get(SETTINGS_STORAGE_KEY) as Record<string, unknown>).__yomuSettingsPersistenceCommitV1).not.toBe(originalCommit);
        expect(controls.theme.disabled || controls.language.disabled).toBe(false);
        expect(source).not.toContain('localStorage.setItem(settingsKey');
    });
});
