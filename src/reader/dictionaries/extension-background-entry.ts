import { adoptLearningTargetLanguage, learningTargetModuleFor } from '../languages/target-runtime';
import { YomitanDictionaryStore } from './yomitan/index';
import { installExtensionDictionaryBackgroundHost } from './extension-background-host';
import type { DictionaryRpcTarget } from './extension-rpc-protocol';
import { compiledStoragePrefix } from './extension-background-adapters';
import { installExtensionReviewQueueHost, type ReviewQueueExtensionRoot } from '../newtab/extension-review-queue-host';

installExtensionReviewQueueHost(globalThis as ReviewQueueExtensionRoot, compiledStoragePrefix);

installExtensionDictionaryBackgroundHost({
    createStore: (getCorsProxyUrl, getInterfaceLanguage) => (
        new YomitanDictionaryStore(getCorsProxyUrl, getInterfaceLanguage)
    ),
    resolveTarget: target => validatedTarget(target, false),
    adoptTarget: target => validatedTarget(target, true),
});

function validatedTarget(target: DictionaryRpcTarget, adopt: boolean): unknown {
    const module = adopt
        ? adoptLearningTargetLanguage(target.language)
        : learningTargetModuleFor(target.language);
    if (!module
        || module.id !== target.id
        || module.interfaceVersion !== target.interfaceVersion) {
        throw new Error(`Dictionary RPC learning target is unavailable: ${target.id}.`);
    }
    return module;
}
