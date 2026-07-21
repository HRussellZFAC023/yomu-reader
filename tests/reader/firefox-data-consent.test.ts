import { afterEach, describe, expect, it, vi } from 'vitest';

import { testEnSettings } from './helpers/settings-fixture';
import {
    addsOrChangesAuthenticationInfo,
    firefoxAuthenticationInfoRequiresExtensionPage,
    firefoxAuthenticationInfoSettingsPageUrl,
    requestFirefoxAuthenticationInfoForChangedSettings,
    requestFirefoxAuthenticationInfoPermission,
} from '../../src/reader/settings/firefox-data-consent';

describe('Firefox built-in credential consent', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('detects only newly added or changed transmitted credentials', () => {
        const current = { ...testEnSettings(), apiKey: 'same-key' };
        expect(addsOrChangesAuthenticationInfo(current, { ...current })).toBe(false);
        expect(addsOrChangesAuthenticationInfo(current, { ...current, apiKey: '' })).toBe(false);
        expect(addsOrChangesAuthenticationInfo(current, { ...current, apiKey: 'new-key' })).toBe(true);
        expect(addsOrChangesAuthenticationInfo(current, { ...current, nadeshikoApiKey: 'nadeshiko-key' })).toBe(true);
        expect(addsOrChangesAuthenticationInfo(current, { ...current, ocrCloudVisionApiKey: 'vision-key' })).toBe(true);
    });

    const firefoxBrowser = (permissions?: Record<string, unknown>) => ({
        runtime: { id: 'yomu@yomureader.com', getURL: (path: string) => `moz-extension://yomu/${path}` },
        ...(permissions ? { permissions } : {}),
    });

    it('requests Firefox authenticationInfo from the native permission API', async () => {
        const request = vi.fn().mockResolvedValue(true);
        vi.stubGlobal('browser', firefoxBrowser({ request }));

        await expect(requestFirefoxAuthenticationInfoPermission()).resolves.toBe('granted');
        expect(request).toHaveBeenCalledWith({ data_collection: ['authenticationInfo'] });
    });

    it('keeps the integration off when Firefox denies or fails the request', async () => {
        const request = vi.fn().mockResolvedValue(false);
        vi.stubGlobal('browser', firefoxBrowser({ request }));
        await expect(requestFirefoxAuthenticationInfoPermission()).resolves.toBe('denied');

        request.mockRejectedValueOnce(new Error('not allowed'));
        await expect(requestFirefoxAuthenticationInfoPermission()).resolves.toBe('denied');
    });

    it('does not ask Chrome, userscripts, or unchanged settings for a Firefox-only permission', async () => {
        const current = { ...testEnSettings(), apiKey: '' };
        const next = { ...current, apiKey: 'jpdb-key' };
        await expect(requestFirefoxAuthenticationInfoForChangedSettings(current, next)).resolves.toBe('granted');

        const request = vi.fn().mockResolvedValue(true);
        vi.stubGlobal('browser', firefoxBrowser({ request }));
        await expect(requestFirefoxAuthenticationInfoForChangedSettings(current, current)).resolves.toBe('granted');
        expect(request).not.toHaveBeenCalled();
    });

    it('treats a Safari Web Extension (safari-web-extension://) as NOT Firefox so credentials can be entered on any page', async () => {
        // Safari (incl. iPad/iPhone) exposes browser.runtime.id to content
        // scripts without permissions.request — the same shape as a Firefox
        // content script. It must NOT hit the Firefox extension-page gate.
        vi.stubGlobal('browser', {
            runtime: {
                id: 'com.yomu.safari (ABCDE)',
                getURL: (path: string) => `safari-web-extension://YOMU-UUID/${path}`,
            },
        });
        expect(firefoxAuthenticationInfoRequiresExtensionPage()).toBe(false);
        expect(firefoxAuthenticationInfoSettingsPageUrl()).toBe('');
        const current = { ...testEnSettings(), jitenApiKey: '' };
        const next = { ...current, jitenApiKey: 'ak_safari_key' };
        await expect(requestFirefoxAuthenticationInfoForChangedSettings(current, next)).resolves.toBe('granted');
    });

    it('fails closed in Firefox content scripts and links to bundled Study settings', async () => {
        vi.stubGlobal('browser', {
            runtime: {
                id: 'yomu@yomureader.com',
                getURL: vi.fn((path: string) => `moz-extension://yomu/${path}`),
            },
        });

        expect(firefoxAuthenticationInfoRequiresExtensionPage()).toBe(true);
        expect(firefoxAuthenticationInfoSettingsPageUrl()).toBe(
            'moz-extension://yomu/newtab/index.html#settings=api',
        );
        await expect(requestFirefoxAuthenticationInfoPermission()).resolves.toBe('extension-page-required');
    });
});
