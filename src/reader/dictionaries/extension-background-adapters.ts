import {
    ManagedStateEpochSession,
    StaleManagedStateEpochError,
    managedStateEpochToken,
    managedStateLogicalValue,
    parseManagedStateEpoch,
    sameManagedStateEpoch,
    type ManagedStateEpoch,
} from '../app/managed-state-epoch';
import { MANAGED_STATE_SLOT_KEY_PREFIX } from '../app/managed-storage-keys';
import type {
    AudioSourceSetting,
    AudioSourceType,
    AudioSubSourceSetting,
    DictionaryPreference,
    InterfaceLanguage,
} from '../app/types';
import { booleanValue, finiteNumber, objectRecord, stringValue } from '../settings/values';

declare const __YOMU_EXTENSION_STORAGE_PREFIX__: string | undefined;

const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const STATE_EPOCH_KEY = 'yomu:state-epoch';
const FACTORY_RESET_SIGNAL_KEY = 'yomu:factory-reset-signal';
const UNORDERED_DICTIONARY_PRIORITY_BASE = 1000;
const AUDIO_SOURCE_TYPES = new Set<AudioSourceType>([
    'jpod101',
    'language-pod-101',
    'jisho',
    'bunpro',
    'lingua-libre',
    'wiktionary',
    'jiten-tts',
    'jpdb-tts',
    'text-to-speech',
    'text-to-speech-reading',
    'custom',
    'custom-json',
]);
const compiledStoragePrefix = typeof __YOMU_EXTENSION_STORAGE_PREFIX__ === 'string'
    ? __YOMU_EXTENSION_STORAGE_PREFIX__
    : '';

type StorageRecord = Record<string, unknown>;

interface ExtensionStorageArea {
    get(keys?: string | string[] | null, callback?: (items: StorageRecord) => void): unknown;
}

interface ExtensionStorageChangedEvent {
    addListener(listener: (changes: StorageRecord, areaName: string) => void): void;
    removeListener?(listener: (changes: StorageRecord, areaName: string) => void): void;
}

interface ExtensionStorageRoot {
    chrome?: {
        runtime?: { lastError?: { message?: string } };
        storage?: { local?: ExtensionStorageArea; onChanged?: ExtensionStorageChangedEvent };
    };
    browser?: {
        runtime?: { lastError?: { message?: string } };
        storage?: { local?: ExtensionStorageArea; onChanged?: ExtensionStorageChangedEvent };
    };
}

export interface ExtensionDictionaryBackgroundSettings {
    readonly corsProxyUrl: string;
    readonly localDictionariesEnabled: boolean;
    readonly interfaceLanguage: InterfaceLanguage;
}

const DEFAULT_BACKGROUND_SETTINGS: ExtensionDictionaryBackgroundSettings = {
    corsProxyUrl: '',
    localDictionariesEnabled: true,
    interfaceLanguage: 'en',
};

let backgroundStorage: DirectExtensionDictionaryStorage | undefined;

export function configureExtensionDictionaryBackgroundStorage(
    root: typeof globalThis = globalThis,
    storagePrefix = compiledStoragePrefix,
): DirectExtensionDictionaryStorage {
    backgroundStorage = new DirectExtensionDictionaryStorage(root as ExtensionStorageRoot, storagePrefix);
    return backgroundStorage;
}

function extensionDictionaryBackgroundStorage(): DirectExtensionDictionaryStorage {
    return backgroundStorage ?? configureExtensionDictionaryBackgroundStorage();
}

/**
 * The generated extension background is itself the GM host. This adapter talks
 * to its storage area directly, applying the compiler prefix and Yomu's current
 * managed-state slot instead of recursively calling the content-side GM facade.
 */
export class DirectExtensionDictionaryStorage {
    private epochSession = new ManagedStateEpochSession();
    private readonly area: ExtensionStorageArea;
    private readonly changed?: ExtensionStorageChangedEvent;
    private settings = DEFAULT_BACKGROUND_SETTINGS;
    private settingsPromise?: Promise<ExtensionDictionaryBackgroundSettings>;
    private settingsRevision = 0;

    constructor(
        private readonly root: ExtensionStorageRoot,
        private readonly prefix: string,
    ) {
        const api = root.browser?.storage?.local ? root.browser : root.chrome;
        if (!api?.storage?.local) throw new Error('Extension dictionary background requires storage.local.');
        this.area = api.storage.local;
        this.changed = api.storage.onChanged;
    }

    get currentSettings(): ExtensionDictionaryBackgroundSettings {
        return this.settings;
    }

    loadSettings(): Promise<ExtensionDictionaryBackgroundSettings> {
        if (!this.settingsPromise) {
            const revision = this.settingsRevision;
            const promise = this.readSettingsForCurrentEpoch()
                .then(value => {
                    if (revision !== this.settingsRevision) return this.loadSettings();
                    this.settings = normalizeBackgroundSettings(value);
                    return this.settings;
                })
                .finally(() => {
                    if (this.settingsPromise === promise) this.settingsPromise = undefined;
                });
            this.settingsPromise = promise;
        }
        return this.settingsPromise;
    }

    subscribeToChanges(): () => void {
        if (!this.changed?.addListener) return () => undefined;
        const listener = (changes: StorageRecord, areaName: string) => {
            if (areaName !== 'local') return;
            this.settingsRevision += 1;
            this.settingsPromise = undefined;
            if (Object.prototype.hasOwnProperty.call(changes, this.physicalKey(STATE_EPOCH_KEY))) {
                // Content realms deliberately keep an immutable epoch capture,
                // but the shared host outlives those realms. Factory reset has
                // already quiesced host mutations before committing the new
                // epoch, so the worker must begin a fresh session for newly
                // loaded tabs instead of remaining stale until MV3 eviction.
                this.epochSession = new ManagedStateEpochSession();
            }
            void this.loadSettings().catch(() => undefined);
        };
        this.changed.addListener(listener);
        return () => this.changed?.removeListener?.(listener);
    }

    async assertAllowed(mutation = false): Promise<ManagedStateEpoch> {
        const expected = await this.epochSession.assertCurrent(async () => {
            const epoch = await this.readEpoch();
            return epoch.generation === 0 ? undefined : epoch;
        });
        if (!mutation) return expected;
        const before = await this.readEpoch();
        if (!sameManagedStateEpoch(expected, before)) throw new StaleManagedStateEpochError(expected, before);
        const signal = await this.readRaw(FACTORY_RESET_SIGNAL_KEY);
        if (factoryResetPreparing(signal)) throw new Error('Managed state writes are suppressed during factory reset.');
        const after = await this.readEpoch();
        if (!sameManagedStateEpoch(expected, after)) throw new StaleManagedStateEpochError(expected, after);
        return expected;
    }

    async readManagedValue<T>(key: string, fallback: T): Promise<T> {
        const epoch = await this.assertAllowed();
        const scopedKey = epoch.generation === 0
            ? key
            : `${MANAGED_STATE_SLOT_KEY_PREFIX}${encodeURIComponent(managedStateEpochToken(epoch))}:${encodeURIComponent(key)}`;
        let stored = await this.readRaw(scopedKey);
        if (!stored.found && scopedKey !== key) stored = await this.readRaw(key);
        await this.assertAllowed();
        if (!stored.found) return fallback;
        const unreadable = Symbol('unreadable-managed-state');
        const value = managedStateLogicalValue<T | typeof unreadable>(stored.value, epoch, unreadable);
        return value === unreadable ? fallback : value as T;
    }

    private async readEpoch(): Promise<ManagedStateEpoch> {
        const stored = await this.readRaw(STATE_EPOCH_KEY);
        return parseManagedStateEpoch(stored.found ? stored.value : undefined);
    }

    private async readSettingsForCurrentEpoch(): Promise<unknown> {
        try {
            return await this.readManagedValue<unknown>(SETTINGS_KEY, null);
        } catch (error) {
            if (!(error instanceof StaleManagedStateEpochError)) throw error;
            // A capability probe can race storage.onChanged by one task. Retry
            // this read in a new host session so that race cannot permanently
            // strand the newly loaded content script on its per-site fallback.
            this.epochSession = new ManagedStateEpochSession();
            this.settingsRevision += 1;
            this.settingsPromise = undefined;
            return this.readManagedValue<unknown>(SETTINGS_KEY, null);
        }
    }

    private async readRaw(key: string): Promise<{ found: boolean; value?: unknown }> {
        const physicalKey = this.physicalKey(key);
        const values = await storageGet(this.root, this.area, physicalKey);
        return Object.prototype.hasOwnProperty.call(values, physicalKey)
            ? { found: true, value: values[physicalKey] }
            : { found: false };
    }

    private physicalKey(key: string): string {
        return `${this.prefix}${key}`;
    }
}

// Build aliases route the Yomitan store's epoch fences here. They deliberately
// retain the original names so the store source remains untouched, while the
// implementation above never enters gmStorageGet.
export function assertManagedStateMutationAllowed(): Promise<ManagedStateEpoch> {
    return extensionDictionaryBackgroundStorage().assertAllowed(true);
}

export function assertManagedStateReadAllowed(): Promise<ManagedStateEpoch> {
    return extensionDictionaryBackgroundStorage().assertAllowed();
}

// A shared extension-origin IndexedDB no longer needs cross-origin source ZIP
// replication. Keep these build-specific adapters inert so an 80 MB import is
// not copied into storage.local as another ~107 MB of base64.
export async function persistDictionaryArchive(): Promise<void> {}
export async function deleteDictionaryArchive(): Promise<void> {}

// Exact, worker-safe preference normalization used by the store's cache keys
// and ranking. The ordinary build still imports the canonical settings module;
// the background bundle aliases that wide module to this focused adapter.
export function normalizeDictionaryPreferences(value: unknown): DictionaryPreference[] {
    if (!Array.isArray(value)) return [];
    return value
        .map(normalizeDictionaryPreference)
        .filter((item): item is DictionaryPreference => item !== null)
        .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

function normalizeDictionaryPreference(item: unknown, index: number): DictionaryPreference | null {
    const record = objectRecord(item);
    if (!record) return null;
    const name = stringValue(record.name);
    if (!name.trim()) return null;
    const alias = stringValue(record.alias);
    return {
        name,
        alias: alias.trim() ? alias : name,
        enabled: booleanValue(record.enabled, true),
        priority: finiteNumber(record.priority, UNORDERED_DICTIONARY_PRIORITY_BASE + index),
        allowSecondarySearches: booleanValue(record.allowSecondarySearches, false),
        type: normalizeDictionaryType(record.type, name),
    };
}

function normalizeDictionaryType(value: unknown, name = ''): DictionaryPreference['type'] {
    if (value === 'terms' || value === 'kanji' || value === 'frequency' || value === 'pronunciation' || value === 'metadata') {
        return value;
    }
    const normalized = name.toLowerCase();
    if (/\b(?:ipa|pronunciation|phonetic)\b/.test(normalized)) return 'pronunciation';
    if (/\b(?:frequency|freq|jpdbv?\d*|bccwj|jiten|cc100|kwdlc|aozora|netflix|novel|anime|vn)\b/.test(normalized)) {
        return 'frequency';
    }
    if (/\b(?:kanjidic|kanji)\b/.test(normalized)) return 'kanji';
    return 'terms';
}

export function normalizeAudioSource(value: unknown): AudioSourceSetting | null {
    const record = value && typeof value === 'object'
        ? value as Record<string, unknown>
        : null;
    if (!record || typeof record.type !== 'string' || !AUDIO_SOURCE_TYPES.has(record.type as AudioSourceType)) {
        return null;
    }
    const subSources = normalizeAudioSubSources(record.subSources);
    return {
        type: record.type as AudioSourceType,
        url: stringValue(record.url),
        voice: stringValue(record.voice),
        enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
        ...(subSources.length ? { subSources } : {}),
    };
}

function normalizeAudioSubSources(value: unknown): AudioSubSourceSetting[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const subSources: AudioSubSourceSetting[] = [];
    for (const item of value) {
        const record = item && typeof item === 'object' ? item as Record<string, unknown> : null;
        const name = stringValue(record?.name).trim();
        if (!name) continue;
        const key = name.normalize('NFC').split(/\s+/, 1)[0]!.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        subSources.push({ name, enabled: typeof record?.enabled === 'boolean' ? record.enabled : true });
    }
    return subSources;
}

// The worker keeps normal diagnostics quiet unless an actual RPC error is
// returned to the caller. This avoids importing app/logger, whose synchronous
// setting facade belongs to document/userscript realms.
const scopedLogger = {
    debug: (_message: string, ..._args: unknown[]) => undefined,
    info: (_message: string, ..._args: unknown[]) => undefined,
    warn: (_message: string, ..._args: unknown[]) => undefined,
    error: (_message: string, ..._args: unknown[]) => undefined,
    warnOnce: (_key: string, _message: string, ..._args: unknown[]) => undefined,
    time: (_label: string, ..._args: unknown[]) => () => undefined,
};

export const Logger = {
    scope: (_scopeName: string) => scopedLogger,
};

function normalizeBackgroundSettings(value: unknown): ExtensionDictionaryBackgroundSettings {
    const record = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
    return {
        corsProxyUrl: typeof record.corsProxyUrl === 'string' ? record.corsProxyUrl : '',
        localDictionariesEnabled: typeof record.localDictionariesEnabled === 'boolean'
            ? record.localDictionariesEnabled
            : true,
        interfaceLanguage: record.interfaceLanguage === 'ja' || record.interfaceLanguage === 'auto'
            ? record.interfaceLanguage
            : 'en',
    };
}

function factoryResetPreparing(value: { found: boolean; value?: unknown }): boolean {
    if (!value.found || !value.value || typeof value.value !== 'object') return false;
    return (value.value as Record<string, unknown>).phase === 'prepare';
}

function storageGet(
    root: ExtensionStorageRoot,
    area: ExtensionStorageArea,
    key: string,
): Promise<StorageRecord> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (value: unknown) => {
            if (settled) return;
            settled = true;
            const lastError = root.chrome?.runtime?.lastError ?? root.browser?.runtime?.lastError;
            if (lastError) reject(new Error(lastError.message || 'Extension storage read failed.'));
            else resolve(value && typeof value === 'object' ? value as StorageRecord : {});
        };
        const fail = (error: unknown) => {
            if (settled) return;
            settled = true;
            reject(error);
        };
        try {
            const maybePromise = area.get(key, finish);
            if (isPromiseLike(maybePromise)) void maybePromise.then(finish, fail);
            else if (maybePromise !== undefined) finish(maybePromise);
        } catch (callbackError) {
            try {
                const maybePromise = area.get(key);
                if (isPromiseLike(maybePromise)) void maybePromise.then(finish, fail);
                else finish(maybePromise);
            } catch {
                fail(callbackError);
            }
        }
    });
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return Boolean(value && typeof (value as { then?: unknown }).then === 'function');
}
