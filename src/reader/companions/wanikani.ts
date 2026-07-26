import { WanikaniClient } from '../wanikani/wanikani';
import { WanikaniLookupClient } from '../wanikani/wanikani-lookup';
import { renderWanikaniDefinitionMount, WanikaniSourceController } from '../wanikani/wanikani-source';
import { createWanikaniSrsAdapter } from '../srs/wanikani';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('wanikani', {
    WanikaniClient,
    WanikaniLookupClient,
    WanikaniSourceController,
    renderWanikaniDefinitionMount,
    createWanikaniSrsAdapter,
});
