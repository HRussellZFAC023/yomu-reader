import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizedBridgeEventDetail } from '../../src/reader/userscript/bridge-detail';

const HOSTED_LOCATION = {
    href: 'https://yomureader.com/study/',
    hostname: 'yomureader.com',
    pathname: '/study/',
    origin: 'https://yomureader.com',
};
const COMPILER_STORAGE_PREFIX = 'usc_https_github_com_HRussellZFAC023_yomu_reader_';
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const INTENT_KEY = 'yomu:settings-intent:v2';
const PRIVATE_KEY = 'yomu:private:academy-device:v1';
const EPOCH_KEY = 'yomu:state-epoch';
const BRIDGE_REQUEST_EVENT = 'yomu-userscript-storage-request';
const BRIDGE_RESPONSE_EVENT = 'yomu-userscript-storage-response';

describe('hosted factory reset through the userscript storage bridge', () => {
    const eventCleanups: Array<() => void> = [];

    afterEach(async () => {
        while (eventCleanups.length) eventCleanups.pop()?.();
        const bridge = await import('../../src/reader/userscript/storage-bridge');
        bridge.uninstallUserscriptGmStorageBridge();
        delete document.documentElement.dataset.yomuUserscriptStorageBridge;
        localStorage.clear();
        sessionStorage.clear();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it('delegates raw extension storage purge to content world before deleting canonical public authority', async () => {
        const epoch = { version: 1, generation: 1, resetId: 'previous-reset', committedAt: 1_000 } as const;
        const { values, settingsSlot, intentSlot, privateSlot } = authorityStore(epoch, 'dark');
        const gm = installCompilerBackedGmStore(values);
        const extension = installContentWorldLegacyResetStore(values);
        eventCleanups.push(extension.cleanup);
        vi.stubGlobal('location', HOSTED_LOCATION);
        const bridge = await import('../../src/reader/userscript/storage-bridge');
        extension.advertiseWhile(bridge.installUserscriptGmStorageBridge);
        const pageStorage = bridge.getUserscriptGmStorage();
        expect(pageStorage).toBeDefined();
        if (!pageStorage) return;
        await expect(pageStorage.listValues()).resolves.toEqual([EPOCH_KEY, settingsSlot, intentSlot]);

        // Switch to the hosted page world: direct GM and browser.storage APIs are
        // absent there. The probe exposes browser.storage only while content
        // world handles clear-legacy-extension-managed.
        const storage = await enterHostedPageWorld();

        await expect(storage.clearManagedStoredValues()).resolves.toBeGreaterThan(0);

        expect(extension.legacyRequestIds).toHaveLength(1);
        expect(extension.responses).toEqual([{ ok: true, message: undefined }]);
        expect(extension.responseSnapshots).toHaveLength(1);
        const atLegacyBridgeSuccess = extension.responseSnapshots[0];
        expect(atLegacyBridgeSuccess.has(SETTINGS_KEY)).toBe(false);
        expect(atLegacyBridgeSuccess.has(INTENT_KEY)).toBe(false);
        expect(atLegacyBridgeSuccess.has(PRIVATE_KEY)).toBe(false);
        expect(atLegacyBridgeSuccess.get(prefixed(settingsSlot))).toEqual(envelope({ theme: 'dark' }, epoch));
        expect(atLegacyBridgeSuccess.get(prefixed(intentSlot))).toEqual(envelope({ revision: 2, records: {} }, epoch));
        expect(atLegacyBridgeSuccess.get('unrelated-extension-key')).toBe('keep-me');

        // After the raw-only bridge operation succeeds, the normal logical GM
        // reset owns deletion of compiler-prefixed public authority.
        expect(values.has(prefixed(settingsSlot))).toBe(false);
        expect(values.has(prefixed(intentSlot))).toBe(false);
        expect(values.has(prefixed(privateSlot))).toBe(false);
        expect(values.get(prefixed(EPOCH_KEY))).toEqual(epoch);
        expect(values.get('unrelated-extension-key')).toBe('keep-me');
        expect(extension.remove.mock.calls.map(([key]) => key).sort()).toEqual([
            SETTINGS_KEY,
            INTENT_KEY,
            PRIVATE_KEY,
        ].sort());
        expect(extension.remove.mock.calls.some(([key]) => key.startsWith(COMPILER_STORAGE_PREFIX))).toBe(false);
        expect(gm.deleteValue.mock.calls.some(([key]) => key === settingsSlot)).toBe(true);
        expect(gm.deleteValue.mock.calls.some(([key]) => key === intentSlot)).toBe(true);
        await expect(storage.managedStoredKeysStillPresent()).resolves.toEqual([]);
        await expect(pageStorage.getValue(privateSlot, null)).rejects.toThrow('Unmanaged storage key');
    });

    it('propagates a content-world raw-storage deletion failure and does not report reset success', async () => {
        const epoch = { version: 1, generation: 1, resetId: 'current-reset', committedAt: 2_000 } as const;
        const { values, settingsSlot, intentSlot, privateSlot } = authorityStore(epoch, 'canonical');
        const gm = installCompilerBackedGmStore(values);
        const extension = installContentWorldLegacyResetStore(values, {
            removeError: new Error('extension storage remove denied'),
        });
        eventCleanups.push(extension.cleanup);
        vi.stubGlobal('location', HOSTED_LOCATION);
        const bridge = await import('../../src/reader/userscript/storage-bridge');
        extension.advertiseWhile(bridge.installUserscriptGmStorageBridge);
        const storage = await enterHostedPageWorld();

        await expect(storage.clearManagedStoredValues()).rejects.toMatchObject({
            name: 'ManagedStateResetError',
            message: 'Factory reset could not clear private managed storage.',
            cause: { message: 'extension storage remove denied' },
        });

        expect(extension.legacyRequestIds).toHaveLength(1);
        expect(extension.responses).toEqual([{ ok: false, message: 'extension storage remove denied' }]);
        expect(extension.responseSnapshots).toHaveLength(1);
        expect(values.get(prefixed(settingsSlot))).toEqual(envelope({ theme: 'canonical' }, epoch));
        expect(values.get(prefixed(intentSlot))).toEqual(envelope({ revision: 2, records: {} }, epoch));
        expect(values.has(prefixed(privateSlot))).toBe(false);
        expect(values.get(SETTINGS_KEY)).toEqual({ theme: 'stranded-raw' });
        expect(values.get(INTENT_KEY)).toEqual({ revision: 1, records: {} });
        expect(values.get(PRIVATE_KEY)).toEqual({ credential: 'stranded-secret' });
        expect(values.get('unrelated-extension-key')).toBe('keep-me');
        expect(gm.deleteValue.mock.calls.some(([key]) => key === settingsSlot)).toBe(false);
        expect(gm.deleteValue.mock.calls.some(([key]) => key === intentSlot)).toBe(false);
    });

    it('waits for the targeted extension responder instead of accepting a userscript-only no-op', async () => {
        const rawValues = new Map<string, unknown>([
            [SETTINGS_KEY, { theme: 'stranded-raw' }],
            [PRIVATE_KEY, { credential: 'stranded-secret' }],
            ['unrelated-extension-key', 'keep-me'],
        ]);
        const { pageStorage, extension } = await installMixedAuthorityResetHarness(rawValues);
        eventCleanups.push(extension.cleanup);

        let settled = false;
        const clearing = pageStorage.clearLegacyExtensionManagedValues()
            .finally(() => { settled = true; });
        await vi.waitFor(() => expect(extension.requests).toHaveLength(1));

        expect(extension.requests[0]).toMatchObject({
            op: 'clear-legacy-extension-managed',
            target: 'extension-storage',
        });
        expect(extension.responses).toEqual([]);
        expect(settled).toBe(false);
        expect(rawValues.has(SETTINGS_KEY)).toBe(true);
        expect(rawValues.has(PRIVATE_KEY)).toBe(true);

        extension.release();
        await expect(clearing).resolves.toBeUndefined();

        expect(extension.responses).toEqual([{ ok: true, message: undefined }]);
        expect(rawValues.has(SETTINGS_KEY)).toBe(false);
        expect(rawValues.has(PRIVATE_KEY)).toBe(false);
        expect(rawValues.get('unrelated-extension-key')).toBe('keep-me');
    });

    it('rejects a targeted extension failure even when a userscript-only responder is also installed', async () => {
        const rawValues = new Map<string, unknown>([
            [SETTINGS_KEY, { theme: 'stranded-raw' }],
            [PRIVATE_KEY, { credential: 'stranded-secret' }],
        ]);
        const { pageStorage, extension } = await installMixedAuthorityResetHarness(rawValues, {
            error: new Error('extension storage remove denied'),
        });
        eventCleanups.push(extension.cleanup);

        const clearing = pageStorage.clearLegacyExtensionManagedValues();
        await vi.waitFor(() => expect(extension.requests).toHaveLength(1));
        expect(extension.responses).toEqual([]);

        extension.release();
        await expect(clearing).rejects.toThrow('extension storage remove denied');

        expect(extension.responses).toEqual([{
            ok: false,
            message: 'extension storage remove denied',
        }]);
        expect(rawValues.get(SETTINGS_KEY)).toEqual({ theme: 'stranded-raw' });
        expect(rawValues.get(PRIVATE_KEY)).toEqual({ credential: 'stranded-secret' });
    });

    it('does not let a userscript-only responder teardown erase another realm extension capability', async () => {
        vi.stubGlobal('location', HOSTED_LOCATION);
        installCompilerBackedGmStore(new Map());
        const bridge = await import('../../src/reader/userscript/storage-bridge');
        bridge.installUserscriptGmStorageBridge();
        expect(document.documentElement.dataset.yomuExtensionStorageBridge).toBeUndefined();

        // A separate extension isolated world advertises into the same DOM.
        document.documentElement.dataset.yomuExtensionStorageBridge = 'true';
        bridge.uninstallUserscriptGmStorageBridge();

        expect(document.documentElement.dataset.yomuExtensionStorageBridge).toBe('true');
        delete document.documentElement.dataset.yomuExtensionStorageBridge;
    });

    it('does not clear private values before the public inventory proves complete', async () => {
        const values = new Map<string, unknown>([
            [PRIVATE_KEY, { credential: 'keep-on-failure' }],
            [SETTINGS_KEY, { theme: 'dark' }],
        ]);
        vi.stubGlobal('location', HOSTED_LOCATION);
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback));
        vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { values.set(key, value); }));
        vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => { values.delete(key); }));
        vi.stubGlobal('GM_listValues', undefined);
        const bridge = await import('../../src/reader/userscript/storage-bridge');
        bridge.installUserscriptGmStorageBridge();
        vi.stubGlobal('GM_getValue', undefined);
        vi.stubGlobal('GM_setValue', undefined);
        vi.stubGlobal('GM_deleteValue', undefined);
        const storage = await import('../../src/reader/app/storage');

        await expect(storage.clearManagedStoredValues()).rejects.toMatchObject({ name: 'ManagedStateResetError' });
        expect(values.get(PRIVATE_KEY)).toEqual({ credential: 'keep-on-failure' });
        expect(values.get(SETTINGS_KEY)).toEqual({ theme: 'dark' });
    });
});

function installCompilerBackedGmStore(values: Map<string, unknown>) {
    const getValue = vi.fn((key: string, fallback: unknown) => {
        const physicalKey = prefixed(key);
        return values.has(physicalKey) ? values.get(physicalKey) : fallback;
    });
    const setValue = vi.fn((key: string, value: unknown) => { values.set(prefixed(key), value); });
    const deleteValue = vi.fn((key: string) => { values.delete(prefixed(key)); });
    const listValues = vi.fn(() => [...values.keys()]
        .filter(key => key.startsWith(COMPILER_STORAGE_PREFIX))
        .map(key => key.slice(COMPILER_STORAGE_PREFIX.length)));
    vi.stubGlobal('GM_getValue', getValue);
    vi.stubGlobal('GM_setValue', setValue);
    vi.stubGlobal('GM_deleteValue', deleteValue);
    vi.stubGlobal('GM_listValues', listValues);
    return { getValue, setValue, deleteValue, listValues };
}

async function enterHostedPageWorld() {
    vi.stubGlobal('GM_getValue', undefined);
    vi.stubGlobal('GM_setValue', undefined);
    vi.stubGlobal('GM_deleteValue', undefined);
    vi.stubGlobal('GM_listValues', undefined);
    const { installFreshManagedStateEpochSessionForTests } = await import('../../src/reader/app/managed-state-epoch');
    installFreshManagedStateEpochSessionForTests();
    return import('../../src/reader/app/storage');
}

function installContentWorldLegacyResetStore(
    values: Map<string, unknown>,
    options: { removeError?: Error } = {},
) {
    const get = vi.fn(async (key: string | null) => selectedExtensionValues(values, key));
    const remove = vi.fn(async (key: string) => {
        if (options.removeError) throw options.removeError;
        values.delete(key);
    });
    const extensionBrowser = {
        runtime: { id: 'yomu@yomureader.com' },
        storage: { local: { get, remove } },
    };
    let exposeContentWorldStorage = false;
    Object.defineProperty(globalThis, 'browser', {
        configurable: true,
        get: () => exposeContentWorldStorage ? extensionBrowser : undefined,
    });
    const legacyRequestIds: string[] = [];
    const responses: Array<{ ok: boolean; message: string | undefined }> = [];
    const responseSnapshots: Array<Map<string, unknown>> = [];
    const onRequest = (event: Event): void => {
        const requestId = legacyResetRequestId(event);
        if (!requestId) return;
        legacyRequestIds.push(requestId);
        exposeContentWorldStorage = true;
        queueMicrotask(() => { exposeContentWorldStorage = false; });
    };
    const onResponse = (event: Event): void => {
        const detail = eventDetail(event);
        if (!detail || detail.id !== legacyRequestIds.at(-1)) return;
        const message = detail.message;
        responses.push({ ok: detail.ok === true, message: typeof message === 'string' ? message : undefined });
        responseSnapshots.push(new Map(values));
    };
    window.addEventListener(BRIDGE_REQUEST_EVENT, onRequest);
    window.addEventListener(BRIDGE_RESPONSE_EVENT, onResponse);
    return {
        get,
        remove,
        legacyRequestIds,
        responses,
        responseSnapshots,
        advertiseWhile: (install: () => void) => {
            exposeContentWorldStorage = true;
            try {
                install();
            } finally {
                exposeContentWorldStorage = false;
            }
        },
        cleanup: () => {
            window.removeEventListener(BRIDGE_REQUEST_EVENT, onRequest);
            window.removeEventListener(BRIDGE_RESPONSE_EVENT, onResponse);
            Reflect.deleteProperty(globalThis, 'browser');
        },
    };
}

function installTargetedExtensionResetResponder(
    values: Map<string, unknown>,
    options: { error?: Error } = {},
) {
    document.documentElement.dataset.yomuExtensionStorageBridge = 'true';
    const gate = deferred();
    const requests: Record<string, unknown>[] = [];
    const responses: Array<{ ok: boolean; message: string | undefined }> = [];
    const onRequest = (event: Event): void => {
        const detail = targetedExtensionResetRequest(event);
        if (!detail) return;
        requests.push(detail);
        void gate.promise.then(() => dispatchTargetedExtensionResetResponse(detail.id, values, options.error));
    };
    const onResponse = (event: Event): void => {
        const response = targetedExtensionResetResponse(event, requests.at(-1)?.id);
        if (response) responses.push(response);
    };
    window.addEventListener(BRIDGE_REQUEST_EVENT, onRequest);
    window.addEventListener(BRIDGE_RESPONSE_EVENT, onResponse);
    return {
        requests,
        responses,
        release: gate.resolve,
        cleanup: () => {
            window.removeEventListener(BRIDGE_REQUEST_EVENT, onRequest);
            window.removeEventListener(BRIDGE_RESPONSE_EVENT, onResponse);
            delete document.documentElement.dataset.yomuExtensionStorageBridge;
        },
    };
}

async function installMixedAuthorityResetHarness(
    rawValues: Map<string, unknown>,
    options: { error?: Error } = {},
) {
    vi.stubGlobal('location', HOSTED_LOCATION);
    installCompilerBackedGmStore(new Map());
    const bridge = await import('../../src/reader/userscript/storage-bridge');
    bridge.installUserscriptGmStorageBridge();
    const pageStorage = bridge.getUserscriptGmStorage();
    if (!pageStorage) throw new Error('Hosted settings bridge was not installed.');
    return {
        pageStorage,
        extension: installTargetedExtensionResetResponder(rawValues, options),
    };
}

function targetedExtensionResetRequest(
    event: Event,
): (Record<string, unknown> & { id: string }) | undefined {
    const detail = eventDetail(event);
    if (!detail || !isTargetedExtensionReset(detail)) return undefined;
    return typeof detail.id === 'string'
        ? detail as Record<string, unknown> & { id: string }
        : undefined;
}

function isTargetedExtensionReset(detail: Record<string, unknown>): boolean {
    return detail.op === 'clear-legacy-extension-managed'
        && detail.target === 'extension-storage';
}

function dispatchTargetedExtensionResetResponse(
    requestId: string,
    values: Map<string, unknown>,
    error: Error | undefined,
): void {
    if (!error) {
        values.delete(SETTINGS_KEY);
        values.delete(INTENT_KEY);
        values.delete(PRIVATE_KEY);
    }
    window.dispatchEvent(new CustomEvent(BRIDGE_RESPONSE_EVENT, {
        detail: { id: requestId, ok: !error, message: error?.message },
    }));
}

function targetedExtensionResetResponse(
    event: Event,
    requestId: unknown,
): { ok: boolean; message: string | undefined } | undefined {
    const detail = eventDetail(event);
    if (!detail || detail.id !== requestId) return undefined;
    return normalizedResetResponse(detail);
}

function normalizedResetResponse(detail: Record<string, unknown>): { ok: boolean; message: string | undefined } {
    return {
        ok: detail.ok === true,
        message: typeof detail.message === 'string' ? detail.message : undefined,
    };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>(settle => { resolve = settle; });
    return { promise, resolve };
}

function legacyResetRequestId(event: Event): string | undefined {
    const detail = eventDetail(event) ?? {};
    return detail.op === 'clear-legacy-extension-managed' && typeof detail.id === 'string'
        ? detail.id
        : undefined;
}

function eventDetail(event: Event): Record<string, unknown> | undefined {
    const detail = normalizedBridgeEventDetail(event);
    return detail && typeof detail === 'object' ? detail as Record<string, unknown> : undefined;
}

function selectedExtensionValues(values: Map<string, unknown>, key: string | null): Record<string, unknown> {
    if (key === null) return Object.fromEntries(values);
    return values.has(key) ? { [key]: values.get(key) } : {};
}

function authorityStore(
    epoch: { version: 1; generation: number; resetId: string; committedAt: number },
    canonicalTheme: string,
) {
    const settingsSlot = physicalSlot(SETTINGS_KEY, epoch);
    const intentSlot = physicalSlot(INTENT_KEY, epoch);
    const privateSlot = physicalSlot(PRIVATE_KEY, epoch);
    const values = new Map<string, unknown>([
        [prefixed(EPOCH_KEY), epoch],
        [prefixed(settingsSlot), envelope({ theme: canonicalTheme }, epoch)],
        [prefixed(intentSlot), envelope({ revision: 2, records: {} }, epoch)],
        [prefixed(privateSlot), envelope({ credential: 'canonical-secret' }, epoch)],
        [SETTINGS_KEY, { theme: 'stranded-raw' }],
        [INTENT_KEY, { revision: 1, records: {} }],
        [PRIVATE_KEY, { credential: 'stranded-secret' }],
        ['unrelated-extension-key', 'keep-me'],
    ]);
    return { values, settingsSlot, intentSlot, privateSlot };
}

function prefixed(key: string): string {
    return `${COMPILER_STORAGE_PREFIX}${key}`;
}

function physicalSlot(key: string, epoch: { generation: number; resetId: string }): string {
    return `yomu:state-slot:v1:${encodeURIComponent(`${epoch.generation}:${epoch.resetId}`)}:${encodeURIComponent(key)}`;
}

function envelope(value: unknown, epoch: { generation: number; resetId: string }): unknown {
    return { __yomuManagedStateEnvelope: 1, epoch: `${epoch.generation}:${epoch.resetId}`, value };
}
