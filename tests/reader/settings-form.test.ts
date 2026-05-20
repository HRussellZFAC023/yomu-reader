import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { localizeSettingsForm, readFormSettings, renderHelpLinksPanel, renderSettingsForm } from '../../src/reader/settings-form';

function topLevelLegendForControl(form: HTMLFormElement, controlName: string): string {
    const control = form.querySelector<HTMLElement>(`[name="${controlName}"]`);
    const fieldset = control?.closest<HTMLFieldSetElement>('fieldset[data-settings-panel]');
    const legend = Array.from(fieldset?.children ?? []).find((child): child is HTMLElement =>
        child instanceof HTMLElement && child.tagName === 'LEGEND',
    );

    return legend?.textContent ?? '';
}

function labelForControl(form: HTMLFormElement, controlName: string): string {
    return form.querySelector<HTMLElement>(`[name="${controlName}"]`)?.closest('label')?.textContent ?? '';
}

function optionText(form: HTMLFormElement, controlName: string, value: string): string {
    const option = Array.from(form.querySelector<HTMLSelectElement>(`[name="${controlName}"]`)?.options ?? [])
        .find(item => item.value === value);
    return option?.textContent ?? '';
}

describe('settings help panel', () => {
    it('replaces the hosted Help link with the factory reset action', () => {
        const html = renderHelpLinksPanel();

        expect(html).toContain('data-action="factory-reset"');
        expect(html).toContain('data-help-link="factory-reset"');
        expect(html).not.toContain('data-help-link="support"');
    });

    it('moves technical definitions into the Help glossary', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        expect(form.querySelector('[data-settings-panel="help"] .jpdb-reader-help-glossary-card')).toBeTruthy();
        expect(form.querySelector('[data-help-glossary-title]')?.textContent).toBe('Glossary');
        expect(form.textContent).toContain('JPDB');
        expect(form.textContent).toContain('Yomitan dictionaries');
        expect(form.textContent).toContain('Reading text from images');
    });
});

describe('settings form localization', () => {
    it('shows Immersion Kit reveal audio autoplay enabled by default', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const toggle = form.querySelector<HTMLInputElement>('input[name="immersionKitAutoPlayAudio"]');

        expect(DEFAULT_SETTINGS.immersionKitAutoPlayAudio).toBe(true);
        expect(toggle?.checked).toBe(true);
        expect(toggle?.closest('label')?.textContent).toContain('reveal');
    });

    it('shows the Nadeshiko key field only for Nadeshiko-backed example modes', () => {
        const defaultForm = document.createElement('form');
        defaultForm.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const nadeshikoOnlyForm = document.createElement('form');
        nadeshikoOnlyForm.innerHTML = renderSettingsForm({
            ...DEFAULT_SETTINGS,
            immersionKitExampleSource: 'nadeshiko',
            nadeshikoApiKey: 'nad-key',
        }, 'https://jpdb.io/settings');
        const saved = readFormSettings(new FormData(nadeshikoOnlyForm), DEFAULT_SETTINGS);

        expect(defaultForm.querySelector<HTMLElement>('[data-nadeshiko-api-key-field]')?.hidden).toBe(true);
        expect(nadeshikoOnlyForm.querySelector<HTMLElement>('[data-nadeshiko-api-key-field]')?.hidden).toBe(false);
        expect(nadeshikoOnlyForm.querySelector<HTMLAnchorElement>('a[href="https://nadeshiko.co/user/developer"]')).toBeTruthy();
        expect(saved.immersionKitExampleSource).toBe('nadeshiko');
        expect(saved.nadeshikoApiKey).toBe('nad-key');
    });

    it('shows new-tab word-front sentences by default and persists the toggle', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const toggle = form.querySelector<HTMLInputElement>('input[name="newTabFrontSentenceEnabled"]');

        expect(DEFAULT_SETTINGS.newTabFrontSentenceEnabled).toBe(true);
        expect(toggle?.checked).toBe(true);

        toggle!.checked = false;

        expect(readFormSettings(new FormData(form), DEFAULT_SETTINGS).newTabFrontSentenceEnabled).toBe(false);
    });

    it('keeps top-level section legends attached to their panels', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        localizeSettingsForm(form, 'en');

        expect(topLevelLegendForControl(form, 'subtitlePlayerEnabled')).toBe('Video');
        expect(topLevelLegendForControl(form, 'ankiEnabled')).toBe('Anki');
        expect(topLevelLegendForControl(form, 'jpdbDefinitionsEnabled')).toBe('Dictionaries');
        expect(topLevelLegendForControl(form, 'shortcuts.openSettings')).toBe('Shortcuts');
        expect(form.querySelector('.jpdb-reader-radio-group > legend')?.textContent).toBe('Examples per word limit');
    });

    it('localizes Japanese settings copy added outside the original labels', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        localizeSettingsForm(form, 'ja');

        expect(form.lang).toBe('ja');
        expect(form.querySelector('h2')?.textContent).toBe('よむ 設定');
        expect(labelForControl(form, 'newTabJpdbReviewMode')).toContain('JPDB復習モード');
        expect(optionText(form, 'newTabJpdbReviewMode', 'api-vocabulary')).toBe('API語彙のみ');
        expect(labelForControl(form, 'newTabKanjiKeywordSource')).toContain('漢字キーワードのソース');
        expect(labelForControl(form, 'newTabParsingEnabled')).toContain('新規タブで文を解析');
        expect(optionText(form, 'audioAutoPlayMode', 'all')).toBe('ホバーとタップ/クリック');
        expect(form.querySelector('.jpdb-reader-radio-group > legend')?.textContent).toBe('単語ごとの例文数制限');
        expect(form.querySelector('.jpdb-reader-lookup-link-head span:nth-child(3)')?.textContent).toBe('検索URLテンプレート');
        expect(form.querySelector('.jpdb-reader-template-preview-title')?.textContent).toBe('単語を先に表示するプリセット');
        expect(form.querySelector('.jpdb-reader-template-meaning')?.textContent).toBe('読む');
        expect(form.querySelector<HTMLElement>('[data-theme-switch]')?.title).toBe('ライトテーマに切り替え');

        const text = form.textContent ?? '';
        [
            'New tab review source',
            'JPDB review mode',
            'Kanji keyword source',
            'Parse sentences on new tab',
            'Examples per word limit',
            'Lookup pills',
            'Term dictionaries',
            'Factory Reset',
            'Word first preset',
            'to read',
        ].forEach(phrase => expect(text).not.toContain(phrase));
    });
});
