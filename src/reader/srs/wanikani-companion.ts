import { yomuWanikaniCompanion } from '../companions/registry';
import type { WanikaniClient } from '../wanikani/wanikani';
import type { createWanikaniSrsAdapter as createWanikaniSrsAdapterImpl } from './wanikani';
import type { YomuSrsAdapter } from './types';

// Core-side facade for the Yomu WaniKani companion (ADR-0003 split); see
// ../wanikani/wanikani-companion.ts. The inert adapter reports no credential,
// so provider selection skips WaniKani exactly as it does for a user who never
// pasted a token, instead of surfacing errors from a half-present provider.
const UNAVAILABLE = 'The Yomu WaniKani companion did not load.';

function disabledWanikaniSrsAdapter(): YomuSrsAdapter {
    return {
        id: 'wanikani',
        label: 'WaniKani',
        capabilities: { stats: false, queue: false, review: false, mine: false, import: false },
        hasCredential: () => false,
        verify: () => Promise.resolve(false),
        stats: () => Promise.reject(new Error(UNAVAILABLE)),
        queue: () => Promise.reject(new Error(UNAVAILABLE)),
        review: () => Promise.reject(new Error(UNAVAILABLE)),
        mine: () => Promise.reject(new Error(UNAVAILABLE)),
    };
}

export const createWanikaniSrsAdapter: typeof createWanikaniSrsAdapterImpl = (client: WanikaniClient) =>
    yomuWanikaniCompanion()?.createWanikaniSrsAdapter(client) ?? disabledWanikaniSrsAdapter();
