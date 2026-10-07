import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { setImmediate as nextEventLoopTurn } from 'node:timers/promises';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InterfaceLanguage } from '../../src/reader/app/types';
import { userFacingErrorText } from '../../src/reader/app/user-facing-errors';
import { isStaleManagedStateEpochError, managedStateEpochSessionForRealm, StaleManagedStateEpochError } from '../../src/reader/app/managed-state-epoch';
import { createReaderDictionaryStore, dictionaryReadConcurrency, type LocalDictionaryStore } from '../../src/reader/dictionaries/local-store';
import {
    installExtensionDictionaryBackgroundHost,
    type ExtensionDictionaryBackgroundHostOptions,
} from '../../src/reader/dictionaries/extension-background-host';
import {
    EXTENSION_DICTIONARY_BACKGROUND_MARKER,
    EXTENSION_DICTIONARY_KEEPALIVE_MS,
    EXTENSION_DICTIONARY_PROBE_TIMEOUT_MS,
    EXTENSION_DICTIONARY_READ_BATCH,
    EXTENSION_DICTIONARY_RPC_CHANNEL,
    EXTENSION_DICTIONARY_RPC_PORT,
    EXTENSION_DICTIONARY_RPC_VERSION,
    dictionaryRpcError,
} from '../../src/reader/dictionaries/extension-rpc-protocol';
import { extensionDictionaryStoreProxy } from '../../src/reader/dictionaries/extension-store-client';
import { compiledDictionaryBackgroundSource } from './helpers/compiled-dictionary-background';
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
    it('installs the review owner in compiled output and serializes packaged Study claims', async () => {
        const harness = compiledBackgroundHarness();
        const sender = { id: harness.runtime.id, url: harness.runtime.getURL('newtab/index.html'), frameId: 0 };
        const send = (request: Record<string, unknown>) => new Promise<{ ok: boolean; value?: unknown }>(resolve => {
            harness.runtime.onMessage.emit({ channel: 'yomu.review-queue.v2', epoch: MANAGED_EPOCH, ...request }, sender, response => resolve(response as never));
        });
        const review = { id: 'compiled-review', at: 1, target: 'anki', grade: 'okay', attempts: 0,
            providerContext: 'account-a', card: { vid: 1, sid: 0, spelling: '読む', reading: 'よむ' } };
        expect(await send({ kind: 'record', reviews: [review] })).toMatchObject({ ok: true });
        const request = { kind: 'claim', id: review.id, providerContext: review.providerContext };
        const claims = await Promise.all([send(request), send(request)]);
        expect(claims.every(result => result.ok)).toBe(true);
        expect(claims.filter(result => result.value !== null)).toHaveLength(1);
        expect(harness.storageReads).toContain(`${STORAGE_PREFIX}yomu:state-slot:v1:${encodeURIComponent(MANAGED_EPOCH_TOKEN)}:${encodeURIComponent('yomu:private:review-delivery:v2')}`);
        expect(await send({ kind: 'acknowledge', id: review.id, providerContext: review.providerContext })).toMatchObject({ ok: true });
        await send({ kind: 'record', reviews: [review] });
        expect(await send(request)).toMatchObject({ ok: true, value: null });
        const next = { ...MANAGED_EPOCH, generation: 4, resetId: 'review-reset' };
        harness.setStorageValue('yomu:state-epoch', next);
        expect(await send({ kind: 'list' })).toMatchObject({ ok: false });
        expect(await send({ kind: 'list', epoch: next })).toMatchObject({ ok: true, value: [] });
    });

    it('imports and looks up through the compiled worker and rejects reset-time writes', async () => {
        let now = 100_000;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        const harness = compiledBackgroundHarness();
        harness.setStorageValue('yomu:dictionary-replica-purge:v1', Number.MAX_SAFE_INTEGER);
        vi.spyOn(harness.runtime, 'sendMessage').mockImplementationOnce(() => undefined);
        const direct = vi.fn(async () => { throw new Error('Direct store must not replace the compiled host'); });
        const proxy = extensionDictionaryStoreProxy(
            store({ importFile: direct, lookup: direct, summary: direct }),
            harness.root as unknown as typeof globalThis,
        );
        const dictionaryFile = (expression: string) => portableFile(new TextEncoder().encode(JSON.stringify({
            formatName: 'yomu-yomitan-dictionaries', formatVersion: 2,
            terms: [{ expression, reading: expression === '猫' ? 'ねこ' : 'いぬ', glossary: ['fixture'], dictionary: 'Canonical fixture' }],
        })), 'canonical-fixture.json');
        await expect(proxy.importFile(dictionaryFile('猫'))).rejects.toMatchObject({ yomuUiCopyKey: 'extensionDictionaryUnavailable' });
        expect(direct).not.toHaveBeenCalled();
        now += 1_001;
        await expect(proxy.importFile(dictionaryFile('猫'))).resolves.toMatchObject({ terms: 1 });
        await expect(proxy.lookup('猫', 'ねこ', 10)).resolves.toContainEqual(expect.objectContaining({ expression: '猫', dictionary: 'Canonical fixture' }));
        harness.setStorageValue('yomu:factory-reset-signal', { phase: 'prepare' });
        await expect(proxy.importFile(dictionaryFile('犬'))).rejects.toThrow(/factory reset/);
        harness.setStorageValue('yomu:factory-reset-signal', { phase: 'complete' });
        await expect(proxy.summary()).resolves.toMatchObject({ terms: 1 });
        await expect(proxy.lookup('犬', 'いぬ', 10)).resolves.toEqual([]);
        expect(direct).not.toHaveBeenCalled();
        expect(harness.network).not.toHaveBeenCalled();
        expect(harness.persist).not.toHaveBeenCalled();
        expect(harness.storageReads).not.toContain(`${STORAGE_PREFIX}yomu:dictionary-replica-purge:v1`);
    }, 30_000);

    it('rejects an upload admitted before reset when its bytes arrive after reset', async () => {
        const harness = compiledBackgroundHarness();
        const root = harness.root as unknown as typeof globalThis;
        await managedStateEpochSessionForRealm(root).capture(async () => MANAGED_EPOCH);
        const direct = vi.fn(async () => { throw new Error('No page-store fallback'); });
        const directStore = store({ importFile: direct, summary: direct, deleteDatabase: direct });
        const old = extensionDictionaryStoreProxy(directStore, root);
        await old.summary();
        const bytes = new TextEncoder().encode(JSON.stringify({ formatName: 'yomu-yomitan-dictionaries', formatVersion: 2,
            terms: [{ expression: '猫', reading: 'ねこ', glossary: ['fixture'], dictionary: 'Late upload' }] }));
        const file = portableFile(bytes, 'late-upload.json');
        const pending = deferred<ArrayBuffer>();
        const slice = file.slice.bind(file);
        vi.spyOn(file, 'slice').mockImplementation((...args) => {
            const chunk = slice(...args);
            vi.spyOn(chunk, 'arrayBuffer').mockReturnValue(pending.promise);
            return chunk;
        });
        const outcome = old.importFile(file).catch(error => error);
        await vi.waitFor(() => expect(file.slice).toHaveBeenCalledTimes(1));
        // The fixture replies through microtasks; let admission finish while the bytes remain withheld.
        await nextEventLoopTurn();
        const resetting = extensionDictionaryStoreProxy(directStore, { chrome: harness.root.chrome } as unknown as typeof globalThis);
        harness.setStorageValue('yomu:factory-reset-signal', { phase: 'prepare', id: 'upload-reset' });
        await resetting.deleteDatabase();
        const epoch = { ...MANAGED_EPOCH, generation: 4, resetId: 'upload-reset' };
        harness.setStorageValue('yomu:state-epoch', epoch);
        harness.emitStorageChange('yomu:state-epoch');
        await resetting.deleteDatabase({ completedResetId: epoch.resetId });
        harness.setStorageValue('yomu:factory-reset-signal', { phase: 'complete' });
        pending.resolve(bytes.buffer as ArrayBuffer);
        expect(isStaleManagedStateEpochError(await outcome)).toBe(true);
        const fresh = extensionDictionaryStoreProxy(directStore, { chrome: harness.root.chrome } as unknown as typeof globalThis);
        await expect(fresh.summary()).resolves.toMatchObject({ terms: 0 });
        expect(direct).not.toHaveBeenCalled();
    }, 30_000);

    it('represents the initial epoch explicitly instead of omitting the caller fence', async () => {
        const remote = vi.fn(async () => dictionarySummary(0));
        const harness = backgroundHarness(store({ summary: remote }));
        harness.setStorageValue('yomu:state-epoch', undefined);
        const proxy = extensionDictionaryStoreProxy(store({ summary: vi.fn() }), harness.root as unknown as typeof globalThis);
        await expect(proxy.summary()).resolves.toEqual(dictionarySummary(0));
        expect(harness.runtime.backgroundResponses[0]).toMatchObject({ epoch: null });
        expect(harness.runtime.clientPortMessages.find(message => messageKind(message) === 'invoke')).toMatchObject({ epoch: null });
    });

    it.each([undefined, {}, { version: 1, generation: 0, resetId: 'legacy', committedAt: 0 }])('rejects malformed caller epochs before reaching the store (%j)', async epoch => {
        const remote = vi.fn(async () => dictionarySummary(7));
        const harness = backgroundHarness(store({ summary: remote }));
        const response = await invokePortRequest(harness.runtime, {
            channel: EXTENSION_DICTIONARY_RPC_CHANNEL, version: EXTENSION_DICTIONARY_RPC_VERSION,
            kind: 'invoke', method: 'summary', args: [], epoch,
        });
        expect(response).toMatchObject({ kind: 'error', error: { message: expect.stringMatching(/epoch/) } });
        expect(remote).not.toHaveBeenCalled();
        expect(harness.adoptTarget).not.toHaveBeenCalled();
    });

    it('rejects an old content realm after a completed reset even when it misses notifications', async () => {
        const harness = compiledBackgroundHarness();
        const oldRoot = harness.root as unknown as typeof globalThis;
        await managedStateEpochSessionForRealm(oldRoot).capture(async () => MANAGED_EPOCH);
        const direct = vi.fn(async () => { throw new Error('No page-store fallback'); });
        const directStore = store({ importFile: direct, summary: direct, lookup: direct, deleteDatabase: direct });
        const old = extensionDictionaryStoreProxy(directStore, oldRoot);
        const dictionaryFile = (expression: string) => portableFile(new TextEncoder().encode(JSON.stringify({
            formatName: 'yomu-yomitan-dictionaries', formatVersion: 2,
            terms: [{ expression, reading: expression === '猫' ? 'ねこ' : 'いぬ', glossary: ['fixture'], dictionary: 'Reset fixture' }],
        })), 'reset-fixture.json');
        await expect(old.importFile(dictionaryFile('猫'))).resolves.toMatchObject({ terms: 1 });

        const resetRoot = { chrome: harness.root.chrome } as unknown as typeof globalThis;
        const resetting = extensionDictionaryStoreProxy(directStore, resetRoot);
        harness.setStorageValue('yomu:factory-reset-signal', { phase: 'prepare', id: 'completed-reset' });
        await resetting.deleteDatabase({ timeoutMs: 2_000 });
        expect(await harness.database.databases()).toEqual([]);
        const nextEpoch = { ...MANAGED_EPOCH, generation: 4, resetId: 'completed-reset', committedAt: MANAGED_EPOCH.committedAt + 1 };
        harness.setStorageValue('yomu:state-epoch', nextEpoch);
        harness.emitStorageChange('yomu:state-epoch');
        await expect(old.deleteDatabase({ completedResetId: 'wrong-reset' })).rejects.toMatchObject({ code: 'YOMU_STALE_MANAGED_STATE_EPOCH' });
        for (const method of ['summary', 'clear', 'invalidateCaches']) {
            const denied = await invokePortRequest(harness.runtime, {
                channel: EXTENSION_DICTIONARY_RPC_CHANNEL, version: EXTENSION_DICTIONARY_RPC_VERSION,
                kind: 'invoke', method, args: [{ completedResetId: nextEpoch.resetId }], epoch: MANAGED_EPOCH,
            });
            expect(denied).toMatchObject({ kind: 'error', error: { code: 'YOMU_STALE_MANAGED_STATE_EPOCH' } });
        }
        const older = await invokePortRequest(harness.runtime, {
            channel: EXTENSION_DICTIONARY_RPC_CHANNEL, version: EXTENSION_DICTIONARY_RPC_VERSION,
            kind: 'invoke', method: 'deleteDatabase', args: [{ completedResetId: nextEpoch.resetId }],
            epoch: { ...MANAGED_EPOCH, generation: 2, resetId: 'older-reset' },
        });
        expect(older).toMatchObject({ kind: 'error', error: { code: 'YOMU_STALE_MANAGED_STATE_EPOCH' } });
        await resetting.deleteDatabase({ timeoutMs: 2_000, completedResetId: nextEpoch.resetId });
        harness.setStorageValue('yomu:factory-reset-signal', { phase: 'complete' });

        await expect(old.importFile(dictionaryFile('犬'))).rejects.toMatchObject({ code: 'YOMU_STALE_MANAGED_STATE_EPOCH' });
        const replacementInOldRealm = extensionDictionaryStoreProxy(directStore, oldRoot);
        await expect(replacementInOldRealm.summary()).rejects.toMatchObject({ code: 'YOMU_STALE_MANAGED_STATE_EPOCH' });
        expect(managedStateEpochSessionForRealm(oldRoot).current()?.generation).toBe(3);
        const freshRoot = { chrome: harness.root.chrome } as unknown as typeof globalThis;
        const fresh = extensionDictionaryStoreProxy(directStore, freshRoot);
        await expect(fresh.summary()).resolves.toMatchObject({ terms: 0 });
        await expect(fresh.importFile(dictionaryFile('犬'))).resolves.toMatchObject({ terms: 1 });
        await expect(old.deleteDatabase()).rejects.toMatchObject({ code: 'YOMU_STALE_MANAGED_STATE_EPOCH' });
        await expect(resetting.deleteDatabase({ completedResetId: nextEpoch.resetId })).rejects.toMatchObject({ code: 'YOMU_STALE_MANAGED_STATE_EPOCH' });
        harness.setStorageValue('yomu:factory-reset-signal', undefined);
        await expect(resetting.deleteDatabase({ completedResetId: nextEpoch.resetId })).rejects.toMatchObject({ code: 'YOMU_STALE_MANAGED_STATE_EPOCH' });
        await expect(fresh.lookup('犬', 'いぬ', 10)).resolves.toContainEqual(expect.objectContaining({ expression: '犬' }));
        expect(direct).not.toHaveBeenCalled();
        await fresh.deleteDatabase();
    }, 30_000);

    it('preserves fresh dictionaries when a cleanup receipt belongs to a different live reset', async () => {
        const harness = compiledBackgroundHarness();
        const direct = vi.fn(async () => { throw new Error('No page-store fallback'); });
        const directStore = store({ importFile: direct, lookup: direct, summary: direct, deleteDatabase: direct });
        const resetting = extensionDictionaryStoreProxy(directStore, harness.root as unknown as typeof globalThis);
        await resetting.summary();
        const nextEpoch = { ...MANAGED_EPOCH, generation: 4, resetId: 'finished-reset' };
        harness.setStorageValue('yomu:factory-reset-signal', { phase: 'prepare', id: nextEpoch.resetId });
        await resetting.deleteDatabase();
        harness.setStorageValue('yomu:state-epoch', nextEpoch);
        harness.emitStorageChange('yomu:state-epoch');
        await resetting.deleteDatabase({ completedResetId: nextEpoch.resetId });
        harness.setStorageValue('yomu:factory-reset-signal', { phase: 'complete', id: nextEpoch.resetId });
        const fresh = extensionDictionaryStoreProxy(directStore, { chrome: harness.root.chrome } as unknown as typeof globalThis);
        const file = portableFile(new TextEncoder().encode(JSON.stringify({
            formatName: 'yomu-yomitan-dictionaries', formatVersion: 2,
            terms: [{ expression: '犬', reading: 'いぬ', glossary: ['dog'], dictionary: 'Fresh dictionary' }],
        })), 'fresh-dictionary.json');
        await fresh.importFile(file);

        harness.setStorageValue('yomu:factory-reset-signal', { phase: 'prepare', id: 'different-live-reset' });
        const outcome = await resetting.deleteDatabase({ completedResetId: nextEpoch.resetId }).catch(error => error);
        harness.setStorageValue('yomu:factory-reset-signal', { phase: 'complete', id: 'different-live-reset' });

        await expect(fresh.lookup('犬', 'いぬ', 10)).resolves.toContainEqual(expect.objectContaining({ dictionary: 'Fresh dictionary' }));
        expect(isStaleManagedStateEpochError(outcome)).toBe(true);
        expect(direct).not.toHaveBeenCalled();
    }, 30_000);

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

    it('round-trips a read through a Read Batch and restores request identity', async () => {
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

    it('reads the reset epoch at most twice for a warm batch of per-word lookups', async () => {
        const remoteLookup = vi.fn(async () => []);
        const harness = backgroundHarness(store({ lookupTermMeta: remoteLookup }));
        const proxy = extensionDictionaryStoreProxy(
            store({ lookupTermMeta: vi.fn(async () => []) }),
            harness.root as unknown as typeof globalThis,
        );
        await proxy.lookupTermMeta('読む', 5);
        const warm = harness.storageReads.length;

        await Promise.all(['書く', '話す', '聞く'].map(word => proxy.lookupTermMeta(word, 5)));

        expect(remoteLookup).toHaveBeenCalledTimes(4);
        const epochReads = harness.storageReads.slice(warm).filter(key => key === `${STORAGE_PREFIX}yomu:state-epoch`);
        expect(epochReads.length).toBeLessThanOrEqual(2);
    });

    it('sends the reads of one macrotask as one Port message answered in one queue slot', async () => {
        const meta = (expression: string) => [{ expression, mode: 'freq', data: 1, dictionary: 'Fixture' }];
        const remoteMeta = vi.fn(async (expression: string) => meta(expression));
        const remoteKanji = vi.fn(async (character: string) => [{ character, onyomi: [], kunyomi: [] }]);
        const remoteAvailability = vi.fn(async () => true);
        const harness = backgroundHarness(store({
            lookupTermMeta: remoteMeta,
            lookupKanji: remoteKanji,
            hasTermDictionaries: remoteAvailability,
        }));
        const proxy = extensionDictionaryStoreProxy(store({}), harness.root as unknown as typeof globalThis);

        await expect(Promise.all([
            proxy.lookupTermMeta('読む', 12),
            proxy.lookupKanji('読', 3),
            proxy.lookupTermMeta('書く', 12),
            proxy.hasTermDictionaries(),
        ])).resolves.toEqual([
            meta('読む'),
            [{ character: '読', onyomi: [], kunyomi: [] }],
            meta('書く'),
            true,
        ]);

        expect(harness.runtime.connectedPortNames).toEqual([EXTENSION_DICTIONARY_RPC_PORT]);
        expect(invokeMessages(harness.runtime)).toEqual([expect.objectContaining({
            method: EXTENSION_DICTIONARY_READ_BATCH,
            args: [
                ['lookupTermMeta', ['読む', 12]],
                ['lookupKanji', ['読', 3]],
                ['lookupTermMeta', ['書く', 12]],
                ['hasTermDictionaries', []],
            ],
            epoch: MANAGED_EPOCH,
            target: expect.objectContaining({ id: 'japanese-v1' }),
        })]);
        expect(harness.adoptTarget).toHaveBeenCalledTimes(1);
    });

    it('rejects only the failed read of a batch', async () => {
        const remoteMeta = vi.fn(async (expression: string) => {
            if (expression === '壊れ') throw Object.assign(new Error('Meta row unreadable'), { code: 'META_UNREADABLE' });
            return [];
        });
        const harness = backgroundHarness(store({ lookupTermMeta: remoteMeta }));
        const proxy = extensionDictionaryStoreProxy(store({}), harness.root as unknown as typeof globalThis);

        const [failed, answered] = await Promise.allSettled([
            proxy.lookupTermMeta('壊れ', 12),
            proxy.lookupTermMeta('読む', 12),
        ]);

        expect(failed).toMatchObject({ status: 'rejected', reason: { message: 'Meta row unreadable', code: 'META_UNREADABLE' } });
        expect(answered).toEqual({ status: 'fulfilled', value: [] });
        expect(harness.runtime.connectedPortNames).toHaveLength(1);
    });

    it('keeps a durable mutation on its own Port, in order with the reads around it', async () => {
        const hostOrder: string[] = [];
        const remoteDelete = vi.fn(async () => { hostOrder.push('deleteDictionary'); });
        const harness = backgroundHarness(store({
            lookupTermMeta: vi.fn(async () => { hostOrder.push('lookupTermMeta'); return []; }),
            deleteDictionary: remoteDelete,
            summary: vi.fn(async () => { hostOrder.push('summary'); return dictionarySummary(2); }),
        }));
        const proxy = extensionDictionaryStoreProxy(store({}), harness.root as unknown as typeof globalThis);

        await expect(Promise.all([
            proxy.lookupTermMeta('読む', 12),
            proxy.deleteDictionary('Old dictionary'),
            proxy.summary(),
        ])).resolves.toEqual([[], undefined, dictionarySummary(2)]);

        expect(remoteDelete).toHaveBeenCalledWith('Old dictionary');
        expect(hostOrder).toEqual(['lookupTermMeta', 'deleteDictionary', 'summary']);
        expect(harness.runtime.connectedPortNames).toHaveLength(3);
        expect(invokeMessages(harness.runtime)).toEqual([
            expect.objectContaining({ method: EXTENSION_DICTIONARY_READ_BATCH, args: [['lookupTermMeta', ['読む', 12]]] }),
            expect.objectContaining({ method: 'deleteDictionary', args: ['Old dictionary'], epoch: MANAGED_EPOCH }),
            expect.objectContaining({ method: EXTENSION_DICTIONARY_READ_BATCH, args: [['summary', []]] }),
        ]);
    });

    it('fails every read of a batch when the epoch changes while it runs', async () => {
        const nextEpoch = { ...MANAGED_EPOCH, generation: MANAGED_EPOCH.generation + 1, resetId: 'reset-during-batch' };
        let harness: ReturnType<typeof backgroundHarness> | undefined;
        const remoteMeta = vi.fn(async (expression: string) => {
            if (expression === '書く') harness!.setStorageValue('yomu:state-epoch', nextEpoch);
            return [];
        });
        harness = backgroundHarness(store({ lookupTermMeta: remoteMeta, hasTermDictionaries: vi.fn(async () => true) }));
        const proxy = extensionDictionaryStoreProxy(store({}), harness.root as unknown as typeof globalThis);

        const outcomes = await Promise.allSettled([
            proxy.lookupTermMeta('読む', 12),
            proxy.lookupTermMeta('書く', 12),
            proxy.hasTermDictionaries(),
        ]);

        expect(remoteMeta).toHaveBeenCalledTimes(2);
        expect(invokeMessages(harness.runtime)).toHaveLength(1);
        expect(outcomes).toEqual(Array.from({ length: 3 }, () => ({
            status: 'rejected',
            reason: expect.objectContaining({ code: 'YOMU_STALE_MANAGED_STATE_EPOCH' }),
        })));
    });

    it('rejects a batch admitted before a reset without reading the store once it leaves the queue', async () => {
        const pendingDelete = deferred<void>();
        const remoteDelete = vi.fn(async () => pendingDelete.promise);
        const remoteMeta = vi.fn(async () => []);
        const harness = backgroundHarness(store({ deleteDictionary: remoteDelete, lookupTermMeta: remoteMeta }));
        const proxy = extensionDictionaryStoreProxy(store({}), harness.root as unknown as typeof globalThis);

        const deleting = proxy.deleteDictionary('Old dictionary').catch(error => error);
        await settleUntil(() => remoteDelete.mock.calls.length === 1);
        const reads = Promise.allSettled([proxy.lookupTermMeta('読む', 12), proxy.lookupTermMeta('書く', 12)]);
        await settleUntil(() => invokeMessages(harness.runtime).length === 2);
        // The fixture admits through microtasks; let admission finish while the delete holds the queue.
        await nextEventLoopTurn();
        harness.setStorageValue('yomu:state-epoch', { ...MANAGED_EPOCH, generation: MANAGED_EPOCH.generation + 1, resetId: 'queued-reset' });
        harness.emitStorageChange('yomu:state-epoch');
        pendingDelete.resolve(undefined);

        expect(isStaleManagedStateEpochError(await deleting)).toBe(true);
        expect(await reads).toEqual(Array.from({ length: 2 }, () => ({
            status: 'rejected',
            reason: expect.objectContaining({ code: 'YOMU_STALE_MANAGED_STATE_EPOCH' }),
        })));
        expect(remoteMeta).not.toHaveBeenCalled();
    });

    it('answers a mutation inside a read batch with an error and never runs it', async () => {
        const remoteDelete = vi.fn(async () => undefined);
        const harness = backgroundHarness(store({
            deleteDatabase: remoteDelete,
            summary: vi.fn(async () => dictionarySummary(1)),
        }));

        const response = await invokePortRequest(harness.runtime, {
            channel: EXTENSION_DICTIONARY_RPC_CHANNEL, version: EXTENSION_DICTIONARY_RPC_VERSION,
            kind: 'invoke', method: EXTENSION_DICTIONARY_READ_BATCH, epoch: MANAGED_EPOCH,
            args: [['deleteDatabase', []], ['summary', []]],
        });

        expect(response).toMatchObject({
            kind: 'result',
            value: [
                { error: { message: expect.stringMatching(/cannot join a read batch/) } },
                { value: dictionarySummary(1) },
            ],
        });
        expect(remoteDelete).not.toHaveBeenCalled();
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
        const deletionFailure = expect(deleting).rejects.toMatchObject({
            yomuUiCopyKey: 'extensionDictionaryConnectionLost',
            cause: { message: 'Dictionary background operation disconnected before completion.' },
        });
        await settleUntil(() => harness.runtime.clientPorts.length === 2);
        harness.runtime.clientPorts[1].disconnect();
        await deletionFailure;

        pendingImport.resolve(importSummary('remote'));
        await expect(importing).resolves.toEqual(importSummary('remote'));
        await settleUntil(() => harness.runtime.clientPorts[0].disconnected);
        expect(remoteDelete).not.toHaveBeenCalled();
    });

    it('starts no further read of a Read Batch once its Port disconnects', async () => {
        const release = deferred<void>();
        const remoteMeta = vi.fn(async (expression: string) => {
            if (expression !== '後') await release.promise;
            return [];
        });
        const harness = backgroundHarness(store({ lookupTermMeta: remoteMeta }));
        const proxy = extensionDictionaryStoreProxy(store({}), harness.root as unknown as typeof globalThis);
        const words = Array.from({ length: 40 }, (_, index) => `語${index}`);

        const reads = Promise.allSettled(words.map(word => proxy.lookupTermMeta(word, 12)));
        await settleUntil(() => remoteMeta.mock.calls.length > 0);
        const running = remoteMeta.mock.calls.length;
        expect(running).toBeLessThan(words.length);
        harness.runtime.clientPorts[0].disconnect();
        release.resolve(undefined);
        expect((await reads).every(outcome => outcome.status === 'rejected')).toBe(true);

        // The next read waits for the orphaned batch's queue slot.
        await expect(proxy.lookupTermMeta('後', 12)).resolves.toEqual([]);
        expect(remoteMeta.mock.calls.map(([expression]) => expression))
            .toEqual([...words.slice(0, running), '後']);
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
        await settleUntil(() => remotePrepare.mock.calls.length === 1);
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
            { chrome: harness.root.chrome } as unknown as typeof globalThis,
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

    it('gives a Reader the Shared Dictionary Host, and unlimited reads, only in the extension build', () => {
        vi.stubGlobal('chrome', { runtime: { id: 'fixture-extension', sendMessage: vi.fn(), connect: vi.fn() } });
        try {
            vi.stubGlobal('__YOMU_EXTENSION_BUILD__', false);
            expect(dictionaryReadConcurrency(createReaderDictionaryStore(() => '', () => 'en'), 8)).toBe(8);
            vi.stubGlobal('__YOMU_EXTENSION_BUILD__', true);
            expect(dictionaryReadConcurrency(createReaderDictionaryStore(() => '', () => 'en'), 8)).toBe(Infinity);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('rejects a timed-out extension probe without touching the page store', async () => {
        vi.useFakeTimers();
        const directLookup = vi.fn(async () => true);
        const directInvalidate = vi.fn();
        const directImport = vi.fn(async () => importSummary('wrong-page-store'));
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
            store({ hasDictionaries: directLookup, invalidateCaches: directInvalidate, importFile: directImport }),
            root as unknown as typeof globalThis,
        );

        expect(proxy.invalidateCaches()).toBeUndefined();
        const lookup = expect(proxy.hasDictionaries()).rejects.toMatchObject({ yomuUiCopyKey: 'extensionDictionaryUnavailable' });
        const importing = expect(proxy.importFile(portableFile(new Uint8Array([1]), 'unsubmitted.zip')))
            .rejects.toMatchObject({ yomuUiCopyKey: 'extensionDictionaryUnavailable' });
        await vi.advanceTimersByTimeAsync(EXTENSION_DICTIONARY_PROBE_TIMEOUT_MS + 1);

        await lookup;
        await importing;
        expect(directLookup).not.toHaveBeenCalled();
        expect(directImport).not.toHaveBeenCalled();
        expect(directInvalidate).not.toHaveBeenCalled();
        expect(connect).not.toHaveBeenCalled();
    });

    it('shares the failed probe during cooldown and retries the same owner afterward', async () => {
        vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
        const remoteSummary = vi.fn(async () => dictionarySummary(7));
        const harness = backgroundHarness(store({ summary: remoteSummary }));
        const send = vi.spyOn(harness.runtime, 'sendMessage').mockImplementationOnce(() => undefined);
        const direct = vi.fn(async () => dictionarySummary(99));
        const proxy = extensionDictionaryStoreProxy(store({ summary: direct }), harness.root as unknown as typeof globalThis);
        const first = expect(proxy.summary()).rejects.toMatchObject({ yomuUiCopyKey: 'extensionDictionaryUnavailable' });
        const concurrent = expect(proxy.summary()).rejects.toMatchObject({ yomuUiCopyKey: 'extensionDictionaryUnavailable' });
        await vi.advanceTimersByTimeAsync(EXTENSION_DICTIONARY_PROBE_TIMEOUT_MS);
        await Promise.all([first, concurrent]);
        expect(send).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(999);
        await expect(proxy.summary()).rejects.toMatchObject({ yomuUiCopyKey: 'extensionDictionaryUnavailable' });
        expect(send).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        await expect(settleReads(proxy.summary())).resolves.toEqual(dictionarySummary(7));
        expect(send).toHaveBeenCalledTimes(2);
        expect(remoteSummary).toHaveBeenCalledTimes(1);
        expect(direct).not.toHaveBeenCalled();
    });

    it.each([
        undefined,
        { channel: EXTENSION_DICTIONARY_RPC_CHANNEL, version: EXTENSION_DICTIONARY_RPC_VERSION + 1, kind: 'capability', ok: true, marker: EXTENSION_DICTIONARY_BACKGROUND_MARKER },
        { channel: EXTENSION_DICTIONARY_RPC_CHANNEL, version: EXTENSION_DICTIONARY_RPC_VERSION, kind: 'capability', ok: true, marker: 'another-service' },
        { channel: EXTENSION_DICTIONARY_RPC_CHANNEL, version: EXTENSION_DICTIONARY_RPC_VERSION, kind: 'capability', ok: true, marker: EXTENSION_DICTIONARY_BACKGROUND_MARKER },
    ])('rejects an absent or incompatible owner response without choosing a local store (%j)', async response => {
        const harness = backgroundHarness(store({ summary: vi.fn(async () => dictionarySummary(7)) }));
        vi.spyOn(harness.runtime, 'sendMessage').mockImplementation((_message, callback) => callback?.(response));
        const direct = vi.fn(async () => dictionarySummary(99));
        const proxy = extensionDictionaryStoreProxy(store({ summary: direct }), harness.root as unknown as typeof globalThis);
        const error = await proxy.summary().catch(failure => failure);
        expect(error).toMatchObject({ yomuUiCopyKey: 'extensionDictionaryUnavailable' });
        expect(userFacingErrorText('en', 'dictionaryStatusUnavailable', error)).toContain('Retry');
        expect(userFacingErrorText('ja', 'dictionaryStatusUnavailable', error)).toContain('再試行');
        expect(direct).not.toHaveBeenCalled();
        expect(harness.runtime.connectedPortNames).toEqual([]);
    });

    it('preserves a recognized owner epoch error instead of converting it to absence', async () => {
        const harness = backgroundHarness(store({}));
        const stale = Object.assign(new StaleManagedStateEpochError(MANAGED_EPOCH, { ...MANAGED_EPOCH, generation: 4, resetId: 'new-reset' }), {
            epochMayHaveCommitted: true, cause: Object.assign(new Error('Underlying failure'), { code: 'UNDERLYING_FAILURE' }),
        });
        vi.spyOn(harness.runtime, 'sendMessage').mockImplementation((_message, callback) => callback?.({
            channel: EXTENSION_DICTIONARY_RPC_CHANNEL, version: EXTENSION_DICTIONARY_RPC_VERSION,
            kind: 'error', ok: false, error: dictionaryRpcError(stale),
        }));
        const direct = vi.fn(async () => dictionarySummary(99));
        const proxy = extensionDictionaryStoreProxy(store({ summary: direct }), harness.root as unknown as typeof globalThis);
        const error = await proxy.summary().catch(failure => failure);
        expect(error).toMatchObject({ name: stale.name, message: stale.message, code: stale.code,
            epochMayHaveCommitted: true, cause: { code: 'UNDERLYING_FAILURE', message: 'Underlying failure' } });
        expect(isStaleManagedStateEpochError(error)).toBe(true);
        expect(direct).not.toHaveBeenCalled();
    });

    it('handles promise-based browser transport failure without local fallback', async () => {
        const failure = new Error('Background could not start');
        const direct = vi.fn(async () => dictionarySummary(99));
        const connect = vi.fn();
        const root = { browser: { runtime: { id: 'fixture-extension', sendMessage: vi.fn(async () => { throw failure; }), connect } } };
        const proxy = extensionDictionaryStoreProxy(store({ summary: direct }), root as unknown as typeof globalThis);
        await expect(proxy.summary()).rejects.toMatchObject({ yomuUiCopyKey: 'extensionDictionaryUnavailable', cause: failure });
        expect(direct).not.toHaveBeenCalled();
        expect(connect).not.toHaveBeenCalled();
    });

    it('does not replay a failed remote mutation or retry it in a page store', async () => {
        vi.useFakeTimers();
        const stale = new StaleManagedStateEpochError(MANAGED_EPOCH, { ...MANAGED_EPOCH, generation: 4, resetId: 'next' });
        const failure = Object.assign(new Error('Import reply failed after mutation'), { code: 'ACK_FAILED', epochMayHaveCommitted: true, cause: stale });
        const remote = vi.fn(async () => { throw failure; });
        const harness = backgroundHarness(store({ importFile: remote }));
        const direct = vi.fn(async () => importSummary('wrong-page-store'));
        const proxy = extensionDictionaryStoreProxy(store({ importFile: direct }), harness.root as unknown as typeof globalThis);
        const error = await proxy.importFile(portableFile(new Uint8Array([1]), 'example.zip')).catch(value => value);
        expect(error).toMatchObject({ message: failure.message, code: 'ACK_FAILED', epochMayHaveCommitted: true, cause: { code: stale.code } });
        expect(isStaleManagedStateEpochError(error.cause)).toBe(true);
        await vi.advanceTimersByTimeAsync(5_000);
        expect(remote).toHaveBeenCalledTimes(1);
        expect(direct).not.toHaveBeenCalled();
        expect(harness.runtime.clientMessages).toHaveLength(1);
    });

    it('recovers promise-based Firefox discovery without passing a callback', async () => {
        vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
        const remote = vi.fn(async () => dictionarySummary(7));
        const harness = backgroundHarness(store({ summary: remote }));
        const sendMessage = vi.fn((message: unknown) => new Promise<unknown>(resolve => harness.runtime.sendMessage(message, resolve)))
            .mockRejectedValueOnce(new Error('Worker unavailable'));
        const root = { browser: { runtime: { id: harness.runtime.id, sendMessage, connect: harness.runtime.connect.bind(harness.runtime) } } };
        const direct = vi.fn(async () => dictionarySummary(99));
        const proxy = extensionDictionaryStoreProxy(store({ summary: direct }), root as unknown as typeof globalThis);
        await expect(proxy.summary()).rejects.toMatchObject({ yomuUiCopyKey: 'extensionDictionaryUnavailable' });
        await vi.advanceTimersByTimeAsync(1_000);
        await expect(settleReads(proxy.summary())).resolves.toEqual(dictionarySummary(7));
        expect(sendMessage.mock.calls.every(args => args.length === 1)).toBe(true);
        expect(sendMessage).toHaveBeenCalledTimes(2);
        expect(remote).toHaveBeenCalledTimes(1);
        expect(direct).not.toHaveBeenCalled();
    });

    it('retries discovery on elapsed time even when wall time moves backward', async () => {
        vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
        const harness = backgroundHarness(store({ summary: vi.fn(async () => dictionarySummary(7)) }));
        vi.spyOn(harness.runtime, 'sendMessage').mockImplementationOnce(() => undefined);
        const direct = vi.fn(async () => dictionarySummary(99));
        const proxy = extensionDictionaryStoreProxy(store({ summary: direct }), harness.root as unknown as typeof globalThis);
        const rejected = expect(proxy.summary()).rejects.toMatchObject({ yomuUiCopyKey: 'extensionDictionaryUnavailable' });
        await vi.advanceTimersByTimeAsync(EXTENSION_DICTIONARY_PROBE_TIMEOUT_MS);
        await rejected;
        vi.setSystemTime(Date.now() - 3_600_000);
        await vi.advanceTimersByTimeAsync(1_000);
        await expect(settleReads(proxy.summary())).resolves.toEqual(dictionarySummary(7));
        expect(direct).not.toHaveBeenCalled();
    });

    it('localizes a post-probe connection failure without attempting a local mutation', async () => {
        const harness = backgroundHarness(store({}));
        const failure = new Error('Extension context invalidated.');
        const connect = vi.spyOn(harness.runtime, 'connect').mockImplementation(() => { throw failure; });
        const direct = vi.fn(async () => importSummary('wrong-page-store'));
        const proxy = extensionDictionaryStoreProxy(store({ importFile: direct }), harness.root as unknown as typeof globalThis);
        const error = await proxy.importFile(portableFile(new Uint8Array([1]), 'example.zip')).catch(value => value);
        expect(error).toMatchObject({ yomuUiCopyKey: 'extensionDictionaryUnavailable', cause: failure });
        expect(userFacingErrorText('ja', 'dictionaryStatusUnavailable', error)).toContain('再試行');
        expect(connect).toHaveBeenCalledTimes(1);
        expect(direct).not.toHaveBeenCalled();
    });

    it('reports an interrupted operation without replaying a possibly completed mutation', async () => {
        vi.useFakeTimers();
        const pending = deferred<ImportSummary>();
        const remote = vi.fn(() => pending.promise);
        const harness = backgroundHarness(store({ importFile: remote }));
        const direct = vi.fn(async () => importSummary('wrong-page-store'));
        const proxy = extensionDictionaryStoreProxy(store({ importFile: direct }), harness.root as unknown as typeof globalThis);
        const outcome = proxy.importFile(portableFile(new Uint8Array([1]), 'example.zip')).catch(error => error);
        await settleUntil(() => remote.mock.calls.length === 1);
        harness.runtime.clientPorts[0]!.disconnect();
        const error = await outcome;
        expect(error).toMatchObject({ yomuUiCopyKey: 'extensionDictionaryConnectionLost' });
        expect(userFacingErrorText('ja', 'dictionaryStatusUnavailable', error)).toContain('完了');
        pending.resolve(importSummary('remote'));
        await vi.advanceTimersByTimeAsync(5_000);
        expect(remote).toHaveBeenCalledTimes(1);
        expect(direct).not.toHaveBeenCalled();
    });

    it('settles a failed Port write without relying on a disconnect event', async () => {
        vi.useFakeTimers();
        const remote = vi.fn(async () => importSummary('remote'));
        const harness = backgroundHarness(store({ importFile: remote }));
        const connect = harness.runtime.connect.bind(harness.runtime);
        const failure = new Error('Port could not send the request');
        vi.spyOn(harness.runtime, 'connect').mockImplementation(options => {
            const port = connect(options);
            vi.spyOn(port, 'postMessage').mockImplementation(() => { throw failure; });
            return port;
        });
        const direct = vi.fn(async () => importSummary('wrong-page-store'));
        const proxy = extensionDictionaryStoreProxy(store({ importFile: direct }), harness.root as unknown as typeof globalThis);
        const file = portableFile(new Uint8Array([1]), 'example.zip');
        const chunks = vi.spyOn(file, 'slice');
        let outcome: unknown;
        const result = proxy.importFile(file).then(value => { outcome = value; }, error => { outcome = error; });
        try {
            await vi.advanceTimersByTimeAsync(1);
            expect(outcome).toMatchObject({ yomuUiCopyKey: 'extensionDictionaryConnectionLost', cause: failure });
            await result;
            expect(chunks).not.toHaveBeenCalled();
            expect(remote).not.toHaveBeenCalled();
            expect(direct).not.toHaveBeenCalled();
        } finally {
            harness.runtime.clientPorts.forEach(port => port.disconnect());
        }
    });
});

interface HarnessOptions {
    readonly install?: (root: typeof globalThis) => void;
    readonly createStore?: ExtensionDictionaryBackgroundHostOptions['createStore'];
    readonly adoptTarget?: ExtensionDictionaryBackgroundHostOptions['adoptTarget'];
    readonly rootAdditions?: Record<string, unknown>;
}

function compiledBackgroundHarness() {
    const persist = vi.fn(async () => true);
    const network = vi.fn(async () => { throw new Error('Unexpected network request'); });
    const database = new IDBFactory();
    const source = compiledDictionaryBackgroundSource().replace(
        JSON.stringify('__YOMU_EXTENSION_STORAGE_PREFIX_PLACEHOLDER__'), JSON.stringify(STORAGE_PREFIX),
    );
    const harness = backgroundHarness(undefined, {
        install: root => runInNewContext(source, {
            chrome: (root as unknown as { chrome: unknown }).chrome,
            location: new URL((root as unknown as { chrome: { runtime: FakeExtensionRuntime } }).chrome.runtime.getURL('background.js')),
            indexedDB: database, IDBKeyRange, Blob: NodeBlob, File: NodeFile,
            TextEncoder, TextDecoder, URL, URLSearchParams, structuredClone, atob, btoa,
            setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
            performance, crypto: webcrypto, console,
            navigator: { storage: { persist } }, fetch: network,
        }),
    });
    return { ...harness, persist, network, database };
}

function backgroundHarness(backgroundStore: LocalDictionaryStore | undefined, options: HarnessOptions = {}) {
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
                        return Promise.resolve(jsonClone(result));
                    },
                    async set(values: Record<string, unknown>) {
                        Object.assign(storageValues, jsonClone(values));
                    },
                },
                onChanged: storageChanged,
            },
        },
    };
    const adoptTarget = options.adoptTarget ?? vi.fn();
    if (options.install) options.install(root as unknown as typeof globalThis);
    else {
        if (!backgroundStore) throw new Error('The host fixture requires a store or compiled installer.');
        const installed = installExtensionDictionaryBackgroundHost({
            root: root as unknown as typeof globalThis,
            storagePrefix: STORAGE_PREFIX,
            createStore: options.createStore ?? (() => backgroundStore),
            resolveTarget: target => ({ ...target, normalizeText: (text: string) => text }),
            adoptTarget,
        });
        expect(installed).toBe(true);
    }
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
    getURL(path: string): string { return `chrome-extension://${this.id}/${path}`; }
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
    return invokePortRequest(runtime, {
        channel: EXTENSION_DICTIONARY_RPC_CHANNEL,
        version: EXTENSION_DICTIONARY_RPC_VERSION,
        kind: 'invoke', method: 'summary', args: [], epoch: MANAGED_EPOCH,
        target: { id: targetId, language: 'ja', interfaceVersion: 1 },
    });
}

function invokePortRequest(runtime: FakeExtensionRuntime, request: Record<string, unknown>): Promise<unknown> {
    const port = runtime.connect({ name: EXTENSION_DICTIONARY_RPC_PORT });
    return new Promise(resolve => {
        port.onMessage.addListener(message => {
            if (messageKind(message) !== 'result' && messageKind(message) !== 'error') return;
            resolve(message);
            port.disconnect();
        });
        port.postMessage(request);
    });
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}

/** A Read Batch leaves in the next macrotask; under fake timers, run it. */
async function settleReads<T>(promise: Promise<T>): Promise<T> {
    let settled = false;
    promise.then(() => { settled = true; }, () => { settled = true; });
    for (let turn = 0; !settled && turn < 50; turn++) await vi.advanceTimersByTimeAsync(0);
    return promise;
}

function invokeMessages(runtime: FakeExtensionRuntime): Array<Record<string, unknown>> {
    return runtime.clientPortMessages.filter(message => messageKind(message) === 'invoke') as Array<Record<string, unknown>>;
}

async function settleUntil(done: () => boolean): Promise<void> {
    await vi.waitFor(() => expect(done(), 'The background operation did not start.').toBe(true), { timeout: 1_000, interval: 1 });
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
