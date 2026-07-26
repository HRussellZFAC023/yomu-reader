import { yomuWanikaniCompanion } from '../companions/registry';
import type { WanikaniClient } from './wanikani';
import type { WanikaniLookupClient as WanikaniLookupClientImpl } from './wanikani-lookup';

// Core-side facade for the Yomu WaniKani companion (ADR-0003 split); see
// wanikani-companion.ts. Lookups resolve to "nothing found" without the
// companion so definition stacks render their remaining sources.
class DisabledWanikaniLookupClient {
    lookupCard(): Promise<null> {
        return Promise.resolve(null);
    }

    lookupKanji(): Promise<null> {
        return Promise.resolve(null);
    }
}

const CompanionBackedWanikaniLookupClient = class {
    constructor(client: WanikaniClient) {
        const LookupClient = yomuWanikaniCompanion()?.WanikaniLookupClient;
        return LookupClient
            ? new LookupClient(client)
            : new DisabledWanikaniLookupClient() as unknown as WanikaniLookupClientImpl;
    }
};

export { CompanionBackedWanikaniLookupClient as WanikaniLookupClient };
