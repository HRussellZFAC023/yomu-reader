import type { ReaderSettings } from '../app/types';
import { sensitiveFingerprint } from '../core/sensitive-fingerprint';
import { ankiFieldMappingsSettingsKey } from './field-mapping';
import { ankiMediaMimeType } from './card-details';
import type { AnkiStatusIndex, AnkiStatusIndexCardData } from './types';

const MEDIA_DATA_URL_CACHE_LIMIT = 64;

export interface AnkiStatusIndexRebuildContext {
    allCardIds: number[];
    cardData: AnkiStatusIndexCardData;
    noteIds: number[];
    now: number;
    rebuildLeaseOwner?: string;
    settings: ReaderSettings;
    settingsKey: string;
}

interface AnkiStatusIndexLoaderDependencies {
    current(): AnkiStatusIndex | null | undefined;
    store(index: AnkiStatusIndex | null | undefined): void;
    valid(index: AnkiStatusIndex | null | undefined): AnkiStatusIndex | null;
    synchronous(): AnkiStatusIndex | null;
    loadStored(): Promise<AnkiStatusIndex | null>;
    settingsKey(): string;
}

/** Owns account-bound status-index admission and latest in-flight loading. */
export class AccountBoundAnkiStatusIndexLoader {
    private inflight: Promise<AnkiStatusIndex | null> | undefined;

    constructor(private readonly dependencies: AnkiStatusIndexLoaderDependencies) {}

    clear(): void {
        this.inflight = undefined;
    }

    load(): Promise<AnkiStatusIndex | null> {
        const memory = this.fromMemory();
        if (memory) return memory;
        const synchronous = this.fromSynchronousStorage();
        if (synchronous) return synchronous;
        return this.inflight ?? this.beginLoad();
    }

    private fromMemory(): Promise<AnkiStatusIndex | null> | undefined {
        const stored = this.dependencies.current();
        if (stored === undefined) return undefined;
        const current = this.dependencies.valid(stored);
        if (current || stored === null) return Promise.resolve(current);
        this.dependencies.store(undefined);
        return undefined;
    }

    private fromSynchronousStorage(): Promise<AnkiStatusIndex> | undefined {
        const index = this.dependencies.valid(this.dependencies.synchronous());
        if (!index || index.entryStore === 'indexeddb') return undefined;
        this.dependencies.store(index);
        return Promise.resolve(index);
    }

    private beginLoad(): Promise<AnkiStatusIndex | null> {
        const settingsKey = this.dependencies.settingsKey();
        const load = this.dependencies.loadStored()
            .then(index => this.acceptCurrentAccount(index, settingsKey))
            .finally(() => {
                if (this.inflight === load) this.inflight = undefined;
            });
        this.inflight = load;
        return load;
    }

    private acceptCurrentAccount(index: AnkiStatusIndex | null, settingsKey: string): AnkiStatusIndex | null {
        if (settingsKey !== this.dependencies.settingsKey()) return null;
        this.dependencies.store(index);
        return index;
    }
}

export function shouldLoadAnkiFieldTargetPlan(ankiEnabled: boolean, mobileHandoff: boolean, userscriptBridge: boolean): boolean {
    return ankiEnabled && (!mobileHandoff || userscriptBridge);
}

export function currentAnkiFieldTargetPlan<T>(cache: { key: string; expiresAt: number; promise: Promise<T> } | undefined, key: string, now: number): Promise<T> | undefined {
    if (!cache || cache.key !== key || cache.expiresAt <= now) return undefined;
    return cache.promise;
}

export function ankiAccountContextKey(settings: ReaderSettings): string {
    return sensitiveFingerprint(JSON.stringify([
        settings.ankiConnectUrl.trim(),
        settings.activeLanguageProfileId,
    ]));
}

export function ankiStatusIndexSettingsKey(settings: ReaderSettings): string {
    const fieldMappings = ankiFieldMappingsSettingsKey(settings.ankiFieldMappings);
    return sensitiveFingerprint(JSON.stringify({
        account: ankiAccountContextKey(settings),
        ...(Object.keys(fieldMappings).length ? { fieldMappings } : {}),
    }));
}

export async function resolvedAnkiStatusIds(ids: number[] | null | undefined, load: () => Promise<number[]>): Promise<number[]> {
    return ids ?? await load();
}

/** Account-partitioned media payload cache; failures remain retryable. */
export class AnkiMediaDataUrlCache {
    private readonly values = new Map<string, Promise<string>>();

    constructor(
        private readonly accountContext: () => string,
        private readonly retrieve: (filename: string) => Promise<string | false>,
    ) {}

    clear(): void {
        this.values.clear();
    }

    async load(filename: string, notFoundMessage: string): Promise<string> {
        const cleanFilename = requiredMediaFilename(filename, notFoundMessage);
        const cacheKey = `${this.accountContext()}:${cleanFilename}`;
        const cached = this.values.get(cacheKey);
        if (cached) return cached;
        return this.loadAndRemember(cacheKey, cleanFilename, notFoundMessage);
    }

    private loadAndRemember(cacheKey: string, filename: string, notFoundMessage: string): Promise<string> {
        const promise = this.retrieve(filename)
            .then(data => mediaDataUrl(filename, data, notFoundMessage))
            .catch(error => {
                this.values.delete(cacheKey);
                throw error;
            });
        this.values.set(cacheKey, promise);
        this.evictOverflow();
        return promise;
    }

    private evictOverflow(): void {
        if (this.values.size <= MEDIA_DATA_URL_CACHE_LIMIT) return;
        const oldest = this.values.keys().next().value;
        if (oldest !== undefined) this.values.delete(oldest);
    }
}

function requiredMediaFilename(filename: string, notFoundMessage: string): string {
    const cleanFilename = filename.trim();
    if (!cleanFilename) throw new Error(notFoundMessage);
    return cleanFilename;
}

function mediaDataUrl(filename: string, data: string | false, notFoundMessage: string): string {
    if (!data) throw new Error(notFoundMessage);
    return `data:${ankiMediaMimeType(filename)};base64,${data}`;
}
