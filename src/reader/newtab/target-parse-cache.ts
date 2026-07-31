import type { JPDBToken, ReaderSettings } from '../app/types';
import { activeLearningTargetGeneration, activeLearningTargetLanguage } from '../languages/target-runtime';
import { parseContentCacheKey } from '../lookup/parse-content-cache-key';
import type { ReaderParser } from '../lookup/parser';
import { usesJapaneseProviders } from '../languages/character-lookup';

export interface NewTabParseContentOptions {
    jpdbTimeoutMs?: number;
    allowJpdbTimeoutFallback?: boolean;
}

interface TargetParseCacheDependencies {
    readonly getSettings: () => ReaderSettings;
    readonly parse: ReaderParser['parse'];
    readonly defaultTimeoutMs: number;
    readonly ttlMs: number;
    readonly limit: number;
}

/** Bounded parse cache whose identity includes the active learning-target epoch. */
export class NewTabTargetParseCache {
    private readonly entries = new Map<string, { expiresAt: number; promise: Promise<JPDBToken[][]> }>();

    constructor(private readonly dependencies: TargetParseCacheDependencies) {}

    clear(): void {
        this.entries.clear();
    }

    load(texts: string[], options: NewTabParseContentOptions = {}, publicJitenDetailLimit?: number): Promise<JPDBToken[][]> {
        const allowJapaneseProviders = usesJapaneseProviders();
        const parseOptions = {
            jpdbTimeoutMs: options.jpdbTimeoutMs ?? this.dependencies.defaultTimeoutMs,
            allowJpdbTimeoutFallback: options.allowJpdbTimeoutFallback ?? false,
            includeLocalPitch: false,
            allowSegmentedFallback: true,
            skipApi: !allowJapaneseProviders,
            ...(allowJapaneseProviders && publicJitenDetailLimit !== undefined ? { publicJitenDetailLimit } : {}),
        };
        const key = parseContentCacheKey(texts, {
            ...parseOptions,
            targetLanguage: activeLearningTargetLanguage(),
            targetGeneration: activeLearningTargetGeneration(),
        }, this.dependencies.getSettings());
        const now = Date.now();
        const cached = this.entries.get(key);
        if (cached?.expiresAt && cached.expiresAt > now) {
            this.entries.delete(key);
            this.entries.set(key, cached);
            return cached.promise;
        }
        if (cached) this.entries.delete(key);
        const promise = this.dependencies.parse(texts, parseOptions).catch(error => {
            if (this.entries.get(key)?.promise === promise) this.entries.delete(key);
            throw error;
        });
        this.entries.set(key, { expiresAt: now + this.dependencies.ttlMs, promise });
        this.prune(now);
        return promise;
    }

    private prune(now: number): void {
        for (const [key, entry] of this.entries) {
            if (entry.expiresAt <= now) this.entries.delete(key);
        }
        while (this.entries.size > this.dependencies.limit) {
            const oldest = this.entries.keys().next().value;
            if (typeof oldest !== 'string') break;
            this.entries.delete(oldest);
        }
    }
}
