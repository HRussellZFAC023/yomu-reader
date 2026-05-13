import readerCss from './styles.css?inline';

const TEST_READER_CSS_FALLBACK = `
.jpdb-reader-word { --jpdb-reader-word-underline: transparent; --jpdb-reader-source-status-soft: transparent; --jpdb-reader-source-status-decoration: transparent; --jpdb-reader-source-status-color: currentColor; --jpdb-reader-source-pitch-soft: transparent; --jpdb-reader-source-pitch-decoration: var(--jpdb-reader-pitch-unknown, #94a3b8); --jpdb-reader-source-pitch-color: currentColor; position: static; display: inline; text-decoration-line: underline !important; text-decoration-color: var(--jpdb-reader-word-underline, transparent) !important; }
.jpdb-reader-word::after { content: none; }
.jpdb-reader-word.jpdb-reader-has-furi { line-height: 1.85; }
.jpdb-reader-word ruby { position: static; display: ruby; ruby-align: center; ruby-position: over; line-height: 1; text-decoration-line: inherit !important; text-decoration-color: inherit !important; text-decoration-thickness: inherit !important; text-underline-offset: inherit !important; }
.jpdb-reader-word rt.jpdb-reader-furi { position: static; display: ruby-text; transform: none; line-height: 1; }
.jpdb-reader-word.jpdb-new, .jpdb-reader-word.jpdb-learning { --jpdb-reader-source-jpdb-soft: var(--jpdb-reader-state-new-soft, rgba(88,166,255,.18)); --jpdb-reader-source-jpdb-decoration: var(--jpdb-reader-state-new, #58a6ff); --jpdb-reader-source-jpdb-color: var(--jpdb-reader-state-new, #58a6ff); --jpdb-reader-source-status-soft: var(--jpdb-reader-state-new-soft, rgba(88,166,255,.18)); --jpdb-reader-source-status-decoration: var(--jpdb-reader-state-new, #58a6ff); --jpdb-reader-source-status-color: var(--jpdb-reader-state-new, #58a6ff); }
.jpdb-reader-word.jpdb-known, .jpdb-reader-word.jpdb-due { --jpdb-reader-source-status-decoration: var(--jpdb-reader-state-known, #7bd88f); --jpdb-reader-source-status-color: var(--jpdb-reader-state-known, #7bd88f); }
.jpdb-reader-word.jpdb-pitch-heiban { --jpdb-reader-source-pitch-decoration: var(--jpdb-reader-pitch-heiban, #359eff); --jpdb-reader-source-pitch-color: var(--jpdb-reader-pitch-heiban, #359eff); --jpdb-reader-source-pitch-soft: var(--jpdb-reader-pitch-heiban-soft, rgba(53,158,255,.14)); }
.jpdb-reader-word-highlight-status .jpdb-reader-word { background: var(--jpdb-reader-source-status-soft, transparent) !important; }
.jpdb-reader-word-underline-status .jpdb-reader-word { --jpdb-reader-word-underline: var(--jpdb-reader-source-status-decoration, transparent); }
.jpdb-reader-word-underline-pitch .jpdb-reader-word { --jpdb-reader-word-underline: var(--jpdb-reader-source-pitch-decoration, transparent); }
.jpdb-ocr-line .jpdb-reader-word { --jpdb-reader-word-underline: transparent; text-decoration: none !important; }
`;

export const READER_CSS = readerCss || TEST_READER_CSS_FALLBACK;
