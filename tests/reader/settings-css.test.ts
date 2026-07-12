import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { TRANSCRIPT_PANEL_Z_INDEX } from '../../src/reader/subtitles/subtitle-layout';

const BASE_CSS = readFileSync('src/reader/styles/base.css', 'utf8');
const IMMERSION_CSS = readFileSync('src/reader/styles/immersion-study.css', 'utf8');
const KANJI_CSS = readFileSync('src/reader/styles/kanji.css', 'utf8');
const INTERACTIONS_CSS = readFileSync('src/reader/styles/interactions.css', 'utf8');
const LOCAL_DICTIONARIES_CSS = readFileSync('src/reader/styles/local-dictionaries.css', 'utf8');
const NEW_TAB_CSS = readFileSync('src/reader/styles/new-tab.css', 'utf8');
const POPOVER_CORE_CSS = readFileSync('src/reader/styles/popover-core.css', 'utf8');
const READER_WORDS_OCR_CSS = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
const SETTINGS_CSS = readFileSync('src/reader/styles/settings.css', 'utf8');
const SUBTITLES_YOUTUBE_CSS = readFileSync('src/reader/styles/subtitles-youtube.css', 'utf8');

function normalizeCss(css: string): string {
    return css.replace(/\s+/g, ' ');
}

function normalizedRuleBlock(css: string, selector: string): string {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`).exec(css);
    return normalizeCss(match?.[1] ?? '');
}

describe('settings CSS', () => {
    it('keeps inline help link icons and status text constrained inside settings panels', () => {
        const normalizedPopoverCss = normalizeCss(POPOVER_CORE_CSS);
        const normalizedSettingsCss = normalizeCss(SETTINGS_CSS);

        expect(normalizedPopoverCss).toContain('.jpdb-reader-status-line[data-status-tone] { --jpdb-reader-status-light: var(--jpdb-reader-faint); display: flex; align-items: flex-start; gap: 8px; min-width: 0; max-width: 100%;');
        expect(normalizedPopoverCss).toContain('white-space: normal; overflow-wrap: anywhere;');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings a:not(.jpdb-reader-btn) svg { display: inline-block; width: 0.95em; height: 0.95em;');
        expect(normalizedSettingsCss).toContain('stroke-linejoin: round; vertical-align: -0.12em;');
    });

    it('isolates Yomu roots from host page element CSS', () => {
        const normalizedBaseCss = normalizeCss(BASE_CSS);

        expect(normalizedBaseCss).toContain('[data-jpdb-reader-root] { all: initial; box-sizing: border-box; color: var(--jpdb-reader-text); color-scheme: normal; direction: ltr; font: 14px/1.45 var(--jpdb-reader-font); letter-spacing: 0; text-transform: none; unicode-bidi: isolate; }');
        expect(normalizedBaseCss).toContain('[data-jpdb-reader-root], [data-jpdb-reader-root] *, [data-jpdb-reader-root]::before, [data-jpdb-reader-root]::after, [data-jpdb-reader-root] *::before, [data-jpdb-reader-root] *::after { box-sizing: border-box; }');
        expect(normalizedBaseCss).toContain('[data-jpdb-reader-root] *, [data-jpdb-reader-root] *::before, [data-jpdb-reader-root] *::after { background: transparent; color: inherit; }');
        expect(normalizedBaseCss).toContain('--jpdb-reader-selection-bg: color-mix(in srgb, var(--jpdb-reader-accent) 24%, var(--jpdb-reader-surface-2));');
        expect(normalizedBaseCss).toContain('[data-jpdb-reader-root]::selection, [data-jpdb-reader-root] *::selection { background-color: var(--jpdb-reader-selection-bg); color: var(--jpdb-reader-selection-text); text-shadow: none; }');
        expect(normalizedBaseCss).toContain('[data-jpdb-reader-root]:where(button), [data-jpdb-reader-root] :where(button) { appearance: none;');
        expect(normalizedBaseCss).toContain('height: auto; min-height: 0; width: auto; min-width: 0; max-width: none; line-height: normal; margin: 0; padding: 0; text-align: inherit;');
        expect(normalizedBaseCss).toContain('[data-jpdb-reader-root]:where(input, select, textarea), [data-jpdb-reader-root] :where(input, select, textarea) { appearance: auto;');
        expect(normalizedBaseCss).toContain('[data-jpdb-reader-root]:where(input[type="checkbox"], input[type="radio"]), [data-jpdb-reader-root] :where(input[type="checkbox"], input[type="radio"]) { accent-color: var(--jpdb-reader-accent) !important; }');
        expect(normalizedBaseCss).toContain('[data-jpdb-reader-root]:where(fieldset, legend, p, ul, ol, li, dl, dt, dd, blockquote, figure, form, table, th, td, hr, h1, h2, h3, h4, h5, h6), [data-jpdb-reader-root] :where(fieldset, legend, p, ul, ol, li, dl, dt, dd, blockquote, figure, form, table, th, td, hr, h1, h2, h3, h4, h5, h6) { background: transparent; color: inherit;');
    });

    it('pins Yomu control colors over host page button CSS', () => {
        const normalizedReaderWordsOcrCss = normalizeCss(READER_WORDS_OCR_CSS);
        const normalizedSettingsCss = normalizeCss(SETTINGS_CSS);
        const normalizedInteractionsCss = normalizeCss(INTERACTIONS_CSS);

        expect(normalizedReaderWordsOcrCss).toContain('.jpdb-reader-fab { position: fixed !important; display: inline-flex !important;');
        expect(normalizedReaderWordsOcrCss).toContain('inline-size: 52px !important; block-size: 52px !important; min-inline-size: 52px !important; min-block-size: 52px !important; max-inline-size: 52px !important; max-block-size: 52px !important;');
        expect(normalizedReaderWordsOcrCss).toContain('min-width: 52px !important; width: 52px !important; max-width: 52px !important; height: 52px !important; min-height: 52px !important; max-height: 52px !important; padding: 0 !important;');
        expect(normalizedReaderWordsOcrCss).toContain('border: 1px solid var(--jpdb-reader-border) !important; border-radius: 50% !important; background: var(--jpdb-reader-surface) !important; color: var(--jpdb-reader-text) !important;');
        expect(normalizedReaderWordsOcrCss).toContain('.jpdb-reader-fab:hover, .jpdb-reader-fab:focus-visible { border-color: var(--jpdb-reader-accent) !important; color: var(--jpdb-reader-accent-readable) !important;');
        expect(normalizedReaderWordsOcrCss).toContain(".jpdb-reader-fab.jpdb-reader-fab--no-furigana::after { content: 'ふ' !important;");
        expect(normalizedReaderWordsOcrCss).toContain(".jpdb-reader-fab.jpdb-reader-fab--paused::after { content: 'II' !important;");
        expect(normalizedReaderWordsOcrCss).toContain('.jpdb-reader-fab-radial-item.is-partial { border-color: color-mix(in srgb, var(--jpdb-reader-grade-something) 76%, var(--jpdb-reader-border)) !important;');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings-tab { min-height: 34px !important; padding: 0 11px !important; border: 1px solid var(--jpdb-reader-border) !important;');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings-tab[aria-selected="true"] { border-color: var(--jpdb-reader-accent) !important; color: var(--jpdb-reader-accent-readable) !important; background: var(--jpdb-reader-accent-soft) !important; }');
        expect(normalizedInteractionsCss).toContain('filter: brightness(1.045);');
        expect(normalizedInteractionsCss).toContain('.jpdb-reader-stats-dropzone:focus-within, .jpdb-reader-stats-dropzone:hover { border-color: color-mix(in srgb, var(--jpdb-reader-accent) 64%, var(--jpdb-reader-border));');
    });

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

    it('keeps compact dictionary statuses readable and captions clickable around details blocks', () => {
        const normalizedImmersionCss = normalizeCss(IMMERSION_CSS);
        const normalizedLocalDictionaryCss = normalizeCss(LOCAL_DICTIONARIES_CSS);
        const normalizedNewTabCss = normalizeCss(NEW_TAB_CSS);

        expect(normalizedLocalDictionaryCss).toContain('.jpdb-reader-source-status { flex: 0 0 auto; margin-left: auto; color: var(--jpdb-reader-muted);');
        expect(normalizedImmersionCss).toContain('.jpdb-reader-grammar-more { display: grid; gap: 4px; pointer-events: none; }');
        expect(normalizedImmersionCss).toContain('.jpdb-reader-grammar-more > * { pointer-events: auto; }');
        expect(normalizedNewTabCss).toContain('button.jpdb-reader-newtab-study-hint-btn { padding: 3px 12px; border: 1px solid color-mix(in srgb, var(--jpdb-reader-accent, currentColor) 42%, var(--jpdb-reader-border, currentColor));');
        expect(normalizedNewTabCss).toContain('color: var(--jpdb-reader-accent-readable, var(--jpdb-reader-text, currentColor));');
    });

    it('lets subtitle rails idle while the transcript panel is open', () => {
        const normalizedSubtitlesCss = normalizeCss(SUBTITLES_YOUTUBE_CSS);

        expect(normalizedSubtitlesCss).toContain('.jpdb-subtitle-controls-auto.jpdb-subtitle-controls-idle:not(.jpdb-subtitle-style-open) .jpdb-subtitle-rail:not(:hover):not(:focus-within) { opacity: 0; pointer-events: none; transform: translateY(-4px); }');
        expect(normalizedSubtitlesCss).toContain('.jpdb-subtitle-rail:hover, .jpdb-subtitle-style-open .jpdb-subtitle-rail { opacity: 1; }');
        expect(normalizedSubtitlesCss).not.toContain('jpdb-subtitle-controls-idle:not(.jpdb-subtitle-panel-open)');
        expect(normalizedSubtitlesCss).not.toContain('.jpdb-subtitle-panel-open .jpdb-subtitle-rail');
    });

    it('keeps the settings puck clickable when it overlaps the transcript side panel', () => {
        const puckRule = normalizedRuleBlock(READER_WORDS_OCR_CSS, '.jpdb-reader-fab');

        expect(puckRule).toContain(`z-index: ${TRANSCRIPT_PANEL_Z_INDEX + 1} !important;`);
        expect(puckRule).toContain('opacity: 0.72 !important;');
        expect(TRANSCRIPT_PANEL_Z_INDEX + 1).toBeLessThan(2147483647);
    });

    it('keeps every resting puck state above the audited opacity floor', () => {
        const normalizedReaderWordsOcrCss = normalizeCss(READER_WORDS_OCR_CSS);

        expect(normalizedReaderWordsOcrCss).toContain('.jpdb-reader-fab.jpdb-reader-fab--on { opacity: 0.72 !important;');
        expect(normalizedReaderWordsOcrCss).toContain('.jpdb-reader-fab.jpdb-reader-fab--no-furigana { opacity: 0.72 !important;');
        expect(normalizedReaderWordsOcrCss).toContain('.jpdb-reader-fab.jpdb-reader-fab--paused { filter: grayscale(1) !important; opacity: 0.68 !important;');
        expect(normalizedReaderWordsOcrCss).toContain('.jpdb-reader-fab-over-video:not(:hover):not(:focus-visible) { opacity: 0.68 !important;');
    });

    it('starts review shortcut groups on their own settings-grid row', () => {
        const normalizedSettingsCss = normalizeCss(SETTINGS_CSS);

        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings .grid > .jpdb-reader-shortcut-group { grid-column: 1 / -1; display: grid; grid-template-columns: inherit; align-items: stretch; gap: inherit; }');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings .grid > .jpdb-reader-shortcut-group[hidden] { display: none !important; }');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings .grid > label:not(.inline), .jpdb-reader-settings .grid > .jpdb-reader-shortcut-group > label:not(.inline) { display: flex; flex-direction: column; align-items: stretch; gap: 6px; margin: 0; }');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings .grid > label:not(.inline) > .jpdb-reader-settings-label-text, .jpdb-reader-settings .grid > .jpdb-reader-shortcut-group > label:not(.inline) > .jpdb-reader-settings-label-text { min-height: 2.75em; display: flex; align-items: flex-end; }');
    });

    it('keeps unknown-pitch page-word underlines transparent', () => {
        const normalizedReaderWordsOcrCss = normalizeCss(READER_WORDS_OCR_CSS);

        expect(normalizedReaderWordsOcrCss).toContain('.jpdb-reader-word.jpdb-pitch-unknown { --jpdb-reader-pitch-color: var(--jpdb-reader-pitch-unknown); --jpdb-reader-pitch-readable: var(--jpdb-reader-pitch-unknown-readable); --jpdb-reader-pitch-soft: var(--jpdb-reader-pitch-unknown-soft, transparent); --jpdb-reader-source-pitch-decoration: transparent; }');
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

    it('reserves subtitle line height for furigana on player overlays', () => {
        const normalizedSubtitlesCss = normalizeCss(SUBTITLES_YOUTUBE_CSS);

        expect(normalizedSubtitlesCss).toContain(':is(.jpdb-subtitle-primary, .jpdb-reader-subtitle-surface) .jpdb-reader-word.jpdb-reader-has-furi { line-height: 1.72; }');
    });

    it('keeps host page button widths out of shared popover controls', () => {
        const normalizedKanjiCss = normalizeCss(KANJI_CSS);

        expect(normalizedKanjiCss).toContain('.jpdb-reader-btn { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; width: auto; min-width: 0; max-width: 100%;');
        expect(normalizedKanjiCss).toContain('.jpdb-reader-mining-title:hover, .jpdb-reader-mining-title:focus-visible { color: var(--jpdb-reader-accent-readable); }');
    });

    it('redeclares layout for root surfaces after the host-page reset', () => {
        const normalizedLocalDictionaryCss = normalizeCss(LOCAL_DICTIONARIES_CSS);
        const normalizedNewTabCss = normalizeCss(NEW_TAB_CSS);
        const normalizedPopoverCss = normalizeCss(POPOVER_CORE_CSS);
        const normalizedReaderWordsOcrCss = normalizeCss(READER_WORDS_OCR_CSS);
        const normalizedSettingsCss = normalizeCss(SETTINGS_CSS);
        const normalizedSubtitlesCss = normalizeCss(SUBTITLES_YOUTUBE_CSS);

        expect(normalizedReaderWordsOcrCss).toContain('.jpdb-ocr-layer { position: fixed; display: block;');
        expect(normalizedReaderWordsOcrCss).toContain('.jpdb-reader-fab { position: fixed !important; display: inline-flex !important; align-items: center !important; justify-content: center !important;');
        expect(normalizedPopoverCss).toContain('.jpdb-reader-backdrop { position: fixed; display: block;');
        expect(normalizedPopoverCss).toContain('.jpdb-reader-popover, .jpdb-reader-settings { position: fixed; display: block;');
        expect(normalizedPopoverCss).toContain('pointer-events: auto !important;');
        expect(normalizedPopoverCss).toContain('.jpdb-reader-popover-body, .jpdb-reader-word-pills, .jpdb-reader-popover :is(a[href], button, input, select, textarea, summary, [role="button"], [data-action], .jpdb-reader-word, .jpdb-reader-action-pill), .jpdb-reader-settings :is(a[href], button, input, select, textarea, summary, [role="button"], [data-action]) { pointer-events: auto !important; }');
        expect(normalizedPopoverCss).toContain('.jpdb-reader-onboarding { position: fixed; display: block;');
        expect(normalizedPopoverCss).toContain('.jpdb-reader-onboarding h2 { margin: 0 0 8px -0.06em; padding: 0; border: 0 !important;');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings { left: 50%; top: 50%; transform: translate(-50%, -50%);');
        expect(normalizedSettingsCss).toContain('padding: 0; display: flex; flex-direction: column;');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings-tab { min-height: 34px !important; padding: 0 11px !important; border: 1px solid var(--jpdb-reader-border) !important; border-radius: 999px !important; background: var(--jpdb-reader-surface) !important; color: var(--jpdb-reader-muted) !important;');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-btn { display: inline-flex !important; align-items: center !important; justify-content: center !important; gap: 6px !important; box-sizing: border-box !important; min-height: 38px !important;');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings input, .jpdb-reader-settings select, .jpdb-reader-settings textarea, .jpdb-reader-field-display { width: 100%; box-sizing: border-box; min-height: 38px; border-radius: 7px; border: 1px solid var(--jpdb-reader-border) !important; background-color: var(--jpdb-reader-surface) !important; color: var(--jpdb-reader-text) !important;');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings fieldset { border: 1px solid var(--jpdb-reader-border); border-radius: 8px; background: transparent;');
        expect(normalizedSubtitlesCss).toContain('.jpdb-subtitle-player { position: fixed; display: block;');
        expect(normalizedLocalDictionaryCss).toContain('.yomu-jpdb-page-addon { display: block;');
        expect(normalizedLocalDictionaryCss).toContain('width: 100%; max-width: 100%;');
        expect(normalizedNewTabCss).toContain('.jpdb-reader-newtab { --jpdb-reader-bg: var(--bg, var(--jpdb-reader-theme-dark-bg));');
        expect(normalizedNewTabCss).toContain('--jpdb-reader-newtab-content-width: min(760px, 100%); display: block;');
        expect(normalizedNewTabCss).toContain('.jpdb-reader-newtab-search-suggestions { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 148px), 1fr));');
        expect(normalizedNewTabCss).toContain('.jpdb-reader-newtab-search-suggestion-term, .jpdb-reader-newtab-search-suggestion-detail { min-width: 0; max-width: 100%; overflow: visible; overflow-wrap: anywhere; white-space: normal; }');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings-appearance-preview { min-height: 170px;');
        expect(normalizedSettingsCss).toContain('display: flex; flex-wrap: wrap; align-items: center; justify-content: center; align-content: center; min-width: 0; overflow-wrap: anywhere; word-break: normal; text-align: center; font-size: 28px; line-height: 1.48;');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings-appearance-preview-line { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: center; width: 100%; max-width: min(100%, 36em); min-width: 0; }');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings-appearance-preview-line .jpdb-reader-word { display: inline-block !important; width: auto !important; max-width: none !important; vertical-align: baseline; }');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings-appearance-preview .jpdb-reader-word {');
        expect(normalizedSettingsCss).toContain('color: var( --jpdb-reader-word-accessible-color, var(--jpdb-reader-word-color-source, currentColor) ) !important;');
    });
});
