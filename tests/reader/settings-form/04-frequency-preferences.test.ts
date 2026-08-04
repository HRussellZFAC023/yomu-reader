import { describe, expect, it } from 'vitest';
import { renderLookupPillsEditor } from '../../../src/reader/settings/form';
import { updateDictionaryLookupLinkEditor } from '../../../src/reader/settings/form-editors';
import { DEFAULT_DICTIONARY_LOOKUP_LINKS } from '../../../src/reader/settings/dictionary';
import { renderWordPills } from '../../../src/reader/sources/word-pills';
import type { JPDBCard, ReaderSettings } from '../../../src/reader/app/types';
import { UNORDERED_DICTIONARY_PRIORITY_BASE } from '../../../src/reader/settings/dictionary';
import { mergeDictionaryPreferences } from '../../../src/reader/settings/index';
import { updateSourceRowEditor } from '../../../src/reader/settings/form-order';
import {
    DEFAULT_SETTINGS,
    JITEN_DEFINITION_SOURCE_ID,
    JPDB_DEFINITION_SOURCE_ID,
    normalizeReaderSettings,
    orderedDefinitionSourceIds,
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

    // GitHub #43, the half no existing test could see: the fixture above has no
    // imported TERMS or KANJI dictionary competing with the built-in rows, so the
    // numbering the editor writes was never compared against the numbering the
    // hidden frequency rows submitted. They were two different spaces, and a
    // no-op open-and-save re-sorted dictionaryPreferences on every pass.
    const shelfSettings = {
        ...DEFAULT_SETTINGS,
        dictionaryPreferences: [
            { name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0, type: 'terms' as const },
            { name: 'JMdict', alias: 'JMdict', enabled: true, priority: 1, type: 'terms' as const },
            { name: 'KANJIDIC', alias: 'KANJIDIC', enabled: true, priority: 2, type: 'kanji' as const },
            { name: 'BCCWJ', alias: 'BCCWJ', enabled: true, priority: 3, type: 'frequency' as const },
        ],
    };

    it('leaves the dictionary shelf byte-identical through a no-op open and save', () => {
        const form = renderSettingsTestForm(shelfSettings);

        const saved = readFormSettings(new FormData(form), shelfSettings);
        const resaved = readFormSettings(new FormData(renderSettingsTestForm(saved)), saved);
        const rerendered = readFormSettings(new FormData(renderSettingsTestForm(resaved)), resaved);

        // Opening and saving renumbers the shelf into the editor's single space
        // exactly once; every pass after that is a fixed point. KANJIDIC used to
        // teleport to the end of the array here.
        expect(saved.dictionaryPreferences.map(item => item.name))
            .toEqual(['Jitendex', 'JMdict', 'KANJIDIC', 'BCCWJ']);
        expect(JSON.stringify(resaved.dictionaryPreferences)).toBe(JSON.stringify(saved.dictionaryPreferences));
        expect(JSON.stringify(rerendered.dictionaryPreferences)).toBe(JSON.stringify(saved.dictionaryPreferences));
    });

    it('keeps an imported dictionary dragged above Jiten in front across re-renders', () => {
        const form = renderSettingsTestForm(shelfSettings);
        const editor = form.querySelector<HTMLElement>('[data-definition-source-editor]')!;
        const rowIds = () => Array.from(editor.querySelectorAll<HTMLElement>('[data-source-row]'))
            .map(row => row.dataset.sourceId);
        const jitendexRow = () => editor.querySelector<HTMLElement>('[data-source-id="Jitendex"]')!;

        // Drag Jitendex to the very top, past the built-in Jiten row.
        while (rowIds().indexOf('Jitendex') > 0) {
            updateSourceRowEditor('dictionary-source-up', jitendexRow());
        }
        expect(rowIds()[0]).toBe('Jitendex');

        const saved = readFormSettings(new FormData(form), shelfSettings);
        const normalized = normalizeReaderSettings(saved);
        const rerendered = renderSettingsTestForm(normalized);
        const resaved = readFormSettings(new FormData(rerendered), normalized);
        const twiceRendered = renderSettingsTestForm(normalizeReaderSettings(resaved));

        const orderedIds = (settings: ReaderSettings) => orderedDefinitionSourceIds(settings, ['Jitendex', 'JMdict']);
        expect(orderedIds(normalized)[0]).toBe('Jitendex');
        expect(orderedIds(normalizeReaderSettings(resaved))[0]).toBe('Jitendex');
        expect(Array.from(twiceRendered
            .querySelector<HTMLElement>('[data-definition-source-editor]')!
            .querySelectorAll<HTMLElement>('[data-source-row]'))[0]?.dataset.sourceId).toBe('Jitendex');
        expect(normalized.dictionaryPreferences.find(item => item.name === 'Jitendex')!.priority)
            .toBeLessThan(normalized.jitenDefinitionsPriority);
    });

    // mirrormc, v1.8.77: "it also still jams jiten to the top of the dictionary
    // array even though claiming otherwise in the changelog". Dragging JPDB to the
    // top produces {jpdb: 0, jiten: 1}, which is byte-for-byte the pre-1.4.215
    // shipped default, so the one-shot migration for that default fired on the
    // same save and put Jiten back -- every time, forever.
    it('keeps JPDB in front once the learner drags it above Jiten', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        const editor = form.querySelector<HTMLElement>('[data-definition-source-editor]')!;
        const rowIds = () => Array.from(editor.querySelectorAll<HTMLElement>('[data-source-row]'))
            .map(row => row.dataset.sourceId);
        const jpdbRow = () => editor.querySelector<HTMLElement>(`[data-source-id="${JPDB_DEFINITION_SOURCE_ID}"]`)!;

        while (rowIds().indexOf(JPDB_DEFINITION_SOURCE_ID) > 0) {
            updateSourceRowEditor('dictionary-source-up', jpdbRow());
        }

        const saved = normalizeReaderSettings(readFormSettings(new FormData(form), DEFAULT_SETTINGS));
        expect(saved.jpdbDefinitionsPriority).toBe(0);
        expect(saved.jitenDefinitionsPriority).toBe(1);
        expect(orderedDefinitionSourceIds(saved, []).slice(0, 2))
            .toEqual([JPDB_DEFINITION_SOURCE_ID, JITEN_DEFINITION_SOURCE_ID]);

        // And it survives reopening the dialog and saving again unchanged.
        const reopened = normalizeReaderSettings(readFormSettings(new FormData(renderSettingsTestForm(saved)), saved));
        expect(orderedDefinitionSourceIds(reopened, []).slice(0, 2))
            .toEqual([JPDB_DEFINITION_SOURCE_ID, JITEN_DEFINITION_SOURCE_ID]);
    });

    // An imported dictionary nobody has ordered yet used to fall back to its
    // ARRAY INDEX, which put the first one on 0 -- tied with the built-in Jiten
    // row, and the tie was broken alphabetically, so "Jiten" sat above Jitendex,
    // JMdict and JMnedict whatever the shelf said.
    it('places a freshly discovered dictionary after the built-in sources, not tied with them', () => {
        const discovered = mergeDictionaryPreferences([], ['Jitendex', 'JMnedict'], {});

        expect(discovered.map(item => item.priority))
            .toEqual([UNORDERED_DICTIONARY_PRIORITY_BASE, UNORDERED_DICTIONARY_PRIORITY_BASE + 1]);
        expect(discovered.every(item => item.priority > DEFAULT_SETTINGS.jitenDefinitionsPriority)).toBe(true);
        expect(orderedDefinitionSourceIds({ ...DEFAULT_SETTINGS, dictionaryPreferences: discovered }, ['Jitendex', 'JMnedict'])
            .filter(id => id === 'Jitendex' || id === JITEN_DEFINITION_SOURCE_ID))
            .toEqual([JITEN_DEFINITION_SOURCE_ID, 'Jitendex']);
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
