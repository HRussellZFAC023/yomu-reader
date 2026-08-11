import { activeLearningTarget } from '../languages/target-runtime';
import type { LocalDictionaryStore } from './local-store';
import {
    DictionaryRpcBinaryReceiver,
    EXTENSION_DICTIONARY_BACKGROUND_MARKER,
    EXTENSION_DICTIONARY_KEEPALIVE_MS,
    EXTENSION_DICTIONARY_PROBE_TIMEOUT_MS,
    EXTENSION_DICTIONARY_RPC_CHANNEL,
    EXTENSION_DICTIONARY_RPC_PORT,
    EXTENSION_DICTIONARY_RPC_VERSION,
    decodeDictionaryRpcValue,
    isDictionaryRpcBinaryChunk,
    prepareDictionaryRpcValue,
    rebindDictionaryRpcInputReferences,
    reviveDictionaryRpcError,
    sendDictionaryRpcBinaries,
    type DictionaryRpcError,
    type DictionaryRpcTarget,
    type DictionaryRpcValue,
} from './extension-rpc-protocol';

interface ExtensionEvent<T> {
    addListener(listener: T): void;
}

interface ExtensionPort {
    readonly onMessage: ExtensionEvent<(message: unknown) => void>;
    readonly onDisconnect: ExtensionEvent<() => void>;
    postMessage(message: unknown): void;
    disconnect(): void;
}

interface ExtensionRuntimeApi {
    readonly id?: string;
    readonly lastError?: { message?: string };
    sendMessage(message: unknown, callback?: (response: unknown) => void): unknown;
    connect(connectInfo: { name: string }): ExtensionPort;
}

interface ExtensionApi {
    readonly runtime?: ExtensionRuntimeApi;
}

interface ExtensionRuntime {
    readonly promiseBased: boolean;
    readonly runtime: ExtensionRuntimeApi;
}

interface DictionaryRpcResponse {
    readonly channel?: string;
    readonly version?: number;
    readonly kind?: string;
    readonly ok?: boolean;
    readonly enabled?: boolean;
    readonly marker?: string;
    readonly value?: DictionaryRpcValue;
    readonly error?: DictionaryRpcError;
}

/**
 * One Proxy over the derived store facade. Adding a public Yomitan method adds
 * a callable remote method automatically; there is no second method inventory.
 */
export function extensionDictionaryStoreProxy(
    directStore: LocalDictionaryStore,
    root: typeof globalThis = globalThis,
): LocalDictionaryStore {
    const extension = extensionRuntime(root);
    if (!extension) return directStore;

    // Constructing ReaderApp/NewTabRuntime also constructs this proxy, before a
    // fresh learner has chosen a target. Keep transport discovery lazy so that
    // construction/dismissal sends no extension message; the first dictionary
    // operation owns the one memoized capability probe and its normal fallback.
    let capability: Promise<boolean> | undefined;
    const dictionaryBackgroundAvailable = () => (
        capability ??= probeDictionaryBackground(extension)
    );
    const wrappers = new Map<PropertyKey, (...args: unknown[]) => unknown>();
    return new Proxy(directStore, {
        get(target, property, receiver) {
            const direct = Reflect.get(target as object, property, receiver) as unknown;
            if (typeof direct !== 'function') return direct;
            const existing = wrappers.get(property);
            if (existing) return existing;
            // The store has one synchronous public operation. Preserve its
            // void/timing contract locally, then mirror the cache invalidation
            // to the shared host when the capability probe succeeds. This is a
            // transport policy exception, not a second store-method inventory.
            if (property === 'invalidateCaches') {
                const invalidate = (...args: unknown[]) => {
                    const result = Reflect.apply(direct as (...values: unknown[]) => unknown, target, args);
                    void dictionaryBackgroundAvailable().then(available => {
                        if (available) return invokeRemote(extension, String(property), args);
                        return undefined;
                    }).catch(() => undefined);
                    return result;
                };
                wrappers.set(property, invalidate);
                return invalidate;
            }
            const invoke = (...args: unknown[]) => dictionaryBackgroundAvailable().then(available => (
                available
                    ? invokeRemote(extension, String(property), args)
                    : Reflect.apply(direct as (...values: unknown[]) => unknown, target, args)
            ));
            wrappers.set(property, invoke);
            return invoke;
        },
        has: (target, property) => Reflect.has(target as object, property),
    }) as LocalDictionaryStore;
}

function probeDictionaryBackground(extension: ExtensionRuntime): Promise<boolean> {
    return sendExtensionMessage(extension, envelope('ping'), EXTENSION_DICTIONARY_PROBE_TIMEOUT_MS)
        .then(value => {
            const response = dictionaryRpcResponse(value);
            return Boolean(
                response?.ok
                && response.kind === 'capability'
                && response.marker === EXTENSION_DICTIONARY_BACKGROUND_MARKER,
            );
        }, () => false);
}

function invokeRemote(extension: ExtensionRuntime, method: string, args: unknown[]): Promise<unknown> {
    return invokeRemoteViaPort(extension, method, args);
}

function invokeRemoteViaPort(
    extension: ExtensionRuntime,
    method: string,
    args: unknown[],
): Promise<unknown> {
    return new Promise((resolve, reject) => {
        let port: ExtensionPort;
        try {
            port = extension.runtime.connect({ name: EXTENSION_DICTIONARY_RPC_PORT });
        } catch (error) {
            reject(error);
            return;
        }

        let closed = false;
        let resultDelivered = false;
        let backgroundPending = false;
        let completionReceived = false;
        let resultValue: DictionaryRpcValue | undefined;
        let resultBinaryIds: string[] | undefined;
        const receiver = new DictionaryRpcBinaryReceiver();
        const callbacks = new Map<number, (...values: unknown[]) => unknown>();
        let callbackSequence = 0;
        const prepared = prepareDictionaryRpcValue(args, {
            callbackId: callback => {
                const id = ++callbackSequence;
                callbacks.set(id, callback);
                return id;
            },
        });
        const keepalive = globalThis.setInterval(() => {
            safePortPost(port, { kind: 'keepalive' });
        }, EXTENSION_DICTIONARY_KEEPALIVE_MS);

        const close = (callback: () => void) => {
            if (closed) return;
            closed = true;
            globalThis.clearInterval(keepalive);
            callback();
            try { port.disconnect(); } catch { /* already disconnected */ }
        };
        const fail = (error: unknown) => close(() => {
            if (!resultDelivered) reject(error);
        });
        const finishResultIfReady = () => {
            if (resultDelivered) return;
            if (resultBinaryIds === undefined || resultValue === undefined) return;
            if (resultBinaryIds.some(id => !receiver.has(id))) return;
            try {
                const decoded = decodeDictionaryRpcValue(resultValue, {
                    binary: marker => receiver.value(marker),
                });
                resultDelivered = true;
                const rebound = rebindDictionaryRpcInputReferences(args, decoded);
                if (backgroundPending) {
                    resolve(rebound);
                    if (completionReceived) close(() => undefined);
                } else {
                    close(() => resolve(rebound));
                }
            } catch (error) {
                fail(error);
            }
        };

        port.onDisconnect.addListener(() => {
            if (!closed) fail(new Error('Dictionary background operation disconnected before completion.'));
        });
        port.onMessage.addListener(message => {
            if (closed) return;
            if (isDictionaryRpcBinaryChunk(message)) {
                try {
                    receiver.accept(message);
                    finishResultIfReady();
                } catch (error) {
                    fail(error);
                }
                return;
            }
            const record = message && typeof message === 'object' ? message as Record<string, unknown> : {};
            if (record.kind === 'callback' && Number.isInteger(record.id)) {
                const callback = callbacks.get(record.id as number);
                if (!callback) return;
                try {
                    const values = decodeDictionaryRpcValue(record.args);
                    Reflect.apply(callback, undefined, Array.isArray(values) ? values : []);
                } catch {
                    // Progress handlers are observational and must not abort an import.
                }
                return;
            }
            if (record.kind === 'error') {
                fail(reviveDictionaryRpcError(record.error as DictionaryRpcError));
                return;
            }
            if (record.kind === 'complete') {
                completionReceived = true;
                if (resultDelivered) close(() => undefined);
                return;
            }
            if (record.kind === 'result') {
                resultValue = record.value;
                backgroundPending = record.backgroundPending === true;
                resultBinaryIds = Array.isArray(record.binaryIds)
                    ? record.binaryIds.filter((id): id is string => typeof id === 'string')
                    : [];
                finishResultIfReady();
            }
        });

        safePortPost(port, envelope('invoke', {
            method,
            args: prepared.value,
            target: currentTarget(),
        }));
        void sendDictionaryRpcBinaries(prepared.binaries, message => safePortPost(port, message)).catch(fail);
    });
}

function sendExtensionMessage(
    extension: ExtensionRuntime,
    message: unknown,
    timeoutMs: number,
): Promise<unknown> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback: () => void) => {
            if (settled) return;
            settled = true;
            globalThis.clearTimeout(timer);
            callback();
        };
        const timer = globalThis.setTimeout(
            () => finish(() => reject(new Error('Dictionary background request timed out.'))),
            timeoutMs,
        );
        const done = (value: unknown) => finish(() => {
            const lastError = extension.runtime.lastError;
            if (lastError) reject(new Error(lastError.message || 'Dictionary background request failed.'));
            else resolve(value);
        });
        try {
            const maybePromise = extension.promiseBased
                ? extension.runtime.sendMessage(message)
                : extension.runtime.sendMessage(message, done);
            if (isPromiseLike(maybePromise)) void maybePromise.then(done, error => finish(() => reject(error)));
        } catch (error) {
            finish(() => reject(error));
        }
    });
}

function currentTarget(): DictionaryRpcTarget {
    const target = activeLearningTarget();
    return {
        id: target.id,
        language: target.language,
        interfaceVersion: target.interfaceVersion,
    };
}

function envelope(kind: string, detail: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        channel: EXTENSION_DICTIONARY_RPC_CHANNEL,
        version: EXTENSION_DICTIONARY_RPC_VERSION,
        kind,
        ...detail,
    };
}

function dictionaryRpcResponse(value: unknown): DictionaryRpcResponse | null {
    if (!value || typeof value !== 'object') return null;
    const response = value as DictionaryRpcResponse;
    return response.channel === EXTENSION_DICTIONARY_RPC_CHANNEL
        && response.version === EXTENSION_DICTIONARY_RPC_VERSION
        ? response
        : null;
}

function extensionRuntime(root: typeof globalThis): ExtensionRuntime | null {
    const global = root as typeof globalThis & { browser?: ExtensionApi; chrome?: ExtensionApi };
    try {
        if (global.browser?.runtime?.id
            && typeof global.browser.runtime.sendMessage === 'function'
            && typeof global.browser.runtime.connect === 'function') {
            return { promiseBased: true, runtime: global.browser.runtime };
        }
        if (global.chrome?.runtime?.id
            && typeof global.chrome.runtime.sendMessage === 'function'
            && typeof global.chrome.runtime.connect === 'function') {
            return { promiseBased: false, runtime: global.chrome.runtime };
        }
    } catch {
        return null;
    }
    return null;
}

function safePortPost(port: ExtensionPort, message: unknown): void {
    try { port.postMessage(message); } catch { /* operation port closed */ }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return Boolean(value && typeof (value as { then?: unknown }).then === 'function');
}
