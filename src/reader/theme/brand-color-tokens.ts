// Ink and paper with one restrained red, taken from the よむ icon's pitch mark
// (#fe4b74) and deepened until white text on it and it on white both pass AA.
//
// Its own module so the inline appearance bootstrap (hosted-accent-css.ts),
// stamped into every hosted page's <head>, bundles these three values and not
// the reader's whole token table: esbuild cannot drop the other tables, whose
// values are built from property reads.
export const BRAND_COLOR_TOKENS = {
    accent: '#b8324e',
    accentOnDark: '#ff7892',
    consoleAccent: '#b8324e',
} as const;
