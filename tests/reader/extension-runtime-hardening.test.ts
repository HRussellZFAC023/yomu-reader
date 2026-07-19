import { describe, expect, it } from 'vitest';
// @ts-expect-error The packaging hardener is a Node ESM script exercised directly by the build.
import { hardenExtensionBackgroundSource, hardenExtensionManifest } from '../../scripts/lib/extension-runtime-hardening.mjs';

describe('extension runtime hardening', () => {
    it('guards generated tabs.onRemoved listeners for browsers without that event', () => {
        const source = `
            api.tabs.onRemoved.addListener(handleRemoved);
            api.tabs.onRemoved.removeListener(handleRemoved);
            browser.tabs.onRemoved.addListener(handleBrowserRemoved);
            chrome.tabs.onRemoved.removeListener(handleChromeRemoved);
        `;

        expect(hardenExtensionBackgroundSource(source)).toContain('api.tabs?.onRemoved?.addListener?.(handleRemoved)');
        expect(hardenExtensionBackgroundSource(source)).toContain('api.tabs?.onRemoved?.removeListener?.(handleRemoved)');
        expect(hardenExtensionBackgroundSource(source)).toContain('browser.tabs?.onRemoved?.addListener?.(handleBrowserRemoved)');
        expect(hardenExtensionBackgroundSource(source)).toContain('chrome.tabs?.onRemoved?.removeListener?.(handleChromeRemoved)');
    });

    it('adds the visible-tab screenshot bridge to generated backgrounds once', () => {
        const source = 'console.log("background");';
        const hardened = hardenExtensionBackgroundSource(source);

        expect(hardened).toContain('yomu-extension-screenshot-bridge');
        expect(hardened).toContain('yomu.captureVisibleTab');
        expect(hardenExtensionBackgroundSource(hardened).match(/yomu-extension-screenshot-bridge/g)).toHaveLength(1);
    });

    it('adds the Google Drive settings sync bridge only to configured Chrome backgrounds', () => {
        const source = 'console.log("background");';
        const hardened = hardenExtensionBackgroundSource(source, {
            target: 'chrome',
            googleOAuthClientId: 'client-id.apps.googleusercontent.com',
        });

        expect(hardened).toContain('yomu-google-drive-settings-sync-bridge');
        expect(hardened).toContain('yomu.googleDriveSettingsSync');
        expect(hardened).toContain('appDataFolder');
        expect(hardenExtensionBackgroundSource(hardened, {
            target: 'chrome',
            googleOAuthClientId: 'client-id.apps.googleusercontent.com',
        }).match(/yomu-google-drive-settings-sync-bridge/g)).toHaveLength(1);
        expect(hardenExtensionBackgroundSource(source, { target: 'firefox' })).not.toContain('yomu-google-drive-settings-sync-bridge');
    });

    it('uses host access for screenshots without requesting browsing-history tabs access', () => {
        expect(hardenExtensionManifest({ manifest_version: 2, permissions: ['storage'] })).toMatchObject({
            permissions: ['storage', '<all_urls>'],
        });
        expect(hardenExtensionManifest({ manifest_version: 3, permissions: ['storage', 'tabs'], host_permissions: ['https://example.com/*', 'file:///*'] })).toMatchObject({
            permissions: ['storage'],
            host_permissions: ['https://example.com/*', '<all_urls>'],
        });
    });

    it('adds Google Drive OAuth manifest fields when configured', () => {
        expect(hardenExtensionManifest(
            { manifest_version: 3, permissions: [], host_permissions: [] },
            { target: 'chrome', googleOAuthClientId: 'client-id.apps.googleusercontent.com' },
        )).toMatchObject({
            permissions: ['identity'],
            oauth2: {
                client_id: 'client-id.apps.googleusercontent.com',
                scopes: ['https://www.googleapis.com/auth/drive.appdata'],
            },
        });
        expect(hardenExtensionManifest(
            { manifest_version: 3, permissions: [], host_permissions: [] },
            { target: 'firefox', googleOAuthClientId: 'client-id.apps.googleusercontent.com' },
        )).not.toHaveProperty('oauth2');
    });
});
