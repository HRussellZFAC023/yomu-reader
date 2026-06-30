import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    installBunproFrontendTokenImporter,
    isBunproApiSettingsPage,
    readBunproFrontendToken,
    readBunproFrontendTokenFromCookieHeader,
} from '../../src/reader/bunpro/frontend-token-importer';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { ReaderSettings } from '../../src/reader/app/types';

describe('Bunpro frontend token importer', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('only mounts on the Bunpro API settings page', () => {
        expect(isBunproApiSettingsPage('https://bunpro.jp/settings/api')).toBe(true);
        expect(isBunproApiSettingsPage('https://bunpro.jp/settings/api/')).toBe(true);
        expect(isBunproApiSettingsPage('https://bunpro.jp/dashboard')).toBe(false);
        expect(isBunproApiSettingsPage('https://example.com/settings/api')).toBe(false);
    });

    it('reads the frontend token from a normal cookie header', () => {
        expect(readBunproFrontendTokenFromCookieHeader('theme=dark; frontend_api_token=abc123%2Ftoken; other=1')).toEqual({
            token: 'abc123/token',
            expiresAt: '',
        });
    });

    it('uses Cookie Store expiry when the browser exposes it', async () => {
        const expiresAt = Date.UTC(2026, 6, 6, 16, 5, 56);
        await expect(readBunproFrontendToken({
            cookieStore: {
                get: vi.fn(async name => name === 'frontend_api_token'
                    ? { value: 'store-token', expires: expiresAt }
                    : null),
            },
        })).resolves.toEqual({
            token: 'store-token',
            expiresAt: new Date(expiresAt).toISOString(),
        });
    });

    it('saves the Bunpro token into Yomu settings from the Bunpro page helper', async () => {
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            bunproFrontendApiToken: '',
            bunproFrontendApiTokenExpiresAt: '',
            bunproMiningEnabled: false,
        };
        const saveSettings = vi.fn(async (next: ReaderSettings) => {
            settings = next;
        });

        await installBunproFrontendTokenImporter({
            getSettings: () => settings,
            setSettings: next => { settings = next; },
            saveSettings,
            href: 'https://bunpro.jp/settings/api',
            cookieStore: {
                get: vi.fn(async () => ({ value: 'imported-token', expires: '2026-07-06T16:05:56.552Z' })),
            },
        });

        const root = document.querySelector<HTMLElement>('#jpdb-reader-bunpro-token-importer');
        const button = root?.querySelector<HTMLButtonElement>('[data-action="import-bunpro-token"]');
        expect(root?.textContent).toContain('Yomu found your Bunpro session token');
        expect(button?.disabled).toBe(false);

        button?.click();

        await vi.waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1));
        expect(settings.bunproFrontendApiToken).toBe('imported-token');
        expect(settings.bunproFrontendApiTokenExpiresAt).toBe('2026-07-06T16:05:56.552Z');
        expect(settings.bunproMiningEnabled).toBe(true);
        await vi.waitFor(() => expect(root?.textContent).toContain('Bunpro token saved to Yomu.'));
    });

    it('shows a signed-out prompt when no frontend token is visible', async () => {
        const saveSettings = vi.fn(async () => undefined);

        await installBunproFrontendTokenImporter({
            getSettings: () => DEFAULT_SETTINGS,
            setSettings: vi.fn(),
            saveSettings,
            href: 'https://bunpro.jp/settings/api',
            cookieHeader: () => '',
        });

        const root = document.querySelector<HTMLElement>('#jpdb-reader-bunpro-token-importer');
        const button = root?.querySelector<HTMLButtonElement>('[data-action="import-bunpro-token"]');
        expect(root?.textContent).toContain('Log in to Bunpro');
        expect(button?.disabled).toBe(true);
        expect(saveSettings).not.toHaveBeenCalled();
    });
});
