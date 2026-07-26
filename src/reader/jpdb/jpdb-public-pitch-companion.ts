import { yomuJpdbCompanion, type JpdbPublicPitchClientInstance } from '../companions/registry';

// Core-side facade for the Yomu JPDB companion (ADR-0003 split); see
// jpdb-companion.ts. Keyless pitch-pattern scraping from jpdb.io ships with
// the rest of the JPDB suite. Without the companion the lookup yields no
// patterns, which is exactly what a failed or disabled fetch already yields —
// the word still renders, just without JPDB-sourced pitch.
class DisabledJpdbPublicPitchClient {
    lookup(): Promise<string[]> {
        return Promise.resolve([]);
    }
}

const CompanionBackedJpdbPublicPitchClient = class {
    constructor(getCorsProxyUrl: () => string = () => '') {
        const Client = yomuJpdbCompanion()?.JpdbPublicPitchClient;
        return Client
            ? new Client(getCorsProxyUrl)
            : new DisabledJpdbPublicPitchClient() as unknown as JpdbPublicPitchClientInstance;
    }
};

export { CompanionBackedJpdbPublicPitchClient as JpdbPublicPitchClient };
