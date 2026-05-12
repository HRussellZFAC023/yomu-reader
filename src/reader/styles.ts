import readerCss from './styles.css?inline';

const TEST_READER_CSS_FALLBACK = `
.jpdb-reader-word { --jpdb-reader-word-underline: transparent; position: relative; display: inline-block; text-decoration-line: underline !important; text-decoration-color: transparent !important; }
.jpdb-reader-word::after { content: ""; position: absolute; left: .08em; right: .08em; bottom: .12em; height: 2px; background: var(--jpdb-reader-word-underline, transparent); pointer-events: none; }
.jpdb-reader-word ruby { text-decoration-line: inherit !important; text-decoration-color: inherit !important; text-decoration-thickness: inherit !important; text-underline-offset: inherit !important; }
.jpdb-reader-word.jpdb-new, .jpdb-reader-word.jpdb-learning { background: var(--jpdb-reader-state-new-soft, rgba(88,166,255,.18)) !important; }
.jpdb-reader-word.jpdb-known, .jpdb-reader-word.jpdb-due { --jpdb-reader-word-underline: var(--jpdb-reader-state-known, #7bd88f); }
.jpdb-reader-highlight-pitch .jpdb-reader-word.jpdb-pitch-heiban { --jpdb-reader-word-underline: #359eff; }
.jpdb-ocr-line .jpdb-reader-word { --jpdb-reader-word-underline: transparent; text-decoration: none !important; }
.jpdb-reader-highlight-off .jpdb-reader-word, .jpdb-reader-highlight-off .jpdb-reader-word.jpdb-known { --jpdb-reader-word-underline: transparent; text-decoration-color: transparent !important; }
.jpdb-reader-example-sentence .jpdb-reader-word { display: inline; text-decoration-color: var(--jpdb-reader-word-underline, transparent) !important; }
.jpdb-reader-example-sentence .jpdb-reader-word::after { content: none; }
`;

export const READER_CSS = readerCss || TEST_READER_CSS_FALLBACK;
