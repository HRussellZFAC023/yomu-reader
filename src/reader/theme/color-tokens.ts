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

export const OCR_OVERLAY_COLOR_TOKENS = {
    text: READER_THEME_COLOR_TOKENS.light.text,
    outline: CORE_COLOR_TOKENS.white,
    background: READER_THEME_COLOR_TOKENS.light.surface,
} as const;

export const DEFAULT_WORD_COLOR_TOKENS = {
    new: '#ffffff',
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
    unknown: '#94a3b8',
} as const;

export const LOOKUP_PILL_COLOR_TOKENS = {
    jpdb: { bg: '#2563c7', border: '#4f8ff0', text: CORE_COLOR_TOKENS.white },
    jiten: { bg: '#13845f', border: '#34c89a', text: CORE_COLOR_TOKENS.white },
    bunpro: { bg: '#be3455', border: '#fb7185', text: CORE_COLOR_TOKENS.white },
    'yomu-search': { bg: '#b83280', border: '#f472b6', text: CORE_COLOR_TOKENS.white },
    jisho: { bg: '#4f46c7', border: '#7567f0', text: CORE_COLOR_TOKENS.white },
    weblio: { bg: '#0f766e', border: '#2dd4bf', text: CORE_COLOR_TOKENS.white },
    kotobank: { bg: '#be123c', border: '#fb7185', text: CORE_COLOR_TOKENS.white },
    takoboto: { bg: '#0f5f99', border: '#38bdf8', text: CORE_COLOR_TOKENS.white },
    'wiktionary-ja': { bg: '#374151', border: '#9ca3af', text: CORE_COLOR_TOKENS.white },
    'immersion-kit': { bg: '#0e7490', border: '#22d3ee', text: CORE_COLOR_TOKENS.white },
    nadeshiko: { bg: '#7c3aed', border: '#a78bfa', text: CORE_COLOR_TOKENS.white },
    // Styling for the retained outbound lookup link only; there is no embedded source.
    uchisen: { bg: '#9a3412', border: '#fb923c', text: CORE_COLOR_TOKENS.white },
    anki: { bg: '#2f6da8', border: '#68a6e6', text: CORE_COLOR_TOKENS.white },
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
