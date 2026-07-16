import type { LibraryVocabularySheetItem } from '../content/library-vocabulary-sheet';
import {
    AUTHORED_VOCABULARY_ATTRIBUTE,
    encodeAuthoredVocabularyAnnotations,
    type AuthoredVocabularyAnnotation,
} from '../../reader/lookup/authored-vocabulary';

/**
 * Preserve the exact source row while telling Reader which installed-dictionary
 * headword to use for its popup, examples, readings, and pitch treatment.
 */
export function attachLibraryReaderVocabulary(surface: HTMLElement, word: LibraryVocabularySheetItem): void {
    if (word.studyStatus === 'quarantined-source-ambiguity'
        || word.studyStatus === 'quarantined-source-gap') {
        surface.removeAttribute(AUTHORED_VOCABULARY_ATTRIBUTE);
        return;
    }
    const annotation: AuthoredVocabularyAnnotation = {
        surface: word.expression,
        lemma: word.studyExpression,
        reading: word.reading,
    };
    surface.setAttribute(AUTHORED_VOCABULARY_ATTRIBUTE, encodeAuthoredVocabularyAnnotations([annotation]));
}
