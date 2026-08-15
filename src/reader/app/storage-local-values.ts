export function localStorageGet<T>(key: string, fallback: T): T {
    try {
        const value = localStorage.getItem(key);
        return value == null ? fallback : JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

export function localStorageSet(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Best effort only. Durability-sensitive callers use localStorageSetOrThrow.
    }
}

export function removeLocalStorageKey(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // Best effort only.
    }
}

export function removeSessionStorageKey(key: string): void {
    try {
        sessionStorage.removeItem(key);
    } catch {
        // Best effort only.
    }
}

export function webStorageHasKey(storage: Storage, key: string): boolean {
    try {
        return storage.getItem(key) !== null;
    } catch {
        return false;
    }
}

export function localStorageSetOrThrow(key: string, value: unknown): string {
    try {
        const serialized = JSON.stringify(value);
        if (serialized === undefined) throw new Error('value is not JSON-serializable');
        localStorage.setItem(key, serialized);
        if (localStorage.getItem(key) !== serialized) throw new Error('read-back did not match');
        return serialized;
    } catch (error) {
        throw storageWriteError(key, 'localStorage write failed', error);
    }
}

export function storageWriteError(key: string, message: string, ...causes: unknown[]): Error {
    const details = causes
        .map(cause => cause instanceof Error ? cause.message : String(cause))
        .filter(Boolean)
        .join('; ');
    return new Error(`${message} for "${key}"${details ? `: ${details}` : ''}`);
}
