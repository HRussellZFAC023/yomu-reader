import { afterEach, describe, expect, it } from 'vitest';
import { collectFragmentTextTargetsIn, collectTextTargetsIn } from '../../src/reader/dom';
import { nestedTextParsePlan } from '../../src/reader/lookup/nested-text-parse';
import { localizeSettingsForm, renderSettingsForm } from '../../src/reader/settings/form';
import { testEnSettings } from './helpers/settings-fixture';

afterEach(() => document.body.replaceChildren());

describe('reader interface annotation boundary', () => {
    it.each(['en', 'ja'] as const)('keeps real %s settings controls and labels unannotated', language => {
        const form = document.createElement('form');
        form.className = 'jpdb-reader-settings';
        form.dataset.jpdbReaderRoot = 'true';
        form.innerHTML = renderSettingsForm({ ...testEnSettings(), interfaceLanguage: language }, 'https://yomureader.com/study/');
        localizeSettingsForm(form, language);
        document.body.append(form);
        expect(collectTextTargetsIn(form, 1000, false)).toEqual([]);
        expect(collectFragmentTextTargetsIn(form, 1000, false)).toEqual([]);
        expect(nestedTextParsePlan(form, 1000)).toBeNull();
        expect([...form.querySelectorAll('.jpdb-reader-word')].filter(word => !word.closest('[data-settings-preview-lookup]'))).toHaveLength(0);
    });

    it('keeps controls inside an owned shadow host out of both page collectors', () => {
        const host = document.createElement('section');
        host.dataset.jpdbReaderRoot = 'true';
        document.body.append(host);
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = '<div><h2>よむ 設定</h2><p>日本語の表示</p></div>';
        expect(collectTextTargetsIn(shadow, 100, false)).toEqual([]);
        expect(collectFragmentTextTargetsIn(shadow.querySelector('div')!, 100, false)).toEqual([]);
    });

    it('still parses dictionary content while leaving its source headings and controls alone', () => {
        document.body.innerHTML = `<div class="jpdb-reader-popover" data-jpdb-reader-root="true">
            <h2>よむ</h2><button>保存</button><details open>
                <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore="true">日本語辞典</summary>
                <p class="jpdb-reader-parseable">青空の下で本を読みます。</p>
            </details></div>`;
        const root = document.body.firstElementChild as HTMLElement;
        expect(nestedTextParsePlan(root, 100)?.targets.map(target => target.text)).toEqual(['青空の下で本を読みます。']);
    });
});
