export const CORE_COLOR_TOKENS = {
    black: '#000000',
    white: '#ffffff',
    transparentBlack: 'rgba(0, 0, 0, 0)',
} as const;

export const BRAND_COLOR_TOKENS = {
    accent: '#5ea780',
    consoleAccent: '#247a58',
} as const;

export const READER_THEME_COLOR_TOKENS = {
    dark: {
        bg: '#181b20',
        surface: '#20242b',
        surface2: '#282e37',
        text: '#f2f4f8',
        muted: '#aab2c0',
        faint: '#6f7a89',
        accentText: '#11161d',
    },
    light: {
        bg: '#fbfcfe',
        surface: '#f4f7fa',
        surface2: '#e8edf3',
        text: '#17202a',
        muted: '#4f5968',
        faint: '#687384',
        accentText: CORE_COLOR_TOKENS.white,
    },
} as const;

export const OVERLAY_COLOR_TOKENS = {
    text: CORE_COLOR_TOKENS.white,
    outline: CORE_COLOR_TOKENS.black,
    background: READER_THEME_COLOR_TOKENS.dark.bg,
} as const;

export const DEFAULT_WORD_COLOR_TOKENS = {
    new: '#58a6ff',
    learning: '#ffd166',
    known: '#7bd88f',
    due: '#5fb3b3',
    failed: '#ff6b6b',
    ignored: '#b8a7ff',
} as const;

export const DEFAULT_PITCH_COLOR_TOKENS = {
    heiban: '#359eff',
    atamadaka: '#fe4b74',
    nakadaka: '#fba840',
    odaka: '#57ccb7',
    kifuku: '#9050f6',
    unknown: '#94a3b8',
} as const;

export const LOOKUP_PILL_COLOR_TOKENS = {
    jpdb: { bg: '#2563c7', border: '#4f8ff0', text: CORE_COLOR_TOKENS.white },
    jisho: { bg: '#4f46c7', border: '#7567f0', text: CORE_COLOR_TOKENS.white },
    copy: { bg: '#7e3fbf', border: '#a064e5', text: CORE_COLOR_TOKENS.white },
} as const;

export const NEW_TAB_COLOR_TOKENS = {
    backgroundBase: '#f6f8f5',
    backgroundReadableSeed: '#141b17',
    surface: '#fbfcf8',
    surfaceText: '#15171c',
    shadow: 'rgba(18, 28, 23, .20)',
} as const;

export const DOODLE_COLOR_TOKENS = {
    ink: '#141820',
} as const;

export const PAGE_WORD_COLOR_TOKENS = {
    unknownBackgroundShadow: 'var(--jpdb-reader-word-unknown-bg-shadow)',
} as const;

export const LOGGER_COLOR_TOKENS = {
    debug: '#6b7280',
    warn: '#a15c00',
    error: '#b91c1c',
} as const;

export const ANKI_CARD_COLOR_TOKENS = {
    text: '#f4f7fb',
    background: '#15181e',
    muted: '#bac3d0',
    sentenceBorder: '#323843',
    sentenceBackground: '#1e232b',
    sentenceText: '#d8dee8',
    highlight: '#7ad119',
    sectionBorder: '#303641',
    sectionBackground: '#1b2028',
    headingText: '#c2cad7',
    labelText: '#92a0b3',
    expressionText: CORE_COLOR_TOKENS.white,
    readingText: '#aab4c2',
    chipBorder: '#4b5565',
    chipText: '#cdd5e1',
    metaLabelText: '#8f9aaa',
    tableBorder: '#353c47',
} as const;
