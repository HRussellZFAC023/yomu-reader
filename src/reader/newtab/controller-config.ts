import type { CardState } from '../app/types';
import type { NewTabConcreteSource } from './source';

export { CARD_STATE_LABEL_KEYS as SEARCH_CARD_STATE_LABEL_KEYS } from '../app/i18n';

export const NEW_TAB_WORD_STATE_CLASSES: CardState[] = [
    'new',
    'learning',
    'young',
    'mature',
    'known',
    'mastered',
    'due',
    'failed',
    'locked',
    'never-forget',
    'blacklisted',
    'suspended',
    'in-deck',
    'not-in-deck',
    'redundant',
    'frequent',
    'unparsed',
];

export const NEW_TAB_SOURCE_LABELS: Record<NewTabConcreteSource, string> = {
    jpdb: 'JPDB',
    anki: 'Anki',
    dictionary: 'Dictionary',
};

export const SESSION_WORD_KEY = 'jpdb-reader-newtab-current-word';
export const JPDB_ALL_DECKS = 'all';
export const JPDB_DECK_SAMPLE_LIMIT = 6;
export const NEW_TAB_WORD_LIMIT = 180;
export const NEW_TAB_FALLBACK_SUPPLEMENT_MIN = 12;
export const NEW_TAB_DICTIONARY_FALLBACK_RANKS = [2000, 6000] as const;
export const NEW_TAB_NAVIGATION_DEDUPE_MS = 550;
export const NEW_TAB_SEARCH_DEBOUNCE_MS = 220;
export const NEW_TAB_SEARCH_WORD_LIMIT = 10;
export const NEW_TAB_SEARCH_KANJI_LIMIT = 6;
export const NEW_TAB_SEARCH_SUGGESTION_LIMIT = 6;
export const NEW_TAB_LOCAL_SEARCH_CANDIDATE_LIMIT = 96;
export const NEW_TAB_LOCAL_SEARCH_INDEX_MAX_ROWS = 2500;
export const NEW_TAB_LOCAL_SEARCH_INDEX_MAX_MS = 90;
export const NEW_TAB_LOCAL_SEARCH_FALLBACK_MAX_ROWS = 4000;
export const NEW_TAB_LOCAL_SEARCH_FALLBACK_MAX_MS = 80;
export const NEW_TAB_LOCAL_SEARCH_TIMEOUT_MS = 450;
export const NEW_TAB_PUBLIC_SEARCH_TIMEOUT_MS = 2500;
export const NEW_TAB_PUBLIC_JPDB_LOCAL_SEED_LIMIT = 24;
export const NEW_TAB_PUBLIC_JPDB_KANJI_FALLBACK_LIMIT = 5;
export const NEW_TAB_PUBLIC_JPDB_WORD_FALLBACK_LIMIT = 2;
export const NEW_TAB_PUBLIC_JPDB_CONCURRENCY = 4;
export const NEW_TAB_DICTIONARY_RANDOM_MAX_ROWS = 16000;
export const NEW_TAB_DICTIONARY_RANDOM_MAX_MS = 180;
export const NEW_TAB_DICTIONARY_TOP_MAX_ROWS = 22000;
export const NEW_TAB_DICTIONARY_TOP_MAX_MS = 240;
export const NEW_TAB_DICTIONARY_PRESENCE_TIMEOUT_MS = 500;
export const NEW_TAB_KANJI_FRONT_KEYWORD_LIMIT = 3;
export const NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS = 8_000;
export const NEW_TAB_REVIEW_SOURCE_TIMEOUT_MS = 3_000;
export const NEW_TAB_PUBLIC_FALLBACK_GRACE_MS = 900;
export const NEW_TAB_PUBLIC_STAGE_TIMEOUT_MS = 2_500;
export const NEW_TAB_LIVE_REVIEW_STALE_MS = 1_500;
export const NEW_TAB_HANDWRITING_DEBOUNCE_MS = 360;
export const NEW_TAB_HANDWRITING_GEOMETRY_CANDIDATE_LIMIT = 240;
export const NEW_TAB_HEADER_LABEL = 'yomu';
export const NEW_TAB_GRADE_QUEUE_KEY = 'jpdb-reader-newtab-grade-queue';
export const NEW_TAB_GRADE_QUEUE_LIMIT = 200;
export const NEW_TAB_STATS_JPDB_HISTORY_KEY = 'jpdb-reader-newtab-jpdb-stats-history';
export const NEW_TAB_STATS_DISABLED_ANKI_DECKS_KEY = 'jpdb-reader-newtab-disabled-anki-decks';
export const NEW_TAB_STATS_JPDB_CARD_LIMIT = 2_000;
// Deck-scoped Search browser (2D reviews): one bulk lookup covers thousands
// of pairs cheaply, so whole decks are browsable; capped to keep render/data
// structures sane on huge decks.
export const NEW_TAB_BROWSE_DECK_LIMIT = 5_000;
export const NEW_TAB_STUDY_INTERACTIVE_SELECTOR = [
    '.jpdb-reader-word',
    '.jpdb-reader-doodle-stage',
    '.jpdb-reader-newtab-answer',
    '.jpdb-reader-newtab-meaning',
    '[data-action]',
    '[data-immersion-action]',
    'a',
    'audio',
    'button',
    'canvas',
    'details',
    'form',
    'input',
    'select',
    'summary',
    'textarea',
    'video',
    '[contenteditable="true"]',
].join(',');
