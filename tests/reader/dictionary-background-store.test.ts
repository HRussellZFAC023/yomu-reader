import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InterfaceLanguage } from '../../src/reader/app/types';
import type { LocalDictionaryStore } from '../../src/reader/dictionaries/local-store';
import {
    installExtensionDictionaryBackgroundHost,
    type ExtensionDictionaryBackgroundHostOptions,
} from '../../src/reader/dictionaries/extension-background-host';
import {
    EXTENSION_DICTIONARY_BACKGROUND_MARKER,
    EXTENSION_DICTIONARY_KEEPALIVE_MS,
    EXTENSION_DICTIONARY_PROBE_TIMEOUT_MS,
    EXTENSION_DICTIONARY_RPC_CHANNEL,
    EXTENSION_DICTIONARY_RPC_PORT,
    EXTENSION_DICTIONARY_RPC_VERSION,
} from '../../src/reader/dictionaries/extension-rpc-protocol';
import { extensionDictionaryStoreProxy } from '../../src/reader/dictionaries/extension-store-client';
import type {
    ImportSummary,
    YomitanExactTermCandidateRequest,
    YomitanTermEntry,
} from '../../src/reader/dictionaries/yomitan';

const STORAGE_PREFIX = 'usc_yomu_test_';
const MANAGED_EPOCH = {
    version: 1,
    generation: 3,
    resetId: 'dictionary-background-test',
    committedAt: 1_754_000_000_000,
} as const;
const MANAGED_EPOCH_TOKEN = `${MANAGED_EPOCH.generation}:${MANAGED_EPOCH.resetId}`;
const SETTINGS_SLOT = `yomu:state-slot:v1:${encodeURIComponent(MANAGED_EPOCH_TOKEN)}:${encodeURIComponent('jpdb-popup-reader-settings')}`;
const SETTINGS = {
    corsProxyUrl: 'https://proxy.example.test/',
    localDictionariesEnabled: false,
    interfaceLanguage: 'ja',
};

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('extension background dictionary store', () => {
    it('does not probe the extension transport until the first dictionary operation', async () => {
        const remoteSummary = vi.fn(async () => dictionarySummary(1));
        const harness = backgroundHarness(store({ summary: remoteSummary }));

        const proxy = extensionDictionaryStoreProxy(
            store({ summary: vi.fn(async () => dictionarySummary(99)) }),
            harness.root as unknown as typeof globalThis,
        );

        expect(harness.runtime.clientMessages).toEqual([]);
        expect(harness.runtime.connectedPortNames).toEqual([]);

        await expect(proxy.summary()).resolves.toEqual(dictionarySummary(1));
        expect(harness.runtime.clientMessages).toHaveLength(1);
        expect(harness.runtime.clientMessages[0]).toMatchObject({ kind: 'ping' });
    });

    it('probes capability and hydrates background-only settings from the prefixed current slot', async () => {
        const gmGetValue = vi.fn(() => {
            throw new Error('The background must not enter the GM/content storage bridge.');
        });
        let getCorsProxyUrl: (() => string) | undefined;
        let getInterfaceLanguage: (() => InterfaceLanguage) | undefined;
        const remoteSummary = vi.fn(async () => ({
            dictionaries: [],
            terms: 0,
            kanji: 0,
            termMeta: 0,
            kanjiMeta: 0,
        }));
        const harness = backgroundHarness(
            store({ summary: remoteSummary }),
            {
                createStore: (corsGetter, languageGetter) => {
                    getCorsProxyUrl = corsGetter;
                    getInterfaceLanguage = languageGetter;
                    return store({ summary: remoteSummary });
                },
                rootAdditions: { GM_getValue: gmGetValue },
            },
        );
        const directSummary = vi.fn(async () => ({
            dictionaries: [],
            terms: 99,
            kanji: 0,
            termMeta: 0,
            kanjiMeta: 0,
        }));
        const proxy = extensionDictionaryStoreProxy(
            store({ summary: directSummary }),
            harness.root as unknown as typeof globalThis,
        );

        await expect(proxy.summary()).resolves.toEqual({
            dictionaries: [],
            terms: 0,
            kanji: 0,
            termMeta: 0,
            kanjiMeta: 0,
        });

        expect(harness.runtime.clientMessages[0]).toMatchObject({
            channel: EXTENSION_DICTIONARY_RPC_CHANNEL,
            version: EXTENSION_DICTIONARY_RPC_VERSION,
            kind: 'ping',
        });
        expect(harness.runtime.backgroundResponses).toContainEqual(expect.objectContaining({
            kind: 'capability',
            ok: true,
            enabled: false,
            marker: EXTENSION_DICTIONARY_BACKGROUND_MARKER,
        }));
        expect(harness.storageReads).toContain(`${STORAGE_PREFIX}yomu:state-epoch`);
        expect(harness.storageReads).toContain(`${STORAGE_PREFIX}${SETTINGS_SLOT}`);
        expect(harness.storageReads).not.toContain('jpdb-popup-reader-settings');
        expect(getCorsProxyUrl?.()).toBe(SETTINGS.corsProxyUrl);
        expect(getInterfaceLanguage?.()).toBe('ja');
        expect(gmGetValue).not.toHaveBeenCalled();
        expect(directSummary).not.toHaveBeenCalled();
    });

    it('round-trips a newly exposed store method through the dynamic Proxy and restores request identity', async () => {
        const request: YomitanExactTermCandidateRequest = {
            surface: '食べました',
            lookupCandidate: {
                term: '食べる',
                rules: ['v1'],
                reasons: ['past'],
                depth: 1,
            },
        };
        const entry: YomitanTermEntry = {
            expression: '食べる',
            reading: 'たべる',
            glossary: ['to eat'],
            dictionary: 'Test Dictionary',
        };
        const remoteLookup = vi.fn(async (requests: readonly YomitanExactTermCandidateRequest[]) => [{
            request: requests[0],
            requestIndex: 0,
            entry,
        }]);
        const directLookup = vi.fn(async () => []);
        const harness = backgroundHarness(store({ lookupExactTermCandidates: remoteLookup }));
        const proxy = extensionDictionaryStoreProxy(
            store({ lookupExactTermCandidates: directLookup }),
            harness.root as unknown as typeof globalThis,
        );

        const [match] = await proxy.lookupExactTermCandidates([request]);

        expect(remoteLookup).toHaveBeenCalledTimes(1);
        expect(directLookup).not.toHaveBeenCalled();
        expect(match).toMatchObject({ requestIndex: 0, entry });
        expect(match?.request).toBe(request);
        expect(harness.adoptTarget).toHaveBeenCalledWith(expect.objectContaining({
            id: 'japanese-v1',
            language: 'ja',
        }));
    });

    it('streams a File import over a Port and sends keepalive traffic until the import settles', async () => {
        vi.useFakeTimers();
        const pending = deferred<ImportSummary>();
        const observedProgress: string[] = [];
        let importedFile: File | undefined;
        const remoteImport = vi.fn(async (file: File, onProgress?: (message: string) => void) => {
            importedFile = file;
            onProgress?.('halfway');
            return pending.promise;
        });
        const directImport = vi.fn(async () => importSummary('direct'));
        const harness = backgroundHarness(store({ importFile: remoteImport }));
        const proxy = extensionDictionaryStoreProxy(
            store({ importFile: directImport }),
            harness.root as unknown as typeof globalThis,
        );
        const sourceFile = portableFile(new Uint8Array([80, 75, 3, 4, 121, 111, 109, 117]), 'test-dictionary.zip');

        const importing = proxy.importFile(sourceFile, message => observedProgress.push(message));
        await settleUntil(() => remoteImport.mock.calls.length === 1);

        expect(importedFile).toMatchObject({
            name: 'test-dictionary.zip',
            size: sourceFile.size,
            type: 'application/zip',
        });
        expect(harness.runtime.connectedPortNames).toEqual([EXTENSION_DICTIONARY_RPC_PORT]);

        await vi.advanceTimersByTimeAsync((EXTENSION_DICTIONARY_KEEPALIVE_MS * 2) + 1);
        expect(harness.runtime.clientPortMessages.filter(message => messageKind(message) === 'keepalive')).toHaveLength(2);

        pending.resolve(importSummary('remote'));
        await expect(importing).resolves.toEqual(importSummary('remote'));
        expect(observedProgress).toEqual(['halfway']);
        expect(directImport).not.toHaveBeenCalled();
    });

    it('serializes destructive work behind an import without the one-shot request timeout', async () => {
        vi.useFakeTimers();
        const pendingImport = deferred<ImportSummary>();
        const pendingDelete = deferred<void>();
        const remoteImport = vi.fn(async () => pendingImport.promise);
        const remoteDelete = vi.fn(async () => pendingDelete.promise);
        const harness = backgroundHarness(store({
            importFile: remoteImport,
            deleteDatabase: remoteDelete,
        }));
        const proxy = extensionDictionaryStoreProxy(
            store({
                importFile: vi.fn(async () => importSummary('direct')),
                deleteDatabase: vi.fn(async () => undefined),
            }),
            harness.root as unknown as typeof globalThis,
        );

        const importing = proxy.importFile(portableFile(new Uint8Array([1, 2, 3]), 'large.zip'));
        await settleUntil(() => remoteImport.mock.calls.length === 1);
        const deleting = proxy.deleteDatabase({ timeoutMs: 60_000 });
        await settleUntil(() => harness.runtime.connectedPortNames.length === 2);
        expect(remoteDelete).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(30_001);
        expect(remoteDelete).not.toHaveBeenCalled();
        pendingImport.resolve(importSummary('remote'));
        await expect(importing).resolves.toEqual(importSummary('remote'));
        await settleUntil(() => remoteDelete.mock.calls.length === 1);

        pendingDelete.resolve(undefined);
        await expect(deleting).resolves.toBeUndefined();
        expect(harness.runtime.connectedPortNames).toEqual([
            EXTENSION_DICTIONARY_RPC_PORT,
            EXTENSION_DICTIONARY_RPC_PORT,
        ]);
    });

    it('does not execute a queued operation after its Port disconnects', async () => {
        const pendingImport = deferred<ImportSummary>();
        const remoteImport = vi.fn(async () => pendingImport.promise);
        const remoteDelete = vi.fn(async () => undefined);
        const harness = backgroundHarness(store({
            importFile: remoteImport,
            deleteDatabase: remoteDelete,
        }));
        const proxy = extensionDictionaryStoreProxy(
            store({
                importFile: vi.fn(async () => importSummary('direct')),
                deleteDatabase: vi.fn(async () => undefined),
            }),
            harness.root as unknown as typeof globalThis,
        );

        const importing = proxy.importFile(portableFile(new Uint8Array([1]), 'active.zip'));
        await settleUntil(() => remoteImport.mock.calls.length === 1);
        const deleting = proxy.deleteDatabase();
        const deletionFailure = expect(deleting).rejects.toThrow(
            'Dictionary background operation disconnected before completion.',
        );
        await settleUntil(() => harness.runtime.clientPorts.length === 2);
        harness.runtime.clientPorts[1].disconnect();
        await deletionFailure;

        pendingImport.resolve(importSummary('remote'));
        await expect(importing).resolves.toEqual(importSummary('remote'));
        await settleUntil(() => harness.runtime.clientPorts[0].disconnected);
        expect(remoteDelete).not.toHaveBeenCalled();
    });

    it('returns search fallback results while retaining the Port and queue for lazy index preparation', async () => {
        vi.useFakeTimers();
        const pendingPreparation = deferred<void>();
        const pendingDelete = deferred<void>();
        const remoteSearch = vi.fn(async () => []);
        const remotePrepare = vi.fn(() => pendingPreparation.promise);
        const remoteDelete = vi.fn(() => pendingDelete.promise);
        const harness = backgroundHarness(store({
            searchTerms: remoteSearch,
            prepareTermSearchIndex: remotePrepare,
            deleteDatabase: remoteDelete,
        }));
        const proxy = extensionDictionaryStoreProxy(
            store({
                searchTerms: vi.fn(async () => []),
                prepareTermSearchIndex: vi.fn(async () => undefined),
                deleteDatabase: vi.fn(async () => undefined),
            }),
            harness.root as unknown as typeof globalThis,
        );

        await expect(proxy.searchTerms('cat', 5, [])).resolves.toEqual([]);
        expect(remotePrepare).toHaveBeenCalledTimes(1);
        expect(harness.runtime.clientPorts[0].disconnected).toBe(false);
        const deleting = proxy.deleteDatabase();
        await settleUntil(() => harness.runtime.clientPorts.length === 2);
        expect(remoteDelete).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(EXTENSION_DICTIONARY_KEEPALIVE_MS + 1);
        expect(harness.runtime.clientPortMessages.some(message => messageKind(message) === 'keepalive')).toBe(true);
        pendingPreparation.resolve(undefined);
        await settleUntil(() => remoteDelete.mock.calls.length === 1);

        pendingDelete.resolve(undefined);
        await expect(deleting).resolves.toBeUndefined();
        await settleUntil(() => harness.runtime.clientPorts.every(port => port.disconnected));
    });

    it('retains the Port and queue for lazy index preparation when the search rejects', async () => {
        const pendingPreparation = deferred<void>();
        const remoteSearch = vi.fn(async () => {
            throw new Error('Search cursor failed.');
        });
        const remotePrepare = vi.fn(() => pendingPreparation.promise);
        const remoteDelete = vi.fn(async () => undefined);
        const harness = backgroundHarness(store({
            searchTerms: remoteSearch,
            prepareTermSearchIndex: remotePrepare,
            deleteDatabase: remoteDelete,
        }));
        const proxy = extensionDictionaryStoreProxy(
            store({
                searchTerms: vi.fn(async () => []),
                prepareTermSearchIndex: vi.fn(async () => undefined),
                deleteDatabase: vi.fn(async () => undefined),
            }),
            harness.root as unknown as typeof globalThis,
        );

        let searchSettled = false;
        const searchOutcome = proxy.searchTerms('cat', 5, []).then(
            value => value,
            error => error as Error,
        ).finally(() => {
            searchSettled = true;
        });
        await settleUntil(() => remotePrepare.mock.calls.length === 1);
        const deleting = proxy.deleteDatabase();
        await settleUntil(() => harness.runtime.clientPorts.length === 2);
        await Promise.resolve();
        expect(searchSettled).toBe(false);
        expect(remoteDelete).not.toHaveBeenCalled();

        pendingPreparation.resolve(undefined);
        await expect(searchOutcome).resolves.toMatchObject({ message: 'Search cursor failed.' });
        await settleUntil(() => remoteDelete.mock.calls.length === 1);
        await expect(deleting).resolves.toBeUndefined();
    });

    it('recaptures a committed reset epoch while the background worker stays alive', async () => {
        let getCorsProxyUrl: (() => string) | undefined;
        let getInterfaceLanguage: (() => InterfaceLanguage) | undefined;
        const remoteSummary = vi.fn(async () => dictionarySummary(7));
        const directSummary = vi.fn(async () => dictionarySummary(99));
        const harness = backgroundHarness(store({ summary: remoteSummary }), {
            createStore: (corsGetter, languageGetter) => {
                getCorsProxyUrl = corsGetter;
                getInterfaceLanguage = languageGetter;
                return store({ summary: remoteSummary });
            },
        });
        const firstProxy = extensionDictionaryStoreProxy(
            store({ summary: directSummary }),
            harness.root as unknown as typeof globalThis,
        );
        await expect(firstProxy.summary()).resolves.toEqual(dictionarySummary(7));

        const nextEpoch = {
            version: 1,
            generation: MANAGED_EPOCH.generation + 1,
            resetId: 'dictionary-background-next',
            committedAt: MANAGED_EPOCH.committedAt + 1,
        } as const;
        const nextToken = `${nextEpoch.generation}:${nextEpoch.resetId}`;
        const nextSettings = {
            corsProxyUrl: 'https://next-proxy.example.test/',
            localDictionariesEnabled: true,
            interfaceLanguage: 'en',
        };
        const nextSlot = `yomu:state-slot:v1:${encodeURIComponent(nextToken)}:${encodeURIComponent('jpdb-popup-reader-settings')}`;
        harness.setStorageValue('yomu:state-epoch', nextEpoch);
        harness.setStorageValue(nextSlot, {
            __yomuManagedStateEnvelope: 1,
            epoch: nextToken,
            value: nextSettings,
        });
        harness.emitStorageChange('yomu:state-epoch');

        const reloadedProxy = extensionDictionaryStoreProxy(
            store({ summary: directSummary }),
            harness.root as unknown as typeof globalThis,
        );
        await expect(reloadedProxy.summary()).resolves.toEqual(dictionarySummary(7));
        await settleUntil(() => getInterfaceLanguage?.() === 'en');

        expect(getCorsProxyUrl?.()).toBe(nextSettings.corsProxyUrl);
        expect(directSummary).not.toHaveBeenCalled();
        expect(harness.runtime.backgroundResponses.at(-1)).toMatchObject({
            kind: 'capability',
            ok: true,
            marker: EXTENSION_DICTIONARY_BACKGROUND_MARKER,
        });
    });

    it('rejects a queued target-contract failure and continues draining later targets', async () => {
        const firstSummary = deferred<ReturnType<typeof dictionarySummary>>();
        let summaryCalls = 0;
        const remoteSummary = vi.fn(() => {
            summaryCalls += 1;
            return summaryCalls === 1
                ? firstSummary.promise
                : Promise.resolve(dictionarySummary(2));
        });
        const adoptTarget = vi.fn((target: { id: string }) => {
            if (target.id === 'bad-target') throw new Error('Unsupported target contract.');
        });
        const harness = backgroundHarness(store({ summary: remoteSummary }), { adoptTarget });

        const first = invokePortSummary(harness.runtime, 'first-target');
        await settleUntil(() => remoteSummary.mock.calls.length === 1);
        const rejected = invokePortSummary(harness.runtime, 'bad-target');
        const later = invokePortSummary(harness.runtime, 'later-target');
        firstSummary.resolve(dictionarySummary(1));

        await expect(first).resolves.toMatchObject({ kind: 'result' });
        await expect(rejected).resolves.toMatchObject({
            kind: 'error',
            error: expect.objectContaining({ message: 'Unsupported target contract.' }),
        });
        await expect(later).resolves.toMatchObject({ kind: 'result' });
        expect(remoteSummary).toHaveBeenCalledTimes(2);
        expect(adoptTarget).toHaveBeenCalledWith(expect.objectContaining({ id: 'later-target' }));
    });

    it('returns the exact direct store when no extension runtime exists', async () => {
        const directLookup = vi.fn(async () => true);
        const direct = store({ hasDictionaries: directLookup });

        const resolved = extensionDictionaryStoreProxy(direct, {} as typeof globalThis);

        expect(resolved).toBe(direct);
        await expect(resolved.hasDictionaries()).resolves.toBe(true);
        expect(directLookup).toHaveBeenCalledTimes(1);
    });

    it('falls back to the direct store when the background ping times out', async () => {
        vi.useFakeTimers();
        const directLookup = vi.fn(async () => true);
        const directInvalidate = vi.fn();
        const connect = vi.fn(() => {
            throw new Error('A timed-out capability probe must not open an operation Port.');
        });
        const root = {
            chrome: {
                runtime: {
                    id: 'fake-extension',
                    sendMessage: vi.fn(() => undefined),
                    connect,
                },
            },
        };
        const proxy = extensionDictionaryStoreProxy(
            store({ hasDictionaries: directLookup, invalidateCaches: directInvalidate }),
            root as unknown as typeof globalThis,
        );

        expect(proxy.invalidateCaches()).toBeUndefined();
        expect(directInvalidate).toHaveBeenCalledTimes(1);
        const lookup = proxy.hasDictionaries();
        await vi.advanceTimersByTimeAsync(EXTENSION_DICTIONARY_PROBE_TIMEOUT_MS + 1);

        await expect(lookup).resolves.toBe(true);
        expect(directLookup).toHaveBeenCalledTimes(1);
        expect(connect).not.toHaveBeenCalled();
    });
});

interface HarnessOptions {
    readonly createStore?: ExtensionDictionaryBackgroundHostOptions['createStore'];
    readonly adoptTarget?: ExtensionDictionaryBackgroundHostOptions['adoptTarget'];
    readonly rootAdditions?: Record<string, unknown>;
}

function backgroundHarness(backgroundStore: LocalDictionaryStore, options: HarnessOptions = {}) {
    const runtime = new FakeExtensionRuntime();
    const storageReads: string[] = [];
    const storageValues: Record<string, unknown> = {
        [`${STORAGE_PREFIX}yomu:state-epoch`]: MANAGED_EPOCH,
        [`${STORAGE_PREFIX}${SETTINGS_SLOT}`]: {
            __yomuManagedStateEnvelope: 1,
            epoch: MANAGED_EPOCH_TOKEN,
            value: SETTINGS,
        },
    };
    const storageChanged = new ListenerEvent<(changes: Record<string, unknown>, areaName: string) => void>();
    const root = {
        ...options.rootAdditions,
        chrome: {
            runtime,
            storage: {
                local: {
                    get(key: string, callback?: (items: Record<string, unknown>) => void) {
                        storageReads.push(key);
                        const result = Object.prototype.hasOwnProperty.call(storageValues, key)
                            ? { [key]: storageValues[key] }
                            : {};
                        queueMicrotask(() => callback?.(jsonClone(result)));
                    },
                },
                onChanged: storageChanged,
            },
        },
    };
    const adoptTarget = options.adoptTarget ?? vi.fn();
    const installed = installExtensionDictionaryBackgroundHost({
        root: root as unknown as typeof globalThis,
        storagePrefix: STORAGE_PREFIX,
        createStore: options.createStore ?? (() => backgroundStore),
        resolveTarget: target => ({ ...target, normalizeText: (text: string) => text }),
        adoptTarget,
    });
    expect(installed).toBe(true);
    return {
        root,
        runtime,
        storageReads,
        adoptTarget,
        setStorageValue(key: string, value: unknown) {
            storageValues[`${STORAGE_PREFIX}${key}`] = value;
        },
        emitStorageChange(key: string) {
            storageChanged.emit({ [`${STORAGE_PREFIX}${key}`]: {} }, 'local');
        },
    };
}

class ListenerEvent<T extends (...args: never[]) => unknown> {
    private readonly listeners: T[] = [];

    addListener(listener: T): void {
        this.listeners.push(listener);
    }

    emit(...args: Parameters<T>): ReturnType<T>[] {
        return this.listeners.map(listener => listener(...args) as ReturnType<T>);
    }
}

class FakeExtensionRuntime {
    readonly id = 'fake-extension';
    readonly onMessage = new ListenerEvent<(
        message: unknown,
        sender: unknown,
        sendResponse: (response: unknown) => void,
    ) => boolean | undefined>();
    readonly onConnect = new ListenerEvent<(port: FakePort) => void>();
    readonly clientMessages: unknown[] = [];
    readonly backgroundResponses: unknown[] = [];
    readonly clientPortMessages: unknown[] = [];
    readonly connectedPortNames: string[] = [];
    readonly clientPorts: FakePort[] = [];

    sendMessage(message: unknown, callback?: (response: unknown) => void): void {
        const clonedMessage = jsonClone(message);
        this.clientMessages.push(clonedMessage);
        queueMicrotask(() => {
            this.onMessage.emit(clonedMessage, {}, response => {
                const clonedResponse = jsonClone(response);
                this.backgroundResponses.push(clonedResponse);
                queueMicrotask(() => callback?.(clonedResponse));
            });
        });
    }

    connect(connectInfo: { name: string }): FakePort {
        this.connectedPortNames.push(connectInfo.name);
        const [client, background] = pairedPorts(connectInfo.name, message => {
            this.clientPortMessages.push(jsonClone(message));
        });
        this.clientPorts.push(client);
        this.onConnect.emit(background);
        return client;
    }
}

class FakePort {
    readonly onMessage = new ListenerEvent<(message: unknown) => void>();
    readonly onDisconnect = new ListenerEvent<() => void>();
    peer?: FakePort;
    disconnected = false;

    constructor(
        readonly name: string,
        private readonly observePost: (message: unknown) => void = () => undefined,
    ) {}

    postMessage(message: unknown): void {
        if (this.disconnected) throw new Error('Port is disconnected.');
        const cloned = jsonClone(message);
        this.observePost(cloned);
        queueMicrotask(() => {
            if (!this.disconnected && this.peer && !this.peer.disconnected) this.peer.onMessage.emit(cloned);
        });
    }

    disconnect(): void {
        if (this.disconnected) return;
        this.disconnected = true;
        this.onDisconnect.emit();
        if (this.peer && !this.peer.disconnected) {
            this.peer.disconnected = true;
            this.peer.onDisconnect.emit();
        }
    }
}

function pairedPorts(name: string, observeClientPost: (message: unknown) => void): [FakePort, FakePort] {
    const client = new FakePort(name, observeClientPost);
    const background = new FakePort(name);
    client.peer = background;
    background.peer = client;
    return [client, background];
}

function store(methods: Record<string, unknown>): LocalDictionaryStore {
    return methods as unknown as LocalDictionaryStore;
}

function portableFile(bytes: Uint8Array, name: string): File {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const blob = new NodeBlob([buffer], { type: 'application/zip' });
    Object.defineProperties(blob, {
        name: { value: name, configurable: true },
        lastModified: { value: 1_754_000_000_000, configurable: true },
    });
    return blob as unknown as File;
}

function importSummary(dictionary: string): ImportSummary {
    return {
        dictionaries: [dictionary],
        entries: 1,
        terms: 1,
        kanji: 0,
        termMeta: 0,
        kanjiMeta: 0,
    };
}

function dictionarySummary(terms: number) {
    return {
        dictionaries: [],
        terms,
        kanji: 0,
        termMeta: 0,
        kanjiMeta: 0,
    };
}

function invokePortSummary(runtime: FakeExtensionRuntime, targetId: string): Promise<unknown> {
    const port = runtime.connect({ name: EXTENSION_DICTIONARY_RPC_PORT });
    return new Promise(resolve => {
        port.onMessage.addListener(message => {
            if (messageKind(message) !== 'result' && messageKind(message) !== 'error') return;
            resolve(message);
            port.disconnect();
        });
        port.postMessage({
            channel: EXTENSION_DICTIONARY_RPC_CHANNEL,
            version: EXTENSION_DICTIONARY_RPC_VERSION,
            kind: 'invoke',
            method: 'summary',
            args: [],
            target: { id: targetId, language: 'ja', interfaceVersion: 1 },
        });
    });
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}

async function settleUntil(done: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100 && !done(); attempt += 1) await Promise.resolve();
    if (!done()) throw new Error('The background operation did not start.');
}

function messageKind(message: unknown): unknown {
    return message && typeof message === 'object'
        ? (message as Record<string, unknown>).kind
        : undefined;
}

function jsonClone<T>(value: T): T {
    if (value === undefined) return value;
    return JSON.parse(JSON.stringify(value)) as T;
}
