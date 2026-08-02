import { describe, expect, it } from 'vitest';
import { renderLookupPillsEditor } from '../../../src/reader/settings/form';
import { updateDictionaryLookupLinkEditor } from '../../../src/reader/settings/form-editors';
import { DEFAULT_DICTIONARY_LOOKUP_LINKS } from '../../../src/reader/settings/dictionary';
import { renderWordPills } from '../../../src/reader/sources/word-pills';
import type { JPDBCard } from '../../../src/reader/app/types';
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

    it('keeps all built-ins and local frequency rows through render, save, and reopen', () => {
        const builtInIds = DEFAULT_DICTIONARY_LOOKUP_LINKS.map(link => link.id);
        const localFrequencyIds = ['frequency-local:BCCWJ', 'frequency-local:Jiten', 'frequency-local:JPDB Freq'];
        const expectedIds = [...builtInIds, ...localFrequencyIds];
        const assertCompleteRow = (ids: string[]) => {
            expect(ids).toHaveLength(19);
            expect(new Set(ids).size).toBe(19);
            expect(ids.filter(id => builtInIds.includes(id))).toEqual(builtInIds);
            expect([...ids].sort()).toEqual([...expectedIds].sort());
        };
        const renderedIds = (form: HTMLFormElement) => Array.from(form
            .querySelectorAll<HTMLInputElement>('.jpdb-reader-lookup-links input[name$=".id"]'))
            .map(input => input.value);

        const form = renderSettingsTestForm(frequencySettings);
        form.querySelector<HTMLElement>('.jpdb-reader-lookup-links')!.innerHTML = renderLookupPillsEditor(frequencySettings);
        assertCompleteRow(renderedIds(form));

        const saved = readFormSettings(new FormData(form), frequencySettings);
        assertCompleteRow(saved.dictionaryLookupLinks.map(link => link.id));

        const reopened = renderSettingsTestForm(saved);
        assertCompleteRow(renderedIds(reopened));
        reopened.querySelector<HTMLElement>('.jpdb-reader-lookup-links')!.innerHTML = renderLookupPillsEditor(saved);
        assertCompleteRow(renderedIds(reopened));
        const resaved = readFormSettings(new FormData(reopened), saved);
        assertCompleteRow(resaved.dictionaryLookupLinks.map(link => link.id));
    });

    it('moves BCCWJ above Jiten in saved dictionary config and rendered frequency pills', () => {
        const jitenFirstSettings = {
            ...frequencySettings,
            dictionaryPreferences: [
                frequencySettings.dictionaryPreferences[0]!,
                { ...frequencySettings.dictionaryPreferences[2]!, priority: 1 },
                { name: 'Secondary Terms', alias: 'Secondary Terms', enabled: true, priority: 2, type: 'terms' as const },
                { ...frequencySettings.dictionaryPreferences[1]!, priority: 3 },
                { ...frequencySettings.dictionaryPreferences[3]!, priority: 4 },
            ],
        };
        const baselineForm = renderSettingsTestForm(jitenFirstSettings);
        baselineForm.querySelector<HTMLElement>('.jpdb-reader-lookup-links')!.innerHTML = renderLookupPillsEditor(jitenFirstSettings);
        const baselineSaved = readFormSettings(new FormData(baselineForm), jitenFirstSettings);
        expect(baselineSaved.dictionaryPreferences
            .filter(preference => preference.type === 'frequency')
            .map(preference => preference.name))
            .toEqual(['Jiten', 'BCCWJ', 'JPDB Freq']);

        const form = renderSettingsTestForm(jitenFirstSettings);
        const editor = form.querySelector<HTMLElement>('.jpdb-reader-lookup-links')!;
        editor.innerHTML = renderLookupPillsEditor(jitenFirstSettings);
        const rowIndex = (id: string) => Array.from(editor.querySelectorAll<HTMLElement>('[data-lookup-link-row]'))
            .findIndex(row => row.querySelector<HTMLInputElement>('input[name$=".id"]')?.value === id);
        const bccwjId = 'frequency-local:BCCWJ';
        const jitenId = 'frequency-local:Jiten';
        const moves = rowIndex(bccwjId) - rowIndex(jitenId);

        for (let index = 0; index < moves; index++) {
            const bccwjRow = editor.querySelector<HTMLInputElement>(`input[name$=".id"][value="${bccwjId}"]`)!
                .closest<HTMLElement>('[data-lookup-link-row]')!;
            updateDictionaryLookupLinkEditor(form, 'lookup-link-up', bccwjRow);
        }

        expect(rowIndex(bccwjId)).toBeLessThan(rowIndex(jitenId));
        const saved = readFormSettings(new FormData(form), jitenFirstSettings);
        expect(saved.dictionaryLookupLinks
            .filter(link => link.action === 'frequency-local')
            .map(link => link.id))
            .toEqual([bccwjId, jitenId, 'frequency-local:JPDB Freq']);
        const savedFrequencyPreferences = saved.dictionaryPreferences
            .filter(preference => preference.type === 'frequency');
        expect(savedFrequencyPreferences.map(preference => preference.name))
            .toEqual(['BCCWJ', 'Jiten', 'JPDB Freq']);
        expect(savedFrequencyPreferences[0]!.priority).toBeLessThan(savedFrequencyPreferences[1]!.priority);
        expect(saved.dictionaryPreferences
            .filter(preference => preference.type !== 'frequency')
            .map(preference => [preference.name, preference.priority]))
            .toEqual(baselineSaved.dictionaryPreferences
                .filter(preference => preference.type !== 'frequency')
                .map(preference => [preference.name, preference.priority]));

        const rerendered = renderSettingsTestForm(saved);
        const rerenderedEditor = rerendered.querySelector<HTMLElement>('.jpdb-reader-lookup-links')!;
        rerenderedEditor.innerHTML = renderLookupPillsEditor(saved);
        const resaved = readFormSettings(new FormData(rerendered), saved);
        expect(resaved.dictionaryPreferences
            .map(preference => [preference.name, preference.priority]))
            .toEqual(saved.dictionaryPreferences.map(preference => [preference.name, preference.priority]));

        const card: JPDBCard = {
            vid: 0,
            sid: 0,
            rid: 0,
            spelling: '読む',
            reading: 'よむ',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'local',
        };
        const html = renderWordPills({
            card,
            jpdbUrl: '',
            settings: {
                ...resaved,
                showLookupPillFrequency: false,
                dictionaryLookupLinks: resaved.dictionaryLookupLinks.map(link => ({
                    ...link,
                    enabled: link.action === 'frequency-local',
                })),
            },
            metaEntries: [
                { expression: '読む', mode: 'freq', data: { frequency: 20 }, dictionary: 'Jiten' },
                { expression: '読む', mode: 'freq', data: { frequency: 10 }, dictionary: 'BCCWJ' },
            ],
            isJpdbBackedCard: () => false,
            dictionaryLabel: name => name,
        });
        const result = document.createElement('div');
        result.innerHTML = html;
        expect(Array.from(result.querySelectorAll<HTMLElement>('[data-frequency-source="local"]'))
            .map(pill => pill.dataset.dictionary))
            .toEqual(['BCCWJ', 'Jiten']);
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
