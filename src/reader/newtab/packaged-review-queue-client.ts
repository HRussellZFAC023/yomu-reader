import { assertManagedStateMutationAllowed } from '../app/storage';
import type { ManagedStateEpoch } from '../app/managed-state-epoch';
import { ExtensionReviewQueueClient } from './extension-review-queue-client';
import { managedSessionStorage } from '../app/managed-web-storage';

export const REVIEW_ACTION_DRAFT_KEY = 'yomu:review-action-draft:v2';

interface ReviewQueueRuntime {
    id?: string;
    getURL(path: string): string;
    sendMessage(message: unknown): Promise<unknown>;
}

export interface PackagedReviewEnvironment {
    location: Pick<Location, 'href' | 'protocol'>;
    sessionStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
    browser?: { runtime?: ReviewQueueRuntime };
    chrome?: { runtime?: ReviewQueueRuntime };
}

export function createPackagedReviewQueueClient(
    root: PackagedReviewEnvironment = globalThis as unknown as PackagedReviewEnvironment,
    currentEpoch: () => Promise<ManagedStateEpoch> = assertManagedStateMutationAllowed,
    storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = managedSessionStorage,
): ExtensionReviewQueueClient | null {
    if (!root.location || !/^(?:moz|chrome|safari-web)-extension:$/u.test(root.location.protocol)) return null;
    const runtime = root.browser?.runtime ?? root.chrome?.runtime;
    if (!runtime?.id || typeof runtime.getURL !== 'function' || typeof runtime.sendMessage !== 'function') {
        throw new Error('Packaged review queue runtime is unavailable.');
    }
    if (root.location.href.split(/[?#]/u)[0] !== runtime.getURL('newtab/index.html')) {
        return null;
    }
    return new ExtensionReviewQueueClient(message => runtime.sendMessage(message), currentEpoch, {
        read: () => {
            const saved = storage.getItem(REVIEW_ACTION_DRAFT_KEY);
            return saved === null ? null : JSON.parse(saved);
        },
        write: draft => {
            const saved = JSON.stringify(draft);
            storage.setItem(REVIEW_ACTION_DRAFT_KEY, saved);
            if (storage.getItem(REVIEW_ACTION_DRAFT_KEY) !== saved) throw new Error('Review action draft could not be saved.');
        },
        clear: () => {
            storage.removeItem(REVIEW_ACTION_DRAFT_KEY);
            if (storage.getItem(REVIEW_ACTION_DRAFT_KEY) !== null) throw new Error('Review action draft could not be cleared.');
        },
    });
}
