import './style.css';

import type { ActivityPlugin } from '../../domain/activity-runtime';
import { gradePhraseKaruta, phraseKarutaReviewSeeds, validatePhraseKaruta } from './engine';
import { PHRASE_KARUTA_KIND, type PhraseKarutaModel, type PhraseKarutaResponse } from './manifest';
import { renderPhraseKaruta } from './view';

export const phraseKarutaPlugin: ActivityPlugin<PhraseKarutaModel, PhraseKarutaResponse> = {
    kind: PHRASE_KARUTA_KIND,
    validate: validatePhraseKaruta,
    render: renderPhraseKaruta,
    grade: gradePhraseKaruta,
    toReviewSeeds: phraseKarutaReviewSeeds,
};

export * from './engine';
export * from './manifest';
