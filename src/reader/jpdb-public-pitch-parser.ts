import { parseHtmlDocument } from './dom';
import {
    compactJpdbText,
    hasRequestedJpdbVocabularyIdentity,
    jpdbDocumentMatchesVocabulary,
    jpdbVocabularyResultRoots,
    jpdbVocabularyRootMatches,
    unique,
} from './jpdb-public-lookup';
import { splitMorae } from './pitch-accent';

export function parseJpdbPublicPitchHtml(html: string, spelling = '', reading = ''): string[] {
    const doc = parseHtmlDocument(html);
    const roots = jpdbVocabularyResultRoots(doc);
    const matchingRoots = roots.filter(root => jpdbVocabularyRootMatches(root, spelling, reading));
    const candidates = pitchCandidateRoots(doc, roots, matchingRoots, spelling, reading);
    const patterns = candidates.flatMap(readJpdbPitchPatterns).filter(Boolean);
    return unique(patterns);
}

function pitchCandidateRoots(
    doc: Document,
    roots: Element[],
    matchingRoots: Element[],
    spelling: string,
    reading: string,
): ParentNode[] {
    if (matchingRoots.length) return matchingRoots;
    return canUseGenericPitchRoot(doc, roots, spelling, reading) ? [roots[0] ?? doc] : [];
}

function canUseGenericPitchRoot(doc: Document, roots: Element[], spelling: string, reading: string): boolean {
    return (!hasRequestedJpdbVocabularyIdentity(spelling, reading) && roots.length === 1)
        || jpdbDocumentMatchesVocabulary(doc, spelling, reading);
}

export function readJpdbPitchPatterns(root: ParentNode): string[] {
    const patterns: string[] = [];
    root.querySelectorAll('.subsection-pitch-accent').forEach(section => {
        const stack = section.querySelector('.subsection > div') ?? section;
        Array.from(stack.children).forEach(row => {
            const pattern = Array.from(row.querySelectorAll<HTMLElement>('div[style*="--pitch-low"], div[style*="--pitch-high"]'))
                .map(segment => pitchSegmentPattern(segment))
                .join('');
            if (pattern.length >= 2) patterns.push(pattern);
        });
    });
    return patterns;
}

function pitchSegmentPattern(segment: HTMLElement): string {
    const level = pitchSegmentLevel(segment);
    if (!level) return '';
    return level.repeat(splitMorae(compactJpdbText(segment.textContent ?? '')).length);
}

function pitchSegmentLevel(segment: HTMLElement): string {
    const style = segment.getAttribute('style') ?? '';
    if (style.includes('--pitch-high')) return 'H';
    return style.includes('--pitch-low') ? 'L' : '';
}
