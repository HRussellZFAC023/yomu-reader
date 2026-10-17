import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findHasInvalidationRisks, readerStylesheetFiles } from '../../scripts/lib/css-has-invalidation.mjs';

const blocking = (css: string) => findHasInvalidationRisks(css).filter(finding => !finding.allowed);

describe('CSS :has() invalidation gate', () => {
    it('blocks a :has() anchored on the document root or followed by a combinator', () => {
        expect(blocking('body:has(.x) .y { color: red; }')).toEqual([
            expect.objectContaining({ line: 1, reason: 'anchored on the document root and followed by a combinator' }),
        ]);
        expect(blocking('html:has(.x) { color: red; }')).toHaveLength(1);
        expect(blocking(':root:has(.x) { color: red; }')).toHaveLength(1);
        expect(blocking(':has(.x) { color: red; }')).toHaveLength(1);
        expect(blocking('\n\n.a:has(.b) > .c, .d { color: red; }')).toEqual([expect.objectContaining({ line: 3, reason: 'followed by a combinator' })]);
        expect(blocking('.a:has(.b)\n  ~ .c { color: red; }')).toHaveLength(1);
        expect(blocking('@media (max-width: 600px) { body:has(.x) .y { color: red; } }')).toHaveLength(1);
    });

    it('keeps subject-position :has() on a Yomu-owned anchor', () => {
        expect(blocking('.a:has(.b) { color: red; }')).toEqual([]);
        expect(blocking('.a:has(> .b, .c .d) { color: red; }')).toEqual([]);
        expect(blocking('.x .a:not(:has(input)) { color: red; }')).toEqual([]);
        expect(blocking('.a:has(:nth-child(2n+1)) { content: "{ body:has(.x) .y }"; }')).toEqual([]);
        expect(blocking('/* body:has(.x) .y { } */ .a { color: red; }')).toEqual([]);
    });

    it('accepts an allow comment with a reason on the :has( line or directly above it', () => {
        expect(blocking('.a:has(.b) .c { color: red; } /* has-invalidation-allow: small subtree */')).toEqual([]);
        expect(blocking('/* has-invalidation-allow: small subtree */\n.a:has(.b) .c { color: red; }')).toEqual([]);
        expect(blocking('/* has-invalidation-allow: */\n.a:has(.b) .c { color: red; }')).toHaveLength(1);
        expect(blocking('/* has-invalidation-allow: small subtree */\n\n.a:has(.b) .c { color: red; }')).toHaveLength(1);
    });

    it('passes the stylesheet Yomu injects into pages', () => {
        const files = readerStylesheetFiles('src/reader/styles-reader.css');
        expect(files.length).toBeGreaterThan(5);
        for (const file of files) expect(blocking(readFileSync(file, 'utf8')), file).toEqual([]);
    });
});
