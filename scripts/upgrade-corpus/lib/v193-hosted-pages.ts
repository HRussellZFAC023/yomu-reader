// yomureader.com page writers as v1.9.3 shipped them. The docs theme and the
// PDF Reader shell keep their writers module-private or inline, so their exact
// source is lifted from the reference checkout (see shipped-functions.ts); the
// Academy seed is imported and driven through its public boot entry point.
import { HOSTED_DEMO_VIDEO_SETTINGS_PATCH } from '@yomu-ref/docs/.vitepress/theme/hosted-demo-settings';
import { initYomuReaderRuntime } from '@yomu-ref/src/academy/integration/yomu-runtime';
import { gmStorageGetShared, gmStorageSet, withGmStorageLease } from '@yomu-ref/src/reader/app/storage';
import {
    mergeHostedSettingsPatch,
    mergeHostedSharedSettingsPatch,
} from '@yomu-ref/src/reader/settings/hosted-settings-provenance';
import { SETTINGS_PERSISTENCE_STORAGE_LEASE } from '@yomu-ref/src/reader/settings/settings-persistence-transaction';
import { shippedFunctions } from './shipped-functions';

type Writer = (...args: unknown[]) => unknown;

function docsTheme(): Record<string, Writer> {
    return shippedFunctions({
        file: 'docs/.vitepress/theme/index.ts',
        declarations: [
            'SETTINGS_STORAGE_KEY',
            'VITEPRESS_APPEARANCE_KEY',
            'hostedSettingsEventPatch',
            'hostedSharedSettingsWrite',
            'HOSTED_THEME_PREFERENCES',
        ],
        functions: [
            'readStoredSettings',
            'parseHostedSettings',
            'hostedSettingsRecord',
            'isHostedSettingsRecord',
            'writeStoredSettingsPatch',
            'propagateSettingsPatchToSharedStorage',
            'writeStoredThemePreference',
            'writeVitePressAppearancePreference',
            'readStoredThemePreference',
            'readEffectiveHostedSettings',
            'normalizeHostedThemePreference',
            'hostedThemePreferenceFromValue',
            'prepareHostedDemoVideoSettings',
        ],
        glue: 'function sharedSettingsWriteSettled() { return hostedSharedSettingsWrite; }',
        glueExports: ['sharedSettingsWriteSettled'],
        bindings: {
            HOSTED_DEMO_VIDEO_SETTINGS_PATCH,
            mergeHostedSettingsPatch,
            mergeHostedSharedSettingsPatch,
            gmStorageGetShared,
            gmStorageSet,
            withGmStorageLease,
            SETTINGS_PERSISTENCE_STORAGE_LEASE,
        },
    }) as Record<string, Writer>;
}

/** The homepage idle-loads its demo runtime and stages the demo patch first. */
export async function homepageDemoStaging(): Promise<void> {
    const theme = docsTheme();
    const player = document.createElement('div');
    player.dataset.yomuDemoPlayer = '';
    document.body.append(player);
    theme.prepareHostedDemoVideoSettings();
    await theme.sharedSettingsWriteSettled();
    player.remove();
}

/** The docs header's appearance toggle: setHostedThemePreference's two writes. */
export async function docsThemeToggle(preference: 'dark' | 'light'): Promise<void> {
    const theme = docsTheme();
    theme.writeStoredThemePreference(preference);
    theme.writeVitePressAppearancePreference(preference, preference);
    await theme.sharedSettingsWriteSettled();
}

function pdfReaderShell(): Record<string, Writer> {
    return shippedFunctions({
        file: 'docs/public/pdf-reader/index.html',
        declarations: ['themeKey', 'settingsKey', 'settingsChangeEvent', 'languageEvent'],
        functions: ['readSettings', 'stampNeutralHostedTarget', 'saveThemePreference', 'saveInterfaceLanguage'],
        // DOM painters only; they read the stored values back and write nothing.
        glue: 'function applyTheme() {}\nfunction applyAccent() {}\nfunction applyInterfaceLanguage() {}',
    }) as Record<string, Writer>;
}

/** The PDF Reader header's language toggle. */
export function pdfReaderLanguageToggle(language: 'en' | 'ja'): void {
    pdfReaderShell().saveInterfaceLanguage(language);
}

/** An Academy lesson with Japanese text and no installed Reader. */
export async function academyLessonVisit(): Promise<boolean> {
    const root = document.createElement('main');
    root.id = 'yomu-academy';
    const lesson = document.createElement('p');
    lesson.lang = 'ja';
    lesson.dataset.yomuRuntimeSurface = 'lesson';
    lesson.textContent = '日本語を読みます。';
    root.append(lesson);
    document.body.append(root);
    const ready = await initYomuReaderRuntime();
    root.remove();
    return ready;
}
