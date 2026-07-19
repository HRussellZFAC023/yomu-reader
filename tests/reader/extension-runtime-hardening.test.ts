import { describe, expect, it } from 'vitest';
// @ts-expect-error The packaging hardener is a Node ESM script exercised directly by the build.
import { deterministicExtensionTimestamp, hardenExtensionBackgroundSource, hardenExtensionContentSource, hardenExtensionManifest, hardenExtensionSubmissionGuide } from '../../scripts/lib/extension-runtime-hardening.mjs';

describe('extension runtime hardening', () => {
    it('uses SOURCE_DATE_EPOCH with a deterministic Git commit fallback', () => {
        expect(deterministicExtensionTimestamp('1720000000', '1710000000')).toBe('2024-07-03T09:46:40.000Z');
        expect(deterministicExtensionTimestamp('', '1710000000\n')).toBe('2024-03-09T16:00:00.000Z');
        expect(() => deterministicExtensionTimestamp('not-an-epoch', '1710000000')).toThrow(/whole seconds/);
    });

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

    it('routes generated reader CSS requests to the packaged stylesheet', () => {
        const source = `
          function GM_getResourceURL(name) {
            const resource = GM_info.script.resources.find(item => item.name === name);
            return resource?.url || '';
          }
          const GM_info = { script: { resources: [{ name: "yomuCss", url: "https://yomureader.com/yomu.012345abcdef.css#sha256=abc+123=" }] } };
          const READER_CSS_RESOURCE_URL = \`https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css?v=\${"1.2.3"}\`;
          function readerCssFallbackUrls(href = safeLocationHref()) {
            const hostedUrl = hostedReaderCssUrl(href);
            return hostedUrl ? [hostedUrl, READER_CSS_RESOURCE_URL] : [READER_CSS_RESOURCE_URL];
          }
        `;

        const hardened = hardenExtensionContentSource(source);

        expect(hardened).toContain('yomu-extension-packaged-reader-css');
        expect(hardened).toContain('runtime?.getURL?.("yomu.css")');
        expect(hardened).toContain('return [READER_CSS_RESOURCE_URL]');
        expect(hardened).not.toContain('raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css');
        expect(hardened).not.toContain('https://yomureader.com/yomu.012345abcdef.css');
        expect(hardenExtensionContentSource(hardened)).toBe(hardened);
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

    it('removes static new-tab overrides from every store manifest', () => {
        const manifest = {
            manifest_version: 3,
            permissions: ['storage'],
            host_permissions: [],
            chrome_url_overrides: { newtab: 'newtab/index.html' },
            browser_url_overrides: { newtab: 'newtab/index.html' },
            chrome_settings_overrides: { homepage: 'newtab/index.html' },
        };

        expect(hardenExtensionManifest(manifest, { target: 'chrome' })).not.toHaveProperty('chrome_url_overrides');
        expect(hardenExtensionManifest(manifest, { target: 'firefox' })).not.toHaveProperty('chrome_url_overrides');
        expect(hardenExtensionManifest(manifest, { target: 'safari' })).not.toHaveProperty('chrome_url_overrides');
        expect(hardenExtensionManifest(manifest, { target: 'firefox' })).not.toHaveProperty('browser_url_overrides');
        expect(hardenExtensionManifest(manifest, { target: 'chrome' })).not.toHaveProperty('chrome_settings_overrides');
    });

    it('declares Firefox built-in data consent and its supported versions', () => {
        expect(hardenExtensionManifest(
            { manifest_version: 2, permissions: ['storage'] },
            { target: 'firefox' },
        )).toMatchObject({
            browser_specific_settings: {
                gecko: {
                    id: 'yomu@yomureader.com',
                    strict_min_version: '140.0',
                    data_collection_permissions: {
                        required: ['websiteContent'],
                        optional: ['authenticationInfo'],
                    },
                },
                gecko_android: { strict_min_version: '142.0' },
            },
        });
    });

    it('exposes the packaged reader stylesheet without adding a remote stylesheet', () => {
        const manifest = hardenExtensionManifest(
            { manifest_version: 3, permissions: [], host_permissions: [] },
            { target: 'chrome', packagedReaderCss: true },
        );

        expect(manifest.web_accessible_resources).toContainEqual({
            resources: ['yomu.css'],
            matches: ['<all_urls>'],
        });
        expect(JSON.stringify(manifest)).not.toMatch(/https?:\/\/.*yomu\.css/);
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

    it('keeps generated reviewer copy honest about Study and browser new tabs', () => {
        const hardened = hardenExtensionSubmissionGuide([
            'Safari new-tab behavior must be tested through Apple Safari Web Extension packaging because platform support differs.',
            'an extension popup menu, and a packaged new-tab page.',
            'Keep all new-tab content packaged in the extension. Do not redirect the new tab to a remote page.',
            '**Remote new tab:** keep new-tab files inside the extension package.',
        ].join('\n'));

        expect(hardened).toContain('packaged Study page that opens only when the user chooses it');
        expect(hardened).toContain('does not declare a new-tab override');
        expect(hardened).not.toContain('packaged new-tab page');
        expect(hardened).not.toContain('Safari new-tab behavior');
    });
});
