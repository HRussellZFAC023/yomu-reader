import { yomuWanikaniCompanion } from '../companions/registry';
import type { WanikaniClient as WanikaniClientImpl, WanikaniClientOptions } from './wanikani';

// Core-side facade for the Yomu WaniKani companion (ADR-0003 split). The API
// client, subject parsing, definition mounts, and SRS adapter only matter to
// users who connect a WaniKani token, so the suite ships as a companion
// library and core keeps these delegating shells. Without the companion the
// provider behaves exactly like an unconfigured one: no credential, no
// requests, no UI mounts.
class DisabledWanikaniClient {
    hasCredential(): boolean {
        return false;
    }
}

const CompanionBackedWanikaniClient = class {
    constructor(options: WanikaniClientOptions) {
        const Client = yomuWanikaniCompanion()?.WanikaniClient;
        return Client
            ? new Client(options)
            : new DisabledWanikaniClient() as unknown as WanikaniClientImpl;
    }
};

export { CompanionBackedWanikaniClient as WanikaniClient };
