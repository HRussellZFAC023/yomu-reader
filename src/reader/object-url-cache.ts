import { Logger } from './logger';

interface CachedObjectUrl {
    expiresAt: number;
    promise: Promise<string>;
    timeoutId?: number;
    url?: string;
}

const log = Logger.scope('ObjectUrlCache');

export class ObjectUrlCache {
    private entries = new Map<string, CachedObjectUrl>();

    constructor(private ttlMs: number, private label: string) {}

    getOrCreate(key: string, createUrl: () => Promise<string>): Promise<string> {
        const now = Date.now();
        const cached = this.entries.get(key);
        if (cached && cached.expiresAt > now) {
            log.debug('Object URL cache hit', { label: this.label });
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
        if (entry.url?.startsWith('blob:')) URL.revokeObjectURL(entry.url);
    }
}
