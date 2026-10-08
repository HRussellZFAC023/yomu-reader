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

function lastNormalizedRuleBlock(css: string, selector: string): string {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = [...css.matchAll(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([^}]*)\\}`, 'g'))];
    return normalizeCss(matches.at(-1)?.[1] ?? '');
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


    it('splits a wrapped Settings section nav into balanced rows rather than stranding one tab', () => {
        const settingsCss = readFileSync('src/reader/styles/settings.css', 'utf8');
        const tabs = lastNormalizedRuleBlock(settingsCss, '.jpdb-reader-settings-tabs');
        const tab = lastNormalizedRuleBlock(settingsCss, '.jpdb-reader-settings-tab');

        // text-wrap balances line boxes only, so the tabs are inline in a block.
        expect(tabs).toContain('display: block;');
        expect(tabs).toContain('text-wrap: balance;');
        expect(tab).toContain('display: inline-flex !important;');
        // The keyboard-open sheet keeps its one scrolling row.
        expect(normalizeCss(settingsCss)).toContain('.jpdb-reader-settings.jpdb-reader-settings-keyboard-open .jpdb-reader-settings-tabs { white-space: nowrap; }');
    });

    it('keeps the section nav on one scrolling row on a phone held sideways, so Save stays on screen', () => {
        const css = normalizeCss(readFileSync('src/reader/styles/settings.css', 'utf8')).replace(/\/\*.*?\*\/ /g, '');
        const landscapeRow = '@media (pointer: coarse) and (max-height: 560px) { .jpdb-reader-settings-tabs { white-space: nowrap; } .jpdb-reader-settings-scroll { padding-bottom: 16px; } }';
        const balancedNav = css.lastIndexOf('text-wrap: balance;');

        // One row of tabs, and only a little room under the last setting: the
        // footer sits below the scroll area, and padding cannot shrink.
        expect(css).toContain(landscapeRow);
        // white-space and text-wrap both set the wrap mode, so the one-row rule
        // only wins when it comes after the balanced nav.
        expect(balancedNav).toBeGreaterThan(-1);
        expect(css.lastIndexOf(landscapeRow)).toBeGreaterThan(balancedNav);
        // The scroll the row needs is still there for the same screens.
        expect(css).toMatch(/@media \(pointer: coarse\) and \(max-height: 560px\) \{[^@]*\.jpdb-reader-settings-tabs \{ overflow-x: auto;/);
    });

    it('sets the Settings title face itself so a host page h2 rule cannot restyle it', () => {
        const settingsCss = readFileSync('src/reader/styles/settings.css', 'utf8');
        const title = lastNormalizedRuleBlock(settingsCss, '.jpdb-reader-settings .jpdb-reader-settings-head h2');

        expect(title).toContain('border: 0;');
        expect(title).toContain('font-family: var(--jpdb-reader-font);');
        expect(lastNormalizedRuleBlock(settingsCss, '.jpdb-reader-settings-launcher .jpdb-reader-settings-scroll'))
            .toContain('padding-bottom: calc(var(--jpdb-reader-settings-gutter) + env(safe-area-inset-bottom, 0px));');
    });

    it('keeps the settings puck clickable when it overlaps the transcript side panel', () => {
        const puckRule = normalizedRuleBlock(READER_WORDS_OCR_CSS, '.jpdb-reader-fab');

        expect(puckRule).toContain(`z-index: ${TRANSCRIPT_PANEL_Z_INDEX + 1} !important;`);
        expect(puckRule).toContain('opacity: 0.9 !important;');
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
        expect(normalizedReaderWordsOcrCss).toContain(':is( .jpdb-reader-word-highlight-status, .jpdb-reader-word-highlight-jpdb, .jpdb-reader-word-highlight-review, .jpdb-reader-word-highlight-pitch ) .jpdb-reader-word { --jpdb-reader-word-highlight-paint:');
        expect(normalizedReaderWordsOcrCss).not.toContain('[data-jpdb-reader-passive-chrome="true"] ) .jpdb-reader-word.jpdb-reader-passive-word');
    });

});
