import { isTargetLanguageText } from '../lookup/target-text';
import { isLikelyProseElement } from './decoration-policy';

const OWNED_SENTENCE_SURFACE_SELECTOR = [
    '.jpdb-reader-text-mirror',
    '.jpdb-reader-control-text-mirror',
    '.jpdb-ocr-line-text',
    '.jpdb-subtitle-primary',
    '.jpdb-subtitle-row-text',
    '.asbplayer-subtitles-container-bottom',
].join(',');

const STRUCTURAL_SENTENCE_BOUNDARY_TAGS = new Set(
    'ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,BR,DD,DETAILS,DIALOG,DIV,DL,DT,FIGCAPTION,FIGURE,H1,H2,H3,H4,H5,H6,HR,LI,MAIN,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL'.split(','),
);

/**
 * Smallest structural scope that owns the fragments of one rendered sentence.
 *
 * This resolver is used after canonical card hydration may already have
 * changed classes and ruby. It therefore avoids computed style reads entirely:
 * reading display at that point would flush earlier writes once per card on an
 * infinite feed. Styled inline wrappers safely fall through to their nearest
 * authored block/component owner.
 */
export function renderedWordSentenceScope(word: HTMLElement): ParentNode {
    const ownedSurface = word.closest<HTMLElement>(OWNED_SENTENCE_SURFACE_SELECTOR);
    if (ownedSurface) return ownedSurface;
    for (let current = word.parentElement; current && current !== document.body; current = current.parentElement) {
        if (isCustomElementTextBoundary(current) || STRUCTURAL_SENTENCE_BOUNDARY_TAGS.has(current.tagName)) return current;
    }
    return word.parentElement ?? word;
}

function isCustomElementTextBoundary(element: HTMLElement): boolean {
    if (!element.localName.includes('-') || !isTargetLanguageText(element.textContent ?? '')) return false;
    const parent = element.parentElement;
    return !parent || !isLikelyProseElement(parent);
}
