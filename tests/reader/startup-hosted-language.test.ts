import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/reader/settings/index', async importOriginal => {
    const actual = await importOriginal<typeof import('../../src/reader/settings/index')>();
    return {
        ...actual,
        loadSettings: vi.fn(async () => ({ ...actual.DEFAULT_SETTINGS, interfaceLanguage: 'en' })),
    };
});

import { loadReaderStartupSettings } from '../../src/reader/app/startup';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../../src/reader/settings/index';

const HOSTED_URL = 'https://yomureader.com/getting-started';

function setLocation(href: string): void {
    const url = new URL(href);
    vi.stubGlobal('location', { ...url, href } as unknown as Location);
}

describe('hosted interface-language adoption at startup', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        localStorage.removeItem(SETTINGS_STORAGE_KEY);
    });

    it('adopts the hosted page toggle choice over stale stored settings', async () => {
        // The docs あ toggle writes the visitor's choice to page-localStorage
        // before the runtime boots; the runtime's stale GM copy must not ride
        // along on its first save and clobber that choice back.
        setLocation(HOSTED_URL);
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ interfaceLanguage: 'ja' }));

        const startup = await loadReaderStartupSettings();

        expect(startup.settings.interfaceLanguage).toBe('ja');
    });

    it('keeps stored settings when the hosted page has no choice', async () => {
        setLocation(HOSTED_URL);

        const startup = await loadReaderStartupSettings();

        expect(startup.settings.interfaceLanguage).toBe('en');
    });

    it('ignores page-localStorage on non-hosted origins', async () => {
        setLocation('https://example.com/article');
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ interfaceLanguage: 'ja' }));

        const startup = await loadReaderStartupSettings();

        expect(startup.settings.interfaceLanguage).toBe('en');
    });

    it('accepts an explicit packaged settings snapshot without consulting off-host page storage', async () => {
        setLocation('file:///Applications/Yomu Gaming/renderer/index.html');
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ learningTargetChosen: false }));
        const startupSettings = {
            ...DEFAULT_SETTINGS,
            learningTargetChosen: true,
            interfaceLanguage: 'ja' as const,
        };

        const startup = await loadReaderStartupSettings({ startupSettings });

        expect(startup.settings.learningTargetChosen).toBe(true);
        expect(startup.settings.interfaceLanguage).toBe('ja');
    });
});
