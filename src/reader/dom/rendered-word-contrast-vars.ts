export const RENDERED_WORD_CONTRAST_VARS = [
    '--jpdb-reader-page-bg',
    '--jpdb-reader-highlight-backdrop',
    '--jpdb-reader-word-accessible-color',
    '--jpdb-reader-word-accessible-highlight',
    '--jpdb-reader-word-accessible-underline',
    '--jpdb-reader-word-highlight-text',
    '--jpdb-reader-word-contrast-shadow',
];

export const RENDERED_WORD_CONTRAST_VARS_WITHOUT_SHADOW = RENDERED_WORD_CONTRAST_VARS.filter(
    name => name !== '--jpdb-reader-word-contrast-shadow',
);
