import { afterEach, describe, expect, it, vi } from 'vitest';

import { testEnSettings } from './helpers/settings-fixture';
import {
    addsOrChangesAuthenticationInfo,
    firefoxAuthenticationInfoRequiresExtensionPage,
    firefoxAuthenticationInfoSettingsPageUrl,
    requestFirefoxAuthenticationInfoForChangedSettings,
    requestFirefoxAuthenticationInfoPermission,
} from '../../src/reader/settings/firefox-data-consent';
import { type Mock } from "vitest";
import { openOwnedFirefoxStudySettings } from "../../src/reader/settings/sensitive-settings-surface";

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

describe('Firefox packaged Study settings launcher', () => {
    const OWNED_STUDY_URL = 'moz-extension://yomu/newtab/index.html#settings=appearance';

    function installFirefoxRuntime(sendMessage: Mock): void {
        vi.stubGlobal('browser', {
            runtime: {
                id: 'yomu@yomureader.com',
                getURL: (path: string) => new URL(path, 'moz-extension://yomu/').href,
                sendMessage,
            },
        });
    }


    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('routes an ordinary extension content page to packaged Appearance through the compiler background', async () => {
        vi.stubGlobal('location', new URL('https://example.com/article'));
        const sendMessage = vi.fn(async () => ({ ok: true, tabId: 39 }));
        installFirefoxRuntime(sendMessage);

        await expect(openOwnedFirefoxStudySettings(OWNED_STUDY_URL)).resolves.toBe(true);
        expect(sendMessage).toHaveBeenCalledOnce();
        expect(sendMessage).toHaveBeenCalledWith({
            type: 'yomu.openPackagedStudySettings',
            protocol: 'yomu-packaged-study-settings-launcher:v1',
            panel: 'appearance',
        });
    });

    it.each([
        'moz-extension://another-extension/newtab/index.html#settings=appearance',
        'moz-extension://yomu/options.html#settings=appearance',
        'moz-extension://yomu/newtab/index.html?redirect=https://attacker.example/#settings=appearance',
        'moz-extension://yomu/newtab/index.html#settings=not-a-panel',
        'https://yomureader.com/study/#settings=appearance',
    ])('rejects a destination outside the exact runtime-owned Study route: %s', async url => {
        const sendMessage = vi.fn(async () => ({ ok: true, tabId: 39 }));
        installFirefoxRuntime(sendMessage);

        await expect(openOwnedFirefoxStudySettings(url)).resolves.toBe(false);
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it.each([
        { response: () => undefined, label: 'a non-promise runtime result' },
        { response: () => Promise.resolve({}), label: 'a response without an explicit success result' },
        { response: () => Promise.resolve({ ok: true, tabId: '39' }), label: 'a non-numeric tab id' },
        { response: () => Promise.resolve({ ok: false, error: 'tab creation denied' }), label: 'a background error response' },
        { response: () => Promise.reject(new Error('tab creation denied')), label: 'a rejected background request' },
    ])('does not report success for $label', async ({ response }) => {
        const windowOpen = vi.spyOn(window, 'open');
        installFirefoxRuntime(vi.fn(response));

        await expect(openOwnedFirefoxStudySettings(OWNED_STUDY_URL)).resolves.toBe(false);
        expect(windowOpen).not.toHaveBeenCalled();
    });

    it('fails closed when the Firefox extension runtime transport is unavailable', async () => {
        const windowOpen = vi.spyOn(window, 'open');

        await expect(openOwnedFirefoxStudySettings(OWNED_STUDY_URL)).resolves.toBe(false);
        expect(windowOpen).not.toHaveBeenCalled();
    });
});
