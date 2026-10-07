import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const wordsCss = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
const popoverCss = readFileSync('src/reader/styles/popover-core.css', 'utf8').replace(/\s+/gu, ' ');

function rulesFor(css: string, selectorPart: string): string[] {
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)]
        .filter(match => match[1]!.includes(selectorPart))
        .map(match => `${match[1]!.trim()} { ${match[2]!.trim()} }`);
}

describe('Reader surfaces never dim or blur the page behind them', () => {
    it('opens the puck menu without a page scrim or blur', () => {
        const radialRules = rulesFor(wordsCss, 'jpdb-reader-fab-radial');
        expect(radialRules.length).toBeGreaterThan(0);
        expect(radialRules.filter(rule => /backdrop-filter|::before/u.test(rule))).toEqual([]);
    });

    it('gives a lookup a clear dismiss surface while Settings keeps its dim', () => {
        expect(popoverCss).toContain('.jpdb-reader-backdrop { position: fixed; display: block; inset: 0; z-index: 2147483646; background: var(--jpdb-reader-backdrop); }');
        expect(popoverCss).toContain('.jpdb-reader-backdrop--clear { background: transparent; }');
    });
});
