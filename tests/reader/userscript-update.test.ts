import { afterEach, describe, expect, it, vi } from 'vitest';
import { USERSCRIPT_INSTALL_URL } from '../../src/reader/app/constants';
import { detectYomuUpdateFlow, INSTALL_GUIDE_URL, updateFlowNoteKey } from '../../src/reader/app/userscript-update';
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

    it('has en and ja guidance for every flow kind', () => {
        for (const kind of ['manager', 'external-manager', 'no-manager'] as const) {
            const key = updateFlowNoteKey(kind);
            expect(uiText('en', key).length, kind).toBeGreaterThan(10);
            expect(uiText('ja', key).length, kind).toBeGreaterThan(10);
            expect(uiText('en', key)).not.toBe(uiText('ja', key));
        }
    });
});
