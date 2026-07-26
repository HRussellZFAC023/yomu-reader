import { JpdbClient } from '../jpdb/jpdb';
import { JpdbVocabularyClient } from '../jpdb/jpdb-vocabulary';
import { JpdbPublicPitchClient } from '../jpdb/jpdb-public-pitch';
import { initJpdbReviewPageBridge } from '../jpdb/jpdb-review-bridge';
import { renderJpdbDefinitionSource } from '../jpdb/jpdb-definition-source-render';
import { renderedJpdbRelatedWords } from '../jpdb/jpdb-related-words';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('jpdb', {
    JpdbClient,
    JpdbVocabularyClient,
    JpdbPublicPitchClient,
    initJpdbReviewPageBridge,
    renderJpdbDefinitionSource,
    renderedJpdbRelatedWords,
});
