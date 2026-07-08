import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldShowReaderOnboarding } from '../../src/reader/app/startup';

// SIGHUP (iOS Safari extension): the welcome/onboarding overlay was appearing on
// every content page. In a browser extension there is no GM_* storage and this
// codebase persists settings to per-origin localStorage, so the onboardingSeen
// flag saved on the new-tab page never reads true on an arbitrary content origin
// (example.com etc.). The overlay therefore reappeared on every website. The gate
// must never show onboarding on content pages in an extension; it belongs on the
// Yomu new-tab page only. Userscript builds (no chrome.runtime.id) keep their
// first-run overlay everywhere, guarded by onboardingSeen.
describe('shouldShowReaderOnboarding — browser-extension gating', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function asExtension(): void {
        vi.stubGlobal('chrome', { runtime: { id: 'yomu-extension-id' } });
    }

    it('never shows onboarding on an arbitrary content page in a browser extension', () => {
        asExtension();
        expect(shouldShowReaderOnboarding(true, 'https://example.com/some-article')).toBe(false);
    });

    it('still shows onboarding on the Yomu new-tab page in a browser extension', () => {
        asExtension();
        expect(shouldShowReaderOnboarding(true, 'https://yomureader.com/newtab/')).toBe(true);
    });

    it('shows onboarding on a query-flagged new-tab page in a browser extension', () => {
        asExtension();
        expect(shouldShowReaderOnboarding(true, 'https://example.com/newtab.html?yomu-newtab')).toBe(true);
    });

    it('keeps first-run onboarding on content pages for userscript builds (no extension runtime)', () => {
        expect(shouldShowReaderOnboarding(true, 'https://example.com/some-article')).toBe(true);
    });

    it('still suppresses onboarding on the hosted app itself for userscript builds', () => {
        expect(shouldShowReaderOnboarding(true, 'https://yomureader.com/yomu-reader/')).toBe(false);
    });

    it('respects showWelcome=false regardless of runtime', () => {
        asExtension();
        expect(shouldShowReaderOnboarding(false, 'https://yomureader.com/newtab/')).toBe(false);
    });
});
