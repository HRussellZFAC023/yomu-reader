import { AAKASH_DIRECTIONS_READER_ANNOTATIONS } from '../content/aakash-meet';
import type { AuthoredVocabularyAnnotation } from '../../reader/lookup/authored-vocabulary';

const ACADEMY_AUTHORED_VOCABULARY = [
    ...AAKASH_DIRECTIONS_READER_ANNOTATIONS,
] as const satisfies readonly AuthoredVocabularyAnnotation[];

export function academyAuthoredVocabularyForText(text: string): AuthoredVocabularyAnnotation[] {
    return ACADEMY_AUTHORED_VOCABULARY.filter(annotation => text.includes(annotation.surface));
}
