import { describe, expect, it } from 'vitest';
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
});
