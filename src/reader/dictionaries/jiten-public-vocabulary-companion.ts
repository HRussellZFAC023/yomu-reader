import { yomuJitenCompanion, type JitenPublicVocabularyClientInstance } from '../companions/registry';
import type {
    JitenPublicVocabularyClientOptions,
    parsedCardHydrationKey as parsedCardHydrationKeyImpl,
    publicJitenBackoffRemainingMs as publicJitenBackoffRemainingMsImpl,
} from './jiten-public-vocabulary';

// Core-side facade for the Yomu Jiten companion (ADR-0003 split). The keyless
// api.jiten.moe client — chunked parse batching, per-word detail hydration,
// the shared endpoint backoff and its persistent caches — is a self-contained
// network surface, so it ships as a companion library and core keeps this
// delegating shell inside the Greasy Fork budget. Without the companion every
// public lookup answers "nothing found", which is the same result the client
// already returns while its backoff is active.
class DisabledJitenPublicVocabularyClient {
    lookup(): Promise<null> {
        return Promise.resolve(null);
    }

    lookupMany(): Promise<Map<string, never>> {
        return Promise.resolve(new Map<string, never>());
    }

    parse(): Promise<never[]> {
        return Promise.resolve([]);
    }

    hydrateCards(): Promise<Map<string, never>> {
        return Promise.resolve(new Map<string, never>());
    }

    clear(): void {}
}

const CompanionBackedJitenPublicVocabularyClient = class {
    constructor(options: JitenPublicVocabularyClientOptions = {}) {
        const Client = yomuJitenCompanion()?.JitenPublicVocabularyClient;
        return Client
            ? new Client(options)
            : new DisabledJitenPublicVocabularyClient() as unknown as JitenPublicVocabularyClientInstance;
    }
};

// Background hydration timeout. Held as a literal because core reads it as a
// plain value and must not pull the implementation module back into the
// size-limited bundle; tests/reader/companion-split-facades.test.ts fails if
// it ever drifts from jiten-public-vocabulary.ts.
export const JITEN_BACKGROUND_DETAIL_TIMEOUT_MS = 4000;

export const parsedCardHydrationKey: typeof parsedCardHydrationKeyImpl = card =>
    yomuJitenCompanion()?.parsedCardHydrationKey?.(card) ?? `${card.vid}:${card.sid}`;

export const publicJitenBackoffRemainingMs: typeof publicJitenBackoffRemainingMsImpl = () =>
    yomuJitenCompanion()?.publicJitenBackoffRemainingMs?.() ?? 0;

export { CompanionBackedJitenPublicVocabularyClient as JitenPublicVocabularyClient };
