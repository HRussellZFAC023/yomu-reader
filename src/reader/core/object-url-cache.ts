interface CachedObjectUrl {
    expiresAt: number;
    promise: Promise<string>;
    timeoutId?: number;
    url?: string;
}

function revokeBlobObjectUrl(url: string): void {
    if (url.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
}

export class ObjectUrlCache {
    private entries = new Map<string, CachedObjectUrl>();

    // `revoke` lets callers release side-channel state tied to the URL (e.g. the
    // retained Blob the Web Audio CSP fallback reads), not just the object URL.
    constructor(private ttlMs: number, private revoke: (url: string) => void = revokeBlobObjectUrl) {}

    getOrCreate(key: string, createUrl: () => Promise<string>): Promise<string> {
        const now = Date.now();
        const cached = this.entries.get(key);
        if (cached && cached.expiresAt > now) {
            return cached.promise;
        }

        if (cached) this.delete(key);

        const entry: CachedObjectUrl = {
            expiresAt: now + this.ttlMs,
            promise: Promise.resolve()
                .then(createUrl)
                .then(url => {
                    entry.url = url;
                    entry.timeoutId = window.setTimeout(() => this.expire(key, entry), this.ttlMs);
                    return url;
                })
                .catch(error => {
                    if (this.entries.get(key) === entry) this.entries.delete(key);
                    throw error;
                }),
        };
        this.entries.set(key, entry);
        return entry.promise;
    }

    clear(): void {
        for (const key of this.entries.keys()) {
            this.delete(key);
        }
    }

    private expire(key: string, entry: CachedObjectUrl): void {
        if (this.entries.get(key) !== entry) return;
        this.delete(key);
    }

    private delete(key: string): void {
        const entry = this.entries.get(key);
        if (!entry) return;
        if (entry.timeoutId !== undefined) window.clearTimeout(entry.timeoutId);
        this.entries.delete(key);
        if (entry.url !== undefined) this.revoke(entry.url);
    }
}
