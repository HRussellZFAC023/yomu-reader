import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, type Mock } from 'vitest';
import {
    assertAmoJavaScriptFiles,
    deterministicExtensionTimestamp,
    extensionStudyStorageRuntimeSource,
    hardenExtensionBackgroundSource,
    hardenCompilerDurableStorage,
    hardenExtensionContentSource,
    hardenExtensionManifest,
    hardenExtensionPopupSource,
    hardenExtensionSubmissionGuide,
    PACKAGED_STUDY_STORAGE_RUNTIME_FILE,
    reconcilePackageValidationAudit,
    splitCompilerContentScript,
    unindentContentScriptBody,
// @ts-expect-error The packaging hardener is a Node ESM script exercised directly by the build.
} from '../../scripts/lib/extension-runtime-hardening.mjs';

type CompilerMessage = { type: string; payload?: Record<string, unknown> };
type CompilerMutation = { kind: 'set'; value: string } | { kind: 'delete' };
type StorageChangeListener = (changes: Record<string, unknown>, areaName: string) => void;
type BackgroundMessageListener = (
    message: unknown,
    sender: unknown,
    sendResponse: (response: unknown) => void,
) => unknown;

interface CompilerMessageHarness {
    storagePrefix: string;
    values: Map<string, unknown>;
    changeListeners: StorageChangeListener[];
    websiteValueChanges: unknown[][];
    rejectsWrites: () => boolean;
}

function deferred<T>(): {
    promise: Promise<T>;
    resolve(value: T): void;
    reject(error: unknown): void;
} {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function generatedCompilerStorageSource(): string {
    return `/* UserScript Compiler GM compatibility runtime. */
(() => {
  const api = globalThis.browser || globalThis.chrome;
  const values = Object.create(null);
  const listeners = new Map();
  let valuesHydrated = false;
  let listenerSeq = 0;

  function gmMessage(type, payload) {
    return api.runtime.sendMessage({ type, payload });
  }

  function notifyValueListeners(name, oldValue, newValue, remote) {
    for (const listener of listeners.values()) {
      if (listener.name === name) listener.callback(name, oldValue, newValue, Boolean(remote));
    }
  }

  function GM_getValue(name, defaultValue) {
    if (Object.prototype.hasOwnProperty.call(values, name)) return values[name];
    if (valuesHydrated) return defaultValue;
    return gmMessage('GM_getValue', { name, defaultValue }).then(response => {
      values[name] = response?.value;
      return response?.value;
    }, () => defaultValue);
  }
  function GM_setValue(name, value) {
    const oldValue = values[name];
    values[name] = value;
    notifyValueListeners(name, oldValue, value, false);
    return gmMessage('GM_setValue', { name, value }).catch(() => {});
  }
  function GM_deleteValue(name) {
    const oldValue = values[name];
    delete values[name];
    notifyValueListeners(name, oldValue, undefined, false);
    return gmMessage('GM_deleteValue', { name }).catch(() => {});
  }
  function GM_addValueChangeListener(name, callback) {
    const id = ++listenerSeq;
    listeners.set(id, { name, callback });
    return id;
  }
  Object.assign(globalThis, { GM_getValue, GM_setValue, GM_deleteValue, GM_addValueChangeListener });
  globalThis.__USC_READY = gmMessage('GM_getAllValues', {}).then(response => {
    Object.assign(values, response?.values || {});
    valuesHydrated = true;
  }, () => {
    valuesHydrated = true;
  });
})();

Promise.resolve(globalThis.__USC_READY).catch(() => {}).then(() => {
  try {
    globalThis.__YOMU_TEST_BODY_RAN__ = true;
  } catch (error) {
    console.error('Userscript failed:', error);
  }
});`;
}

interface CompilerStorageApi {
    getValue: (key: string, fallback: unknown) => unknown;
    setValue: (key: string, value: unknown) => Promise<void>;
    deleteValue: (key: string) => Promise<void>;
    changes: unknown[][];
}

async function executeCompilerStorageRuntime(
    sandbox: Record<string, unknown>,
    source = hardenCompilerDurableStorage(generatedCompilerStorageSource()),
): Promise<CompilerStorageApi> {
    new Function('globalThis', source)(sandbox);
    await (sandbox.__USC_READY as Promise<void>);
    const changes: unknown[][] = [];
    const addListener = sandbox.GM_addValueChangeListener as (
        key: string,
        listener: (...args: unknown[]) => void,
    ) => number;
    addListener('setting', (...args) => changes.push(args));
    return {
        getValue: sandbox.GM_getValue as CompilerStorageApi['getValue'],
        setValue: sandbox.GM_setValue as CompilerStorageApi['setValue'],
        deleteValue: sandbox.GM_deleteValue as CompilerStorageApi['deleteValue'],
        changes,
    };
}

function promiseStudySettingsBackground(
    create: Mock = vi.fn(async () => ({ id: 73 })),
): {
    create: Mock;
    hardened: string;
    listener: BackgroundMessageListener;
} {
    const listeners: BackgroundMessageListener[] = [];
    const sandbox = {
        browser: {
            runtime: {
                id: 'yomu@yomureader.com',
                getURL: (path: string) => `moz-extension://owned/${path}`,
                onMessage: { addListener: (listener: BackgroundMessageListener) => listeners.push(listener) },
            },
            tabs: { create },
        },
    };
    const hardened = hardenExtensionBackgroundSource('void 0;', { target: 'firefox' });
    new Function('globalThis', hardened)(sandbox);
    return { create, hardened, listener: listeners[0]! };
}

function compilerMessageHandler(harness: CompilerMessageHarness) {
    return async (message: CompilerMessage): Promise<Record<string, unknown>> => {
        const name = String(message.payload?.name ?? '');
        const key = `${harness.storagePrefix}${name}`;
        const handlers: Record<string, () => Promise<Record<string, unknown>>> = {
            GM_getValue: async () => ({
                value: harness.values.has(key) ? harness.values.get(key) : message.payload?.defaultValue,
            }),
            GM_listValues: async () => ({
                keys: [...harness.values.keys()]
                    .filter(candidate => candidate.startsWith(harness.storagePrefix))
                    .map(candidate => candidate.slice(harness.storagePrefix.length)),
            }),
            GM_setValue: () => applyCompilerSetMessage(harness, name, key, message.payload?.value),
            GM_deleteValue: () => applyCompilerDeleteMessage(harness, name, key),
        };
        const handler = handlers[message.type];
        if (!handler) throw new Error(`Unexpected compiler message: ${message.type}`);
        return handler();
    };
}

async function applyCompilerSetMessage(
    harness: CompilerMessageHarness,
    name: string,
    key: string,
    newValue: unknown,
): Promise<Record<string, unknown>> {
    if (harness.rejectsWrites()) throw new Error('durable write rejected');
    const oldValue = harness.values.get(key);
    harness.values.set(key, newValue);
    publishCompilerValueChange(harness, name, key, oldValue, newValue);
    return {};
}

async function applyCompilerDeleteMessage(
    harness: CompilerMessageHarness,
    name: string,
    key: string,
): Promise<Record<string, unknown>> {
    if (harness.rejectsWrites()) throw new Error('durable delete rejected');
    const oldValue = harness.values.get(key);
    harness.values.delete(key);
    publishCompilerValueChange(harness, name, key, oldValue, undefined);
    return {};
}

function publishCompilerValueChange(
    harness: CompilerMessageHarness,
    name: string,
    key: string,
    oldValue: unknown,
    newValue: unknown,
): void {
    harness.websiteValueChanges.push([name, oldValue, newValue, true]);
    harness.changeListeners.forEach(listener => listener({
        [key]: { oldValue, newValue },
    }, 'local'));
}

describe('extension runtime hardening', () => {
    it('uses SOURCE_DATE_EPOCH with a deterministic Git commit fallback', () => {
        expect(deterministicExtensionTimestamp('1720000000', '1710000000')).toBe('2024-07-03T09:46:40.000Z');
        expect(deterministicExtensionTimestamp('', '1710000000\n')).toBe('2024-03-09T16:00:00.000Z');
        expect(() => deterministicExtensionTimestamp('not-an-epoch', '1710000000')).toThrow(/whole seconds/);
    });

    it('stages the Study storage adapter inside the compiler-owned newtab graph', () => {
        const source = readFileSync('scripts/build-extension.mjs', 'utf8');
        const preconditions = source.indexOf('await verifyExtensionSourcePreconditions()');
        const staging = source.indexOf('await stageNewTabShell()');
        const compile = source.indexOf('await run(process.execPath');

        expect(PACKAGED_STUDY_STORAGE_RUNTIME_FILE).toBe('newtab/study-storage-runtime.js');
        expect(preconditions).toBeGreaterThanOrEqual(0);
        expect(staging).toBeGreaterThan(preconditions);
        expect(staging).toBeGreaterThanOrEqual(0);
        expect(compile).toBeGreaterThan(staging);
        expect(source).toContain('await writeFile(stagedStudyStorageRuntime, STUDY_STORAGE_RUNTIME_PLACEHOLDER)');
        expect(source).toContain('<script src="./study-storage-runtime.js"></script>');
        expect(source).not.toContain('<script src="../study-storage-runtime.js"></script>');
        expect(source).toContain('await assertShippedSettingsAuthorityRuntime(entries, target, releaseVersion)');
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

    it('opens only the exact packaged Firefox Study route through a Promise tabs API', async () => {
        const { create, hardened, listener } = promiseStudySettingsBackground();
        let response: unknown;

        expect(listener(
            { type: 'yomu.openPackagedStudySettings', protocol: 'yomu-packaged-study-settings-launcher:v1', panel: 'appearance' },
            { id: 'yomu@yomureader.com', tab: { id: 12 } },
            value => { response = value; },
        )).toBe(true);
        await vi.waitFor(() => expect(response).toEqual({ ok: true, tabId: 73 }));
        expect(create).toHaveBeenCalledOnce();
        expect(create).toHaveBeenCalledWith({
            url: 'moz-extension://owned/newtab/index.html#settings=appearance',
            active: true,
        });
        expect(hardened.match(/yomu-packaged-study-settings-bridge/g)).toHaveLength(1);
        expect(hardenExtensionBackgroundSource(hardened, { target: 'firefox' })
            .match(/yomu-packaged-study-settings-bridge/g)).toHaveLength(1);
        expect(hardenExtensionBackgroundSource('void 0;', { target: 'chrome' }))
            .not.toContain('yomu-packaged-study-settings-bridge');
    });

    it('ignores unrelated messages and rejects unknown panels or non-content senders without creating a tab', () => {
        const { create, listener } = promiseStudySettingsBackground();
        const unrelatedResponse = vi.fn();
        const staleProtocolResponse = vi.fn();
        const invalidPanelResponse = vi.fn();
        const externalSenderResponse = vi.fn();

        expect(listener(
            { type: 'unrelated.message', panel: 'appearance' },
            { id: 'yomu@yomureader.com', tab: { id: 12 } },
            unrelatedResponse,
        )).toBeUndefined();
        expect(listener(
            { type: 'yomu.openPackagedStudySettings', protocol: 'legacy-launcher', panel: 'appearance' },
            { id: 'yomu@yomureader.com', tab: { id: 12 } },
            staleProtocolResponse,
        )).toBe(false);
        expect(listener(
            { type: 'yomu.openPackagedStudySettings', protocol: 'yomu-packaged-study-settings-launcher:v1', panel: 'attacker-panel' },
            { id: 'yomu@yomureader.com', tab: { id: 12 } },
            invalidPanelResponse,
        )).toBe(false);
        expect(listener(
            { type: 'yomu.openPackagedStudySettings', protocol: 'yomu-packaged-study-settings-launcher:v1', panel: 'appearance' },
            { id: 'another-extension', tab: { id: 12 } },
            externalSenderResponse,
        )).toBe(false);
        expect(unrelatedResponse).not.toHaveBeenCalled();
        expect(staleProtocolResponse).toHaveBeenCalledWith({
            ok: false,
            error: 'Unsupported packaged Study settings launcher protocol.',
        });
        expect(invalidPanelResponse).toHaveBeenCalledWith({
            ok: false,
            error: 'Unknown packaged Study settings panel.',
        });
        expect(externalSenderResponse).toHaveBeenCalledWith({
            ok: false,
            error: 'Packaged Study settings requests require an extension content tab.',
        });
        expect(create).not.toHaveBeenCalled();
    });

    it('supports callback tabs.create and reports both callback and Promise creation failures', async () => {
        const callbackListeners: Array<(message: unknown, sender: unknown, send: (response: unknown) => void) => unknown> = [];
        const callbackCreate = vi.fn(function create(
            _options: unknown,
            callback: (tab: { id: number }) => void,
        ) {
            callback({ id: 91 });
        });
        const callbackSandbox = {
            chrome: {
                runtime: {
                    id: 'yomu@yomureader.com',
                    getURL: (path: string) => `moz-extension://owned/${path}`,
                    onMessage: { addListener: (listener: typeof callbackListeners[number]) => callbackListeners.push(listener) },
                    lastError: undefined,
                },
                tabs: { create: callbackCreate },
            },
        };
        new Function('globalThis', hardenExtensionBackgroundSource('void 0;', { target: 'firefox' }))(callbackSandbox);
        let callbackResponse: unknown;
        callbackListeners[0]!({ type: 'yomu.openPackagedStudySettings', protocol: 'yomu-packaged-study-settings-launcher:v1', panel: 'backup' }, {
            id: 'yomu@yomureader.com',
            tab: { id: 12 },
        }, value => { callbackResponse = value; });
        await vi.waitFor(() => expect(callbackResponse).toEqual({ ok: true, tabId: 91 }));
        expect(callbackCreate).toHaveBeenCalledWith({
            url: 'moz-extension://owned/newtab/index.html#settings=backup',
            active: true,
        }, expect.any(Function));

        const rejectedCreate = vi.fn(async () => { throw new Error('tab create rejected'); });
        const { listener: rejectionListener } = promiseStudySettingsBackground(rejectedCreate);
        let rejectionResponse: unknown;
        rejectionListener({ type: 'yomu.openPackagedStudySettings', protocol: 'yomu-packaged-study-settings-launcher:v1', panel: 'appearance' }, {
            id: 'yomu@yomureader.com',
            tab: { id: 12 },
        }, value => { rejectionResponse = value; });
        await vi.waitFor(() => expect(rejectionResponse).toEqual({ ok: false, error: 'tab create rejected' }));
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
        expect(hardened).not.toContain('}, () => {\n            valuesHydrated = true;');
        expect(hardenExtensionContentSource(hardened)).toBe(hardened);

        const strictValuesReady = `const yomuValuesReady = gmMessage('GM_getAllValues', {}).then(response => {
    Object.assign(values, response?.values || {});
    valuesHydrated = true;
  });`;
        const staleCatalogValuesReady = `const yomuValuesReady = gmMessage('GM_getAllValues', {}).then(response => {
    Object.assign(values, response?.values || {});
    valuesHydrated = true;
  }, () => {
    valuesHydrated = true;
  });`;
        const staleHardened = hardened.replace(strictValuesReady, staleCatalogValuesReady);
        expect(staleHardened).not.toBe(hardened);
        expect(hardenExtensionContentSource(staleHardened)).toBe(hardened);
    });

    it('keeps the generated userscript body closed when initial background hydration rejects', async () => {
        const source = generatedCompilerStorageSource().replace(
            '  function GM_getValue(name, defaultValue) {',
            `  function GM_getResourceURL(name) {
    return name;
  }
  const READER_CSS_RESOURCE_URL = \`https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css?v=\${"1.2.3"}\`;
  function readerCssFallbackUrls(href = safeLocationHref()) {
    const hostedUrl = hostedReaderCssUrl(href);
    return hostedUrl ? [hostedUrl, READER_CSS_RESOURCE_URL] : [READER_CSS_RESOURCE_URL];
  }
  function GM_getValue(name, defaultValue) {`,
        );
        const hardened = hardenExtensionContentSource(source);
        const executable = hardened.replace(
            'Promise.resolve(globalThis.__USC_READY).then(() => {',
            'globalThis.__YOMU_TEST_BODY_PROMISE__ = Promise.resolve(globalThis.__USC_READY).then(() => {',
        );
        const sandbox: Record<string, unknown> = {
            browser: {
                runtime: {
                    getURL: (file: string) => `moz-extension://owned/${file}`,
                    sendMessage: vi.fn(async () => { throw new Error('background hydration rejected'); }),
                },
            },
        };
        const fetchCatalog = vi.fn(async () => ({
            ok: true,
            json: async () => ({ dictionaries: [] }),
        }));

        new Function('globalThis', 'fetch', executable)(sandbox, fetchCatalog);

        await expect(sandbox.__YOMU_TEST_BODY_PROMISE__).rejects.toThrow('background hydration rejected');
        expect(sandbox.__YOMU_TEST_BODY_RAN__).toBeUndefined();
        expect(fetchCatalog).toHaveBeenCalledWith('moz-extension://owned/runtime-catalog.json');
    });

    it('does not publish compiler GM mutations whose durable write rejects', async () => {
        const source = generatedCompilerStorageSource();
        const messages: CompilerMessage[] = [];
        const sandbox: Record<string, unknown> = {
            browser: {
                runtime: {
                    sendMessage: vi.fn(async (message: CompilerMessage) => {
                        messages.push(message);
                        if (message.type === 'GM_getAllValues') {
                            return { values: { setting: 'old' } };
                        }
                        if (message.type === 'GM_setValue') throw new Error('background set rejected');
                        if (message.type === 'GM_deleteValue') throw new Error('background delete rejected');
                        throw new Error(`unexpected ${message.type}`);
                    }),
                },
            },
        };
        const hardened = hardenCompilerDurableStorage(source);

        expect(hardened.match(/yomu-extension-durable-storage-runtime:v2/g)).toHaveLength(1);
        expect(hardened).not.toContain("gmMessage('GM_setValue', { name, value }).catch(() => {})");
        expect(hardened).not.toContain("gmMessage('GM_deleteValue', { name }).catch(() => {})");
        expect(hardened).not.toContain('Promise.resolve(globalThis.__USC_READY).catch(() => {}).then(() => {');
        expect(hardenCompilerDurableStorage(hardened)).toBe(hardened);
        const { getValue, setValue, deleteValue, changes } = await executeCompilerStorageRuntime(sandbox, hardened);

        await expect(setValue('setting', 'optimistic')).rejects.toThrow('background set rejected');
        expect(getValue('setting', null)).toBe('old');
        expect(changes).toEqual([]);

        await expect(deleteValue('setting')).rejects.toThrow('background delete rejected');
        expect(getValue('setting', null)).toBe('old');
        expect(changes).toEqual([]);
        expect(messages.map(message => message.type)).toEqual([
            'GM_getAllValues',
            'GM_setValue',
            'GM_deleteValue',
        ]);
    });

    it.each([
        {
            label: 'set then set',
            first: { kind: 'set', value: 'superseded' } as CompilerMutation,
            second: { kind: 'set', value: 'newest' } as CompilerMutation,
            expectedValue: 'newest',
            expectedChange: ['setting', 'old', 'newest', false],
        },
        {
            label: 'set then delete',
            first: { kind: 'set', value: 'superseded' } as CompilerMutation,
            second: { kind: 'delete' } as CompilerMutation,
            expectedValue: null,
            expectedChange: ['setting', 'old', undefined, false],
        },
        {
            label: 'delete then set',
            first: { kind: 'delete' } as CompilerMutation,
            second: { kind: 'set', value: 'newest' } as CompilerMutation,
            expectedValue: 'newest',
            expectedChange: ['setting', 'old', 'newest', false],
        },
    ])('serializes overlapping $label after an earlier rejection', async ({
        first,
        second,
        expectedValue,
        expectedChange,
    }) => {
        const mutationMessages: CompilerMessage[] = [];
        const mutationGates: Array<ReturnType<typeof deferred<Record<string, unknown>>>> = [];
        const sandbox: Record<string, unknown> = {
            browser: {
                runtime: {
                    sendMessage: vi.fn((message: CompilerMessage) => {
                        if (message.type === 'GM_getAllValues') return Promise.resolve({ values: { setting: 'old' } });
                        mutationMessages.push(message);
                        const gate = deferred<Record<string, unknown>>();
                        mutationGates.push(gate);
                        return gate.promise;
                    }),
                },
            },
        };
        const { getValue, setValue, deleteValue, changes } = await executeCompilerStorageRuntime(sandbox);
        const invoke = (mutation: CompilerMutation): Promise<void> => mutation.kind === 'set'
            ? setValue('setting', mutation.value)
            : deleteValue('setting');

        const firstOutcome = invoke(first);
        const secondOutcome = invoke(second);
        await vi.waitFor(() => expect(mutationMessages).toHaveLength(1));
        expect(getValue('setting', null)).toBe('old');
        expect(changes).toEqual([]);

        mutationGates[0]!.reject(new Error('first durable mutation rejected'));
        await expect(firstOutcome).rejects.toThrow('first durable mutation rejected');
        await vi.waitFor(() => expect(mutationMessages).toHaveLength(2));
        expect(getValue('setting', null)).toBe('old');
        expect(changes).toEqual([]);

        mutationGates[1]!.resolve({});
        await expect(secondOutcome).resolves.toBeUndefined();
        expect(getValue('setting', null)).toBe(expectedValue);
        expect(changes).toEqual([expectedChange]);
    });

    it('fails compiler hardening when the generated durable-storage contract drifts or duplicates', () => {
        const source = generatedCompilerStorageSource();
        expect(() => hardenCompilerDurableStorage(source.replace(
            "return gmMessage('GM_setValue', { name, value }).catch(() => {});",
            "return gmMessage('GM_setValue', { name, value });",
        ))).toThrow(/exactly one GM_setValue durable failure handling contract; found 0/);
        const deleteContract = `  function GM_deleteValue(name) {
    const oldValue = values[name];
    delete values[name];
    notifyValueListeners(name, oldValue, undefined, false);
    return gmMessage('GM_deleteValue', { name }).catch(() => {});
  }`;
        expect(() => hardenCompilerDurableStorage(source.replace(
            deleteContract,
            `${deleteContract}\n${deleteContract}`,
        ))).toThrow(/exactly one GM_deleteValue durable failure handling contract; found 2/);
        expect(() => hardenCompilerDurableStorage(source.replace(
            '/* UserScript Compiler GM compatibility runtime. */',
            '/* yomu-extension-durable-storage-runtime:v1 */',
        ))).toThrow(/retired optimistic durable-storage runtime/);
    });

    it('shares durable compiler-prefixed storage with packaged Study and broadcasts saves to open websites', async () => {
        const storagePrefix = 'usc_https_github_com_HRussellZFAC023_yomu_reader_';
        const values = new Map<string, unknown>([
            [`${storagePrefix}jpdb-popup-reader-settings`, { theme: 'dark' }],
            ['unrelated-extension-key', 'keep'],
        ]);
        const changeListeners: StorageChangeListener[] = [];
        const websiteValueChanges: unknown[][] = [];
        let rejectWrites = false;
        const storage = {
            get: async (key: string | null) => key === null
                ? Object.fromEntries(values)
                : values.has(key) ? { [key]: values.get(key) } : {},
            set: async (updates: Record<string, unknown>) => {
                if (rejectWrites) throw new Error('durable write rejected');
                for (const [key, value] of Object.entries(updates)) values.set(key, value);
            },
            remove: async (key: string) => {
                if (rejectWrites) throw new Error('durable delete rejected');
                values.delete(key);
            },
        };
        const sandbox: Record<string, unknown> = {
            browser: {
                runtime: {
                    sendMessage: compilerMessageHandler({
                        storagePrefix,
                        values,
                        changeListeners,
                        websiteValueChanges,
                        rejectsWrites: () => rejectWrites,
                    }),
                },
                storage: {
                    local: storage,
                    onChanged: { addListener: (listener: typeof changeListeners[number]) => changeListeners.push(listener) },
                },
            },
        };
        const runtime = extensionStudyStorageRuntimeSource(storagePrefix);
        new Function('globalThis', runtime)(sandbox);
        expect(sandbox.__YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__).toBe(true);
        expect(sandbox.GM_info).toBeUndefined();
        const getValue = sandbox.GM_getValue as (key: string, fallback: unknown) => Promise<unknown>;
        const setValue = sandbox.GM_setValue as (key: string, value: unknown) => Promise<void>;
        const deleteValue = sandbox.GM_deleteValue as (key: string) => Promise<void>;
        const listValues = sandbox.GM_listValues as () => Promise<string[]>;
        const addListener = sandbox.GM_addValueChangeListener as (
            key: string,
            listener: (key: string, oldValue: unknown, newValue: unknown, remote: boolean) => void,
        ) => number;

        await expect(getValue('jpdb-popup-reader-settings', null)).resolves.toEqual({ theme: 'dark' });
        await expect(listValues()).resolves.toEqual(['jpdb-popup-reader-settings']);
        const changed: unknown[][] = [];
        addListener('jpdb-popup-reader-settings', (...args) => changed.push(args));
        await setValue('jpdb-popup-reader-settings', { theme: 'light' });
        expect(values.get(`${storagePrefix}jpdb-popup-reader-settings`)).toEqual({ theme: 'light' });
        expect(values.get('unrelated-extension-key')).toBe('keep');
        expect(websiteValueChanges).toEqual([[
            'jpdb-popup-reader-settings',
            { theme: 'dark' },
            { theme: 'light' },
            true,
        ]]);
        expect(changed).toEqual([[
            'jpdb-popup-reader-settings',
            { theme: 'dark' },
            { theme: 'light' },
            true,
        ]]);

        values.set(`${storagePrefix}jpdb-popup-reader-settings`, { theme: 'system' });
        changeListeners[0]?.({
            [`${storagePrefix}jpdb-popup-reader-settings`]: {
                oldValue: { theme: 'light' },
                newValue: { theme: 'system' },
            },
        }, 'local');
        expect(changed.at(-1)).toEqual([
            'jpdb-popup-reader-settings',
            { theme: 'light' },
            { theme: 'system' },
            true,
        ]);

        rejectWrites = true;
        await expect(setValue('jpdb-popup-reader-settings', { theme: 'dark' }))
            .rejects.toThrow('durable write rejected');
        await expect(deleteValue('jpdb-popup-reader-settings'))
            .rejects.toThrow('durable delete rejected');
        await expect(getValue('jpdb-popup-reader-settings', null)).resolves.toEqual({ theme: 'system' });
        expect(values.get(`${storagePrefix}jpdb-popup-reader-settings`)).toEqual({ theme: 'system' });
        expect(changed).toHaveLength(2);
        expect(websiteValueChanges).toHaveLength(1);
        expect(runtime).not.toContain('GM_info');
        expect(runtime).not.toContain('GM_xmlhttpRequest');
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
            'Promise.resolve(globalThis.__USC_READY).then(() => {',
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
        expect(splitCompilerContentScript(unindented)).toEqual({
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

    it('compacts the Firefox body without identifier or syntax minification', () => {
        const source = `
          (() => {
            const retainedIdentifierName = 3;
            const retainedTemplateText = \`line one
line two\`;
            globalThis.__yomuFirefoxCompactionProbe = {
              retainedIdentifierName,
              retainedTemplateText,
            };
          })();
        `;
        const hardenerUrl = pathToFileURL(path.join(
            process.cwd(),
            'scripts',
            'lib',
            'extension-runtime-hardening.mjs',
        )).href;
        const program = `
          import { compactFirefoxContentScript } from ${JSON.stringify(hardenerUrl)};
          const source = ${JSON.stringify(source)};
          const compacted = await compactFirefoxContentScript(source);
          const duplicate = await compactFirefoxContentScript(source);
          new Function(compacted)();
          process.stdout.write(JSON.stringify({
            sourceBytes: Buffer.byteLength(source, 'utf8'),
            compactedBytes: Buffer.byteLength(compacted, 'utf8'),
            deterministic: compacted === duplicate,
            retainedDeclaration: compacted.includes('const retainedIdentifierName=3'),
            retainedTemplateDeclaration: compacted.includes('const retainedTemplateText=\`line one\\nline two\`'),
            probe: globalThis.__yomuFirefoxCompactionProbe,
          }));
        `;
        const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', program], {
            encoding: 'utf8',
            timeout: 15_000,
        }));

        expect(result.compactedBytes).toBeLessThan(result.sourceBytes);
        expect(result.deterministic).toBe(true);
        expect(result.retainedDeclaration).toBe(true);
        expect(result.retainedTemplateDeclaration).toBe(true);
        expect(result.probe).toEqual({
            retainedIdentifierName: 3,
            retainedTemplateText: 'line one\nline two',
        });
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
