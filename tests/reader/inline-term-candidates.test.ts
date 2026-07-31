import { describe, expect, it } from 'vitest';

import { InlineTermCandidateCollector } from '../../src/reader/dictionaries/yomitan/inline-term-candidates';
import { createLearningTargetModule } from '../../src/reader/languages/module';
import type { LanguageTextSegment } from '../../src/reader/languages/types';

const featureSemantics = {
    characterSystem: 'latin',
    phoneticScripts: ['latin'],
    pronunciation: 'none',
    readingAnnotation: 'none',
} as const;

describe('inline term candidate cache identity', () => {
    it('resegments when a replacement module reuses the same target id and source', () => {
        const collector = new InlineTermCandidateCollector();
        const source = 'alpha beta';
        const alpha = createLearningTargetModule({
            id: 'replacement-target',
            language: 'en',
            featureSemantics,
            detectsText: /[a-z]/u,
            segment: () => [span('alpha', 0)],
        });
        const beta = createLearningTargetModule({
            id: 'replacement-target',
            language: 'en',
            featureSemantics,
            detectsText: /[a-z]/u,
            segment: () => [span('beta', 6)],
        });

        expect([...collector.collect(alpha, source, 0, source.length).keys()]).toEqual(['alpha']);
        expect([...collector.collect(beta, source, 0, source.length).keys()]).toEqual(['beta']);
    });

    it('recomputes Han-style runs for a replacement module with the same id', () => {
        const collector = new InlineTermCandidateCollector();
        const source = '甲乙丙丁';
        const first = runTarget(() => [span('甲乙', 0)]);
        const second = runTarget(() => [span('丙丁', 2)]);

        const firstCandidates = collector.collect(first, source, 0, source.length);
        const secondCandidates = collector.collect(second, source, 0, source.length);

        expect(firstCandidates.has('甲乙')).toBe(true);
        expect(firstCandidates.has('丙丁')).toBe(false);
        expect(secondCandidates.has('甲乙')).toBe(false);
        expect(secondCandidates.has('丙丁')).toBe(true);
    });
});

function runTarget(lookupRunSegments: (text: string) => readonly LanguageTextSegment[]) {
    return createLearningTargetModule({
        id: 'replacement-run-target',
        language: 'zh',
        featureSemantics: {
            characterSystem: 'han',
            phoneticScripts: [],
            pronunciation: 'none',
            readingAnnotation: 'none',
        },
        detectsText: /\p{Unified_Ideograph}/u,
        lookupStartsAtSegmentBoundary: false,
        lookupRunSegments,
        lookupSweepMode: 'left-to-right-longest-exact',
    });
}

function span(text: string, start: number): LanguageTextSegment {
    return { text, start, end: start + text.length };
}
