import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HAS_GATE_PROBES, HAS_GATE_RULE_PROBES } from '../../scripts/lib/css-has-gate-probes.mjs';
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

    it('sees a combinator after :has() inside :is(), :where(), :not() and :nth-child(of)', () => {
        expect(blocking(':is(.a:has(.b) > .c) { color: red; }')).toEqual([expect.objectContaining({ reason: 'followed by a combinator' })]);
        expect(blocking(':where(.a:has(.b) .c), :not(.a:has(.b) ~ .c) { color: red; }')).toHaveLength(2);
        expect(blocking(':is(.a:has(.b)) > .c { color: red; }')).toHaveLength(1);
        expect(blocking('li:nth-child(2n of .a:has(.b) .c) { color: red; }')).toHaveLength(1);
        expect(blocking(':is(.a :has(.b)) { color: red; }')).toEqual([expect.objectContaining({ reason: 'anchored on the document root' })]);
        expect(blocking('.a:is(:has(.b)), li:nth-child(2n+1) { color: red; }')).toEqual([]);
    });

    it('never allows a combinator into a subject with nothing to key on', () => {
        // Chromium: with a host body:has() rule, this restyled every element under BODY on any insertion.
        const reviewed = '/* has-invalidation-allow: small subtree */\n:is(.probe:has(.inner) > :not(.exclude)) { color: red; }';
        expect(blocking(reviewed)).toEqual([expect.objectContaining({ line: 2, reason: expect.stringContaining('cannot be allowed') })]);
        expect(blocking('/* has-invalidation-allow: small subtree */\n.a:has(.b) > * { color: red; }')).toHaveLength(1);
        expect(blocking('/* has-invalidation-allow: small subtree */\n.a:has(.b) > rt { color: red; }')).toEqual([]);
        // One bare alternative matches every element, so the list keys on nothing.
        expect(blocking('/* has-invalidation-allow: small subtree */\n.probe:has(.inner) > :is(*, .exclude) { color: red; }')).toHaveLength(1);
        expect(blocking('/* has-invalidation-allow: small subtree */\n.a:has(.b) > :where(.c, :hover) { color: red; }')).toHaveLength(1);
        expect(blocking('/* has-invalidation-allow: small subtree */\n.a:has(.b) > :is(rt, .c) { color: red; }')).toEqual([]);
        expect(blocking(':is(:hover, .a):has(.b) { color: red; }')).toEqual([expect.objectContaining({ reason: 'anchored on the document root' })]);
    });

    it('refuses exactly the probe selectors Chromium restyles all of BODY for (css-has-invalidation-smoke re-measures them)', () => {
        const allow = '/* has-invalidation-allow: small subtree */\n';
        const disagreements = HAS_GATE_PROBES.filter(({ selector, wholeSubtree }) => (blocking(`${allow}${selector} { color: red; }`).length > 0) !== wholeSubtree);
        expect(disagreements).toEqual([]);
    });

    it('reports the line and source of a decoded escape as written', () => {
        expect(blocking('.a {}\n.p:h\\61 s(.i)\n  > * { color: red; }')).toEqual([
            expect.objectContaining({ line: 2, selector: '.p:h\\61 s(.i) > *', reason: expect.stringContaining('cannot be allowed') }),
        ]);
        expect(blocking('b\\6f dy:has(.x) { color: red; }')).toEqual([expect.objectContaining({ reason: 'anchored on the document root' })]);
    });

    it('does not read brackets, parens or quotes inside strings and escapes as selector syntax', () => {
        // Chromium: with a host body:has() rule, this restyled every element under BODY on any insertion.
        expect(blocking('.probe[data-label="("]:has(.inner) > :not(.exclude) { color: red; }')).toEqual([
            expect.objectContaining({ reason: expect.stringContaining('cannot be allowed') }),
        ]);
        expect(blocking(".a[title=')]'] :has(.b) { color: red; }")).toHaveLength(1);
        expect(blocking('.a\\(:has(.b) > * { color: red; }')).toHaveLength(1);
        expect(blocking('.a[title="{ body:has(.x) .y }"]:has(.b) { color: red; }')).toEqual([]);
    });

    it('reports :has() in nested style rules instead of guessing what `&` resolves to', () => {
        expect(blocking('body {\n  &:has(.x) .y { color: red; }\n}')).toEqual([
            expect.objectContaining({ line: 2, reason: 'nested in a style rule that this check cannot resolve' }),
        ]);
        expect(blocking('.a:has(.b) { .c { color: red; } }')).toHaveLength(1);
        expect(blocking('.a { .b { color: red; } }')).toEqual([]);
        expect(blocking('@media (hover: hover) { .a:has(.b) { color: red; } }')).toEqual([]);
    });

    it('cannot allow unresolved nesting that invalidates all of BODY beside a host :has() rule', () => {
        // Chromium: each caused 19 whole-BODY invalidations in 20 host text
        // replacements, even though the nesting parent is a small class anchor.
        const allow = '/* has-invalidation-allow: small subtree */';
        expect(blocking(`.p {\n${allow}\n&:has(.i) > * { color: red; }\n}`)).toEqual([
            expect.objectContaining({ line: 3, reason: 'nested in a style rule that this check cannot resolve' }),
        ]);
        expect(blocking(`.p:has(.i) {\n${allow}\n> * { color: red; }\n}`)).toEqual([
            expect.objectContaining({ line: 3, reason: 'nested in a style rule that this check cannot resolve' }),
        ]);
        for (const { rule } of HAS_GATE_RULE_PROBES) expect(blocking(`${allow}\n${rule}`)).toHaveLength(1);
    });

    it('cannot allow a :has() in an @scope prelude, whose scoped rules the gate does not resolve', () => {
        // Chromium: `@scope (.p:has(.i)) { * {} }` caused 19 whole-BODY invalidations
        // beside a host body:has() rule; before this the gate skipped @scope preludes.
        const allow = '/* has-invalidation-allow: small subtree */';
        expect(blocking(`${allow}\n@scope (.p:has(.i)) {\n* { color: red; }\n}`)).toEqual([
            expect.objectContaining({ line: 2, selector: '@scope (.p:has(.i))', reason: 'in an @scope prelude that this check cannot resolve' }),
        ]);
        expect(blocking('@scope (.p) to (.q:h\\61 s(.i)) { * { color: red; } }')).toHaveLength(1);
        expect(blocking('@scope (.p) { .k { color: red; } }')).toEqual([]);
        expect(blocking('@supports selector(:has(a)) { .k { color: red; } }')).toEqual([]);
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
