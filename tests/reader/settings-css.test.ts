import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { TRANSCRIPT_PANEL_Z_INDEX } from '../../src/reader/subtitles/subtitle-layout';

const INTERACTIONS_CSS = readFileSync('src/reader/styles/interactions.css', 'utf8');
const READER_WORDS_OCR_CSS = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');

function normalizeCss(css: string): string {
    return css.replace(/\s+/g, ' ');
}

function normalizedRuleBlock(css: string, selector: string): string {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`).exec(css);
    return normalizeCss(match?.[1] ?? '');
}

describe('settings CSS', () => {
    it('imports the shared interaction state layer into both reader CSS bundles', () => {
        const readerEntryCss = readFileSync('src/reader/styles-reader.css', 'utf8');
        const newTabEntryCss = readFileSync('src/reader/styles.css', 'utf8');
        const normalizedInteractionsCss = normalizeCss(INTERACTIONS_CSS);

        expect(readerEntryCss).toContain("@import './styles/interactions.css';");
        expect(newTabEntryCss.trim().endsWith("@import './styles/interactions.css';")).toBe(true);
        expect(normalizedInteractionsCss).toContain('.jpdb-reader-popover :where( .jpdb-reader-source-card > summary.jpdb-reader-local-title,');
        expect(normalizedInteractionsCss).toContain('.jpdb-reader-newtab .jpdb-reader-newtab-more[open] .jpdb-reader-newtab-more-menu, .jpdb-reader-newtab .jpdb-reader-newtab-search-card-shell[data-newtab-search-expanded="true"] .jpdb-reader-newtab-search-detail, .jpdb-subtitle-style-popover:not([hidden]) { animation: jpdb-reader-interaction-enter 0.14s ease-out both; }');
        expect(normalizedInteractionsCss).toContain('.jpdb-reader-newtab .jpdb-reader-newtab-study { transition: background-color 0.16s ease, filter 0.16s ease; }');
        expect(normalizedInteractionsCss).toContain('@media (prefers-reduced-motion: reduce)');
    });


    it('keeps the settings puck clickable when it overlaps the transcript side panel', () => {
        const puckRule = normalizedRuleBlock(READER_WORDS_OCR_CSS, '.jpdb-reader-fab');

        expect(puckRule).toContain(`z-index: ${TRANSCRIPT_PANEL_Z_INDEX + 1} !important;`);
        expect(puckRule).toContain('opacity: 0.72 !important;');
        expect(TRANSCRIPT_PANEL_Z_INDEX + 1).toBeLessThan(2147483647);
    });

    it('keeps passive page annotations layout-neutral and honours configured highlights at rest', () => {
        const normalizedReaderWordsOcrCss = normalizeCss(READER_WORDS_OCR_CSS);

        // Passive words stay layout-neutral but keep their decoration sources.
        // The shared highlight rule deliberately includes passive chrome so the
        // user's configured highlight mode remains visible at rest.
        expect(normalizedReaderWordsOcrCss).toContain('.jpdb-reader-word.jpdb-reader-passive-word { --jpdb-reader-word-color-source: currentColor; display: inline !important; white-space: inherit; word-break: inherit; overflow-wrap: inherit !important; line-break: inherit; cursor: inherit; }');
        expect(normalizedReaderWordsOcrCss).toContain('[data-jpdb-reader-passive-chrome] .jpdb-reader-passive-word { white-space: inherit; }');
        expect(normalizedReaderWordsOcrCss).toContain(':is(button, [role="button"], [role="tab"], summary, label, .jpdb-reader-control-text-mirror, [data-jpdb-reader-passive-atomic="true"]) .jpdb-reader-passive-word { white-space: nowrap; }');
        expect(normalizedReaderWordsOcrCss).toContain(':is( .jpdb-reader-word-highlight-status, .jpdb-reader-word-highlight-jpdb, .jpdb-reader-word-highlight-anki, .jpdb-reader-word-highlight-pitch ) .jpdb-reader-word { --jpdb-reader-word-highlight-paint:');
        expect(normalizedReaderWordsOcrCss).not.toContain('[data-jpdb-reader-passive-chrome="true"] ) .jpdb-reader-word.jpdb-reader-passive-word');
    });

});
