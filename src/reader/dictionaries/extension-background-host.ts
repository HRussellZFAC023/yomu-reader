import type { LocalDictionaryStore } from './local-store';
import type { InterfaceLanguage } from '../app/types';
import {
    DictionaryRpcBinaryReceiver,
    EXTENSION_DICTIONARY_BACKGROUND_MARKER,
    EXTENSION_DICTIONARY_RPC_CHANNEL,
    EXTENSION_DICTIONARY_RPC_PORT,
    EXTENSION_DICTIONARY_RPC_VERSION,
    decodeDictionaryRpcValue,
    dictionaryRpcBinaryIds,
    dictionaryRpcError,
    isDictionaryRpcBinaryChunk,
    prepareDictionaryRpcValue,
    sendDictionaryRpcBinaries,
    type DictionaryRpcError,
    type DictionaryRpcTarget,
    type DictionaryRpcValue,
} from './extension-rpc-protocol';
import {
    configureExtensionDictionaryBackgroundStorage,
    type DirectExtensionDictionaryStorage,
} from './extension-background-adapters';

interface ExtensionEvent<T> {
    addListener(listener: T): void;
}

interface ExtensionPort {
    readonly name: string;
    readonly onMessage: ExtensionEvent<(message: unknown) => void>;
    readonly onDisconnect: ExtensionEvent<() => void>;
    postMessage(message: unknown): void;
    disconnect?(): void;
}

interface ExtensionDictionaryRuntimeRoot {
    chrome?: { runtime?: ExtensionDictionaryRuntime };
    browser?: { runtime?: ExtensionDictionaryRuntime };
}

interface ExtensionDictionaryRuntime {
    readonly onMessage?: ExtensionEvent<(
        message: unknown,
        sender: unknown,
        sendResponse: (response: unknown) => void,
    ) => boolean | undefined>;
    readonly onConnect?: ExtensionEvent<(port: ExtensionPort) => void>;
}

interface DictionaryRpcEnvelope {
    readonly channel?: string;
    readonly version?: number;
    readonly kind?: string;
    readonly method?: string;
    readonly args?: DictionaryRpcValue;
    readonly target?: DictionaryRpcTarget;
}

interface DictionaryRpcResponse {
    readonly channel: typeof EXTENSION_DICTIONARY_RPC_CHANNEL;
    readonly version: typeof EXTENSION_DICTIONARY_RPC_VERSION;
    readonly kind: 'capability' | 'result' | 'error';
    readonly ok: boolean;
    readonly enabled?: boolean;
    readonly marker?: string;
    readonly value?: DictionaryRpcValue;
    readonly error?: DictionaryRpcError;
}

export interface ExtensionDictionaryBackgroundHostOptions {
    readonly root?: typeof globalThis;
    readonly storagePrefix?: string;
    readonly createStore: (
        getCorsProxyUrl: () => string,
        getInterfaceLanguage: () => InterfaceLanguage,
    ) => LocalDictionaryStore;
    readonly resolveTarget: (target: DictionaryRpcTarget) => unknown;
    readonly adoptTarget: (target: DictionaryRpcTarget) => unknown;
}

/** Install synchronously so a waking MV3 worker cannot miss its first event. */
export function installExtensionDictionaryBackgroundHost(
    options: ExtensionDictionaryBackgroundHostOptions,
): boolean {
    const root = options.root ?? globalThis;
    const global = root as typeof globalThis & ExtensionDictionaryRuntimeRoot;
    const runtime = global.browser?.runtime ?? global.chrome?.runtime;
    if (!runtime?.onMessage?.addListener || !runtime.onConnect?.addListener) return false;

    // Marker retained in the executable bundle and checked in every artifact.
    void EXTENSION_DICTIONARY_BACKGROUND_MARKER;
    const storage = configureExtensionDictionaryBackgroundStorage(root, options.storagePrefix);
    storage.subscribeToChanges();
    const store = lazyStore(storage, options.createStore);
    const operations = new OperationInvocationQueue();

    runtime.onMessage.addListener((message, _sender, sendResponse) => {
        const request = dictionaryRpcEnvelope(message);
        if (!request) return undefined;
        if (request.kind === 'ping') {
            void storage.loadSettings().then(
                settings => safeRespond(sendResponse, response('capability', true, {
                    enabled: settings.localDictionariesEnabled,
                    marker: EXTENSION_DICTIONARY_BACKGROUND_MARKER,
                })),
                error => safeRespond(sendResponse, errorResponse(error)),
            );
            return true;
        }
        if (request.kind === 'invoke') {
            safeRespond(sendResponse, errorResponse(new Error(
                'Dictionary store methods require the operation Port.',
            )));
            return true;
        }
        return undefined;
    });

    runtime.onConnect.addListener(port => {
        if (port.name !== EXTENSION_DICTIONARY_RPC_PORT) return;
        installOperationPort(port, store, options.adoptTarget, operations, options.resolveTarget);
    });
    return true;
}

function lazyStore(
    storage: DirectExtensionDictionaryStorage,
    createStore: ExtensionDictionaryBackgroundHostOptions['createStore'],
): () => Promise<LocalDictionaryStore> {
    let storePromise: Promise<LocalDictionaryStore> | undefined;
    return () => {
        storePromise ??= storage.loadSettings().then(() => createStore(
            () => storage.currentSettings.corsProxyUrl,
            () => storage.currentSettings.interfaceLanguage,
        ));
        return storePromise;
    };
}

function installOperationPort(
    port: ExtensionPort,
    store: () => Promise<LocalDictionaryStore>,
    adoptTarget: ExtensionDictionaryBackgroundHostOptions['adoptTarget'],
    operations: OperationInvocationQueue,
    resolveTarget: ExtensionDictionaryBackgroundHostOptions['resolveTarget'],
): void {
    const receiver = new DictionaryRpcBinaryReceiver();
    let request: DictionaryRpcEnvelope | undefined;
    let started = false;
    let disconnected = false;

    port.onDisconnect.addListener(() => {
        disconnected = true;
    });
    port.onMessage.addListener(message => {
        const record = message && typeof message === 'object' ? message as DictionaryRpcEnvelope : null;
        if (record?.kind === 'keepalive') {
            safePost(port, { kind: 'keepalive-ack' });
            return;
        }
        if (isDictionaryRpcBinaryChunk(message)) {
            try {
                receiver.accept(message);
                void startWhenReady();
            } catch (error) {
                safePost(port, { kind: 'error', error: dictionaryRpcError(error) });
            }
            return;
        }
        const envelope = dictionaryRpcEnvelope(message);
        if (!envelope || envelope.kind !== 'invoke' || !validMethodName(envelope.method) || request) return;
        request = envelope;
        void startWhenReady();
    });

    async function startWhenReady(): Promise<void> {
        if (!request || started || disconnected) return;
        const binaryIds = dictionaryRpcBinaryIds(request.args);
        if (binaryIds.some(id => !receiver.has(id))) return;
        started = true;
        try {
            let resultDelivered = false;
            const result = await operations.run(async () => {
                if (disconnected) throw new Error('Dictionary background operation disconnected while queued.');
                const dictionaryStore = await store();
                if (disconnected) throw new Error('Dictionary background operation disconnected while queued.');
                if (request!.target) adoptTarget(request!.target);
                const args = decodeArguments(request!.args, resolveTarget, receiver, port);
                const retainForSearchIndex = request!.method === 'searchTerms' && searchTermsMayPrepareIndex(args);
                try {
                    const value = await invokeStore(dictionaryStore, request!.method!, args);
                    if (retainForSearchIndex) {
                        await postOperationResult(port, value, true);
                        resultDelivered = true;
                    }
                    return value;
                } finally {
                    if (retainForSearchIndex) {
                        // searchTerms intentionally starts this lazily. Await
                        // the same public promise even when its fallback cursor
                        // rejects, so chunked writes retain the Port keepalive
                        // and the queue remains exclusive. On success the caller
                        // still receives the cursor fallback before this wait.
                        await dictionaryStore.prepareTermSearchIndex();
                        if (resultDelivered && !disconnected) safePost(port, { kind: 'complete' });
                    }
                }
            });
            if (!resultDelivered && !disconnected) await postOperationResult(port, result, false);
        } catch (error) {
            if (!disconnected) safePost(port, { kind: 'error', error: dictionaryRpcError(error) });
        }
    }
}

async function postOperationResult(port: ExtensionPort, result: unknown, backgroundPending: boolean): Promise<void> {
    const prepared = prepareDictionaryRpcValue(result);
    safePost(port, {
        kind: 'result',
        value: prepared.value,
        binaryIds: dictionaryRpcBinaryIds(prepared.value),
        ...(backgroundPending ? { backgroundPending: true } : {}),
    });
    await sendDictionaryRpcBinaries(prepared.binaries, message => safePost(port, message));
}

function searchTermsMayPrepareIndex(args: readonly unknown[]): boolean {
    const options = args[3];
    return !options
        || typeof options !== 'object'
        || (options as { prepareIndex?: unknown }).prepareIndex !== false;
}

function decodeArguments(
    encoded: DictionaryRpcValue,
    resolveTarget: ExtensionDictionaryBackgroundHostOptions['resolveTarget'],
    binaries?: DictionaryRpcBinaryReceiver,
    callbackPort?: ExtensionPort,
): unknown[] {
    const callbacks = new Map<number, (...args: unknown[]) => unknown>();
    const decoded = decodeDictionaryRpcValue(encoded, {
        ...(binaries ? { binary: marker => binaries.value(marker) } : {}),
        callback: id => {
            const existing = callbacks.get(id);
            if (existing) return existing;
            const callback = (...args: unknown[]) => {
                if (!callbackPort) return;
                const prepared = prepareDictionaryRpcValue(args);
                if (!prepared.binaries.length) safePost(callbackPort, { kind: 'callback', id, args: prepared.value });
            };
            callbacks.set(id, callback);
            return callback;
        },
        target: resolveTarget,
    });
    if (!Array.isArray(decoded)) throw new TypeError('Dictionary RPC arguments must be an array.');
    return decoded;
}

async function invokeStore(store: LocalDictionaryStore, methodName: string, args: unknown[]): Promise<unknown> {
    const method = (store as unknown as Record<string, unknown>)[methodName];
    if (typeof method !== 'function') throw new TypeError(`Unknown dictionary store method: ${methodName}`);
    return await Reflect.apply(method as (...values: unknown[]) => unknown, store, args);
}

function dictionaryRpcEnvelope(value: unknown): DictionaryRpcEnvelope | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as DictionaryRpcEnvelope;
    return record.channel === EXTENSION_DICTIONARY_RPC_CHANNEL
        && record.version === EXTENSION_DICTIONARY_RPC_VERSION
        ? record
        : null;
}

function validMethodName(value: unknown): value is string {
    return typeof value === 'string'
        && /^[A-Za-z][A-Za-z0-9]*$/.test(value)
        && value !== 'constructor'
        && value !== 'prototype';
}

function response(
    kind: DictionaryRpcResponse['kind'],
    ok: boolean,
    detail: Partial<DictionaryRpcResponse> = {},
): DictionaryRpcResponse {
    return {
        channel: EXTENSION_DICTIONARY_RPC_CHANNEL,
        version: EXTENSION_DICTIONARY_RPC_VERSION,
        kind,
        ok,
        ...detail,
    };
}

function errorResponse(error: unknown): DictionaryRpcResponse {
    return response('error', false, { error: dictionaryRpcError(error) });
}

function safeRespond(sendResponse: (response: unknown) => void, value: unknown): void {
    try { sendResponse(value); } catch { /* response port closed */ }
}

function safePost(port: ExtensionPort, value: unknown): void {
    try { port.postMessage(value); } catch { /* operation port closed */ }
}

/** One ambient learning target and one IndexedDB writer domain per worker. */
class OperationInvocationQueue {
    private tail: Promise<void> = Promise.resolve();

    run<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.tail.then(operation);
        this.tail = result.then(() => undefined, () => undefined);
        return result;
    }
}
