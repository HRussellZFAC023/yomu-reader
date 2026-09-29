import { yomuJpdbCompanion, type JpdbVocabularyClientInstance } from '../companions/registry';

class CompanionBackedJpdbVocabularyClient {
    private readonly client?: JpdbVocabularyClientInstance;

    constructor(getCorsProxyUrl: () => string = () => '') {
        const Client = yomuJpdbCompanion()?.JpdbVocabularyClient;
        this.client = Client ? new Client(getCorsProxyUrl) : undefined;
    }

    clear(): void { this.client?.clear(); }

    async lookup(...args: Parameters<JpdbVocabularyClientInstance['lookup']>) {
        if (!this.client) throw new Error('JPDB vocabulary companion is unavailable.');
        return this.client.lookup(...args);
    }

    async search(...args: Parameters<JpdbVocabularyClientInstance['search']>) {
        if (!this.client) throw new Error('JPDB vocabulary companion is unavailable.');
        return this.client.search(...args);
    }
}

export { CompanionBackedJpdbVocabularyClient as JpdbVocabularyClient };
