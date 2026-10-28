import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings';
import { readFormSettings } from '../../src/reader/settings/form-read';
import { renderSettingsForm } from '../../src/reader/settings/form';
import { loggingSettingsSummary } from '../../src/reader/app/logger';

describe('retired new-tab takeover setting', () => {
    it.each([false, true])('drops the obsolete flag (%s) at the current settings boundary', flag => {
        const stored = { ...DEFAULT_SETTINGS, newTabEnabled: flag, newTabSource: 'dictionary' as const };
        const current = normalizeReaderSettings(stored);
        expect(DEFAULT_SETTINGS).not.toHaveProperty('newTabEnabled');
        expect(current).not.toHaveProperty('newTabEnabled');
        expect(current.newTabSource).toBe('dictionary');
        expect(loggingSettingsSummary(current)).not.toHaveProperty('newTabEnabled');

        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(current, 'https://yomureader.com/study/');
        expect(form.querySelector('[name="newTabEnabled"]')).toBeNull();
        const saved = readFormSettings(new FormData(form), current);
        expect(saved).not.toHaveProperty('newTabEnabled');
        expect(saved.newTabSource).toBe('dictionary');
        expect(normalizeReaderSettings(JSON.parse(JSON.stringify(saved)))).not.toHaveProperty('newTabEnabled');
    });
});
