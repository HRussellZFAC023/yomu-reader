import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyNestedParsePlan, nestedSettingsTextParsePlan } from '../../src/reader/nested-text-parse';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { localizeSettingsForm, readFormSettings, renderHelpLinksPanel, renderSettingsForm } from '../../src/reader/settings-form';
import type { JPDBCard, JPDBToken } from '../../src/reader/types';

const SETTINGS_CSS = readFileSync('src/reader/styles/settings.css', 'utf8');

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

    it('marks hosted and support links with external-link icons', () => {
        const form = document.createElement('form');
        form.innerHTML = renderHelpLinksPanel();

        for (const key of ['video-player', 'new-tab', 'docs', 'donate', 'issues', 'discord']) {
            expect(form.querySelector(`[data-help-link="${key}"] svg`)).not.toBeNull();
        }
        expect(form.querySelector('[data-help-link="factory-reset"] svg')).toBeNull();

        localizeSettingsForm(form, 'ja');

        expect(form.querySelector('[data-help-link="video-player"]')?.textContent).toContain('動画プレイヤー');
        expect(form.querySelector('[data-help-link="video-player"] svg')).not.toBeNull();
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
    it('keeps checked checkbox and radio marks visible on hover', () => {
        const normalizedCss = SETTINGS_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss).toContain('.jpdb-reader-settings input[type="checkbox"]:enabled:hover, .jpdb-reader-settings input[type="radio"]:enabled:hover { border-color: var(--jpdb-reader-accent);');
        expect(normalizedCss).toContain('box-shadow: 0 0 0 3px var(--jpdb-reader-accent-soft);');
        expect(normalizedCss).toContain('.jpdb-reader-settings input[type="checkbox"]:checked, .jpdb-reader-settings input[type="radio"]:checked { border-color: var(--jpdb-reader-accent); background: var(--jpdb-reader-accent); box-shadow: 0 0 0 3px var(--jpdb-reader-accent-soft); }');
        expect(normalizedCss).toContain('.jpdb-reader-settings input[type="checkbox"]:checked:enabled:hover, .jpdb-reader-settings input[type="radio"]:checked:enabled:hover { background: var(--jpdb-reader-accent); }');
        expect(normalizedCss).toContain('border-left: 2.5px solid #ffffff; border-bottom: 2.5px solid #ffffff;');
        expect(normalizedCss).toContain('background: #ffffff;');
    });

    it('shows Immersion Kit reveal audio autoplay enabled by default', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const toggle = form.querySelector<HTMLInputElement>('input[name="immersionKitAutoPlayAudio"]');

        expect(DEFAULT_SETTINGS.immersionKitAutoPlayAudio).toBe(true);
        expect(toggle?.checked).toBe(true);
        expect(toggle?.closest('label')?.textContent).toContain('reveal');
    });

    it('exposes video-safe autoplay and popover dimming settings', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const videoAudio = form.querySelector<HTMLInputElement>('input[name="suppressAutoAudioOnVideo"]')!;
        const backdrop = form.querySelector<HTMLInputElement>('input[name="popoverBackdropEnabled"]')!;

        expect(DEFAULT_SETTINGS.suppressAutoAudioOnVideo).toBe(true);
        expect(DEFAULT_SETTINGS.popoverBackdropEnabled).toBe(true);
        expect(videoAudio.checked).toBe(true);
        expect(backdrop.checked).toBe(true);

        videoAudio.checked = false;
        backdrop.checked = false;

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(saved.suppressAutoAudioOnVideo).toBe(false);
        expect(saved.popoverBackdropEnabled).toBe(false);
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

    it('keeps Anki new-tab sourcing separate from Anki mining', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({ ...DEFAULT_SETTINGS, ankiEnabled: false }, 'https://jpdb.io/settings');
        const newTabAnkiToggle = form.querySelector<HTMLInputElement>('input[name="newTabAnkiEnabled"]');
        const ankiMiningToggle = form.querySelector<HTMLInputElement>('input[name="ankiEnabled"]');

        expect(DEFAULT_SETTINGS.newTabAnkiEnabled).toBe(true);
        expect(newTabAnkiToggle?.checked).toBe(true);
        expect(ankiMiningToggle?.checked).toBe(false);

        newTabAnkiToggle!.checked = false;

        const saved = readFormSettings(new FormData(form), { ...DEFAULT_SETTINGS, ankiEnabled: false });
        expect(saved.newTabAnkiEnabled).toBe(false);
        expect(saved.ankiEnabled).toBe(false);
    });

    it('keeps top-level section legends attached to their panels', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        localizeSettingsForm(form, 'en');

        expect(topLevelLegendForControl(form, 'subtitlePlayerEnabled')).toBe('Video');
        expect(topLevelLegendForControl(form, 'youtubeImmersionEnabled')).toBe('YouTube');
        expect(topLevelLegendForControl(form, 'ankiEnabled')).toBe('Anki');
        expect(topLevelLegendForControl(form, 'jpdbDefinitionsEnabled')).toBe('Dictionaries');
        expect(topLevelLegendForControl(form, 'shortcuts.openSettings')).toBe('Shortcuts');
        expect(form.querySelector('.jpdb-reader-radio-group > legend')?.textContent).toBe('Examples per word limit');
    });

    it('restores YouTube filter controls and the Alt+Y shortcut', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const filter = form.querySelector<HTMLInputElement>('input[name="youtubeImmersionEnabled"]')!;
        const notice = form.querySelector<HTMLInputElement>('input[name="youtubeShowFilterNotice"]')!;
        const shortcut = form.querySelector<HTMLInputElement>('input[name="shortcuts.toggleYoutubeImmersion"]')!;

        expect(DEFAULT_SETTINGS.youtubeImmersionEnabled).toBe(true);
        expect(DEFAULT_SETTINGS.youtubeShowFilterNotice).toBe(true);
        expect(DEFAULT_SETTINGS.shortcuts.toggleYoutubeImmersion).toBe('Alt+Y');
        expect(filter.checked).toBe(true);
        expect(notice.checked).toBe(true);
        expect(shortcut.value).toBe('Alt+Y');

        filter.checked = false;
        notice.checked = false;
        shortcut.value = 'Ctrl+Y';

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(saved.youtubeImmersionEnabled).toBe(false);
        expect(saved.youtubeShowFilterNotice).toBe(false);
        expect(saved.shortcuts.toggleYoutubeImmersion).toBe('Ctrl+Y');
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
        expect(form.querySelector('[data-help-links-title]')?.textContent).toBe('便利なページ');
        expect(form.querySelector('[data-help-support-title]')?.textContent).toBe('よむをサポート');
        expect(form.querySelector('[data-help-link="factory-reset"]')?.textContent).toBe('初期状態に戻す');
        expect(form.querySelector('[data-help-glossary-title]')?.textContent).toBe('用語集');

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
            'Useful pages',
            'Support よむ',
            'Glossary',
            'Word first preset',
            'to read',
        ].forEach(phrase => expect(text).not.toContain(phrase));
        expect(text).not.toContain('未翻訳');
    });

    it('adds Japanese select option metadata for lookup without duplicating it on relocalize', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const languageSelect = form.querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')!;

        localizeSettingsForm(form, 'ja');
        localizeSettingsForm(form, 'ja');

        const metadata = languageSelect.parentElement?.querySelectorAll('[data-settings-select-options-meta]') ?? [];
        expect(metadata).toHaveLength(1);
        expect(metadata[0]?.textContent).toBe('選択肢: 自動 / 英語 / 日本語');

        localizeSettingsForm(form, 'en');

        expect(languageSelect.parentElement?.querySelector('[data-settings-select-options-meta]')).toBeNull();
    });

    it('unwraps stale parsed settings labels before relocalizing', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        localizeSettingsForm(form, 'ja');
        const label = form.querySelector<HTMLInputElement>('input[name="stickyBottomSheet"]')!.closest('label')!;
        const input = label.querySelector('input')!;
        const firstWord = document.createElement('span');
        firstWord.className = 'jpdb-reader-word';
        firstWord.textContent = '閉じる';
        const secondWord = document.createElement('span');
        secondWord.className = 'jpdb-reader-word';
        secondWord.textContent = '下部';
        label.replaceChildren(input, firstWord, document.createTextNode(' まで '), secondWord, document.createTextNode(' シート'));

        localizeSettingsForm(form, 'ja');

        expect(label.querySelector('.jpdb-reader-word')).toBeNull();
        expect(label.textContent).toBe('閉じるまで下部シートを開いたままにする');
    });

    it('keeps parsed Japanese inline labels inside one grid item', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        localizeSettingsForm(form, 'ja');
        const label = form.querySelector<HTMLInputElement>('input[name="jpdbMiningEnabled"]')!.closest('label')!;
        const labelText = label.querySelector<HTMLElement>(':scope > .jpdb-reader-settings-label-text');

        expect(labelText?.textContent).toBe('JPDBの復習・デッキ変更を許可');

        const plan = nestedSettingsTextParsePlan(form, 640)!;
        const targetIndex = plan.targets.findIndex(target => target.text === 'JPDBの復習・デッキ変更を許可');
        expect(targetIndex).toBeGreaterThanOrEqual(0);
        const parsed = plan.targets.map(() => [] as JPDBToken[]);
        parsed[targetIndex] = [settingsToken('JPDB', 0)];

        applyNestedParsePlan(plan, parsed, DEFAULT_SETTINGS);

        expect(Array.from(label.children).filter(child => child.classList.contains('jpdb-reader-word'))).toHaveLength(0);
        expect(label.querySelector(':scope > .jpdb-reader-settings-label-text .jpdb-reader-word')?.textContent).toBe('JPDB');
    });
});

function settingsToken(surface: string, start: number): JPDBToken {
    return {
        card: settingsCard(surface),
        start,
        end: start + surface.length,
        length: surface.length,
        rubies: [],
        pitchClass: '',
    };
}

function settingsCard(spelling: string): JPDBCard {
    return {
        vid: 1464530,
        sid: 0,
        rid: 0,
        spelling,
        reading: spelling,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'fallback',
    };
}
