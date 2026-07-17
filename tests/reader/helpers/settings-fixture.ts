import { createReaderBackdrop } from '../../../src/reader/popup/shell';
import { DEFAULT_SETTINGS } from '../../../src/reader/settings/index';
import type { ReaderSettings } from '../../../src/reader/app/types';

// Shared base for reader tests that assert against English UI copy. The shipped
// DEFAULT_SETTINGS.interfaceLanguage already resolves via `resolveUiLanguage`
// (which can fall back to the browser locale for 'auto'), so tests pin 'en'
// explicitly to keep string assertions deterministic regardless of the runtime
// default. Returns a fresh object per call so callers can mutate freely.
export function testEnSettings(): ReaderSettings {
    return { ...DEFAULT_SETTINGS, interfaceLanguage: 'en' };
}

export function stackedSettingsFixtureDom() {
    const settings = { ...DEFAULT_SETTINGS, popupMode: 'sheet' as const };
    const settingsForm = document.createElement('form');
    settingsForm.className = 'jpdb-reader-settings';
    settingsForm.dataset.jpdbReaderRoot = 'true';
    const settingsBackdrop = createReaderBackdrop(() => undefined);
    const anchor = document.createElement('span');
    anchor.textContent = '設定';
    document.body.append(settingsBackdrop, settingsForm, anchor);
    return { settings, settingsForm, settingsBackdrop, anchor };
}
