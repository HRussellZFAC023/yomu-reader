import { describe, expect, it } from 'vitest';
// @ts-expect-error The packaging hardener is a Node ESM script exercised directly by the build.
import { assertAmoJavaScriptFiles, deterministicExtensionTimestamp, hardenExtensionBackgroundSource, hardenExtensionContentSource, hardenExtensionManifest, hardenExtensionPopupSource, hardenExtensionSubmissionGuide, reconcilePackageValidationAudit, splitFirefoxContentScript, unindentContentScriptBody } from '../../scripts/lib/extension-runtime-hardening.mjs';

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
          const READER_CSS_HOSTED_FALLBACK_URL = \`https://yomureader.com/yomu.css?v=\${"1.2.3"}\`;
          const READER_CSS_RAW_FALLBACK_URL = \`https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css?v=\${"1.2.3"}\`;
          function readerCssFallbackUrls(href = safeLocationHref()) {
            const urls = [hostedReaderCssUrl(href), READER_CSS_HOSTED_FALLBACK_URL, READER_CSS_RAW_FALLBACK_URL];
            return [...new Set(urls.filter(url => Boolean(url)))];
          }
        `;

        const hardened = hardenExtensionContentSource(source);

        expect(hardened).toContain('yomu-extension-packaged-reader-css');
        expect(hardened).toContain('runtime?.getURL?.("yomu.css")');
        expect(
            hardenExtensionContentSource(
                source.replace(
                    'function GM_getResourceURL(name) {',
                    `function GM_addElement(attributes) {
              const element = document.createElement('div');
              for (const [key, value] of Object.entries(attributes || {})) {
                if (key === 'textContent') element.textContent = value;
                else if (key === 'innerHTML') element.innerHTML = value;
                else element.setAttribute(key, String(value));
              }
            }
            function GM_getResourceURL(name) {`,
                ),
            ),
        ).not.toContain('element.innerHTML = value');
        expect(hardened).toContain('return [READER_CSS_RAW_FALLBACK_URL]');
        expect(hardened).not.toContain('raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css');
        expect(hardened).not.toContain('https://yomureader.com/yomu.012345abcdef.css');
        expect(hardenExtensionContentSource(hardened)).toBe(hardened);
    });

    it('continues to harden the legacy single reader CSS fallback shape', () => {
        const source = `
          function GM_getResourceURL(name) {
            return name;
          }
          const READER_CSS_RESOURCE_URL = \`https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css?v=\${"1.2.3"}\`;
          function readerCssFallbackUrls(href = safeLocationHref()) {
            const hostedUrl = hostedReaderCssUrl(href);
            return hostedUrl ? [hostedUrl, READER_CSS_RESOURCE_URL] : [READER_CSS_RESOURCE_URL];
          }
        `;

        const hardened = hardenExtensionContentSource(source);

        expect(hardened).toContain('return [READER_CSS_RESOURCE_URL]');
        expect(hardened).toContain('runtime?.getURL?.("yomu.css")');
        expect(hardened).not.toContain('raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css');
    });

    it('loads the packaged dictionary catalog before the generated userscript starts', () => {
        const source = `
          function GM_getResourceURL(name) {
            return name;
          }
          const READER_CSS_RESOURCE_URL = \`https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css?v=\${"1.2.3"}\`;
          function readerCssFallbackUrls(href = safeLocationHref()) {
            const hostedUrl = hostedReaderCssUrl(href);
            return hostedUrl ? [hostedUrl, READER_CSS_RESOURCE_URL] : [READER_CSS_RESOURCE_URL];
          }
          globalThis.__USC_READY = gmMessage('GM_getAllValues', {}).then(response => {
            Object.assign(values, response?.values || {});
            valuesHydrated = true;
          }, () => {
            valuesHydrated = true;
          });
        `;

        const hardened = hardenExtensionContentSource(source);

        expect(hardened).toContain('yomu-extension-runtime-catalog');
        expect(hardened).toContain("api.runtime.getURL('runtime-catalog.json')");
        expect(hardened).toContain('globalThis.__YOMU_RUNTIME_DICTIONARY_CATALOG__ = catalog');
        expect(hardened).toContain('Promise.all([yomuValuesReady, yomuCatalogReady])');
    });

    // addons.mozilla.org rejects any file over 5MB with FILE_TOO_LARGE before a
    // human ever sees it, and the compiler's blanket four-space body indent alone
    // accounts for ~429KB of the packaged script.
    it('removes the compiler body indent so the Firefox content script can be parsed', () => {
        const body = [
            'const greeting = "hi";',
            'const template = `line one',
            'line two`;',
            '',
            'function run() {',
            '  return greeting;',
            '}',
        ];
        const wrapped = [
            '/* UserScript Compiler GM compatibility runtime. */',
            '(() => {})();',
            '',
            'Promise.resolve(globalThis.__USC_READY).catch(() => {}).then(() => {',
            '  try {',
            ...body.map(line => (line === '' ? '    ' : `    ${line}`)),
            '  } catch (error) {',
            "    console.error('Userscript failed:', error);",
            '  }',
            '});',
            '',
        ].join('\n');

        const unindented = unindentContentScriptBody(wrapped);

        // The wrapper survives; only the body loses its four-space prefix, so the
        // multi-line template literal carries the exact string the userscript built.
        expect(unindented).toContain('Promise.resolve(globalThis.__USC_READY)');
        expect(unindented).toContain("    console.error('Userscript failed:', error);");
        expect(unindented).toContain('const template = `line one\nline two`;');
        expect(unindented).not.toContain('    const greeting');
        expect(unindented.length).toBe(wrapped.length - 4 * body.length);
        expect(splitFirefoxContentScript(unindented)).toEqual({
            runtime: '/* UserScript Compiler GM compatibility runtime. */\n(() => {})();\n\n',
            content: unindented.slice(unindented.indexOf('Promise.resolve(globalThis.__USC_READY)')),
        });
        // Idempotence would silently eat a real indent level, so it must refuse.
        expect(() => unindentContentScriptBody(unindented)).toThrow(/uniformly indented/);
    });

    it('refuses to rewrite a content script whose wrapper the compiler changed', () => {
        expect(() => unindentContentScriptBody('(() => {})();\nconsole.log("no wrapper");\n'))
            .toThrow(/expected userscript body wrapper/);
    });

    it('rejects every oversized JavaScript file in a Firefox package', () => {
        expect(() => assertAmoJavaScriptFiles({
            'content.js': new Uint8Array(5 * 1024 * 1024),
            'newtab/app.js': new Uint8Array(5 * 1024 * 1024 + 1),
            'large-dictionary.bin': new Uint8Array(6 * 1024 * 1024),
        })).toThrow(/newtab\/app\.js.*5242881 bytes.*5242880-byte/s);
        expect(() => assertAmoJavaScriptFiles({
            'content.js': 'const ready = true;',
            'newtab/chunks/study-settings.js': new Uint8Array(1024),
        })).not.toThrow();
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
        expect(
            hardenExtensionBackgroundSource(hardened, {
                target: 'chrome',
                googleOAuthClientId: 'client-id.apps.googleusercontent.com',
            }).match(/yomu-google-drive-settings-sync-bridge/g),
        ).toHaveLength(1);
        expect(hardenExtensionBackgroundSource(source, { target: 'firefox' })).not.toContain('yomu-google-drive-settings-sync-bridge');
    });

    it('uses host access for screenshots without requesting browsing-history tabs access', () => {
        expect(
            hardenExtensionManifest({
                manifest_version: 2,
                permissions: ['storage'],
            }),
        ).toMatchObject({
            permissions: ['storage', '<all_urls>'],
        });
        expect(
            hardenExtensionManifest({
                manifest_version: 3,
                permissions: ['storage', 'tabs'],
                host_permissions: ['https://example.com/*', 'file:///*'],
            }),
        ).toMatchObject({
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

    it('removes unsupported file-page injection only from Safari packages', () => {
        const manifest = {
            manifest_version: 3,
            permissions: ['storage'],
            host_permissions: ['file:///*'],
            content_scripts: [{ matches: ['*://*/*', 'file:///*'], js: ['content.js'] }],
        };

        expect(hardenExtensionManifest(manifest, { target: 'safari' }).content_scripts).toEqual([{ matches: ['*://*/*'], js: ['content.js'] }]);
        expect(hardenExtensionManifest(manifest, { target: 'chrome' }).content_scripts).toEqual([{ matches: ['*://*/*', 'file:///*'], js: ['content.js'] }]);
        expect(hardenExtensionManifest(manifest, { target: 'firefox' }).content_scripts).toEqual([
            { matches: ['*://*/*', 'file:///*'], js: ['gm-runtime.js', 'content.js'] },
        ]);
    });

    it('does not offer Safari injection on unsupported file pages', () => {
        const source = 'function isInjectableTab(url) { return /^https?:|^file:/i.test(url); }';
        const hardened = hardenExtensionPopupSource(source, { target: 'safari' });

        expect(hardened).toContain('return /^https?:/i.test(url);');
        expect(hardened).not.toContain('^file:');
        expect(hardenExtensionPopupSource(hardened, { target: 'safari' })).toBe(hardened);
        expect(hardenExtensionPopupSource(source, { target: 'chrome' })).toBe(source);
    });

    it('declares Firefox built-in data consent and its supported versions', () => {
        expect(hardenExtensionManifest({ manifest_version: 2, permissions: ['storage'] }, { target: 'firefox' })).toMatchObject({
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
        const manifest = hardenExtensionManifest({ manifest_version: 3, permissions: [], host_permissions: [] }, { target: 'chrome', packagedReaderCss: true });

        expect(manifest.web_accessible_resources).toContainEqual({
            resources: ['yomu.css', 'runtime-catalog.json'],
            matches: ['<all_urls>'],
        });
        expect(JSON.stringify(manifest)).not.toMatch(/https?:\/\/.*yomu\.css/);
    });

    it('adds Google Drive OAuth manifest fields when configured', () => {
        expect(
            hardenExtensionManifest(
                { manifest_version: 3, permissions: [], host_permissions: [] },
                {
                    target: 'chrome',
                    googleOAuthClientId: 'client-id.apps.googleusercontent.com',
                },
            ),
        ).toMatchObject({
            permissions: ['storage', 'identity'],
            oauth2: {
                client_id: 'client-id.apps.googleusercontent.com',
                scopes: ['https://www.googleapis.com/auth/drive.appdata'],
            },
        });
        expect(
            hardenExtensionManifest(
                { manifest_version: 3, permissions: [], host_permissions: [] },
                {
                    target: 'firefox',
                    googleOAuthClientId: 'client-id.apps.googleusercontent.com',
                },
            ),
        ).not.toHaveProperty('oauth2');
    });

    it('keeps generated reviewer copy honest about Study and browser new tabs', () => {
        const source = [
            'Safari new-tab behavior must be tested through Apple Safari Web Extension packaging because platform support differs.',
            'an extension popup menu, and a packaged new-tab page.',
            'Keep all new-tab content packaged in the extension. Do not redirect the new tab to a remote page.',
            '**Remote new tab:** keep new-tab files inside the extension package.',
            '- [info] safari.newtab.review: A packaged new-tab override needs Apple review.',
            '## Mozilla Add-ons (AMO)',
            '- [warning] amo.innerHTML: Review generated innerHTML assignments.',
            '## Safari App Store / Safari Web Extension Notes',
            '- [warning] amo.innerHTML: Review generated innerHTML assignments.',
            '- [info] permissions.file-urls: Safari ignores file URL matches.',
            '## Reviewer notes',
            'Keep this section.',
        ].join('\n');
        const unresolved = hardenExtensionSubmissionGuide(source);
        const hardened = hardenExtensionSubmissionGuide(source, {
            firefoxHasUnsafeHtmlAssignment: false,
            safariHasBrowserOverride: false,
            safariHasFileUrlMatch: false,
        });

        expect(unresolved).toContain('amo.innerHTML');
        expect(unresolved).toContain('safari.newtab.review');
        expect(unresolved).toContain('permissions.file-urls');
        expect(hardened).toContain('packaged Study page that opens only when the user chooses it');
        expect(hardened).toContain('does not declare a new-tab override');
        expect(hardened).toContain('## Mozilla Add-ons (AMO)');
        expect(hardened).toMatch(/## Safari App Store \/ Safari Web Extension Notes\n\s*## Reviewer notes/);
        expect(hardened).toContain('Keep this section.');
        expect(hardened).not.toContain('packaged new-tab page');
        expect(hardened).not.toContain('Safari new-tab behavior');
        expect(hardened).not.toContain('safari.newtab.review');
        expect(hardened).not.toContain('permissions.file-urls');
        expect(hardened).not.toContain('amo.innerHTML');
    });

    it('reconciles stale Safari new-tab audit findings against the final manifest', () => {
        const audit = {
            summary: { errors: 0, warnings: 1, info: 2 },
            targets: [
                {
                    target: 'firefox',
                    status: 'ok',
                    summary: { errors: 0, warnings: 1, info: 0 },
                    issues: [{ severity: 'warning', code: 'amo.innerHTML' }],
                },
                {
                    target: 'safari',
                    status: 'ok',
                    summary: { errors: 0, warnings: 0, info: 2 },
                    issues: [
                        { severity: 'info', code: 'safari.newtab.review' },
                        { severity: 'info', code: 'safari.other' },
                    ],
                },
            ],
        };

        const reconciled = reconcilePackageValidationAudit(audit, {
            safariManifest: {},
        });
        expect(reconciled.summary).toEqual({ errors: 0, warnings: 1, info: 1 });
        expect(reconciled.targets[1]).toMatchObject({
            status: 'ok',
            summary: { errors: 0, warnings: 0, info: 1 },
            issues: [{ severity: 'info', code: 'safari.other' }],
        });

        const preserved = reconcilePackageValidationAudit(audit, {
            safariManifest: { chrome_url_overrides: { newtab: 'newtab/index.html' } },
        });
        expect(preserved).toEqual(audit);
    });
});
