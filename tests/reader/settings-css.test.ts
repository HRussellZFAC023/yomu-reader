import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const BASE_CSS = readFileSync('src/reader/styles/base.css', 'utf8');
const KANJI_CSS = readFileSync('src/reader/styles/kanji.css', 'utf8');
const LOCAL_DICTIONARIES_CSS = readFileSync('src/reader/styles/local-dictionaries.css', 'utf8');
const NEW_TAB_CSS = readFileSync('src/reader/styles/new-tab.css', 'utf8');
const POPOVER_CORE_CSS = readFileSync('src/reader/styles/popover-core.css', 'utf8');
const READER_WORDS_OCR_CSS = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
const SETTINGS_CSS = readFileSync('src/reader/styles/settings.css', 'utf8');
const SUBTITLES_YOUTUBE_CSS = readFileSync('src/reader/styles/subtitles-youtube.css', 'utf8');

function normalizeCss(css: string): string {
    return css.replace(/\s+/g, ' ');
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

    it('keeps host page button widths out of shared popover controls', () => {
        const normalizedKanjiCss = normalizeCss(KANJI_CSS);

        expect(normalizedKanjiCss).toContain('.jpdb-reader-btn { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; width: auto; min-width: 0; max-width: 100%;');
    });

    it('redeclares layout for root surfaces after the host-page reset', () => {
        const normalizedLocalDictionaryCss = normalizeCss(LOCAL_DICTIONARIES_CSS);
        const normalizedNewTabCss = normalizeCss(NEW_TAB_CSS);
        const normalizedPopoverCss = normalizeCss(POPOVER_CORE_CSS);
        const normalizedReaderWordsOcrCss = normalizeCss(READER_WORDS_OCR_CSS);
        const normalizedSettingsCss = normalizeCss(SETTINGS_CSS);
        const normalizedSubtitlesCss = normalizeCss(SUBTITLES_YOUTUBE_CSS);

        expect(normalizedReaderWordsOcrCss).toContain('.jpdb-ocr-layer { position: fixed; display: block;');
        expect(normalizedReaderWordsOcrCss).toContain('.jpdb-reader-fab { position: fixed; display: inline-flex; align-items: center; justify-content: center;');
        expect(normalizedPopoverCss).toContain('.jpdb-reader-backdrop { position: fixed; display: block;');
        expect(normalizedPopoverCss).toContain('.jpdb-reader-popover, .jpdb-reader-settings { position: fixed; display: block;');
        expect(normalizedPopoverCss).toContain('pointer-events: auto !important;');
        expect(normalizedPopoverCss).toContain('.jpdb-reader-popover-body, .jpdb-reader-word-pills, .jpdb-reader-popover :is(a[href], button, input, select, textarea, summary, [role="button"], [data-action], .jpdb-reader-word, .jpdb-reader-action-pill), .jpdb-reader-settings :is(a[href], button, input, select, textarea, summary, [role="button"], [data-action]) { pointer-events: auto !important; }');
        expect(normalizedPopoverCss).toContain('.jpdb-reader-onboarding { position: fixed; display: block;');
        expect(normalizedPopoverCss).toContain('.jpdb-reader-onboarding h2 { margin: 0 0 8px -0.06em; padding: 0; border: 0 !important;');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings { left: 50%; top: 50%; transform: translate(-50%, -50%);');
        expect(normalizedSettingsCss).toContain('padding: 0; display: flex; flex-direction: column;');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings input, .jpdb-reader-settings select, .jpdb-reader-settings textarea, .jpdb-reader-field-display { width: 100%; box-sizing: border-box; min-height: 38px; border-radius: 7px; border: 1px solid var(--jpdb-reader-border) !important; background-color: var(--jpdb-reader-surface) !important; color: var(--jpdb-reader-text) !important;');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings fieldset { border: 1px solid var(--jpdb-reader-border); border-radius: 8px; background: transparent;');
        expect(normalizedSubtitlesCss).toContain('.jpdb-subtitle-player { position: fixed; display: block;');
        expect(normalizedLocalDictionaryCss).toContain('.yomu-jpdb-page-addon { display: block;');
        expect(normalizedLocalDictionaryCss).toContain('width: 100%; max-width: 100%;');
        expect(normalizedNewTabCss).toContain('.jpdb-reader-newtab { --jpdb-reader-newtab-content-width: min(760px, 100%); display: block;');
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
