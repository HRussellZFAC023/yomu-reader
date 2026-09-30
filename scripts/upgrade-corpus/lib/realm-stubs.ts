// Realm stubs for the upgrade-corpus capture: storage APIs that behave like the
// real channels (Tampermonkey GM_*, the extension's compiled GM_* over a
// prefixed browser.storage.local, per-origin Web Storage) and record every
// write. Nothing here imports Yomu code, so the same stubs drive v1.8.80,
// v1.8.90 and v1.9.3 stages (see ../capture.mjs).
import { vi } from 'vitest';

export type StorageArea = 'gm' | 'extension';

export interface RecordedWrite {
    readonly area: StorageArea;
    readonly op: 'set' | 'delete';
    readonly key: string;
}

/** One persisted key/value area with an ordered write log. */
export interface RecordingStore {
    readonly area: StorageArea;
    readonly values: Map<string, unknown>;
    readonly writes: RecordedWrite[];
}

// The UserScript Compiler derives this from the userscript namespace; every
// shipped 1.9.x background declares exactly this literal (see
// scripts/lib/extension-dictionary-background.mjs in v1.9.3).
export const COMPILER_STORAGE_PREFIX = 'usc_https_github_com_HRussellZFAC023_yomu_reader_';
const EXTENSION_ORIGIN = 'moz-extension://2d7c0b8e-0000-4000-8000-00000000c0de';
export const EXTENSION_STUDY_URL = `${EXTENSION_ORIGIN}/newtab/index.html`;

export function createRecordingStore(area: StorageArea, initial: Record<string, unknown> = {}): RecordingStore {
    return { area, values: new Map(Object.entries(structuredClone(initial))), writes: [] };
}

export function storeSnapshot(store: RecordingStore): Record<string, unknown> {
    return Object.fromEntries([...store.values.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function jsonClone<T>(value: T): T {
    return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function recordSet(store: RecordingStore, key: string, value: unknown): void {
    store.values.set(key, jsonClone(value));
    store.writes.push({ area: store.area, op: 'set', key });
}

function recordDelete(store: RecordingStore, key: string): void {
    store.values.delete(key);
    store.writes.push({ area: store.area, op: 'delete', key });
}

export interface GmApiOptions {
    /** Physical key prefix (the compiled extension runtimes). */
    readonly prefix?: string;
    /** Packaged Study messages its background, so every GM_* call is a Promise. */
    readonly async?: boolean;
}

/**
 * Tampermonkey/Violentmonkey semantics by default: synchronous GM_* over a
 * JSON-cloned per-script store. A `prefix` models the extension's compiled
 * runtimes, which keep the same logical API over a prefixed
 * browser.storage.local namespace.
 */
export function installGmApi(store: RecordingStore, options: GmApiOptions = {}): void {
    const prefix = options.prefix ?? '';
    const answer = <T>(value: T): T | Promise<T> => (options.async ? Promise.resolve(value) : value);
    let nextListener = 1;
    vi.stubGlobal('GM_getValue', (key: string, fallback: unknown) => {
        const stored = `${prefix}${key}`;
        return answer(store.values.has(stored) ? jsonClone(store.values.get(stored)) : fallback);
    });
    vi.stubGlobal('GM_setValue', (key: string, value: unknown) => answer(recordSet(store, `${prefix}${key}`, value)));
    vi.stubGlobal('GM_deleteValue', (key: string) => answer(recordDelete(store, `${prefix}${key}`)));
    vi.stubGlobal('GM_listValues', () => answer([...store.values.keys()]
        .filter(key => key.startsWith(prefix))
        .map(key => key.slice(prefix.length))));
    vi.stubGlobal('GM_addValueChangeListener', () => nextListener++);
    vi.stubGlobal('GM_removeValueChangeListener', () => undefined);
}

/** browser.storage.local for an extension realm, over physical keys. */
function installExtensionStorageArea(store: RecordingStore): void {
    const area = {
        get: async (key: string | string[] | null) => {
            if (key === null) return Object.fromEntries([...store.values].map(([k, v]) => [k, jsonClone(v)]));
            const keys = Array.isArray(key) ? key : [key];
            return Object.fromEntries(keys.filter(k => store.values.has(k)).map(k => [k, jsonClone(store.values.get(k))]));
        },
        set: async (updates: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(updates)) recordSet(store, key, value);
        },
        remove: async (key: string | string[]) => {
            for (const k of Array.isArray(key) ? key : [key]) recordDelete(store, k);
        },
        getKeys: async () => [...store.values.keys()],
    };
    const onChanged = { addListener: () => undefined, removeListener: () => undefined };
    const api = {
        runtime: { id: 'yomu@yomureader.com', sendMessage: async () => ({}) },
        storage: { local: area, onChanged },
    };
    vi.stubGlobal('browser', api);
    vi.stubGlobal('chrome', api);
}

/**
 * Packaged Study (moz-extension://…/newtab/). The build's
 * extensionStudyStorageRuntimeSource installs GM_* that message the compiler
 * background, which stores under the same prefix as content scripts.
 */
export function installPackagedStudyRuntime(store: RecordingStore): void {
    installExtensionStorageArea(store);
    installGmApi(store, { prefix: COMPILER_STORAGE_PREFIX, async: true });
    vi.stubGlobal('__YOMU_EXTENSION_STORAGE_PREFIX__', COMPILER_STORAGE_PREFIX);
    vi.stubGlobal('__YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__', true);
}

/**
 * A compiled extension content script: the compiler's hydrated GM_* over the
 * prefixed namespace, plus the content-script view of browser.storage.local.
 */
export function installExtensionContentScript(store: RecordingStore): void {
    installExtensionStorageArea(store);
    installGmApi(store, { prefix: COMPILER_STORAGE_PREFIX });
}

export function setLocation(href: string): URL {
    const url = new URL(href);
    vi.stubGlobal('location', url);
    return url;
}

/** Seeds the realm's Web Storage from a recorded snapshot of one origin. */
function seedWebStorage(area: Storage, values: Record<string, string>): void {
    area.clear();
    for (const [key, value] of Object.entries(values)) area.setItem(key, value);
}

export function webStorageSnapshot(area: Storage): Record<string, string> {
    const keys = Array.from({ length: area.length }, (_, index) => area.key(index))
        .filter((key): key is string => key !== null)
        .sort();
    return Object.fromEntries(keys.map(key => [key, area.getItem(key) ?? '']));
}

/**
 * jsdom has one localStorage; real browsers keep one per origin. This keeps a
 * snapshot per origin and swaps it in whenever a stage moves the realm.
 */
export class OriginWebStorage {
    private readonly origins = new Map<string, Record<string, string>>();
    private current?: string;

    constructor(initial: Record<string, Record<string, string>> = {}) {
        for (const [origin, values] of Object.entries(initial)) this.origins.set(origin, { ...values });
    }

    enter(href: string): void {
        this.leave();
        const origin = new URL(href).origin;
        seedWebStorage(localStorage, this.origins.get(origin) ?? {});
        sessionStorage.clear();
        this.current = origin;
    }

    leave(): void {
        if (this.current) this.origins.set(this.current, webStorageSnapshot(localStorage));
        this.current = undefined;
    }

    snapshot(): Record<string, Record<string, string>> {
        if (this.current) this.origins.set(this.current, webStorageSnapshot(localStorage));
        return Object.fromEntries([...this.origins]
            .filter(([, values]) => Object.keys(values).length > 0)
            .sort(([a], [b]) => a.localeCompare(b)));
    }
}

export function prefixedPhysicalStore(logical: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(logical).map(([key, value]) => [`${COMPILER_STORAGE_PREFIX}${key}`, value]));
}

/** jsdom's Blob predates text()/arrayBuffer(); browsers have both. */
export function installBlobReaders(): void {
    const read = (blob: Blob, as: 'text' | 'buffer') => new Promise<string | ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string | ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        if (as === 'text') reader.readAsText(blob);
        else reader.readAsArrayBuffer(blob);
    });
    if (typeof Blob.prototype.text !== 'function') {
        Blob.prototype.text = function text(this: Blob) { return read(this, 'text') as Promise<string>; };
    }
    if (typeof Blob.prototype.arrayBuffer !== 'function') {
        Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) { return read(this, 'buffer') as Promise<ArrayBuffer>; };
    }
}
