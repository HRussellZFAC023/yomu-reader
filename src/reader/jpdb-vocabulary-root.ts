import {
    hasRequestedJpdbVocabularyIdentity,
    jpdbDocumentMatchesVocabulary,
    jpdbVocabularyResultRoots,
    jpdbVocabularyRootMatches,
} from './jpdb-public-lookup';
import { cleanText } from './jpdb-text';

export function vocabularyRoot(doc: Document, spelling: string, reading: string): ParentNode | null {
    const roots = jpdbVocabularyResultRoots(doc);
    const matches = roots.filter(root => jpdbVocabularyRootMatches(root, spelling, reading, cleanText));
    const matched = firstVocabularyRoot(matches);
    if (matched) return matched;
    if (canUseFallbackVocabularyRoot(doc, roots, spelling, reading)) return roots[0] ?? doc;
    return null;
}

function firstVocabularyRoot(matches: Element[]): Element | null {
    return matches[0] ?? null;
}

function canUseGenericVocabularyRoot(roots: Element[], spelling: string, reading: string): boolean {
    return !hasRequestedJpdbVocabularyIdentity(spelling, reading, cleanText) && roots.length <= 1;
}

function canUseFallbackVocabularyRoot(doc: Document, roots: Element[], spelling: string, reading: string): boolean {
    return canUseGenericVocabularyRoot(roots, spelling, reading)
        || jpdbDocumentMatchesVocabulary(doc, spelling, reading, cleanText);
}
