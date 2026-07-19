export const HAS_JAPANESE = /[\u3040-\u30ff\u3400-\u9fff々〆\uff66-\uff9f]/;
// Render-boundary check: unlike the broad scan gate above, this excludes
// punctuation that lives inside the kana blocks (notably ・ and ー). A token
// must cover at least one Japanese letter/ideograph before it may replace page
// text; punctuation may still be part of a wider legitimate word span.
export const HAS_JAPANESE_LETTER = /[\u3041-\u3096\u309d-\u309f\u30a1-\u30fa\u30fd-\u30ff\u3400-\u9fff\uff66-\uff6f\uff71-\uff9d]/u;
export const READER_ROOT_SELECTOR = '[data-jpdb-reader-root]';
