import { activeLearningTarget } from '../languages/target-runtime';
import { createLocalDictionaryStore } from './local-store-factory';
import { installExtensionDictionaryBackgroundHost } from './extension-background-host';
import type { DictionaryRpcTarget } from './extension-rpc-protocol';
import { compiledStoragePrefix } from './extension-background-adapters';
import { installExtensionReviewQueueHost, type ReviewQueueExtensionRoot } from '../newtab/extension-review-queue-host';

installExtensionReviewQueueHost(globalThis as ReviewQueueExtensionRoot, compiledStoragePrefix);

installExtensionDictionaryBackgroundHost({
    createStore: createLocalDictionaryStore,
    resolveTarget: validatedTarget,
    adoptTarget: validatedTarget,
});

function validatedTarget(target: DictionaryRpcTarget): unknown {
    const module = activeLearningTarget();
    if (module.id !== target.id
        || module.interfaceVersion !== target.interfaceVersion) {
        throw new Error(`Dictionary RPC learning target is unavailable: ${target.id}.`);
    }
    return module;
}
