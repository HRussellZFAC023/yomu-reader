// One learner, told the same way to every release. Keeping the choices fixed
// across stages means every fixture can be checked against the same visible
// outcome: dark theme, their JPDB key, larger subtitles, furigana off.
export const SITE_URL = 'https://www.example.com/articles/yomu-upgrade';
export const YOUTUBE_URL = 'https://www.youtube.com/watch?v=corpus00001';
export const HOSTED_HOME_URL = 'https://yomureader.com/';
export const HOSTED_STUDY_URL = 'https://yomureader.com/study/';
export const HOSTED_ACADEMY_URL = 'https://yomureader.com/academy/';
export const HOSTED_PDF_READER_URL = 'https://yomureader.com/pdf-reader/';

// A fake credential: shaped like a JPDB key, never valid against jpdb.io.
export const CORPUS_JPDB_API_KEY = 'corpus0000000000000000000000jpdb';

export const LEARNER_CHOICES = {
    theme: 'dark',
    apiKey: CORPUS_JPDB_API_KEY,
    subtitleFontSize: 40,
    showFurigana: false,
} as const;

// Chosen in Settings after the 1.8.90 update, so the ledger gains a seq >= 1
// record next to the seq-0 pins it folded in.
export const UPGRADE_ACCENT_COLOR = '#2563eb';

// A three-term Yomitan dictionary, imported by v1.9.3's own store.
export const CORPUS_DICTIONARY_TITLE = 'Yomu Upgrade Corpus Mini';
export const CORPUS_DICTIONARY_TERMS = [
    ['読む', 'よむ', '', 'v5m', 10, ['to read'], 1, ''],
    ['書く', 'かく', '', 'v5k', 9, ['to write'], 2, ''],
    ['猫', 'ねこ', '', '', 8, ['cat'], 3, ''],
] as const;

// The fields every fixture records from the releasing version's own reload, so
// the v2 test compares against what the learner actually saw in v1.9.3.
export const VISIBLE_SETTINGS_KEYS = [
    'theme',
    'apiKey',
    'subtitleFontSize',
    'showFurigana',
    'interfaceLanguage',
    'onboardingSeen',
    'learningTargetChosen',
    'activeLanguageProfileId',
    'accentColor',
    'localDictionariesEnabled',
] as const;
