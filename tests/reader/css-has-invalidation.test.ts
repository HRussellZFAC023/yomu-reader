import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
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
        expect(blocking(':is(body):has(.x) { color: red; }')).toHaveLength(1);
        expect(blocking('.a:where(.b, html):has(.x) { color: red; }')).toHaveLength(1);
    });

    it('reports :has() in nested style rules instead of guessing what `&` resolves to', () => {
        expect(blocking('body {\n  &:has(.x) .y { color: red; }\n}')).toEqual([
            expect.objectContaining({ line: 2, reason: 'nested in a style rule that this check cannot resolve' }),
        ]);
        expect(blocking('.a:has(.b) { .c { color: red; } }')).toHaveLength(1);
        expect(blocking('.a { .b { color: red; } }')).toEqual([]);
        expect(blocking('@media (hover: hover) { .a:has(.b) { color: red; } }')).toEqual([]);
    });

    it('keeps subject-position :has() on a Yomu-owned anchor', () => {
        expect(blocking('.a:has(.b) { color: red; }')).toEqual([]);
        expect(blocking('.a:has(> .b, .c .d) { color: red; }')).toEqual([]);
        expect(blocking('.x .a:not(:has(input)) { color: red; }')).toEqual([]);
        expect(blocking('.a:not(body):has(.b) { color: red; }')).toEqual([]);
        expect(blocking('.a:has(body) { color: red; }')).toEqual([]);
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

// The sheet's handle / scroll body / actions grid is keyed on
// .jpdb-reader-sheet-has-body, which only setReaderPopoverHtml() sets. A popover
// written any other way renders an unpinned, collapsed sheet.
const POPOVER_HTML_WRITE = /setInnerHtml\(\s*[\w.]*popover\s*,|[\w.]*popover\.(?:innerHTML|outerHTML)\s*=|[\w.]*popover\.(?:insertAdjacentHTML|replaceChildren)\(/gi;

describe('popover content writes', () => {
    it('recognises a direct write to a popover', () => {
        for (const source of ['setInnerHtml(popover, html);', 'this.popover.innerHTML = html;', 'lookupPopover.replaceChildren(node);']) {
            expect(source.match(POPOVER_HTML_WRITE), source).not.toBeNull();
        }
        expect('setInnerHtml(container, html);'.match(POPOVER_HTML_WRITE)).toBeNull();
    });

    it('go through setReaderPopoverHtml outside popup/shell.ts', () => {
        const root = path.resolve('src/reader');
        const offenders: string[] = [];
        for (const entry of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
            if (!entry.endsWith('.ts') || entry === path.join('popup', 'shell.ts')) continue;
            readFileSync(path.join(root, entry), 'utf8').split('\n').forEach((line, index) => {
                if (/^\s*(?:\/\/|\*)/.test(line)) return;
                if (line.match(POPOVER_HTML_WRITE)) offenders.push(`src/reader/${entry}:${index + 1}  ${line.trim()}`);
            });
        }
        expect(offenders).toEqual([]);
    });
});
