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

    it('keeps passive page annotations layout-neutral until hover or focus', () => {
        const normalizedReaderWordsOcrCss = normalizeCss(READER_WORDS_OCR_CSS);

        // Passive words stay layout-neutral but KEEP their decoration sources;
        // only chrome contexts (buttons/menus/nav/marked compact controls) go
        // bare until hover. A blanket strip here regressed pitch underlines on
        // link-wrapped prose into hover-only flicker (1.5.4).
        expect(normalizedReaderWordsOcrCss).toContain('.jpdb-reader-word.jpdb-reader-passive-word { --jpdb-reader-word-color-source: currentColor; display: inline !important; white-space: inherit; word-break: inherit; overflow-wrap: inherit !important; line-break: inherit; cursor: inherit; }');
        expect(normalizedReaderWordsOcrCss).toContain('[data-jpdb-reader-passive-chrome] .jpdb-reader-passive-word { white-space: inherit; }');
        expect(normalizedReaderWordsOcrCss).toContain(':is(button, [role="button"], [role="tab"], summary, label, .jpdb-reader-control-text-mirror, [data-jpdb-reader-passive-atomic="true"]) .jpdb-reader-passive-word { white-space: nowrap; }');
        // The trailing :not() carves YouTube's filter chips, live chat, channel
        // headers, and engagement panels out of bare-until-hover: their
        // Japanese is reading material.
        // Chrome bare-until-hover strips only the highlight (background) paint;
        // text colour honours the contrast-computed accessible colour so ruby
        // base glyphs stay legible (Shorts channel pill "floating readings" fix),
        // and the underline/decoration channels stay visible at rest so pitch
        // underlines on chrome (Shorts subscribe button) survive like subtitles.
        expect(normalizedReaderWordsOcrCss).toContain('[data-jpdb-reader-passive-chrome="true"] ) .jpdb-reader-word.jpdb-reader-passive-word:not(:hover):not(:focus):not(.jpdb-reader-keyboard-active):not(:is(yt-chip-cloud-chip-renderer, yt-chip-cloud-chip-view-model, yt-chip-cloud-renderer, ytd-feed-filter-chip-bar-renderer, ytm-feed-filter-chip-bar-renderer, ytd-engagement-panel-section-list-renderer, ytm-engagement-panel-section-list-renderer, ytd-watch-metadata, ytd-live-chat-frame, ytd-masthead, ytd-mini-guide-renderer, ytd-guide-renderer, yt-page-header-view-model, ytd-c4-tabbed-header-renderer, yt-tab-shape, ytm-slim-video-action-bar-renderer, .jpdb-reader-text-mirror) .jpdb-reader-word) { --jpdb-reader-word-accessible-highlight: transparent; --jpdb-reader-word-highlight-source: transparent; --jpdb-reader-word-highlight-shadow-source: none;');
        expect(normalizedReaderWordsOcrCss).toContain('background-image: none !important; box-shadow: none !important; color: var(--jpdb-reader-word-accessible-color, currentColor) !important; -webkit-text-fill-color: var(--jpdb-reader-word-accessible-color, currentColor); text-shadow: none; }');
    });

});
