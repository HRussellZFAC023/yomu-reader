import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXTENSION_STORE_URLS, USERSCRIPT_INSTALL_URL } from '../../src/reader/app/constants';
import { detectYomuUpdateFlow, extensionStoreBrowser, INSTALL_GUIDE_URL, UPDATE_GUIDE_URL, updateFlowNoteKey } from '../../src/reader/app/userscript-update';
import { uiText } from '../../src/reader/app/i18n';

// A wrong branch here regresses straight into the Chromium "Apps, extensions,
// and user scripts cannot be added from this website" banner a real user hit
// from the settings Update button.
describe('yomu update flow detection', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('sends Tampermonkey and Violentmonkey to the .user.js install screen', () => {
        for (const handler of ['Tampermonkey', 'Violentmonkey', 'Greasemonkey', 'ScriptCat', 'OrangeMonkey']) {
            const flow = detectYomuUpdateFlow({ scriptHandler: handler });
            expect(flow.kind, handler).toBe('manager');
            expect(flow.url, handler).toBe(USERSCRIPT_INSTALL_URL);
        }
    });

    it('routes Chromium Tampermonkey through its dashboard update check instead of a website install', () => {
        for (const userAgent of [
            'Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36',
            'Mozilla/5.0 Edg/138.0.0.0',
        ]) {
            const flow = detectYomuUpdateFlow({ scriptHandler: 'Tampermonkey' }, true, userAgent);
            expect(flow.kind).toBe('manager-dashboard');
            expect(flow.url).toBe(UPDATE_GUIDE_URL);
            expect(flow.url).not.toContain('raw.githubusercontent.com');
            expect(uiText('en', updateFlowNoteKey(flow.kind))).toContain('Utilities');
            expect(uiText('ja', updateFlowNoteKey(flow.kind))).toContain('ユーティリティ');
        }
    });

    it('treats an unknown manager as intercepting only when GM_openInTab is callable', () => {
        // Callable openInTab proves a real manager context.
        const withTab = detectYomuUpdateFlow({ script: { name: 'yomu' } }, true);
        expect(withTab.kind).toBe('manager');
        expect(withTab.url).toBe(USERSCRIPT_INSTALL_URL);
        // A stray GM_info-shaped object with no openInTab must NOT target the
        // raw .user.js — window.open there hits the blocked-install banner.
        const withoutTab = detectYomuUpdateFlow({ script: { name: 'yomu' } }, false);
        expect(withoutTab.kind).toBe('no-manager');
        expect(withoutTab.url).toBe(INSTALL_GUIDE_URL);
        // Known intercepting handlers keep the install screen even if
        // openInTab is not exposed (e.g. not @grant-ed).
        const knownWithoutTab = detectYomuUpdateFlow({ scriptHandler: 'Tampermonkey' }, false);
        expect(knownWithoutTab.kind).toBe('manager');
        expect(knownWithoutTab.url).toBe(USERSCRIPT_INSTALL_URL);
    });

    it('keeps the raw source URL but switches guidance for Safari-app managers', () => {
        for (const handler of ['Userscripts', 'Stay', 'userscripts']) {
            const flow = detectYomuUpdateFlow({ scriptHandler: handler });
            expect(flow.kind, handler).toBe('external-manager');
            expect(flow.url, handler).toBe(USERSCRIPT_INSTALL_URL);
        }
        expect(uiText('en', updateFlowNoteKey('external-manager'))).toContain('Safari');
    });

    it('opens the install guide instead of the raw script when no manager runtime exists', () => {
        const flow = detectYomuUpdateFlow(undefined);
        expect(flow.kind).toBe('no-manager');
        expect(flow.url).toBe(INSTALL_GUIDE_URL);
        expect(flow.url.endsWith('.user.js')).toBe(false);
        expect(uiText('en', updateFlowNoteKey('no-manager'))).toContain('install guide');
        expect(uiText('ja', updateFlowNoteKey('no-manager'))).toContain('インストールガイド');
    });

    it('reads the ambient GM_info when no explicit info is passed', () => {
        vi.stubGlobal('GM_info', { scriptHandler: 'Tampermonkey' });
        expect(detectYomuUpdateFlow().kind).toBe('manager');
        vi.unstubAllGlobals();
        vi.stubGlobal('GM', { info: { scriptHandler: 'Userscripts' } });
        expect(detectYomuUpdateFlow().kind).toBe('external-manager');
    });

    it('sends extension builds to their browser store, even when GM globals are shimmed', () => {
        // The extension runtime shims GM_info, so the extension check must win
        // over every manager branch.
        const flow = detectYomuUpdateFlow({ scriptHandler: 'Tampermonkey' }, true, 'Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36', true);
        expect(flow.kind).toBe('extension-store');
        expect(flow.url).toBe(EXTENSION_STORE_URLS.chrome);
        expect(flow.url.endsWith('.user.js')).toBe(false);
        expect(uiText('en', updateFlowNoteKey(flow.kind))).toContain('extension store');
    });

    it('maps the user agent to the matching extension store route', () => {
        expect(extensionStoreBrowser('Mozilla/5.0 (Macintosh) Gecko/20100101 Firefox/140.0')).toBe('firefox');
        expect(extensionStoreBrowser('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/17.0 Safari/604.1')).toBe('safari');
        expect(extensionStoreBrowser('Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36')).toBe('chrome');
        // Edge and other Chromium forks install the chrome package.
        expect(extensionStoreBrowser('Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0')).toBe('chrome');
        expect(extensionStoreBrowser('')).toBe('chrome');
    });

    it('has en and ja guidance for every flow kind', () => {
        for (const kind of ['manager', 'manager-dashboard', 'external-manager', 'extension-store', 'no-manager'] as const) {
            const key = updateFlowNoteKey(kind);
            expect(uiText('en', key).length, kind).toBeGreaterThan(10);
            expect(uiText('ja', key).length, kind).toBeGreaterThan(10);
            expect(uiText('en', key)).not.toBe(uiText('ja', key));
        }
    });
});
