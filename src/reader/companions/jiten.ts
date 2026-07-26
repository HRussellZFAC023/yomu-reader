import {
    JITEN_BACKGROUND_DETAIL_TIMEOUT_MS,
    JitenPublicVocabularyClient,
    parsedCardHydrationKey,
    publicJitenBackoffRemainingMs,
} from '../dictionaries/jiten-public-vocabulary';
import { renderJitenDefinitionSource } from '../jiten/jiten-definition-source-render';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('jiten', {
    JitenPublicVocabularyClient,
    JITEN_BACKGROUND_DETAIL_TIMEOUT_MS,
    parsedCardHydrationKey,
    publicJitenBackoffRemainingMs,
    renderJitenDefinitionSource,
});
