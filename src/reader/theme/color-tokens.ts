export const CORE_COLOR_TOKENS = {
    black: '#000000',
    white: '#ffffff',
    transparentBlack: 'rgba(0, 0, 0, 0)',
} as const;

// Ink and paper with one restrained red, taken from the よむ icon's pitch mark
// (#fe4b74) and deepened until white text on it and it on white both pass AA.
export const BRAND_COLOR_TOKENS = {
    accent: '#b8324e',
    accentOnDark: '#ff7892',
    consoleAccent: '#b8324e',
} as const;

export const READER_THEME_COLOR_TOKENS = {
    dark: {
        bg: '#181b20',
        surface: '#20242b',
        surface2: '#282e37',
        text: '#f2f4f8',
        muted: '#b0b8c4',
        faint: '#8993a2',
        accentText: '#11161d',
    },
    light: {
        bg: '#f8f9fb',
        surface: '#ffffff',
        surface2: '#f0f2f5',
        text: '#20242b',
        muted: '#59616d',
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
    new: '#ffffff',
    learning: '#ffd166',
    known: '#7bd88f',
    due: '#5fb3b3',
    failed: '#ff6b6b',
    ignored: '#b8a7ff',
} as const;

// Study-state underlines on a page, in ink and paper: one quiet hue per state,
// and its tint for a dark page. An underline drawn from an untouched default
// above takes these for the page it sits on (dom/word-contrast.ts); white and
// yellow lines read loud on a dark page. A learner's own colour is kept.
export const PAGE_STATE_UNDERLINE_COLOR_TOKENS = {
    light: { new: '#687384', learning: '#916f08', known: '#347a57', due: '#216f7a', failed: '#b53f43', ignored: '#77649a' },
    dark: { new: '#aab2c0', learning: '#d6b65e', known: '#80b99a', due: '#77b6c0', failed: '#f08a8a', ignored: '#b7a6d7' },
} as const;

export const DEFAULT_PITCH_COLOR_TOKENS = {
    heiban: '#359eff',
    atamadaka: '#fe4b74',
    nakadaka: '#fba840',
    odaka: '#57ccb7',
    unknown: '#94a3b8',
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
