import readerCss from './styles.css?inline';

const TEST_READER_CSS_FALLBACK = `
.jpdb-reader-word { --jpdb-reader-word-underline: transparent; position: static; display: inline; text-decoration-line: underline !important; text-decoration-color: var(--jpdb-reader-word-underline, transparent) !important; }
.jpdb-reader-word::after { content: none; }
.jpdb-reader-word.jpdb-reader-has-furi { line-height: 1.85; }
.jpdb-reader-word ruby { position: static; display: ruby; ruby-align: center; ruby-position: over; line-height: 1; text-decoration-line: inherit !important; text-decoration-color: inherit !important; text-decoration-thickness: inherit !important; text-underline-offset: inherit !important; }
.jpdb-reader-word rt.jpdb-reader-furi { position: static; display: ruby-text; transform: none; line-height: 1; }
.jpdb-reader-word.jpdb-new, .jpdb-reader-word.jpdb-learning { background: var(--jpdb-reader-state-new-soft, rgba(88,166,255,.18)) !important; }
.jpdb-reader-word.jpdb-known, .jpdb-reader-word.jpdb-due { --jpdb-reader-word-underline: var(--jpdb-reader-state-known, #7bd88f); }
.jpdb-reader-highlight-pitch .jpdb-reader-word.jpdb-pitch-heiban { --jpdb-reader-word-underline: #359eff; }
.jpdb-ocr-line .jpdb-reader-word { --jpdb-reader-word-underline: transparent; text-decoration: none !important; }
.jpdb-reader-highlight-off .jpdb-reader-word, .jpdb-reader-highlight-off .jpdb-reader-word.jpdb-known { --jpdb-reader-word-underline: transparent; text-decoration-color: transparent !important; }
`;

export const READER_CSS = readerCss || TEST_READER_CSS_FALLBACK;
