import { createReaderBackdrop } from '../../../src/reader/popover-shell';
import { DEFAULT_SETTINGS } from '../../../src/reader/settings';

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
