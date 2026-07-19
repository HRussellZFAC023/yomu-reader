import { BunproClient } from '../bunpro/bunpro';
import { BunproWordStateStore, effectiveBunproWordState } from '../bunpro/word-states';
import { createBunproSrsAdapter } from '../srs/bunpro';
import { installBunproFrontendTokenImporter } from '../bunpro/frontend-token-importer';
import { lookupBunproDefinitionResult, renderBunproDefinitionSource } from '../bunpro/definition';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('bunpro', {
    BunproClient,
    BunproWordStateStore,
    createBunproSrsAdapter,
    effectiveBunproWordState,
    installBunproFrontendTokenImporter,
    lookupBunproDefinitionResult,
    renderBunproDefinitionSource,
});
