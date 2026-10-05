import { activeLearningTarget } from '../languages/target-runtime';
import { userFacingError } from '../app/user-facing-errors';
import { managedStateEpochSessionForRealm, type ManagedStateEpoch } from '../app/managed-state-epoch';
import type { LocalDictionaryStore } from './local-store';
import {
    DictionaryRpcBinaryReceiver,
    EXTENSION_DICTIONARY_BACKGROUND_MARKER,
    EXTENSION_DICTIONARY_KEEPALIVE_MS,
    EXTENSION_DICTIONARY_PROBE_TIMEOUT_MS,
    EXTENSION_DICTIONARY_RPC_CHANNEL,
    EXTENSION_DICTIONARY_RPC_PORT,
    EXTENSION_DICTIONARY_RPC_VERSION,
    EXTENSION_DICTIONARY_READ_BATCH,
    DICTIONARY_STORE_METHODS,
    decodeDictionaryRpcValue,
    dictionaryRpcEpoch,
    dictionaryRpcEpochValue,
    isDictionaryRpcBinaryChunk,
    prepareDictionaryRpcValue,
    rebindDictionaryRpcInputReferences,
    reviveDictionaryRpcError,
    sendDictionaryRpcBinaries,
    type DictionaryRpcError,
    type DictionaryRpcReadOutcome,
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
    readonly epoch?: unknown;
    readonly channel?: string;
    readonly version?: number;
    readonly kind?: string;
    readonly ok?: boolean;
    readonly enabled?: boolean;
    readonly marker?: string;
    readonly value?: DictionaryRpcValue;
    readonly error?: DictionaryRpcError;
}

const CAPABILITY_RETRY_MS = 1_000;

interface PendingRead {
    readonly method: string;
    readonly args: unknown[];
    resolve(value: unknown): void;
    reject(error: unknown): void;
}

interface ReadBatch {
    readonly epoch: ManagedStateEpoch;
    readonly target: DictionaryRpcTarget;
    readonly reads: PendingRead[];
}

/**
 * Builds the store a page uses inside the extension: one function per entry of
 * the typed method table, each answered by the Shared Dictionary Host. Without
 * an extension runtime the direct store is returned unchanged.
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
    // operation owns discovery. A failed probe never changes the storage owner.
    let capability: { promise: Promise<ManagedStateEpoch>; retryAt: number } | undefined;
    const requireDictionaryBackground = (): Promise<ManagedStateEpoch> => {
        if (!capability || capability.retryAt <= performance.now()) {
            const attempt = {
                retryAt: Infinity,
                promise: probeDictionaryBackground(extension).then(epoch => (
                    managedStateEpochSessionForRealm(root).assertCurrent(async () => dictionaryRpcEpochValue(epoch))
                )).catch(error => {
                    attempt.retryAt = performance.now() + CAPABILITY_RETRY_MS;
                    throw error;
                }),
            };
            capability = attempt;
        }
        return capability.promise;
    };
    // Reads issued in one macrotask travel as one Read Batch: one Port message
    // answered in one host queue slot, instead of a Port per word of a parse.
    // The caller epoch is fixed once the probe succeeds, so only a change of
    // learning target splits a macrotask's reads.
    let pending: ReadBatch | undefined;
    const flush = () => {
        const batch = pending;
        if (!batch) return;
        pending = undefined;
        void invokeRemoteViaPort(
            extension,
            EXTENSION_DICTIONARY_READ_BATCH,
            batch.reads.map(read => [read.method, read.args]),
            batch.epoch,
            batch.target,
        ).then(outcomes => batch.reads.forEach((read, index) => {
            const outcome = (outcomes as DictionaryRpcReadOutcome[])[index]!;
            if ('error' in outcome) read.reject(reviveDictionaryRpcError(outcome.error));
            else read.resolve(rebindDictionaryRpcInputReferences(read.args, outcome.value));
        })).catch(error => batch.reads.forEach(read => read.reject(error)));
    };
    const read = (method: string, args: unknown[]) => requireDictionaryBackground().then(epoch => new Promise((resolve, reject) => {
        const target = currentTarget();
        if (pending?.target.id !== target.id) {
            flush();
            pending = { epoch, target, reads: [] };
            globalThis.setTimeout(flush, 0);
        }
        pending.reads.push({ method, args, resolve, reject });
    }));
    // A call posts its own Port at once. Sending the reads issued before it
    // first keeps the host's order the order the page asked in.
    const call = (method: string, args: unknown[]) => requireDictionaryBackground().then(epoch => {
        flush();
        return invokeRemoteViaPort(extension, method, args, epoch, currentTarget());
    });

    // coalescesReads tells ReaderParser not to gate reads one round trip apart.
    const store: Record<string, unknown> = { coalescesReads: true };
    for (const [method, kind] of Object.entries(DICTIONARY_STORE_METHODS)) {
        store[method] = kind === 'read'
            ? (...args: unknown[]) => read(method, args)
            : kind === 'call'
                ? (...args: unknown[]) => call(method, args)
                // Synchronous at the interface and best-effort over the Port.
                : (...args: unknown[]) => void call(method, args).catch(() => undefined);
    }
    return store as unknown as LocalDictionaryStore;
}

function probeDictionaryBackground(extension: ExtensionRuntime): Promise<ManagedStateEpoch> {
    return sendExtensionMessage(extension, envelope('ping'), EXTENSION_DICTIONARY_PROBE_TIMEOUT_MS)
        .then(value => {
            const response = dictionaryRpcResponse(value);
            if (response?.error) throw reviveDictionaryRpcError(response.error);
            if (!(response?.ok
                && response.kind === 'capability'
                && response.marker === EXTENSION_DICTIONARY_BACKGROUND_MARKER)) {
                throw userFacingError('extensionDictionaryUnavailable');
            }
            try { return dictionaryRpcEpoch(response.epoch); }
            catch (cause) { throw userFacingError('extensionDictionaryUnavailable', { cause }); }
        }, cause => { throw userFacingError('extensionDictionaryUnavailable', { cause }); });
}

function invokeRemoteViaPort(
    extension: ExtensionRuntime,
    method: string,
    args: unknown[],
    epoch: ManagedStateEpoch,
    target: DictionaryRpcTarget,
): Promise<unknown> {
    return new Promise((resolve, reject) => {
        let port: ExtensionPort;
        try {
            port = extension.runtime.connect({ name: EXTENSION_DICTIONARY_RPC_PORT });
        } catch (error) {
            reject(userFacingError('extensionDictionaryUnavailable', { cause: error }));
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
            post({ kind: 'keepalive' });
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
        const post = (message: unknown): boolean => {
            if (closed) return false;
            try {
                port.postMessage(message);
                return !closed;
            } catch (cause) {
                fail(userFacingError('extensionDictionaryConnectionLost', { cause }));
                return false;
            }
        };
        const finishResultIfReady = () => {
            if (resultDelivered) return;
            if (resultBinaryIds === undefined || resultValue === undefined) return;
            if (resultBinaryIds.some(id => !receiver.has(id))) return;
            try {
                const decoded = decodeDictionaryRpcValue(resultValue, {
                    binary: marker => receiver.value(marker),
                });
                resultDelivered = true;
                if (backgroundPending) {
                    resolve(decoded);
                    if (completionReceived) close(() => undefined);
                } else {
                    close(() => resolve(decoded));
                }
            } catch (error) {
                fail(error);
            }
        };

        port.onDisconnect.addListener(() => {
            if (!closed) fail(userFacingError('extensionDictionaryConnectionLost', {
                cause: new Error('Dictionary background operation disconnected before completion.'),
            }));
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

        if (!post(envelope('invoke', {
            method,
            args: prepared.value,
            target,
            epoch: dictionaryRpcEpochValue(epoch),
        }))) return;
        void sendDictionaryRpcBinaries(prepared.binaries, message => {
            if (!post(message)) throw new Error('Dictionary operation transport closed.');
        }).catch(fail);
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

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return Boolean(value && typeof (value as { then?: unknown }).then === 'function');
}
