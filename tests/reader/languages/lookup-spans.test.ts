import { describe, expect, it } from 'vitest';

import { hanIdeographSegments } from '../../../src/reader/languages/han';
import {
    codePointBoundaryAtOrAfter,
    codePointBoundaryAtOrBefore,
    codePointSafePrefix,
    lookupSpansContainingOffset,
    lookupSpansStartingInRange,
} from '../../../src/reader/languages/lookup-spans';

describe('code-point-safe lookup spans', () => {
    it('never cuts a supplementary Han character at a UTF-16 boundary', () => {
        const text = `a𡃁b`;

        expect(codePointBoundaryAtOrBefore(text, 2)).toBe(1);
        expect(codePointBoundaryAtOrAfter(text, 2)).toBe(3);
        expect(codePointSafePrefix(text, 2)).toBe('a');
        expect(codePointSafePrefix(text, 3)).toBe('a𡃁');
    });

    it('returns UTF-16 coordinates while limiting by Unicode code point', () => {
        const text = '我𡃁好';
        const segment = hanIdeographSegments(text)[0]!;
        const spans = lookupSpansStartingInRange(text, segment, 0, text.length, 2);

        expect(spans.map(span => [span.term, span.start, span.end])).toEqual([
            ['我𡃁', 0, 3],
            ['我', 0, 1],
            ['𡃁好', 1, 4],
            ['𡃁', 1, 3],
            ['好', 3, 4],
        ]);
    });

    it('orders pointer candidates longest first without lone surrogates', () => {
        const text = '我𡃁好';
        const segment = hanIdeographSegments(text)[0]!;
        const spans = lookupSpansContainingOffset(text, segment, 2, 18, 8);

        expect(spans.map(span => span.term)).toEqual([
            '我𡃁好',
            '我𡃁',
            '𡃁好',
            '𡃁',
        ]);
        expect(spans.every(span => !/[\ud800-\udfff]/u.test(
            span.term.replace(/[\ud800-\udbff][\udc00-\udfff]/gu, ''),
        ))).toBe(true);
    });
});
