import { describe, expect, it } from 'vitest';
import { renderLookupPillsEditor } from '../../../src/reader/settings/form';
import {
    frequencySettings,
    localizeSettingsForm,
    readFormSettings,
    registerSettingsFormCleanup,
    renderSettingsTestForm,
    settingsText,
} from './fixtures';

describe('frequency dictionary preferences', () => {
    registerSettingsFormCleanup();

    it('waits for live local dictionary evidence before rendering local frequency badges', () => {
        const form = renderSettingsTestForm(frequencySettings);
        const editor = form.querySelector<HTMLElement>('.jpdb-reader-lookup-links')!;

        let rows = Array.from(editor.querySelectorAll<HTMLElement>('[data-lookup-link-row]'));
        let ids = rows.map(row => row.querySelector<HTMLInputElement>('input[name$=".id"]')?.value);
        expect(ids).toContain('jiten-frequency');
        expect(ids).toContain('jpdb-frequency');
        expect(ids).not.toContain('frequency-local:BCCWJ');

        editor.innerHTML = renderLookupPillsEditor(frequencySettings);
        rows = Array.from(editor.querySelectorAll<HTMLElement>('[data-lookup-link-row]'));
        ids = rows.map(row => row.querySelector<HTMLInputElement>('input[name$=".id"]')?.value);
        expect(ids).toContain('frequency-local:BCCWJ');
        expect(ids).toContain('frequency-local:Jiten');
        expect(ids).toContain('frequency-local:JPDB Freq');
        expect(form.querySelector<HTMLElement>('[data-frequency-dictionaries]')).toBeNull();
        expect(form.querySelector<HTMLElement>('[data-frequency-lookup-pills]')).toBeNull();
        expect(editor.closest('.jpdb-reader-settings-subsection')?.querySelector('.jpdb-reader-local-title')?.textContent).toBe('Lookup pills');
        expect(editor.closest('.jpdb-reader-settings-subsection')?.querySelector('.jpdb-reader-help')?.textContent).toContain('frequency badges');
        expect(editor.textContent).toContain('Live Jiten frequency from site lookup');
        expect(editor.textContent).toContain('Installed local frequency dictionary badge');
        for (const row of rows.slice(0, 4)) {
            expect(row.querySelector('[data-lookup-link-enable-toggle]')).not.toBeNull();
            expect(row.querySelector('[data-source-drag-handle]')).not.toBeNull();
            expect(row.querySelector('[data-action="lookup-link-up"]')).not.toBeNull();
        }
        expect(editor.querySelector<HTMLInputElement>('input[name$=".id"][value="jiten-frequency"]')?.closest('[data-lookup-link-row]')?.querySelector<HTMLInputElement>('[data-lookup-link-enable-toggle]')?.checked).toBe(true);
        expect(editor.querySelector<HTMLInputElement>('input[name$=".id"][value="jpdb-frequency"]')?.closest('[data-lookup-link-row]')?.querySelector<HTMLInputElement>('[data-lookup-link-enable-toggle]')?.checked).toBe(true);
        // Frequency dictionaries are preserved as hidden dictionary preferences, not a second visible table.
        expect(form.querySelectorAll('input[name="dictionaryPreferences.1.name"]').length).toBe(1);
    });

    it('round-trips local frequency pill toggles and order through form read', () => {
        const form = renderSettingsTestForm(frequencySettings);
        const editor = form.querySelector<HTMLElement>('.jpdb-reader-lookup-links')!;
        editor.innerHTML = renderLookupPillsEditor(frequencySettings);
        const disabledToggle = editor.querySelector<HTMLInputElement>('input[name$=".id"][value="frequency-local:JPDB Freq"]')!
            .closest<HTMLElement>('[data-lookup-link-row]')!
            .querySelector<HTMLInputElement>('[data-lookup-link-enable-toggle]')!;
        disabledToggle.checked = true;

        const saved = readFormSettings(new FormData(form), frequencySettings);
        const frequency = saved.dictionaryPreferences.filter(preference => preference.type === 'frequency');
        const frequencyPills = saved.dictionaryLookupLinks.filter(link => link.action === 'frequency-live' || link.action === 'frequency-local');

        expect(frequency.map(preference => preference.name)).toEqual(['BCCWJ', 'Jiten', 'JPDB Freq']);
        expect(frequencyPills.find(link => link.id === 'frequency-local:JPDB Freq')?.enabled).toBe(true);
        expect(frequencyPills.find(link => link.id === 'jiten-frequency')?.enabled).toBe(true);
        expect(frequencyPills.find(link => link.id === 'jpdb-frequency')?.enabled).toBe(true);
    });

    it('localizes combined lookup pill settings', () => {
        const form = renderSettingsTestForm(frequencySettings);
        localizeSettingsForm(form, 'ja');
        const editor = form.querySelector<HTMLElement>('.jpdb-reader-lookup-links')!;
        const subsection = editor.closest<HTMLElement>('.jpdb-reader-settings-subsection')!;

        expect(settingsText(form, '.jpdb-reader-lookup-link-head span:nth-child(2)')).toBe('ラベル');
        expect(subsection.querySelector<HTMLElement>('.jpdb-reader-help')?.textContent).toContain('ライブバッジ');
    });
});
