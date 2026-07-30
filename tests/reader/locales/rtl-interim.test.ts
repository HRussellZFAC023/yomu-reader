import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../src/reader/settings/index';
import { SELECTABLE_INTERFACE_LANGUAGES, readFormSettings } from '../../../src/reader/settings/form-read';
import { localizeSettingsForm, renderSettingsForm } from '../../../src/reader/settings/form';
import { formatUiText, uiText } from '../../../src/reader/app/i18n';
import {
    READER_INTERFACE_DIR_ATTRIBUTE,
    READER_INTERFACE_LOCALE_ATTRIBUTE,
    applyInterfaceLocaleToDocument,
    applyInterfaceLocaleToRoot,
    formatIsolated,
    interfaceLocaleByTag,
    isRtlInterface,
    isolate,
} from '../../../src/reader/locales';

function settingsForm(): HTMLFormElement {
    const form = document.createElement('form');
    form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
    return form;
}

function interfaceSelect(form: HTMLFormElement): HTMLSelectElement {
    return form.querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')!;
}

describe('D43 RTL interim: Arabic and Farsi are visible, disabled, and explained', () => {
    let form: HTMLFormElement;

    beforeEach(() => {
        form = settingsForm();
    });

    it('offers all 33 locales plus automatic, with only English and Japanese selectable', () => {
        const select = interfaceSelect(form);
        const enabled = Array.from(select.options).filter((option) => !option.disabled);

        expect(select.options).toHaveLength(34);
        expect(enabled.map((option) => option.value)).toEqual(['auto', 'en', 'ja']);
    });

    it('disables Arabic and Farsi and gives the RTL reason, not the translation one', () => {
        const select = interfaceSelect(form);

        for (const tag of ['ar', 'fa']) {
            const option = Array.from(select.options).find((item) => item.value === tag)!;
            expect(option.disabled, tag).toBe(true);
            expect(option.getAttribute('aria-disabled'), tag).toBe('true');
            expect(option.getAttribute('data-interface-locale-blocked'), tag)
                .toBe('rtl-verification-pending');
            expect(option.textContent, tag).toContain(uiText('en', 'interfaceLocaleRtlPending'));
        }
    });

    it('never stores a blocked locale, even when one is forced into the control', () => {
        // The failure this whole control exists to prevent. `disabled` only stops
        // a *user* from choosing: assigning `.value` in script selects a disabled
        // option quite happily, in jsdom and in every real browser. So the read
        // path is the guarantee, and it is fail-closed.
        const select = interfaceSelect(form);
        select.value = 'ar';
        expect(select.value).toBe('ar');

        const stored = readFormSettings(new FormData(form), { ...DEFAULT_SETTINGS, interfaceLanguage: 'ja' });

        expect(stored.interfaceLanguage).toBe('ja');
        expect(SELECTABLE_INTERFACE_LANGUAGES).toEqual(['auto', 'en', 'ja']);
    });

    it('carries each blocked locale reason in its own language, script and direction', () => {
        const select = interfaceSelect(form);
        const arabic = Array.from(select.options).find((option) => option.value === 'ar')!;
        const spanish = Array.from(select.options).find((option) => option.value === 'es')!;

        expect(arabic.getAttribute('dir')).toBe('rtl');
        expect(arabic.getAttribute('lang')).toBe('ar');
        expect(arabic.title).toBe('لا يزال التحقق من التخطيط من اليمين إلى اليسار جاريًا.');
        expect(spanish.getAttribute('dir')).toBe('ltr');
        expect(spanish.title).toBe('La traducción sigue en curso.');
    });

    it('groups ready locales apart from the ones on the way, and counts them', () => {
        const groups = Array.from(form.querySelectorAll('optgroup'));
        const note = form.querySelector<HTMLElement>('[data-interface-locale-note]')!;

        expect(groups.map((group) => group.getAttribute('data-interface-locale-group')))
            .toEqual(['ready', 'in-progress']);
        expect(groups[0].label).toBe(uiText('en', 'interfaceLocalesReady'));
        expect(note.textContent).toContain(
            formatUiText('en', 'interfaceLocaleReadyCount', { ready: 2, total: 33 }),
        );
    });

    it('re-localizes the whole picker on a live language switch', () => {
        localizeSettingsForm(form, 'ja');
        const select = interfaceSelect(form);
        const arabic = Array.from(select.options).find((option) => option.value === 'ar')!;

        expect(Array.from(form.querySelectorAll('optgroup'))[1].label)
            .toBe(uiText('ja', 'interfaceLocalesInProgress'));
        expect(arabic.textContent).toContain(uiText('ja', 'interfaceLocaleRtlPending'));
        // The in-locale reason is not an interface string and must not move.
        expect(arabic.title).toContain('اليمين');
        expect(form.querySelector('[data-interface-locale-note]')?.textContent)
            .toContain(uiText('ja', 'interfaceLocaleBlockedNote'));
    });
});

describe('D43 direction propagation', () => {
    it('stamps lang, dir, the direction attribute and the script font on a reader root', () => {
        const root = document.createElement('div');
        root.setAttribute('data-jpdb-reader-root', '');

        applyInterfaceLocaleToRoot(root, interfaceLocaleByTag('ar')!);

        expect(root.getAttribute('lang')).toBe('ar');
        expect(root.getAttribute('dir')).toBe('rtl');
        expect(root.getAttribute(READER_INTERFACE_DIR_ATTRIBUTE)).toBe('rtl');
        expect(root.getAttribute(READER_INTERFACE_LOCALE_ATTRIBUTE)).toBe('ar');
        expect(root.style.getPropertyValue('--jpdb-reader-interface-font')).toContain('Arabic');
    });

    it('stamps a reader root inside a shadow tree and leaves the page host alone', () => {
        // `document.querySelectorAll` stops at a shadow boundary, so a popover
        // mounted into a page's shadow tree gets its own pass through the
        // scanned-shadow-root registry. The tempting shortcut — stamp the host and
        // let direction inherit — is wrong: the host belongs to the page, and
        // `dir="rtl"` on it would flip the site's own component to style ours.
        const host = document.createElement('div');
        host.setAttribute('dir', 'ltr');
        document.body.append(host);
        const shadow = host.attachShadow({ mode: 'open' });
        const inner = document.createElement('div');
        inner.setAttribute('data-jpdb-reader-root', '');
        shadow.append(inner);

        applyInterfaceLocaleToRoot(inner, interfaceLocaleByTag('fa')!);

        expect(inner.getAttribute('dir')).toBe('rtl');
        expect(inner.getAttribute('lang')).toBe('fa');
        expect(host.getAttribute('dir')).toBe('ltr');
    });

    it('stamps a document Yomu owns outright', () => {
        applyInterfaceLocaleToDocument(document, interfaceLocaleByTag('ja')!);

        expect(document.documentElement.getAttribute('lang')).toBe('ja');
        expect(document.documentElement.getAttribute('dir')).toBe('ltr');
    });

    it('reports Arabic and Farsi as RTL and every shipped locale as LTR', () => {
        expect(isRtlInterface('ar')).toBe(true);
        expect(isRtlInterface('fa')).toBe(true);
        expect(isRtlInterface('en')).toBe(false);
        expect(isRtlInterface('ja')).toBe(false);
        expect(isRtlInterface('nonsense')).toBe(false);
    });
});

describe('D43 bidi isolation of substituted values', () => {
    it('isolates every substituted value so foreign content cannot reorder a sentence', () => {
        const isolated = formatIsolated('نسخة {version} من {name}', { version: '1.8.41', name: 'Yomu' });

        expect(isolated).toContain(isolate('1.8.41'));
        expect(isolated).toContain(isolate('Yomu'));
    });

    it('leaves English and Japanese substitution byte-identical', () => {
        // Isolation controls are invisible but they are characters, and every
        // English/Japanese snapshot and DOM assertion in the suite would move if
        // they were inserted unconditionally.
        expect(formatUiText('en', 'interfaceLocaleReadyCount', { ready: 2, total: 33 }))
            .toBe('2 of 33 interface languages are ready.');
        expect(formatUiText('ja', 'interfaceLocaleReadyCount', { ready: 2, total: 33 }))
            .toBe('表示言語33件のうち2件が使えます。');
    });
});
