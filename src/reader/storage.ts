const MISSING = { missing: true };
const FACTORY_RESET_SIGNAL_KEY = 'yomu:factory-reset-signal';
const FACTORY_RESET_CHANNEL_NAME = 'yomu:factory-reset';
const MANAGED_STORAGE_KEY_PREFIXES = [
    'yomu-',
    'yomu:',
    'yomu.',
    'jpdb-reader-',
    'jpdb-popup-reader-',
];
const KNOWN_MANAGED_STORAGE_KEYS = [
    'jpdb-popup-reader-settings',
    'jpdb-reader-settings',
    'yomu-reader-settings',
    'yomu-settings',
    'jpdb-reader-newtab-card-cache',
    'jpdb-reader-newtab-grade-queue',
    'jpdb-reader-newtab-current-word',
    'jpdb-reader-newtab-ui',
    'jpdb-reader-newtab-jpdb-stats-history',
    'jpdb-reader-newtab-disabled-anki-decks',
    'jpdb-reader-source-open-state',
    'jpdb-reader-settings-drawer-height-ratio',
    'jpdb-reader-sheet-height-ratio',
    'jpdb-reader-transcript-panel-size',
    'yomu:anki-status-index:v1',
    'yomu:anki-status-index-rebuild:v1',
    'yomu.grammarPreferences.v1',
    'yomu:enable-logs',
    'yomu:prefer-japanese-site-language',
    FACTORY_RESET_SIGNAL_KEY,
];
const MANAGED_INDEXED_DB_NAMES = [
    'yomu-anki-status-index',
];
const EXCLUDED_BACKUP_STORAGE_KEYS = new Set([
    FACTORY_RESET_SIGNAL_KEY,
]);

type SyncStorageRead<T> = { kind: 'found'; value: T } | { kind: 'fallback' };
type GmGetValue = <T>(key: string, defaultValue: T) => T | Promise<T>;
type GmSetValue = (key: string, value: unknown) => void | Promise<void>;
type GmDeleteValue = (key: string) => void | Promise<void>;
type GmListValues = () => string[] | Promise<string[]>;

export type FactoryResetSignalPhase = 'prepare' | 'complete';

export interface FactoryResetSignal {
    id: string;
    phase: FactoryResetSignalPhase;
    at: number;
    href: string;
}

export interface FactoryResetSignalSource {
    remote: boolean;
    transport: 'gm-storage' | 'broadcast-channel' | 'web-storage';
}

export async function gmStorageGet<T>(key: string, fallback: T): Promise<T> {
    const getValue = asyncGmGetValue();
    if (getValue) {
        try {
            const value = await getValue<T | typeof MISSING>(key, MISSING);
            if (value !== MISSING) return value as T;
            const migrated = localStorageGet<T>(key, MISSING as T);
            if (migrated !== (MISSING as T)) {
                await gmStorageSet(key, migrated);
                return migrated;
            }
            return fallback;
        } catch (error) {
            debugStorageError('GM storage read failed', key, error);
        }
    }
    return localStorageGet(key, fallback);
}

export function gmStorageGetSync<T>(key: string, fallback: T): T {
    const getValue = typeof GM_getValue === 'function' ? GM_getValue as GmGetValue : null;
    if (getValue) {
        const read = gmStorageSyncRead<T>(key, getValue);
        if (read.kind === 'found') return read.value;
    }
    return localStorageGet(key, fallback);
}

function gmStorageSyncRead<T>(key: string, getValue: GmGetValue): SyncStorageRead<T> {
    try {
        const value = getValue<T | typeof MISSING>(key, MISSING);
        if (isPromiseLike(value)) return { kind: 'fallback' };
        if (value !== MISSING) return { kind: 'found', value: value as T };
        return migratedLocalStorageSyncValue(key);
    } catch (error) {
        debugStorageError('GM storage sync read failed', key, error);
        return { kind: 'fallback' };
    }
}

function migratedLocalStorageSyncValue<T>(key: string): SyncStorageRead<T> {
    const migrated = localStorageGet<T>(key, MISSING as T);
    if (migrated === (MISSING as T)) return { kind: 'fallback' };
    void gmStorageSet(key, migrated);
    return { kind: 'found', value: migrated };
}

export async function gmStorageSet(key: string, value: unknown): Promise<void> {
    const setValue = asyncGmSetValue();
    if (setValue) {
        await setValue(key, value);
        return;
    }
    localStorageSet(key, value);
}

export function gmStorageSetSync(key: string, value: unknown): void {
    if (typeof GM_setValue === 'function') {
        try {
            const result = GM_setValue(key, value);
            if (!isPromiseLike(result)) return;
        } catch (error) {
            debugStorageError('GM storage sync write failed', key, error);
        }
    }
    localStorageSet(key, value);
}

export async function gmStorageDelete(key: string): Promise<void> {
    const deleteValue = asyncGmDeleteValue();
    if (deleteValue) {
        try {
            await deleteValue(key);
        } catch (error) {
            debugStorageError('GM storage delete failed', key, error);
        }
    }
    removeLocalStorageKey(key);
    removeSessionStorageKey(key);
}

export function gmStorageDeleteSync(key: string): void {
    if (typeof GM_deleteValue === 'function') {
        try {
            const result = GM_deleteValue(key);
            if (isPromiseLike(result)) result.catch(error => debugStorageError('GM storage async delete failed', key, error));
        } catch (error) {
            debugStorageError('GM storage sync delete failed', key, error);
        }
    }
    removeLocalStorageKey(key);
    removeSessionStorageKey(key);
}

async function exportStoredValues(prefixes: string[]): Promise<Record<string, unknown>> {
    const keys = (await storageKeys(prefixes)).filter(isBackupStorageKey);
    const entries = await Promise.all(keys.map(async key => [key, await gmStorageGet<unknown>(key, undefined)] as const));
    return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

export async function exportManagedStoredValues(): Promise<Record<string, unknown>> {
    return await exportStoredValues(MANAGED_STORAGE_KEY_PREFIXES);
}

export async function importStoredValues(values: unknown): Promise<number> {
    let count = 0;
    for (const [key, value] of managedStoredValueEntries(values)) {
        await gmStorageSet(key, value);
        localStorageSet(key, value);
        count++;
    }
    return count;
}

function managedStoredValueEntries(values: unknown): Array<[string, unknown]> {
    return isStorageImportRecord(values)
        ? Object.entries(values).filter(([key]) => isBackupStorageKey(key))
        : [];
}

function isStorageImportRecord(values: unknown): values is Record<string, unknown> {
    return Boolean(values && typeof values === 'object' && !Array.isArray(values));
}

export async function clearManagedStoredValues(): Promise<number> {
    const keys = await allStorageKeys();
    let count = 0;
    for (const key of keys) {
        await gmStorageDelete(key);
        removeLocalStorageKey(key);
        removeSessionStorageKey(key);
        count++;
    }
    await clearManagedIndexedDatabases();
    return count;
}

export async function clearFactoryResetSignal(): Promise<void> {
    await gmStorageDelete(FACTORY_RESET_SIGNAL_KEY);
}

export function createFactoryResetSignal(phase: FactoryResetSignalPhase, id = createFactoryResetId()): FactoryResetSignal {
    return {
        id,
        phase,
        at: Date.now(),
        href: location.href,
    };
}

export async function publishFactoryResetSignal(signal: FactoryResetSignal): Promise<void> {
    const normalized = normalizeFactoryResetSignal(signal);
    await gmStorageSet(FACTORY_RESET_SIGNAL_KEY, normalized);
    publishBroadcastFactoryResetSignal(normalized);
}

export function subscribeToFactoryResetSignals(onSignal: (signal: FactoryResetSignal, source: FactoryResetSignalSource) => void): () => void {
    const cleanups: Array<() => void> = [];
    const addValueChangeListener = (globalThis as {
        GM_addValueChangeListener?: (
            key: string,
            listener: (key: string, oldValue: unknown, newValue: unknown, remote: boolean) => void,
        ) => number;
    }).GM_addValueChangeListener;
    const removeValueChangeListener = (globalThis as {
        GM_removeValueChangeListener?: (listenerId: number) => void;
    }).GM_removeValueChangeListener;

    if (typeof addValueChangeListener === 'function') {
        try {
            const listenerId = addValueChangeListener(FACTORY_RESET_SIGNAL_KEY, (_key, _oldValue, newValue, remote) => {
                const signal = parseFactoryResetSignal(newValue);
                if (signal) onSignal(signal, { remote, transport: 'gm-storage' });
            });
            cleanups.push(() => {
                if (typeof removeValueChangeListener === 'function') removeValueChangeListener(listenerId);
            });
        } catch (error) {
            debugStorageError('GM factory reset listener failed', FACTORY_RESET_SIGNAL_KEY, error);
        }
    }

    if (typeof BroadcastChannel === 'function') {
        try {
            const channel = new BroadcastChannel(FACTORY_RESET_CHANNEL_NAME);
            channel.onmessage = event => {
                const signal = parseFactoryResetSignal(event.data);
                if (signal) onSignal(signal, { remote: true, transport: 'broadcast-channel' });
            };
            cleanups.push(() => channel.close());
        } catch (error) {
            debugStorageError('Broadcast factory reset listener failed', FACTORY_RESET_CHANNEL_NAME, error);
        }
    }

    const onStorage = (event: StorageEvent): void => {
        if (event.key !== FACTORY_RESET_SIGNAL_KEY) return;
        const signal = parseFactoryResetSignal(event.newValue);
        if (signal) onSignal(signal, { remote: true, transport: 'web-storage' });
    };
    window.addEventListener('storage', onStorage);
    cleanups.push(() => window.removeEventListener('storage', onStorage));

    return () => {
        while (cleanups.length) {
            try {
                cleanups.pop()?.();
            } catch {
                // Best-effort listener cleanup.
            }
        }
    };
}

async function storageKeys(prefixes: string[]): Promise<string[]> {
    const keys = new Set<string>();
    await addPrefixedGmStorageKeys(keys, prefixes);
    addLocalStorageKeys(keys, prefixes);
    await addKnownManagedStorageKeys(keys, prefixes);
    return [...keys].sort();
}

async function addPrefixedGmStorageKeys(keys: Set<string>, prefixes: string[]): Promise<void> {
    const listValues = asyncGmListValues();
    if (!listValues) return;
    try {
        addMatchingStorageKeys(keys, await listValues(), prefixes);
    } catch (error) {
        debugStorageError('GM storage list failed', 'GM_listValues', error);
    }
}

function addLocalStorageKeys(keys: Set<string>, prefixes: string[]): void {
    try {
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index);
            if (key && storageKeyMatchesPrefix(key, prefixes)) keys.add(key);
        }
    } catch {
        // Ignore localStorage enumeration failures.
    }
}

async function addKnownManagedStorageKeys(keys: Set<string>, prefixes: string[]): Promise<void> {
    for (const key of KNOWN_MANAGED_STORAGE_KEYS) {
        if (storageKeyMatchesPrefix(key, prefixes) && await storedValueExists(key)) keys.add(key);
    }
}

function addMatchingStorageKeys(keys: Set<string>, candidates: string[], prefixes: string[]): void {
    for (const key of candidates) {
        if (storageKeyMatchesPrefix(key, prefixes)) keys.add(key);
    }
}

function storageKeyMatchesPrefix(key: string, prefixes: string[]): boolean {
    return prefixes.some(prefix => key.startsWith(prefix));
}

async function allStorageKeys(): Promise<string[]> {
    const keys = new Set<string>();
    await addGmStorageKeys(keys);
    collectWebStorageKeys(localStorage, keys);
    collectWebStorageKeys(sessionStorage, keys);
    await addKnownStoredKeys(keys);
    return [...keys].sort();
}

async function addGmStorageKeys(keys: Set<string>): Promise<void> {
    const listValues = asyncGmListValues();
    if (!listValues) return;
    try {
        for (const key of await listValues()) keys.add(key);
    } catch (error) {
        debugStorageError('GM storage list failed', 'GM_listValues', error);
    }
}

async function addKnownStoredKeys(keys: Set<string>): Promise<void> {
    for (const key of KNOWN_MANAGED_STORAGE_KEYS) {
        if (await storedValueExists(key)) keys.add(key);
    }
}

function collectWebStorageKeys(storage: Storage, keys: Set<string>): void {
    try {
        for (let index = 0; index < storage.length; index++) {
            const key = storage.key(index);
            if (key && isManagedStorageKey(key)) keys.add(key);
        }
    } catch {
        // Ignore storage enumeration failures.
    }
}

function localStorageGet<T>(key: string, fallback: T): T {
    try {
        const value = localStorage.getItem(key);
        return value == null ? fallback : JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

function localStorageSet(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Best effort only.
    }
}

function removeLocalStorageKey(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // Ignore storage failures.
    }
}

function removeSessionStorageKey(key: string): void {
    try {
        sessionStorage.removeItem(key);
    } catch {
        // Ignore storage failures.
    }
}

export async function storedValueExists(key: string): Promise<boolean> {
    const getValue = asyncGmGetValue();
    if (getValue) {
        try {
            if (await getValue<unknown | typeof MISSING>(key, MISSING) !== MISSING) return true;
        } catch (error) {
            debugStorageError('GM storage existence check failed', key, error);
        }
    }
    return webStorageHasKey(localStorage, key) || webStorageHasKey(sessionStorage, key);
}

function webStorageHasKey(storage: Storage, key: string): boolean {
    try {
        return storage.getItem(key) !== null;
    } catch {
        return false;
    }
}

async function clearManagedIndexedDatabases(): Promise<void> {
    await Promise.all(MANAGED_INDEXED_DB_NAMES.map(deleteIndexedDbDatabase));
}

function deleteIndexedDbDatabase(name: string): Promise<void> {
    if (typeof indexedDB === 'undefined') return Promise.resolve();
    return new Promise(resolve => {
        try {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = () => resolve();
            request.onerror = error => {
                debugStorageError('IndexedDB delete failed', name, error);
                resolve();
            };
            request.onblocked = error => {
                debugStorageError('IndexedDB delete blocked', name, error);
                resolve();
            };
        } catch (error) {
            debugStorageError('IndexedDB delete threw', name, error);
            resolve();
        }
    });
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
    return Boolean(value) && typeof (value as Promise<unknown>).then === 'function';
}

function asyncGmGetValue(): GmGetValue | null {
    if (typeof GM_getValue === 'function') return GM_getValue as GmGetValue;
    const modern = (globalThis as { GM?: { getValue?: GmGetValue } }).GM?.getValue;
    return typeof modern === 'function' ? modern.bind((globalThis as { GM?: unknown }).GM) : null;
}

function asyncGmSetValue(): GmSetValue | null {
    if (typeof GM_setValue === 'function') return GM_setValue as GmSetValue;
    const modern = (globalThis as { GM?: { setValue?: GmSetValue } }).GM?.setValue;
    return typeof modern === 'function' ? modern.bind((globalThis as { GM?: unknown }).GM) : null;
}

function asyncGmDeleteValue(): GmDeleteValue | null {
    if (typeof GM_deleteValue === 'function') return GM_deleteValue as GmDeleteValue;
    const modern = (globalThis as { GM?: { deleteValue?: GmDeleteValue } }).GM?.deleteValue;
    return typeof modern === 'function' ? modern.bind((globalThis as { GM?: unknown }).GM) : null;
}

function asyncGmListValues(): GmListValues | null {
    const legacy = (globalThis as { GM_listValues?: GmListValues }).GM_listValues;
    if (typeof legacy === 'function') return legacy;
    const modern = (globalThis as { GM?: { listValues?: GmListValues } }).GM?.listValues;
    return typeof modern === 'function' ? modern.bind((globalThis as { GM?: unknown }).GM) : null;
}

function normalizeFactoryResetSignal(signal: FactoryResetSignal): FactoryResetSignal {
    return {
        id: normalizedFactoryResetId(signal.id),
        phase: normalizedFactoryResetPhase(signal.phase),
        at: normalizedFactoryResetAt(signal.at),
        href: normalizedFactoryResetHref(signal.href),
    };
}

function normalizedFactoryResetId(id: string): string {
    return String(id || createFactoryResetId());
}

function normalizedFactoryResetPhase(phase: FactoryResetSignalPhase): FactoryResetSignalPhase {
    return phase === 'complete' ? 'complete' : 'prepare';
}

function normalizedFactoryResetAt(at: number): number {
    return typeof at === 'number' && Number.isFinite(at) ? at : Date.now();
}

function normalizedFactoryResetHref(href: string): string {
    return typeof href === 'string' ? href : location.href;
}

function parseFactoryResetSignal(value: unknown): FactoryResetSignal | null {
    const parsed = typeof value === 'string' ? parseJsonRecord(value) : value;
    if (!isFactoryResetSignalRecord(parsed)) return null;
    const record = parsed;
    if (!isValidFactoryResetPhase(record.phase)) return null;
    return {
        id: record.id,
        phase: record.phase,
        at: factoryResetSignalTime(record.at),
        href: factoryResetSignalHref(record.href),
    };
}

function factoryResetSignalTime(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : Date.now();
}

function factoryResetSignalHref(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function isFactoryResetSignalRecord(value: unknown): value is Partial<FactoryResetSignal> & { id: string } {
    return Boolean(value
        && typeof value === 'object'
        && !Array.isArray(value)
        && typeof (value as Partial<FactoryResetSignal>).id === 'string'
        && (value as Partial<FactoryResetSignal>).id?.trim());
}

function isValidFactoryResetPhase(value: unknown): value is FactoryResetSignal['phase'] {
    return value === 'prepare' || value === 'complete';
}

function parseJsonRecord(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function publishBroadcastFactoryResetSignal(signal: FactoryResetSignal): void {
    if (typeof BroadcastChannel !== 'function') return;
    try {
        const channel = new BroadcastChannel(FACTORY_RESET_CHANNEL_NAME);
        channel.postMessage(signal);
        channel.close();
    } catch (error) {
        debugStorageError('Broadcast factory reset publish failed', FACTORY_RESET_CHANNEL_NAME, error);
    }
}

function createFactoryResetId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isManagedStorageKey(key: string): boolean {
    return MANAGED_STORAGE_KEY_PREFIXES.some(prefix => key.startsWith(prefix));
}

function isBackupStorageKey(key: string): boolean {
    return isManagedStorageKey(key) && !EXCLUDED_BACKUP_STORAGE_KEYS.has(key);
}

function debugStorageError(message: string, key: string, error: unknown): void {
    if (typeof console !== 'undefined') console.debug('[Yomu] Storage', message, { key, error });
}
