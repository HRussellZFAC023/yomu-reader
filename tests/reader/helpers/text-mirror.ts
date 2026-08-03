import { documentPortalSourceHostForReaderWord } from '../../../src/reader/dom';
import { documentAnnotationPortalMirrorsWithin } from '../../../src/reader/dom/youtube-chrome-annotation-portal';

const TEXT_MIRROR_SELECTOR = '.jpdb-reader-text-mirror';
const READER_WORD_SELECTOR = '.jpdb-reader-word';

/**
 * Test-side equivalent of a descendant mirror query that also follows
 * source-owned mirrors mounted in the document portal. Production deliberately
 * keeps those mirrors outside framework-owned DOM, so tests must resolve them
 * through the source registry rather than weakening that ownership boundary.
 */
export function readerTextMirrorsWithinSource(root: ParentNode): HTMLElement[] {
    const mirrors = new Set(root.querySelectorAll<HTMLElement>(TEXT_MIRROR_SELECTOR));
    documentAnnotationPortalMirrorsWithin(root).forEach(mirror => mirrors.add(mirror));
    return [...mirrors];
}

/** Resolve the mirror owned by this exact source host in either mount lane. */
export function readerTextMirrorForSource(source: HTMLElement): HTMLElement | null {
    const inHost = Array.from(source.children).find(
        (child): child is HTMLElement => child instanceof HTMLElement && child.matches(TEXT_MIRROR_SELECTOR),
    );
    if (inHost) return inHost;
    return documentAnnotationPortalMirrorsWithin(source).find(mirror => {
        const word = mirror.querySelector<HTMLElement>(READER_WORD_SELECTOR);
        return word ? documentPortalSourceHostForReaderWord(word) === source : false;
    }) ?? null;
}

export function readerWordsForSource(source: HTMLElement): HTMLElement[] {
    return [...(readerTextMirrorForSource(source)?.querySelectorAll<HTMLElement>(READER_WORD_SELECTOR) ?? [])];
}

export function readerWordsWithinSource(root: ParentNode): HTMLElement[] {
    const words = new Set(root.querySelectorAll<HTMLElement>(READER_WORD_SELECTOR));
    documentAnnotationPortalMirrorsWithin(root).forEach(mirror => {
        mirror.querySelectorAll<HTMLElement>(READER_WORD_SELECTOR).forEach(word => words.add(word));
    });
    return [...words];
}
