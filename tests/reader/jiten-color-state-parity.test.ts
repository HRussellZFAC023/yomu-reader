import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const READER_WORD_CSS = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8').replace(/\s+/g, ' ');
const POPOVER_CSS = readFileSync('src/reader/styles/popover-core.css', 'utf8').replace(/\s+/g, ' ');
const NEW_TAB_CONFIG = readFileSync('src/reader/newtab/controller-config.ts', 'utf8');
const NEW_TAB_CSS_ENTRY = readFileSync('src/reader/styles.css', 'utf8');
const SHIPPED_TEXT_ARTIFACTS = [
    'dist/yomu.user.js',
    'docs/public/yomu.user.js',
    'docs/public/study/app.js',
    'docs/public/greasyfork/yomu-settings-surface.user.js',
    'docs/public/greasyfork/yomu-video.user.js',
].map(path => [path, readFileSync(path, 'utf8')] as const);

describe('Jiten color state parity CSS', () => {
    it('does not ship standalone Legacy copy tokens', () => {
        for (const [path, text] of SHIPPED_TEXT_ARTIFACTS) {
            expect({ path, matches: text.match(/\bLegacy\b/g) ?? [] }).toEqual({ path, matches: [] });
        }
    });

    it('styles frequent and unparsed reader-word classes for page, OCR, subtitle, and newtab words', () => {
        expect(READER_WORD_CSS).toContain('.jpdb-reader-word.jpdb-frequent { --jpdb-reader-jpdb-color: var(--jpdb-reader-state-frequent);');
        expect(READER_WORD_CSS).toContain('text-decoration-style: dotted !important;');
        expect(READER_WORD_CSS).toContain('.jpdb-reader-word.jpdb-unparsed { --jpdb-reader-jpdb-color: var(--jpdb-reader-state-unparsed);');
        expect(READER_WORD_CSS).toContain('text-decoration-style: dashed !important;');
        expect(READER_WORD_CSS).toContain('.jpdb-frequent, .jpdb-unparsed ) { --jpdb-reader-jpdb-highlight: color-mix(');
        expect(READER_WORD_CSS).toContain('.jpdb-frequent, .jpdb-unparsed, .anki-new');
        expect(NEW_TAB_CONFIG).toContain("'frequent'");
        expect(NEW_TAB_CONFIG).toContain("'unparsed'");
        expect(NEW_TAB_CSS_ENTRY).toContain("@import './styles/reader-words-ocr.css';");
    });

    it('styles Jiten and JPDB state dots for parity-only states', () => {
        expect(POPOVER_CSS).toContain('.jpdb-reader-state-dot.jiten-new,');
        expect(POPOVER_CSS).toContain('.jpdb-reader-state-dot.jiten-young,');
        expect(POPOVER_CSS).toContain('.jpdb-reader-state-dot.jiten-mature,');
        expect(POPOVER_CSS).toContain('.jpdb-reader-state-dot.jiten-mastered,');
        expect(POPOVER_CSS).toContain('.jpdb-reader-state-dot.jiten-due,');
        expect(POPOVER_CSS).toContain('.jpdb-reader-state-dot.jiten-blacklisted,');
        expect(POPOVER_CSS).toContain('.jpdb-reader-state-dot.jpdb-frequent, .jpdb-reader-state-dot.jiten-frequent { background: var(--jpdb-reader-state-frequent); }');
        expect(POPOVER_CSS).toContain('.jpdb-reader-state-dot.jpdb-unparsed, .jpdb-reader-state-dot.jiten-unparsed { background: var(--jpdb-reader-state-unparsed); }');
        expect(NEW_TAB_CSS_ENTRY).toContain("@import './styles/popover-core.css';");
    });
});
