import { activeLearningTarget } from '../languages/target-runtime';
import { createLocalDictionaryStore } from './local-store-factory';
import { installExtensionDictionaryBackgroundHost } from './extension-background-host';
import type { DictionaryRpcTarget } from './extension-rpc-protocol';
import { backgroundInterfaceLanguage, compiledStoragePrefix } from './extension-background-adapters';
import { installExtensionReviewQueueHost, type ReviewQueueExtensionRoot } from '../newtab/extension-review-queue-host';
import { installExtensionToolbarLabels } from '../app/extension-popup-actions';

installExtensionReviewQueueHost(globalThis as ReviewQueueExtensionRoot, compiledStoragePrefix);

installExtensionDictionaryBackgroundHost({
    createStore: createLocalDictionaryStore,
    resolveTarget: validatedTarget,
    adoptTarget: validatedTarget,
});

installExtensionToolbarLabels(backgroundInterfaceLanguage);

function validatedTarget(target: DictionaryRpcTarget): unknown {
    const module = activeLearningTarget();
    if (module.id !== target.id
        || module.interfaceVersion !== target.interfaceVersion) {
        throw new Error(`Dictionary RPC learning target is unavailable: ${target.id}.`);
    }
    return module;
}
