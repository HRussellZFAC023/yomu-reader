import catalogJson from '../../../../config/dictionaries/published/v1/catalog.json';
import arRecommendations from '../../../../config/dictionaries/published/v1/recommendations/ar-ja.json';
import daRecommendations from '../../../../config/dictionaries/published/v1/recommendations/da-ja.json';
import deRecommendations from '../../../../config/dictionaries/published/v1/recommendations/de-ja.json';
import elRecommendations from '../../../../config/dictionaries/published/v1/recommendations/el-ja.json';
import enRecommendations from '../../../../config/dictionaries/published/v1/recommendations/en-ja.json';
import esRecommendations from '../../../../config/dictionaries/published/v1/recommendations/es-ja.json';
import faRecommendations from '../../../../config/dictionaries/published/v1/recommendations/fa-ja.json';
import fiRecommendations from '../../../../config/dictionaries/published/v1/recommendations/fi-ja.json';
import frRecommendations from '../../../../config/dictionaries/published/v1/recommendations/fr-ja.json';
import grcRecommendations from '../../../../config/dictionaries/published/v1/recommendations/grc-ja.json';
import huRecommendations from '../../../../config/dictionaries/published/v1/recommendations/hu-ja.json';
import idRecommendations from '../../../../config/dictionaries/published/v1/recommendations/id-ja.json';
import itRecommendations from '../../../../config/dictionaries/published/v1/recommendations/it-ja.json';
import kmRecommendations from '../../../../config/dictionaries/published/v1/recommendations/km-ja.json';
import koRecommendations from '../../../../config/dictionaries/published/v1/recommendations/ko-ja.json';
import laRecommendations from '../../../../config/dictionaries/published/v1/recommendations/la-ja.json';
import loRecommendations from '../../../../config/dictionaries/published/v1/recommendations/lo-ja.json';
import mnRecommendations from '../../../../config/dictionaries/published/v1/recommendations/mn-ja.json';
import nlRecommendations from '../../../../config/dictionaries/published/v1/recommendations/nl-ja.json';
import plRecommendations from '../../../../config/dictionaries/published/v1/recommendations/pl-ja.json';
import ptRecommendations from '../../../../config/dictionaries/published/v1/recommendations/pt-ja.json';
import roRecommendations from '../../../../config/dictionaries/published/v1/recommendations/ro-ja.json';
import ruRecommendations from '../../../../config/dictionaries/published/v1/recommendations/ru-ja.json';
import shRecommendations from '../../../../config/dictionaries/published/v1/recommendations/sh-ja.json';
import sqRecommendations from '../../../../config/dictionaries/published/v1/recommendations/sq-ja.json';
import svRecommendations from '../../../../config/dictionaries/published/v1/recommendations/sv-ja.json';
import thRecommendations from '../../../../config/dictionaries/published/v1/recommendations/th-ja.json';
import tlRecommendations from '../../../../config/dictionaries/published/v1/recommendations/tl-ja.json';
import trRecommendations from '../../../../config/dictionaries/published/v1/recommendations/tr-ja.json';
import viRecommendations from '../../../../config/dictionaries/published/v1/recommendations/vi-ja.json';
import yueRecommendations from '../../../../config/dictionaries/published/v1/recommendations/yue-ja.json';
import zhRecommendations from '../../../../config/dictionaries/published/v1/recommendations/zh-ja.json';
import { assertRecommendationReferencesCatalog, parseDictionaryCatalogManifest, parseDictionaryRecommendationManifest } from './schema';
import { SLICE1_LEARNER_LANGUAGES, type DictionaryCatalogManifest, type DictionaryRecommendationManifest, type Slice1LearnerLanguage } from './types';

const RECOMMENDATION_JSON_BY_LANGUAGE: Readonly<Record<Slice1LearnerLanguage, unknown>> = {
    sq: sqRecommendations,
    grc: grcRecommendations,
    ar: arRecommendations,
    yue: yueRecommendations,
    zh: zhRecommendations,
    da: daRecommendations,
    nl: nlRecommendations,
    en: enRecommendations,
    fi: fiRecommendations,
    fr: frRecommendations,
    de: deRecommendations,
    el: elRecommendations,
    hu: huRecommendations,
    id: idRecommendations,
    it: itRecommendations,
    km: kmRecommendations,
    ko: koRecommendations,
    lo: loRecommendations,
    la: laRecommendations,
    mn: mnRecommendations,
    fa: faRecommendations,
    pl: plRecommendations,
    pt: ptRecommendations,
    ro: roRecommendations,
    ru: ruRecommendations,
    sh: shRecommendations,
    es: esRecommendations,
    sv: svRecommendations,
    tl: tlRecommendations,
    th: thRecommendations,
    tr: trRecommendations,
    vi: viRecommendations,
};

/**
 * These manifests are deliberately eager imports. A missing language file,
 * stale catalogue revision, or unknown dictionary reference therefore fails a
 * test/build instead of becoming a production-only Settings error.
 */
export const FROZEN_DICTIONARY_CATALOG: DictionaryCatalogManifest = parseDictionaryCatalogManifest(catalogJson);

export const FROZEN_DICTIONARY_RECOMMENDATIONS: Readonly<Record<Slice1LearnerLanguage, DictionaryRecommendationManifest>> = Object.freeze(
    Object.fromEntries(
        SLICE1_LEARNER_LANGUAGES.map(language => {
            const manifest = parseDictionaryRecommendationManifest(RECOMMENDATION_JSON_BY_LANGUAGE[language]);
            if (manifest.learnerLanguage !== language) {
                throw new Error(`Dictionary recommendation manifest ${language}-ja declares ${manifest.learnerLanguage}.`);
            }
            assertRecommendationReferencesCatalog(manifest, FROZEN_DICTIONARY_CATALOG);
            return [language, manifest];
        }),
    ) as Record<Slice1LearnerLanguage, DictionaryRecommendationManifest>,
);
