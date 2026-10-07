import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SETTINGS,
    activateSettingsPanel,
    applySettingsSearch,
    localizeSettingsForm,
    registerSettingsFormCleanup,
    renderSettingsTestForm,
} from './fixtures';

// Leia, Discord 2026-10-02: "i cant remember how to change the order of this
// popup". The popup's sections follow the definition-source list in Settings →
// Sources, so that list opens the tab under a name a learner would search for.
const SOURCES_PANEL = '#jpdb-reader-settings-panel-dictionaries';

function sourcesContent(form: HTMLFormElement): HTMLElement {
    return form.querySelector<HTMLElement>(`${SOURCES_PANEL} [data-target-dictionary-content]`)!;
}

function sourcesFoundBy(form: HTMLFormElement, query: string): boolean {
    applySettingsSearch(form, query);
    return form.querySelector<HTMLElement>(SOURCES_PANEL)?.hidden === false;
}

describe('the popup order in Settings → Sources', () => {
    registerSettingsFormCleanup();

    it('exposes dictionary controls immediately without a retired language choice', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        activateSettingsPanel(form, 'dictionaries');
        expect(sourcesContent(form).hidden).toBe(false);
        const parser = sourcesContent(form).querySelector('select[name="parserProvider"]');
        expect(parser).not.toBeNull();
        expect(parser?.closest('[hidden]')).toBeNull();
    });

    it('opens the Sources tab, titled as the popup order, above storage and the parser', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        const first = sourcesContent(form).firstElementChild!;

        expect(first.querySelector('[data-help-key="popupOrderTitle"]')?.textContent).toBe('Popup order');
        expect(first.querySelector('[data-help-key="popupOrderHelp"]')).toBeNull();
        expect(first.querySelector('[data-definition-source-editor] [data-source-row]')).not.toBeNull();
        const editor = form.querySelector('[data-definition-source-editor]')!;
        for (const later of ['[data-dictionary-status]', '[data-local-dictionary-storage]', 'select[name="parserProvider"]']) {
            expect(editor.compareDocumentPosition(form.querySelector(later)!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        }
    });

    // Not plain "order": the Order column header already matched it before.
    it.each(['popup', 'reorder', 'Popup order'])('is what Settings search finds for "%s"', query => {
        expect(sourcesFoundBy(renderSettingsTestForm(DEFAULT_SETTINGS), query)).toBe(true);
    });

    it('is titled in Japanese, also after a live language switch, and search finds it there', () => {
        const japanese = renderSettingsTestForm({ ...DEFAULT_SETTINGS, interfaceLanguage: 'ja' });
        const switched = renderSettingsTestForm(DEFAULT_SETTINGS);
        localizeSettingsForm(switched, 'ja');

        for (const form of [japanese, switched]) {
            const first = sourcesContent(form).firstElementChild!;
            expect(first.querySelector('[data-help-key="popupOrderTitle"]')?.textContent).toBe('ポップアップの順序');
            expect(first.textContent).not.toContain('未翻訳');
            expect(first.textContent).not.toContain('Popup order');
            expect(sourcesFoundBy(form, 'ポップアップ')).toBe(true);
            expect(sourcesFoundBy(form, 'ポップアップの順序')).toBe(true);
        }
    });
});
