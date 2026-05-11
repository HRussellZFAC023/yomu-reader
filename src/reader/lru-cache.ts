import { Logger } from './logger';

const log = Logger.scope('LruCache');

export class LruCache<K, V> {
    private map = new Map<K, V>();

    constructor(private maxSize: number) {}

    get(key: K): V | undefined {
        const value = this.map.get(key);
        if (value !== undefined) {
            this.map.delete(key);
            this.map.set(key, value);
            log.debugThrottled('cache-hit', 1000, 'LRU cache hit', { size: this.map.size, maxSize: this.maxSize });
        } else {
            log.debugThrottled('cache-miss', 1000, 'LRU cache miss', { size: this.map.size, maxSize: this.maxSize });
        }
        return value;
    }

    set(key: K, value: V): void {
        this.map.delete(key);
        this.map.set(key, value);
        if (this.map.size > this.maxSize) {
            const oldest = this.map.keys().next().value;
            if (oldest !== undefined) {
                this.map.delete(oldest);
                log.debug('LRU cache evicted oldest entry', { size: this.map.size, maxSize: this.maxSize });
            }
        }
    }

    clear(): void {
        this.map.clear();
        log.debug('LRU cache cleared', { maxSize: this.maxSize });
    }
}
