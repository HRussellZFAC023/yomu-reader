import { yomuJpdbCompanion, type JpdbVocabularyClientInstance } from '../companions/registry';

// Core-side facade for the Yomu JPDB companion (ADR-0003 split); see
// jpdb-companion.ts. The keyless jpdb.io vocabulary scraper (page fetching,
// HTML parsing, compound/example extraction, linked-audio enrichment) only
// runs when a JPDB definition card or public fallback lookup is opened, so it
// ships with the companion. Without it a JPDB lookup simply finds nothing.
class DisabledJpdbVocabularyClient {
    clear(): void {}

    lookup(): Promise<null> {
        return Promise.resolve(null);
    }

    search(): Promise<never[]> {
        return Promise.resolve([]);
    }
}

const CompanionBackedJpdbVocabularyClient = class {
    constructor(getCorsProxyUrl: () => string = () => '') {
        const Client = yomuJpdbCompanion()?.JpdbVocabularyClient;
        return Client
            ? new Client(getCorsProxyUrl)
            : new DisabledJpdbVocabularyClient() as unknown as JpdbVocabularyClientInstance;
    }
};

export { CompanionBackedJpdbVocabularyClient as JpdbVocabularyClient };
export type { JpdbVocabularyInfo } from './jpdb-vocabulary-types';
