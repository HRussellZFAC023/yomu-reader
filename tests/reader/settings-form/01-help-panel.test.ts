import { describe, expect, it } from 'vitest';
import {
    CURRENT_YOMU_VERSION,
    DEFAULT_SETTINGS,
    INSTALL_GUIDE_URL,
    localizeSettingsForm,
    registerSettingsFormCleanup,
    renderHelpLinksPanel,
    renderSettingsForm,
} from './fixtures';

describe('settings help panel', () => {
    registerSettingsFormCleanup();

    it('replaces the hosted Help link with the factory reset action', () => {
        const html = renderHelpLinksPanel();

        expect(html).toContain('data-action="factory-reset"');
        expect(html).toContain('data-help-link="factory-reset"');
        expect(html).not.toContain('data-help-link="support"');
        expect(html).not.toContain('data-jpdb-reader-surface-ignore');
    });

    it('marks hosted and support links with external-link icons', () => {
        const form = document.createElement('form');
        form.innerHTML = renderHelpLinksPanel();

        for (const key of ['update-userscript', 'anki-connect-addon', 'anki-mobile-docs', 'video-player', 'pdf-reader', 'new-tab', 'docs', 'donate', 'issues', 'discord']) {
            expect(form.querySelector(`[data-help-link="${key}"] svg`)).not.toBeNull();
        }
        expect(form.querySelector('[data-help-link="factory-reset"] svg')).toBeNull();

        localizeSettingsForm(form, 'ja');

        expect(form.querySelector('[data-help-link="video-player"]')?.textContent).toContain('動画プレイヤー');
        expect(form.querySelector('[data-help-link="video-player"] svg')).not.toBeNull();
        expect(form.querySelector('[data-help-link="pdf-reader"]')?.textContent).toContain('PDFリーダー');
        expect(form.querySelector('[data-help-link="pdf-reader"] svg')).not.toBeNull();
        expect(form.querySelector('[data-help-link="update-userscript"]')?.textContent).toContain('更新');
        expect(form.querySelector('[data-help-link="anki-connect-addon"]')?.textContent).toContain('AnkiConnect');
    });

    it('shows a compact version and update strip at the top of Help', () => {
        const marker = document.createElement('meta');
        marker.id = 'jpdb-reader-runtime-owner';
        marker.dataset.yomuRuntimeKind = 'userscript';
        document.head.append(marker);
        const form = document.createElement('form');
        try {
            form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

            const helpPanel = form.querySelector<HTMLElement>('[data-settings-panel="help"]')!;
            const firstHelpBlock = Array.from(helpPanel.children)
                .find((child): child is HTMLElement => child instanceof HTMLElement && child.tagName !== 'LEGEND');
            expect(firstHelpBlock?.matches('.jpdb-reader-help-links-card')).toBe(true);

            const strip = helpPanel.querySelector<HTMLElement>('[data-help-update-strip]')!;
            expect(strip).not.toBeNull();
            expect(strip.parentElement?.firstElementChild).toBe(strip);

            expect(form.querySelector<HTMLElement>('[data-yomu-current-version]')?.textContent).toBe(CURRENT_YOMU_VERSION);
            expect(form.querySelector<HTMLElement>('[data-yomu-update-status]')?.textContent).toContain(CURRENT_YOMU_VERSION);
            expect(form.querySelector<HTMLElement>('[data-yomu-duplicate-status]')?.textContent).toContain('userscript');
            // jsdom has no GM_info, so the update flow resolves to the install
            // guide (a raw .user.js navigation would hit the browser's
            // blocked-install banner in exactly this manager-less situation).
            expect(form.querySelector<HTMLAnchorElement>('[data-help-link="update-userscript"]')?.href).toBe(INSTALL_GUIDE_URL);
            expect(form.querySelector<HTMLAnchorElement>('[data-help-link="update-userscript"]')?.dataset.action).toBe('open-yomu-update');
            expect(form.querySelector<HTMLElement>('[data-help-update-notes]')?.textContent).toContain('install guide');
            expect(form.querySelector<HTMLElement>('[data-diagnostics-title]')?.compareDocumentPosition(strip) ?? 0)
                .toBe(Node.DOCUMENT_POSITION_PRECEDING);

            localizeSettingsForm(form, 'ja');

            expect(form.querySelector<HTMLElement>('[data-help-update-title]')?.textContent).toBe('バージョン');
            expect(form.querySelector<HTMLElement>('[data-yomu-update-status]')?.textContent).toContain(CURRENT_YOMU_VERSION);
            expect(form.querySelector<HTMLElement>('[data-yomu-duplicate-status]')?.textContent).toContain('userscript');
            expect(form.querySelector<HTMLElement>('[data-help-update-notes]')?.textContent).toContain('インストールガイド');
        } finally {
            marker.remove();
        }
    });

    it('shows AnkiConnect CORS, mobile, and Brave setup help in Help', () => {
        const form = document.createElement('form');
        form.innerHTML = renderHelpLinksPanel();

        const ankiDisclosure = form.querySelector<HTMLDetailsElement>('[data-help-anki-disclosure]');
        expect(ankiDisclosure).not.toBeNull();
        expect(ankiDisclosure?.open).toBe(false);
        expect(form.querySelector<HTMLElement>('[data-help-anki-title]')?.textContent).toBe('AnkiConnect setup');
        expect(form.querySelector<HTMLElement>('.jpdb-reader-help-code')?.textContent).toContain('https://yomureader.com');
        expect(form.querySelector<HTMLElement>('.jpdb-reader-help-code')?.textContent).toContain('http://localhost');
        expect(form.querySelector<HTMLElement>('[data-help-anki-brave]')?.textContent).toContain('Brave');
        expect(form.querySelector<HTMLAnchorElement>('[data-help-link="anki-connect-addon"]')?.href).toContain('ankiweb.net/shared/info/2055492159');
        expect(form.querySelector<HTMLAnchorElement>('[data-help-link="anki-mobile-docs"]')?.href).toContain('getting-started#use-desktop-anki');

        localizeSettingsForm(form, 'ja');

        expect(form.querySelector<HTMLElement>('[data-help-anki-title]')?.textContent).toBe('AnkiConnect設定');
        expect(form.querySelector<HTMLElement>('.jpdb-reader-help-code')?.textContent).toContain('https://yomureader.com');
        expect(form.querySelector<HTMLElement>('[data-help-anki-mobile]')?.textContent).toContain('Tailscale');
    });

    it('does not render the removed Help glossary', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        expect(form.querySelector('[data-settings-panel="help"] .jpdb-reader-help-glossary-card')).toBeNull();
        expect(form.querySelector('[data-help-glossary-title]')).toBeNull();
        const helpPanelText = form.querySelector('[data-settings-panel="help"]')?.textContent ?? '';
        expect(helpPanelText).not.toContain('Online Japanese vocabulary review and mining service used for lookup');
        expect(helpPanelText).not.toContain('Reading text from images');
    });
});
