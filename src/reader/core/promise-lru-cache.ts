/** A bounded session cache that also shares in-flight reads by key. */
export class PromiseLruCache<Key, Value> {
    private readonly entries = new Map<Key, Promise<Value>>();

    constructor(private readonly maxSize: number) {}

    getOrLoad(key: Key, load: () => Promise<Value>): Promise<Value> {
        const cached = this.entries.get(key);
        if (cached) {
            this.entries.delete(key);
            this.entries.set(key, cached);
            return cached;
        }

        const promise = load();
        this.entries.set(key, promise);
        this.prune();
        void promise.catch(() => {
            if (this.entries.get(key) === promise) this.entries.delete(key);
        });
        return promise;
    }

    clear(): void {
        this.entries.clear();
    }

    private prune(): void {
        while (this.entries.size > Math.max(1, this.maxSize)) {
            const oldest = this.entries.keys().next().value;
            if (oldest === undefined) return;
            this.entries.delete(oldest);
        }
    }
}
