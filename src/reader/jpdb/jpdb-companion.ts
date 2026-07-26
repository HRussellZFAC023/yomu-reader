import { yomuJpdbCompanion, type JpdbClientInstance } from '../companions/registry';

// Core-side facade for the Yomu JPDB companion (ADR-0003 split). The API
// client — parse batching, deck listing/mutation, review submission, card
// caches — only runs for users who paste a JPDB API key, so the suite ships as
// a companion library and core keeps this delegating shell inside the Greasy
// Fork budget. Without the companion every entry point resolves to the same
// answer an empty API key gives: nothing parsed, no decks, no grades sent, and
// never a throw.
class DisabledJpdbClient {
    parse(): Promise<never[]> {
        return Promise.resolve([]);
    }

    reviewCard(): Promise<void> {
        return Promise.resolve();
    }

    addToDeck(): Promise<void> {
        return Promise.resolve();
    }

    listDecks(): Promise<never[]> {
        return Promise.resolve([]);
    }

    ping(): Promise<boolean> {
        return Promise.resolve(false);
    }

    listDeckCards(): Promise<never[]> {
        return Promise.resolve([]);
    }

    isInUserDeckPool(): Promise<boolean> {
        return Promise.resolve(false);
    }

    removeFromDeck(): Promise<void> {
        return Promise.resolve();
    }

    getCard(): undefined {
        return undefined;
    }

    clear(): void {}

    refreshCardState(): Promise<void> {
        return Promise.resolve();
    }
}

const CompanionBackedJpdbClient = class {
    constructor(getApiKey: () => string, getProxyUrl: () => string = () => '') {
        const Client = yomuJpdbCompanion()?.JpdbClient;
        return Client
            ? new Client(getApiKey, getProxyUrl)
            : new DisabledJpdbClient() as unknown as JpdbClientInstance;
    }
};

export { CompanionBackedJpdbClient as JpdbClient };
