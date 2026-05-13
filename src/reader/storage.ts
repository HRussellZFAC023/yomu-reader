const MISSING = { missing: true };

export async function gmStorageGet<T>(key: string, fallback: T): Promise<T> {
    if (typeof GM_getValue === 'function') {
        try {
            const value = await GM_getValue<T | typeof MISSING>(key, MISSING);
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
    if (typeof GM_getValue === 'function') {
        try {
            const value = GM_getValue<T | typeof MISSING>(key, MISSING);
            if (!isPromiseLike(value)) {
                if (value !== MISSING) return value as T;
                const migrated = localStorageGet<T>(key, MISSING as T);
                if (migrated !== (MISSING as T)) {
                    void gmStorageSet(key, migrated);
                    return migrated;
                }
                return fallback;
            }
        } catch (error) {
            debugStorageError('GM storage sync read failed', key, error);
        }
    }
    return localStorageGet(key, fallback);
}

export async function gmStorageSet(key: string, value: unknown): Promise<void> {
    if (typeof GM_setValue === 'function') {
        await GM_setValue(key, value);
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
    if (typeof GM_deleteValue === 'function') {
        await GM_deleteValue(key);
        return;
    }
    try {
        localStorage.removeItem(key);
    } catch {
        // Ignore storage failures.
    }
}

export function gmStorageDeleteSync(key: string): void {
    if (typeof GM_deleteValue === 'function') {
        try {
            const result = GM_deleteValue(key);
            if (!isPromiseLike(result)) return;
        } catch (error) {
            debugStorageError('GM storage sync delete failed', key, error);
        }
    }
    try {
        localStorage.removeItem(key);
    } catch {
        // Ignore storage failures.
    }
}

export async function exportStoredValues(prefixes: string[]): Promise<Record<string, unknown>> {
    const keys = await storageKeys(prefixes);
    const entries = await Promise.all(keys.map(async key => [key, await gmStorageGet<unknown>(key, undefined)] as const));
    return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

export async function importStoredValues(values: unknown): Promise<number> {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return 0;
    let count = 0;
    for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
        if (!isManagedStorageKey(key)) continue;
        await gmStorageSet(key, value);
        count++;
    }
    return count;
}

async function storageKeys(prefixes: string[]): Promise<string[]> {
    const keys = new Set<string>();
    const listValues = (globalThis as { GM_listValues?: () => string[] | Promise<string[]> }).GM_listValues;
    if (typeof listValues === 'function') {
        try {
            for (const key of await listValues()) {
                if (prefixes.some(prefix => key.startsWith(prefix))) keys.add(key);
            }
        } catch (error) {
            debugStorageError('GM storage list failed', 'GM_listValues', error);
        }
    }
    try {
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index);
            if (key && prefixes.some(prefix => key.startsWith(prefix))) keys.add(key);
        }
    } catch {
        // Ignore localStorage enumeration failures.
    }
    return [...keys].sort();
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

function isPromiseLike(value: unknown): value is Promise<unknown> {
    return Boolean(value) && typeof (value as Promise<unknown>).then === 'function';
}

function isManagedStorageKey(key: string): boolean {
    return key.startsWith('yomu-')
        || key.startsWith('jpdb-reader-')
        || key.startsWith('jpdb-popup-reader-');
}

function debugStorageError(message: string, key: string, error: unknown): void {
    if (typeof console !== 'undefined') console.debug('[Yomu] Storage', message, { key, error });
}
