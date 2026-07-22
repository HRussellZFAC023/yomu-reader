import { MANAGED_STORAGE_KEY_PREFIXES, isManagedStorageKey, isPrivateManagedStorageKey } from './managed-storage-keys';
import { HOSTED_DEMO_SETTINGS_KEYS } from './hosted-demo-settings';
import { isPromiseLike } from '../core/async-utils';
import { DOCS_ORIGIN } from './constants';
import { getUserscriptGmStorage } from '../userscript/storage-bridge';
import './managed-state-manifest';
import {
    registeredManagedStorageKeys,
    registeredManagedIndexedDbNames,
    managedStateEntries,
} from './managed-state-registry';

// Missing-value sentinel. Message-based GM implementations (Safari
// Userscripts, FireMonkey, world bridges) structured-clone the default they
// hand back, so identity alone cannot detect "key not stored" — compare
// structurally as well or every read of an absent key returns the sentinel
// clone as if it were stored data (defaults + onboarding on every site).
const MISSING = { __yomuStorageValueMissing: true };

function isMissingSentinel(value: unknown): boolean {
    if (value === MISSING) return true;
    return Boolean(value
        && typeof value === 'object'
        && !Array.isArray(value)
        && (value as Record<string, unknown>).__yomuStorageValueMissing === true);
}
const FACTORY_RESET_SIGNAL_KEY = 'yomu:factory-reset-signal';
const FACTORY_RESET_CHANNEL_NAME = 'yomu:factory-reset';
const YOMU_LOCAL_SRS_STORAGE_KEY = 'yomu:srs-local:v1';
const MANAGED_CACHE_NAME_PREFIXES = [
    'yomu-newtab-',
    'yomu-pdf-reader-',
    'yomu-video-player-',
    'yomu-docs-shell-',
];
const EXCLUDED_BACKUP_STORAGE_KEYS = new Set([
    FACTORY_RESET_SIGNAL_KEY,
    // Transient cloud-sync handoff written before an OAuth redirect. Factory
    // reset owns it via the '__yomu' prefix, but backups must not replay it.
    '__yomu_cloud_settings_sync_pending_action',
]);
const STORAGE_LEASE_KEY_PREFIX = 'yomu:lease:';

interface StorageLeaseClaim {
    readonly version: 1;
    readonly owner: string;
    readonly choosing: boolean;
    readonly ticket: number;
    readonly leaseUntil: number;
}

export interface GmStorageLeaseOptions {
    readonly leaseMs?: number;
    readonly pollMs?: number;
    readonly timeoutMs?: number;
}

type SyncStorageRead<T> = { kind: 'found'; value: T } | { kind: 'fallback' };
type GmGetValue = <T>(key: string, defaultValue: T) => T | Promise<T>;
type GmSetValue = (key: string, value: unknown) => void | Promise<void>;
type GmDeleteValue = (key: string) => void | Promise<void>;
type GmListValues = () => string[] | Promise<string[]>;
type GmValueChangeListener = (key: string, oldValue: unknown, newValue: unknown, remote: boolean) => void;
type GmAddValueChangeListener = (key: string, listener: GmValueChangeListener) => number;
type GmRemoveValueChangeListener = (listenerId: number) => void;
interface ExtensionStorageArea {
    get(key: string | null): Promise<Record<string, unknown>>;
    set(values: Record<string, unknown>): Promise<void>;
    remove(key: string): Promise<void>;
    getKeys?(): Promise<string[]>;
}
interface ExtensionStorageChange {
    readonly newValue?: unknown;
}
interface ExtensionStorageChangedEvent {
    addListener(listener: (changes: Record<string, ExtensionStorageChange>, areaName: string) => void): void;
    removeListener(listener: (changes: Record<string, ExtensionStorageChange>, areaName: string) => void): void;
}

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

// True when reads/writes reach a shared GM store (direct GM_* APIs or the
// hosted storage bridge) rather than falling back to per-origin localStorage.
export function hasAsyncGmStorageBackend(): boolean {
    return asyncGmGetValue() !== null;
}

// Raw read of this origin's localStorage fallback copy, bypassing GM. Used to
// recover values a bridge-less session stranded here before the GM backend
// became available.
export function localFallbackStoredValue<T>(key: string, fallback: T): T {
    return localStorageGet(key, fallback);
}

export async function gmStorageGet<T>(key: string, fallback: T): Promise<T> {
    const getValue = asyncGmGetValue();
    if (getValue) {
        try {
            const pendingPatch = pendingHostedLocalPatch(key);
            if (pendingPatch) {
                const shared = await getValue<unknown | typeof MISSING>(key, MISSING);
                const sharedRecord = !isMissingSentinel(shared) && isPlainRecord(shared) ? shared : {};
                const reconciled = { ...sharedRecord, ...pendingPatch } as T;
                await gmStorageSet(key, reconciled);
                return reconciled;
            }
            const value = await getValue<T | typeof MISSING>(key, MISSING);
            if (!isMissingSentinel(value)) return value as T;
            const migrated = localStorageGet<T>(key, MISSING as T);
            if (!isMissingSentinel(migrated)) {
                const promoted = sanitizedStrandedLocalValue(key, migrated);
                await gmStorageSet(key, promoted);
                return promoted;
            }
            return fallback;
        } catch (error) {
            debugStorageError('GM storage read failed', key, error);
        }
    }
    const local = localStorageGet<T | typeof MISSING>(key, MISSING);
    if (!isMissingSentinel(local)) return local as T;
    // Establish the standalone hosted profile as a comparison baseline before
    // the user edits it. A later bridge can then persist a field-level patch,
    // rather than mistaking the entire default-filled settings object for user
    // intent and overwriting unrelated settings already present in GM storage.
    if (key === HOSTED_SETTINGS_BLOB_KEY && isHostedYomuOrigin() && isPlainRecord(fallback)) {
        localStorageSet(key, fallback);
    }
    return fallback;
}

/**
 * Read secret material only from the extension/userscript-owned store. This
 * deliberately never migrates from or falls back to page-readable web storage.
 */
export async function gmPrivateStorageGet<T>(key: string, fallback: T): Promise<T> {
    assertPrivateStorageKey(key);
    removeLocalStorageKey(key);
    removeSessionStorageKey(key);
    const getValue = directGmGetValue();
    if (!getValue) return fallback;
    try {
        const value = await getValue<T | typeof MISSING>(key, MISSING);
        return isMissingSentinel(value) ? fallback : value as T;
    } catch (error) {
        debugStorageError('Private GM storage read failed', key, error);
        return fallback;
    }
}

/**
 * Serializes a storage transaction across tabs, userscript worlds, and packaged
 * extension contexts. Each contender owns a separate GM key, so acquiring the
 * lease never relies on an unsafe read-modify-write of one shared lock value.
 * Expired claims are ignored, allowing recovery after a tab or process dies.
 */
export async function withGmStorageLease<T>(
    name: string,
    operation: () => Promise<T>,
    options: GmStorageLeaseOptions = {},
): Promise<T> {
    const getValue = asyncGmGetValue();
    const setValue = asyncGmSetValue();
    const deleteValue = asyncGmDeleteValue();
    const listValues = asyncGmListValues();
    if (!getValue || !setValue || !deleteValue || !listValues) {
        return withWebStorageLock(name, operation);
    }

    const leaseMs = boundedLeaseOption(options.leaseMs, 60_000, 1_000, 10 * 60_000);
    const pollMs = boundedLeaseOption(options.pollMs, 20, 1, 1_000);
    const timeoutMs = boundedLeaseOption(options.timeoutMs, 90_000, leaseMs, 15 * 60_000);
    const owner = createFactoryResetId();
    const prefix = `${STORAGE_LEASE_KEY_PREFIX}${normalizedStorageLeaseName(name)}:`;
    const key = `${prefix}${owner}`;
    const startedAt = Date.now();
    let claim: StorageLeaseClaim = {
        version: 1,
        owner,
        choosing: true,
        ticket: 0,
        leaseUntil: startedAt + leaseMs,
    };

    await setValue(key, claim);
    try {
        const initialClaims = await readStorageLeaseClaims(prefix, listValues, getValue, Date.now());
        const highestTicket = initialClaims.reduce((highest, item) => Math.max(highest, item.ticket), 0);
        claim = { ...claim, choosing: false, ticket: highestTicket + 1, leaseUntil: Date.now() + leaseMs };
        await setValue(key, claim);

        while (true) {
            const now = Date.now();
            if (now - startedAt >= timeoutMs) throw new Error(`Timed out waiting for storage lease: ${name}`);
            const claims = await readStorageLeaseClaims(prefix, listValues, getValue, now);
            const blocked = claims.some(other => other.owner !== owner && (
                other.choosing
                || other.ticket < claim.ticket
                || (other.ticket === claim.ticket && other.owner.localeCompare(owner) < 0)
            ));
            if (!blocked) break;
            if (claim.leaseUntil - now <= leaseMs / 2) {
                claim = { ...claim, leaseUntil: now + leaseMs };
                await setValue(key, claim);
            }
            await storageLeaseDelay(pollMs);
        }

        let renewalStopped = false;
        let renewal = Promise.resolve();
        const renewalTimer = setInterval(() => {
            renewal = renewal.then(async () => {
                if (renewalStopped) return;
                claim = { ...claim, leaseUntil: Date.now() + leaseMs };
                await setValue(key, claim);
            }).catch(error => debugStorageError('GM storage lease renewal failed', key, error));
        }, Math.max(250, Math.floor(leaseMs / 3)));
        try {
            return await operation();
        } finally {
            renewalStopped = true;
            clearInterval(renewalTimer);
            await renewal;
        }
    } finally {
        try {
            await deleteValue(key);
        } catch (error) {
            debugStorageError('GM storage lease release failed', key, error);
        }
    }
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
        if (!isMissingSentinel(value)) return { kind: 'found', value: value as T };
        return migratedLocalStorageSyncValue(key);
    } catch (error) {
        debugStorageError('GM storage sync read failed', key, error);
        return { kind: 'fallback' };
    }
}

function migratedLocalStorageSyncValue<T>(key: string): SyncStorageRead<T> {
    const migrated = localStorageGet<T>(key, MISSING as T);
    if (isMissingSentinel(migrated)) return { kind: 'fallback' };
    const promoted = sanitizedStrandedLocalValue(key, migrated);
    void gmStorageSet(key, promoted);
    return { kind: 'found', value: promoted };
}

// Mirrors SETTINGS_STORAGE_KEY in settings/index.ts; the settings module
// depends on this one, so the literal cannot be imported from there.
const HOSTED_SETTINGS_BLOB_KEY = 'jpdb-popup-reader-settings';
const HOSTED_SETTINGS_PENDING_GM_PATCH_FIELD = '__yomuHostedPendingGmPatch';

// A hosted page's localStorage settings copy includes demo-player staging
// values the docs theme force-writes. Promoting a stranded copy into the
// shared GM store must drop those keys so visiting the homepage can never
// flip the user's real settings everywhere. (Stranded-settings field recovery
// in settings/index.ts applies the same exclusion.)
function sanitizedStrandedLocalValue<T>(key: string, value: T): T {
    if (key !== HOSTED_SETTINGS_BLOB_KEY || !isHostedYomuOrigin()) return value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = { ...(value as Record<string, unknown>) };
    delete record[HOSTED_SETTINGS_PENDING_GM_PATCH_FIELD];
    for (const demoKey of HOSTED_DEMO_SETTINGS_KEYS) delete record[demoKey];
    return record as T;
}

function pendingHostedLocalPatch(key: string): Record<string, unknown> | undefined {
    if (key !== HOSTED_SETTINGS_BLOB_KEY || !isHostedYomuOrigin()) return undefined;
    const value = localStorageGet<unknown>(key, undefined);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const patch = (value as Record<string, unknown>)[HOSTED_SETTINGS_PENDING_GM_PATCH_FIELD];
    return isPlainRecord(patch) ? sanitizedStrandedLocalValue(key, patch) : undefined;
}

function localFallbackValueForWrite(key: string, value: unknown): unknown {
    if (key !== HOSTED_SETTINGS_BLOB_KEY || !isHostedYomuOrigin()) return value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const current = sanitizedStrandedLocalValue(key, value) as Record<string, unknown>;
    const previousValue = localStorageGet<unknown>(key, undefined);
    const previous = isPlainRecord(previousValue)
        ? sanitizedStrandedLocalValue(key, previousValue) as Record<string, unknown>
        : undefined;
    const earlierPatch = isPlainRecord(previousValue)
        && isPlainRecord(previousValue[HOSTED_SETTINGS_PENDING_GM_PATCH_FIELD])
        ? previousValue[HOSTED_SETTINGS_PENDING_GM_PATCH_FIELD] as Record<string, unknown>
        : {};
    // A direct write without a preceding read has no trustworthy baseline.
    // Leave it as a stranded local blob: settings/index.ts can recover only
    // its non-default fields later. Marking the full object as a patch would
    // let default values clobber unrelated, newer GM settings.
    if (!previous) return value;
    const changed = changedRecordFields(previous, current);
    return {
        ...(value as Record<string, unknown>),
        [HOSTED_SETTINGS_PENDING_GM_PATCH_FIELD]: { ...earlierPatch, ...changed },
    };
}

function changedRecordFields(previous: Record<string, unknown>, current: Record<string, unknown>): Record<string, unknown> {
    const changed: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(current)) {
        if (JSON.stringify(previous[field]) !== JSON.stringify(value)) changed[field] = value;
    }
    return changed;
}

export async function gmStorageSet(key: string, value: unknown): Promise<void> {
    const setValue = asyncGmSetValue();
    if (setValue) {
        try {
            await setValue(key, value);
            mirrorManagedValueToHostedStorage(key, value);
            return;
        } catch (error) {
            // A present-but-dead GM_setValue must not swallow the write: fall
            // back to localStorage so at least this origin keeps the change.
            debugStorageError('GM storage write failed', key, error);
        }
    }
    localStorageSet(key, localFallbackValueForWrite(key, value));
}

/** Store secret material fail-closed; page localStorage is never a fallback. */
export async function gmPrivateStorageSet(key: string, value: unknown): Promise<void> {
    assertPrivateStorageKey(key);
    removeLocalStorageKey(key);
    removeSessionStorageKey(key);
    const setValue = directGmSetValue();
    if (!setValue) throw new Error('Secure extension storage is unavailable.');
    try {
        await setValue(key, value);
    } catch (error) {
        debugStorageError('Private GM storage write failed', key, error);
        throw new Error('Secure extension storage is unavailable.');
    }
}

export function gmStorageSetSync(key: string, value: unknown): void {
    if (typeof GM_setValue === 'function') {
        try {
            const result = GM_setValue(key, value);
            if (!isPromiseLike(result)) {
                mirrorManagedValueToHostedStorage(key, value);
                return;
            }
            result.catch(error => debugStorageError('GM storage async write failed', key, error));
        } catch (error) {
            debugStorageError('GM storage sync write failed', key, error);
        }
    }
    localStorageSet(key, localFallbackValueForWrite(key, value));
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

/** Delete secret material from GM storage and scrub any legacy web fallback. */
export async function gmPrivateStorageDelete(key: string): Promise<void> {
    assertPrivateStorageKey(key);
    const deleteValue = directGmDeleteValue();
    if (deleteValue) {
        try {
            await deleteValue(key);
        } catch (error) {
            debugStorageError('Private GM storage delete failed', key, error);
            throw new Error('Secure extension storage is unavailable.');
        }
    }
    removeLocalStorageKey(key);
    removeSessionStorageKey(key);
}

function assertPrivateStorageKey(key: string): void {
    if (!isPrivateManagedStorageKey(key)) throw new TypeError('Private storage requires a yomu:private: key.');
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
        const storedValue = key === YOMU_LOCAL_SRS_STORAGE_KEY
            ? await mergeYomuLocalSrsDeckImport(value)
            : value;
        await gmStorageSet(key, storedValue);
        localStorageSet(key, storedValue);
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

async function mergeYomuLocalSrsDeckImport(imported: unknown): Promise<unknown> {
    const importedDeck = yomuLocalSrsDeckRecord(imported);
    if (!importedDeck) return imported;
    const existingDeck = yomuLocalSrsDeckRecord(await gmStorageGet<unknown>(YOMU_LOCAL_SRS_STORAGE_KEY, null).catch(() => null));
    if (!existingDeck) return importedDeck;
    return {
        version: 1,
        cards: mergeYomuLocalSrsCards(existingDeck.cards, importedDeck.cards),
    };
}

function yomuLocalSrsDeckRecord(value: unknown): { version: 1; cards: Record<string, Record<string, unknown>> } | null {
    if (!isPlainRecord(value) || value.version !== 1 || !isPlainRecord(value.cards)) return null;
    const cards: Record<string, Record<string, unknown>> = {};
    for (const [id, card] of Object.entries(value.cards)) {
        if (isPlainRecord(card)) cards[id] = card;
    }
    return { version: 1, cards };
}

function mergeYomuLocalSrsCards(
    existingCards: Record<string, Record<string, unknown>>,
    importedCards: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
    const cards = { ...existingCards };
    for (const [id, importedCard] of Object.entries(importedCards)) {
        const existingCard = cards[id];
        cards[id] = existingCard ? mergeYomuLocalSrsCard(existingCard, importedCard) : importedCard;
    }
    return cards;
}

function mergeYomuLocalSrsCard(existingCard: Record<string, unknown>, importedCard: Record<string, unknown>): Record<string, unknown> {
    return {
        ...importedCard,
        ...existingCard,
        meanings: uniquePrimitiveStrings([
            ...stringArray(importedCard.meanings),
            ...stringArray(existingCard.meanings),
        ]),
        sentence: existingCard.sentence || importedCard.sentence,
        sourceUrl: existingCard.sourceUrl || importedCard.sourceUrl,
        tags: uniquePrimitiveStrings([
            ...stringArray(importedCard.tags),
            ...stringArray(existingCard.tags),
        ]),
        createdAt: minFiniteNumber(importedCard.createdAt, existingCard.createdAt) ?? existingCard.createdAt ?? importedCard.createdAt,
        updatedAt: maxFiniteNumber(importedCard.updatedAt, existingCard.updatedAt) ?? existingCard.updatedAt ?? importedCard.updatedAt,
    };
}

function stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function uniquePrimitiveStrings(values: string[]): string[] {
    return Array.from(new Set(values));
}

function minFiniteNumber(a: unknown, b: unknown): number | undefined {
    const values = [a, b].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return values.length ? Math.min(...values) : undefined;
}

function maxFiniteNumber(a: unknown, b: unknown): number | undefined {
    const values = [a, b].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return values.length ? Math.max(...values) : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
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
    count += await clearManagedBrowserCaches();
    count += await unregisterManagedServiceWorkers();
    return count;
}

export async function clearManagedBrowserCaches(): Promise<number> {
    if (typeof caches === 'undefined') return 0;
    try {
        const keys = await caches.keys();
        const managedKeys = keys.filter(isManagedBrowserCacheName);
        const deleted = await Promise.all(managedKeys.map(key => caches.delete(key)));
        return deleted.filter(Boolean).length;
    } catch (error) {
        debugStorageError('Cache API clear failed', 'managed-caches', error);
        return 0;
    }
}

export async function unregisterManagedServiceWorkers(): Promise<number> {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker?.getRegistrations) return 0;
    try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const managedRegistrations = registrations.filter(isManagedServiceWorkerRegistration);
        const unregistered = await Promise.all(managedRegistrations.map(registration => registration.unregister()));
        return unregistered.filter(Boolean).length;
    } catch (error) {
        debugStorageError('Service worker unregister failed', 'managed-service-workers', error);
        return 0;
    }
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

    addGmValueChangeCleanup(cleanups, FACTORY_RESET_SIGNAL_KEY, (_key, _oldValue, newValue, remote) => {
        const signal = parseFactoryResetSignal(newValue);
        if (signal) onSignal(signal, { remote, transport: 'gm-storage' });
    }, 'GM factory reset listener failed');

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

    addWebStorageCleanup(cleanups, FACTORY_RESET_SIGNAL_KEY, event => {
        const signal = parseFactoryResetSignal(event.newValue);
        if (signal) onSignal(signal, { remote: true, transport: 'web-storage' });
    });

    return () => runStorageCleanups(cleanups);
}

export function subscribeToStoredValueChanges(key: string, onChange: (newValue: unknown) => void): () => void {
    const cleanups: Array<() => void> = [];

    addGmValueChangeCleanup(cleanups, key, (_key, _oldValue, newValue) => onChange(newValue), 'GM stored value listener failed');
    addWebStorageCleanup(cleanups, key, event => {
        onChange(JSON.parse(event.newValue || 'null'));
    });
    const extensionChanges = extensionStorageChangedEvent();
    if (extensionChanges) {
        const listener = (changes: Record<string, ExtensionStorageChange>, areaName: string): void => {
            if (areaName !== 'local' || !(key in changes)) return;
            onChange(changes[key]?.newValue);
        };
        extensionChanges.addListener(listener);
        cleanups.push(() => extensionChanges.removeListener(listener));
    }

    return () => runStorageCleanups(cleanups);
}

function addGmValueChangeCleanup(
    cleanups: Array<() => void>,
    key: string,
    listener: GmValueChangeListener,
    errorLabel: string,
): void {
    const addValueChangeListener = (globalThis as {
        GM_addValueChangeListener?: GmAddValueChangeListener;
    }).GM_addValueChangeListener;
    if (typeof addValueChangeListener !== 'function') return;

    try {
        const listenerId = addValueChangeListener(key, listener);
        cleanups.push(() => {
            const removeValueChangeListener = (globalThis as {
                GM_removeValueChangeListener?: GmRemoveValueChangeListener;
            }).GM_removeValueChangeListener;
            if (typeof removeValueChangeListener === 'function') removeValueChangeListener(listenerId);
        });
    } catch (error) {
        debugStorageError(errorLabel, key, error);
    }
}

function addWebStorageCleanup(
    cleanups: Array<() => void>,
    key: string,
    listener: (event: StorageEvent) => void,
): void {
    const onStorage = (event: StorageEvent): void => {
        if (event.key !== key) return;
        listener(event);
    };
    window.addEventListener('storage', onStorage);
    cleanups.push(() => window.removeEventListener('storage', onStorage));
}

function runStorageCleanups(cleanups: Array<() => void>): void {
    while (cleanups.length) {
        try {
            cleanups.pop()?.();
        } catch {
            // Best-effort listener cleanup.
        }
    }
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
    for (const key of registeredManagedStorageKeys()) {
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
    warnUnregisteredManagedKeys(keys);
    return [...keys].sort();
}

// Safety-net invariant: every managed key the legacy prefix/GM sweep catches
// should also be declared in the managed-state registry. A key here that the
// registry does not know about means a store escaped registration — the
// factory-reset-invariant test asserts this stays empty, which is the
// enforcement that fails when a future store forgets to register.
export function unregisteredManagedStorageKeys(keys: Iterable<string>): string[] {
    const exactKeys = new Set(registeredManagedStorageKeys());
    const prefixes = managedStateEntries()
        .filter(entry => entry.kind !== 'idb' && entry.prefix)
        .map(entry => entry.prefix as string);
    const unregistered: string[] = [];
    for (const key of keys) {
        if (key === FACTORY_RESET_SIGNAL_KEY) continue;
        if (exactKeys.has(key)) continue;
        if (prefixes.some(prefix => key.startsWith(prefix))) continue;
        unregistered.push(key);
    }
    return unregistered;
}

function warnUnregisteredManagedKeys(keys: Set<string>): void {
    const unregistered = unregisteredManagedStorageKeys(keys);
    if (unregistered.length) {
        debugStorageError('Managed key not in registry (unregistered store escaping reset)', unregistered.join(','), null);
    }
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
    // The registry is the single source of truth for managed exact keys.
    for (const key of registeredManagedStorageKeys()) {
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
            if (!isMissingSentinel(await getValue<unknown | typeof MISSING>(key, MISSING))) return true;
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

function mirrorManagedValueToHostedStorage(key: string, value: unknown): void {
    if (!shouldMirrorManagedValueToHostedStorage(key)) return;
    localStorageSet(key, value);
}

export function cacheManagedValueForHostedStartup(key: string, value: unknown): void {
    mirrorManagedValueToHostedStorage(key, value);
}

function shouldMirrorManagedValueToHostedStorage(key: string): boolean {
    return isManagedStorageKey(key) && !isPrivateManagedStorageKey(key) && isHostedYomuOrigin();
}

export function isHostedYomuOrigin(): boolean {
    try {
        const host = location.hostname;
        const path = location.pathname;
        if (location.origin === DOCS_ORIGIN) return true;
        if (host === 'hrussellzfac023.github.io') return path.startsWith('/yomu-reader/');
        return /^(127\.0\.0\.1|localhost|\[::1\])$/.test(host)
            && (path.includes('/study/') || path.includes('/newtab/'));
    } catch {
        return false;
    }
}

async function clearManagedIndexedDatabases(): Promise<void> {
    // The registry is the single source of truth for managed IndexedDB names.
    await Promise.all(registeredManagedIndexedDbNames().map(deleteIndexedDbDatabase));
}

function isManagedBrowserCacheName(name: string): boolean {
    return MANAGED_CACHE_NAME_PREFIXES.some(prefix => name.startsWith(prefix));
}

function isManagedServiceWorkerRegistration(registration: ServiceWorkerRegistration): boolean {
    return [
        registration.scope,
        registration.active?.scriptURL,
        registration.installing?.scriptURL,
        registration.waiting?.scriptURL,
    ].some(hasManagedYomuServiceWorkerPath);
}

function hasManagedYomuServiceWorkerPath(value: string | undefined): boolean {
    if (typeof value !== 'string') return false;
    try {
        const url = new URL(value, location.href);
        if (!isManagedServiceWorkerOrigin(url)) return false;
        return url.pathname === '/sw.js'
            || url.pathname.endsWith('/sw.js')
            || url.pathname.includes('/study/')
            || url.pathname.includes('/newtab/')
            || url.pathname.includes('/pdf-reader/')
            || url.pathname.includes('/video-player/');
    } catch {
        return value.includes('/study/')
            || value.includes('/newtab/')
            || value.includes('/pdf-reader/')
            || value.includes('/video-player/')
            || value.endsWith('/sw.js');
    }
}

function isManagedServiceWorkerOrigin(url: URL): boolean {
    return url.origin === DOCS_ORIGIN
        || url.hostname === 'hrussellzfac023.github.io'
        || /^(127\.0\.0\.1|localhost|\[::1\])$/.test(url.hostname);
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


function asyncGmGetValue(): GmGetValue | null {
    if (typeof GM_getValue === 'function') return GM_getValue as GmGetValue;
    const modern = (globalThis as { GM?: { getValue?: GmGetValue } }).GM?.getValue;
    if (typeof modern === 'function') return modern.bind((globalThis as { GM?: unknown }).GM);
    const extension = extensionStorageArea();
    if (extension) return (async <T>(key: string, fallback: T): Promise<T> => {
        const value = (await extension.get(key))[key];
        return value === undefined ? fallback : value as T;
    }) as GmGetValue;
    const bridge = getUserscriptGmStorage();
    return bridge ? (key, fallback) => bridge.getValue(key, fallback) : null;
}

function directGmGetValue(): GmGetValue | null {
    if (typeof GM_getValue === 'function') return GM_getValue as GmGetValue;
    const modern = (globalThis as { GM?: { getValue?: GmGetValue } }).GM?.getValue;
    if (typeof modern === 'function') return modern.bind((globalThis as { GM?: unknown }).GM);
    const extension = extensionStorageArea();
    return extension ? (async <T>(key: string, fallback: T): Promise<T> => {
        const value = (await extension.get(key))[key];
        return value === undefined ? fallback : value as T;
    }) as GmGetValue : null;
}

function asyncGmSetValue(): GmSetValue | null {
    if (typeof GM_setValue === 'function') return GM_setValue as GmSetValue;
    const modern = (globalThis as { GM?: { setValue?: GmSetValue } }).GM?.setValue;
    if (typeof modern === 'function') return modern.bind((globalThis as { GM?: unknown }).GM);
    const extension = extensionStorageArea();
    if (extension) return (key, value) => extension.set({ [key]: value });
    const bridge = getUserscriptGmStorage();
    return bridge ? (key, value) => bridge.setValue(key, value) : null;
}

function directGmSetValue(): GmSetValue | null {
    if (typeof GM_setValue === 'function') return GM_setValue as GmSetValue;
    const modern = (globalThis as { GM?: { setValue?: GmSetValue } }).GM?.setValue;
    if (typeof modern === 'function') return modern.bind((globalThis as { GM?: unknown }).GM);
    const extension = extensionStorageArea();
    return extension ? (key, value) => extension.set({ [key]: value }) : null;
}

function asyncGmDeleteValue(): GmDeleteValue | null {
    if (typeof GM_deleteValue === 'function') return GM_deleteValue as GmDeleteValue;
    const modern = (globalThis as { GM?: { deleteValue?: GmDeleteValue } }).GM?.deleteValue;
    if (typeof modern === 'function') return modern.bind((globalThis as { GM?: unknown }).GM);
    const extension = extensionStorageArea();
    if (extension) return key => extension.remove(key);
    const bridge = getUserscriptGmStorage();
    return bridge ? key => bridge.deleteValue(key) : null;
}

function directGmDeleteValue(): GmDeleteValue | null {
    if (typeof GM_deleteValue === 'function') return GM_deleteValue as GmDeleteValue;
    const modern = (globalThis as { GM?: { deleteValue?: GmDeleteValue } }).GM?.deleteValue;
    if (typeof modern === 'function') return modern.bind((globalThis as { GM?: unknown }).GM);
    const extension = extensionStorageArea();
    return extension ? key => extension.remove(key) : null;
}

function asyncGmListValues(): GmListValues | null {
    const directListValues = (globalThis as { GM_listValues?: GmListValues }).GM_listValues;
    if (typeof directListValues === 'function') return directListValues;
    const modern = (globalThis as { GM?: { listValues?: GmListValues } }).GM?.listValues;
    if (typeof modern === 'function') return modern.bind((globalThis as { GM?: unknown }).GM);
    const extension = extensionStorageArea();
    if (extension) return async () => extension.getKeys ? extension.getKeys() : Object.keys(await extension.get(null));
    const bridge = getUserscriptGmStorage();
    return bridge ? () => bridge.listValues() : null;
}

function extensionStorageArea(): ExtensionStorageArea | null {
    const candidate = (globalThis as unknown as {
        browser?: { runtime?: { id?: string }; storage?: { local?: ExtensionStorageArea } };
        chrome?: { runtime?: { id?: string }; storage?: { local?: ExtensionStorageArea } };
    });
    const browser = candidate.browser;
    if (browser?.runtime?.id && browser.storage?.local) return browser.storage.local;
    const chrome = candidate.chrome;
    if (chrome?.runtime?.id && chrome.storage?.local) return chrome.storage.local;
    return null;
}

function extensionStorageChangedEvent(): ExtensionStorageChangedEvent | null {
    const candidate = (globalThis as unknown as {
        browser?: { runtime?: { id?: string }; storage?: { onChanged?: ExtensionStorageChangedEvent } };
        chrome?: { runtime?: { id?: string }; storage?: { onChanged?: ExtensionStorageChangedEvent } };
    });
    if (candidate.browser?.runtime?.id && candidate.browser.storage?.onChanged) return candidate.browser.storage.onChanged;
    if (candidate.chrome?.runtime?.id && candidate.chrome.storage?.onChanged) return candidate.chrome.storage.onChanged;
    return null;
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

function isBackupStorageKey(key: string): boolean {
    return isManagedStorageKey(key)
        && !isPrivateManagedStorageKey(key)
        && !key.startsWith(STORAGE_LEASE_KEY_PREFIX)
        && !EXCLUDED_BACKUP_STORAGE_KEYS.has(key);
}

async function readStorageLeaseClaims(
    prefix: string,
    listValues: GmListValues,
    getValue: GmGetValue,
    now: number,
): Promise<StorageLeaseClaim[]> {
    const keys = (await listValues()).filter(key => key.startsWith(prefix));
    const values = await Promise.all(keys.map(key => getValue<unknown>(key, null)));
    return values.flatMap(value => {
        const claim = parseStorageLeaseClaim(value);
        return claim && claim.leaseUntil > now ? [claim] : [];
    });
}

function parseStorageLeaseClaim(value: unknown): StorageLeaseClaim | null {
    if (!isPlainRecord(value) || value.version !== 1 || typeof value.owner !== 'string'
        || typeof value.choosing !== 'boolean' || !Number.isSafeInteger(value.ticket)
        || (value.ticket as number) < 0 || !Number.isSafeInteger(value.leaseUntil)) return null;
    return value as unknown as StorageLeaseClaim;
}

function normalizedStorageLeaseName(name: string): string {
    const normalized = name.trim().replaceAll(/[^a-z0-9._-]+/giu, '-').slice(0, 80);
    if (!normalized) throw new TypeError('Storage lease name is required.');
    return normalized;
}

function boundedLeaseOption(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError('Invalid storage lease option.');
    return value;
}

function storageLeaseDelay(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function withWebStorageLock<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const lockManager = typeof navigator === 'undefined'
        ? undefined
        : (navigator as Navigator & {
            locks?: { request<Result>(name: string, callback: () => Promise<Result>): Promise<Result> };
        }).locks;
    return lockManager ? lockManager.request(`yomu:${normalizedStorageLeaseName(name)}`, operation) : operation();
}

function debugStorageError(message: string, key: string, error: unknown): void {
    if (typeof console !== 'undefined') console.debug('[Yomu] Storage', message, { key, error });
}
