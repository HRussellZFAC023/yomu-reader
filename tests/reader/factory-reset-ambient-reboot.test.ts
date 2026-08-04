import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('factory reset across ambient-only userscript realms', () => {
    it('rejects a stale pre-reset save and reboots settings and dictionary archives from defaults', () => {
        // Each jsdom is a distinct page realm. The shared Map models the
        // userscript-manager store, while lexical parameters model Tampermonkey
        // ambient GM_* bindings without adding them to globalThis.
        const proof = `
            import { build } from 'esbuild';
            import { JSDOM } from 'jsdom';

            const entrySource = [
                "import { FactoryResetCoordinator } from './src/reader/app/factory-reset-coordinator.ts';",
                "import { DEFAULT_SETTINGS, saveSettings } from './src/reader/settings/index.ts';",
                "import { loadReaderStartupSettings } from './src/reader/app/startup.ts';",
                "import { persistDictionaryArchive, listDictionaryArchives, readDictionaryArchiveFile } from './src/reader/dictionaries/archive-cache.ts';",
                'export { FactoryResetCoordinator, DEFAULT_SETTINGS, saveSettings, loadReaderStartupSettings, persistDictionaryArchive, listDictionaryArchives, readDictionaryArchiveFile };',
            ].join('\\n');
            const result = await build({
                stdin: {
                    contents: entrySource,
                    resolveDir: process.cwd(),
                    sourcefile: 'factory-reset-ambient-proof.ts',
                    loader: 'ts',
                },
                bundle: true,
                write: false,
                format: 'iife',
                globalName: 'YomuFactoryResetProof',
                platform: 'browser',
                target: 'es2022',
                logLevel: 'silent',
                define: {
                    __YOMU_VERSION__: JSON.stringify('test'),
                    __YOMU_NEWTAB_BUILD__: 'false',
                    __YOMU_EXTENSION_BUILD__: 'false',
                    __YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID__: JSON.stringify(''),
                    __YOMU_GOOGLE_OAUTH_EXTENSION_CONFIGURED__: 'false',
                },
            });
            const bundle = result.outputFiles[0].text;

            function assert(condition, message) {
                if (!condition) throw new Error(message);
            }

            function equal(actual, expected, message) {
                const actualJson = JSON.stringify(actual);
                const expectedJson = JSON.stringify(expected);
                if (actualJson !== expectedJson) {
                    throw new Error(message + ': expected ' + expectedJson + ', received ' + actualJson);
                }
            }

            function clone(value) {
                return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
            }

            const values = new Map();
            const gm = {
                get: (key, fallback) => clone(values.has(key) ? values.get(key) : fallback),
                set: (key, value) => { values.set(key, clone(value)); },
                delete: key => { values.delete(key); },
                list: () => [...values.keys()],
            };

            function createRealm(url) {
                const dom = new JSDOM('<!doctype html><html><body></body></html>', {
                    url,
                    runScripts: 'outside-only',
                });
                Object.defineProperty(dom.window, 'BroadcastChannel', {
                    configurable: true,
                    value: undefined,
                });
                dom.window.__proofGet = gm.get;
                dom.window.__proofSet = gm.set;
                dom.window.__proofDelete = gm.delete;
                dom.window.__proofList = gm.list;
                const load = [
                    '((GM_getValue, GM_setValue, GM_deleteValue, GM_listValues) => {',
                    "if (typeof GM_listValues !== 'function') throw new Error('GM_listValues is not an ambient binding');",
                    "if (Object.hasOwn(globalThis, 'GM_listValues')) throw new Error('ambient proof polluted globalThis before evaluation');",
                    'delete globalThis.__proofGet;',
                    'delete globalThis.__proofSet;',
                    'delete globalThis.__proofDelete;',
                    'delete globalThis.__proofList;',
                    bundle,
                    'return YomuFactoryResetProof;',
                    '})(globalThis.__proofGet, globalThis.__proofSet, globalThis.__proofDelete, globalThis.__proofList)',
                ].join('\\n');
                const api = dom.window.eval(load);
                assert(!Object.hasOwn(dom.window, 'GM_listValues'), 'ambient proof polluted globalThis after evaluation');
                return { api, dom };
            }

            const realms = [];
            try {
                const realmA = createRealm('https://jpdb.io/review');
                realms.push(realmA);
                const title = 'Jitendex.org [2026-06-06]';
                const startupA = await realmA.api.loadReaderStartupSettings({ showWelcome: false });
                const staleSettings = {
                    ...startupA.settings,
                    theme: 'dark',
                    onboardingSeen: true,
                    localDictionariesEnabled: true,
                    dictionaryPreferences: [{
                        name: title,
                        alias: title,
                        enabled: true,
                        priority: 0,
                        type: 'terms',
                    }],
                };
                await realmA.api.saveSettings(staleSettings);
                await realmA.api.persistDictionaryArchive({
                    title,
                    filename: 'jitendex.zip',
                    file: new realmA.dom.window.Blob([new realmA.dom.window.Uint8Array(64)]),
                });

                const preResetArchives = await realmA.api.listDictionaryArchives();
                assert(preResetArchives['jitendex.org'], 'pre-reset archive control failed');
                assert(await realmA.api.readDictionaryArchiveFile('jitendex.org'), 'pre-reset archive bytes unreadable');

                const realmB = createRealm('https://www.youtube.com/watch?v=factory-reset');
                realms.push(realmB);
                realmB.dom.window.localStorage.setItem('foreign-site-token', 'keep');
                realmB.dom.window.confirm = () => true;
                let reloads = 0;
                let databaseResets = 0;
                const toasts = [];
                const coordinator = new realmB.api.FactoryResetCoordinator({
                    isDestroyed: () => false,
                    getLanguage: () => 'en',
                    invalidateRuntimeStores: async () => undefined,
                    resetDictionaryDatabase: async () => { databaseResets += 1; },
                    toast: message => { toasts.push(message); },
                    reload: () => { reloads += 1; },
                });
                await coordinator.resetAllData();

                equal(reloads, 1, 'factory reset did not reload its realm');
                equal(databaseResets, 2, 'factory reset did not perform its pre-commit and post-commit dictionary deletes');
                equal(toasts, [], 'factory reset reported a failure');
                equal(realmB.dom.window.localStorage.getItem('foreign-site-token'), 'keep', 'factory reset deleted foreign origin storage');
                for (const key of [
                    'jpdb-popup-reader-settings',
                    'yomu-dictionary-archives',
                    'yomu-dictionary-archive:jitendex.org:0',
                    'yomu:factory-reset-signal',
                ]) {
                    assert(!values.has(key), 'factory reset retained managed GM key ' + key);
                }

                let staleSaveError;
                try {
                    await realmA.api.saveSettings(staleSettings);
                } catch (error) {
                    staleSaveError = error;
                }
                assert(staleSaveError, 'stale Realm A settings save unexpectedly resolved');
                assert(
                    staleSaveError.name === 'StaleManagedStateEpochError'
                        || /Managed state belongs to epoch/.test(staleSaveError.message),
                    'stale Realm A save rejected for the wrong reason: ' + staleSaveError,
                );
                assert(!values.has('jpdb-popup-reader-settings'), 'stale Realm A resurrected the settings key');

                const realmC = createRealm('https://jiten.moe/search');
                realms.push(realmC);
                const startupC = await realmC.api.loadReaderStartupSettings({ showWelcome: false });
                equal(startupC.settings.theme, realmC.api.DEFAULT_SETTINGS.theme, 'fresh Realm C did not load the default theme');
                equal(startupC.settings.dictionaryPreferences, [], 'fresh Realm C restored reset dictionary preferences');
                equal(await realmC.api.listDictionaryArchives(), {}, 'fresh Realm C restored reset archives');

                // The reset archive cannot be resurrected: bytes and index are
                // both gone from the shared store for a fresh realm.
                equal(await realmC.api.readDictionaryArchiveFile('jitendex.org'), null, 'fresh Realm C read a reset archive');
                assert(!values.has('jpdb-popup-reader-settings'), 'fresh Realm C recreated reset settings');
                assert(!values.has('yomu-dictionary-archives'), 'fresh Realm C recreated the archive index');
                assert(!values.has('yomu-dictionary-archive:jitendex.org:0'), 'fresh Realm C recreated an archive chunk');

                for (const realm of realms) {
                    assert(!Object.hasOwn(realm.dom.window, 'GM_listValues'), 'a realm gained globalThis.GM_listValues');
                }
                process.stdout.write('ambient factory reset reboot passed');
            } finally {
                for (const realm of realms) realm.dom.window.close();
            }
        `;

        const output = execFileSync(process.execPath, ['--input-type=module', '-e', proof], {
            cwd: process.cwd(),
            encoding: 'utf8',
        });

        expect(output).toContain('ambient factory reset reboot passed');
    }, 30_000);
});
