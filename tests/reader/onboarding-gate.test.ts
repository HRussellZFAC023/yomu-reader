import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldShowReaderOnboarding } from '../../src/reader/app/startup';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, loadSettings, saveSettings } from '../../src/reader/settings';

// Packaged extensions persist normal settings through chrome.storage.local, so
// onboardingSeen follows the reader across content origins. A fresh extension
// install must therefore use the first Japanese content page as its welcome
// surface; the stored flag keeps the welcome from returning afterwards.
describe('shouldShowReaderOnboarding — browser-extension gating', () => {
    afterEach(() => {
        localStorage.clear();
        vi.unstubAllGlobals();
    });

    function asExtension(): void {
        vi.stubGlobal('chrome', { runtime: { id: 'yomu-extension-id' } });
    }

    it('shows first-run onboarding on an arbitrary content page in a browser extension', () => {
        asExtension();
        expect(shouldShowReaderOnboarding(true, 'https://example.com/some-article')).toBe(true);
    });

    it('still shows onboarding on the Yomu new-tab page in a browser extension', () => {
        asExtension();
        expect(shouldShowReaderOnboarding(true, 'https://yomureader.com/newtab/')).toBe(true);
    });

    it('treats a query-flagged arbitrary page like any other first-run content page', () => {
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

    it('persists onboardingSeen in packaged-extension storage across content origins', async () => {
        const values = new Map<string, unknown>();
        vi.stubGlobal('chrome', {
            runtime: { id: 'yomu-extension-id' },
            storage: {
                local: {
                    get: vi.fn(async (key: string | null) => key === null
                        ? Object.fromEntries(values)
                        : values.has(key) ? { [key]: values.get(key) } : {}),
                    set: vi.fn(async (items: Record<string, unknown>) => {
                        Object.entries(items).forEach(([key, value]) => values.set(key, value));
                    }),
                    remove: vi.fn(async (key: string) => {
                        values.delete(key);
                    }),
                },
            },
        });

        await saveSettings({ ...DEFAULT_SETTINGS, onboardingSeen: true }, {
            explicitUserChoiceKeys: ['onboardingSeen'],
        });

        expect(values.get(SETTINGS_STORAGE_KEY)).toMatchObject({ onboardingSeen: true });
        expect((await loadSettings()).onboardingSeen).toBe(true);
        expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
    });
});
