import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveHostedAppearance } from '../../src/reader/settings/hosted-appearance-settings';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { ReaderSettings } from '../../src/reader/app/types';
import { applySettingsIntent } from '../../src/reader/settings/intent-ledger';
import { readBackupSettingsPersistenceView, serializeSettingsPersistencePair, SETTINGS_STORAGE_KEY } from '../../src/reader/settings/settings-persistence-transaction';

function extractFunction(source: string, name: string): string {
    const match = source.match(new RegExp(`^( +)(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^\\1\\}`, 'mu'));
    if (!match) throw new Error(`Missing hosted shell function: ${name}`);
    return match[0];
}

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe.each([
    ['PDF', 'docs/public/pdf-reader/index.html'],
    ['Video', 'docs/public/video-player/index.html'],
])('%s appearance authority', (_name, file) => {
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
