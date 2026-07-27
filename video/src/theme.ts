// One palette for every scene. The SRS-state and pitch-pattern colours are the
// product's real tokens (src/reader/styles/base.css) and the accent is the real
// hosted accent (src/reader/core/hosted-accent-css.ts), so the clip cannot
// advertise a Yomu that looks different from the Yomu you install.
export const palette = {
    ink: '#0b0b0c',
    paper: '#f7f4ec',
    red: '#e4002b',
    redDeep: '#a80020',
    accent: '#5ea780',
    accentBright: '#8ddcb0',
    yellow: '#ffd400',
    // src/reader/styles/base.css --jpdb-reader-state-*
    stateNew: '#ffffff',
    stateLearning: '#ffd166',
    stateKnown: '#7bd88f',
    // src/reader/styles/base.css --jpdb-reader-pitch-*
    pitchHeiban: '#359eff',
    pitchAtamadaka: '#fe4b74',
    pitchNakadaka: '#fba840',
    pitchOdaka: '#57ccb7',
} as const;

export type PitchClass = 'heiban' | 'atamadaka' | 'nakadaka' | 'odaka';

export const pitchColor: Record<PitchClass, string> = {
    heiban: palette.pitchHeiban,
    atamadaka: palette.pitchAtamadaka,
    nakadaka: palette.pitchNakadaka,
    odaka: palette.pitchOdaka,
};

export const stateColor = {
    new: palette.stateNew,
    learning: palette.stateLearning,
    known: palette.stateKnown,
} as const;

export const font = {
    // Vendored subset first (scripts/fetch-fonts.mjs), then whatever Japanese
    // face the rendering machine has, so a missing glyph degrades to a
    // different face rather than to tofu.
    jp: '"Yomu Video JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif',
    ui: '"Yomu Video JP", -apple-system, "Helvetica Neue", "Arial Black", sans-serif',
    display: '"Yomu Video JP", "Arial Black", "Helvetica Neue", sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
} as const;

// Nothing in this design is axis-aligned. Angles are hand-picked rather than
// generated so the composition stays stable frame to frame and so no two
// neighbouring elements land on the same tilt.
export const tilt = {
    dateStamp: -8.5,
    dayBand: -6.2,
    afterSchool: -11,
    nameTab: -2.4,
    bubble: -1.6,
    yomuTag: -3.8,
    card: -1.9,
    chip: 2.1,
    legend: -1.1,
    deck: 3.4,
    stamp: -13,
} as const;

export const FPS = 30;

// Act boundaries in frames. Each act owns a continuous shot, so every beat
// inside an act is expressed relative to the act's own first frame and a timing
// change here can never leave a beat pointing at the wrong absolute frame.
export const acts = {
    /** The full loop over one game frame: read, look up, mine, keep. */
    one: { from: 0, durationInFrames: 640 },
    /** A different scene, a different speaker, the same three keystrokes. */
    two: { from: 640, durationInFrames: 150 },
    /** Where to get it. */
    three: { from: 790, durationInFrames: 200 },
} as const;

export const TOTAL_FRAMES = acts.three.from + acts.three.durationInFrames;

export const hardShadow = (dx: number, dy: number, color: string = palette.ink): string =>
    `${dx}px ${dy}px 0 ${color}`;
