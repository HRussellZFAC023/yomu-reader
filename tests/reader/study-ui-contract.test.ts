import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const newTabCss = readFileSync('src/reader/styles/new-tab.css', 'utf8').replace(/\s+/gu, ' ');
const statsCss = readFileSync('src/reader/styles/stats.css', 'utf8').replace(/\s+/gu, ' ');
const academyShellCss = readFileSync('src/academy/styles/shell.css', 'utf8').replace(/\s+/gu, ' ');

describe('Reader Study UI contract', () => {
    it('keeps fail left red and pass right green independently of theme state colors', () => {
        expect(newTabCss).toContain('--jpdb-reader-study-fail: #d92d20;');
        expect(newTabCss).toContain('--jpdb-reader-study-pass: #168a45;');
        expect(newTabCss).toContain('color-mix(in srgb, var(--jpdb-reader-study-fail) 62%, transparent)');
        expect(newTabCss).toContain('color-mix(in srgb, var(--jpdb-reader-study-pass) 62%, transparent)');
        expect(newTabCss).toContain('[data-newtab-swipe-mode="nav"][data-newtab-swipe-direction="left"]::before');
        expect(newTabCss).toContain('[data-newtab-swipe-mode="nav"][data-newtab-swipe-direction="right"]::after');
        expect(newTabCss).not.toContain('[data-newtab-swipe-mode="nav"]::before { background:');
        expect(newTabCss).toContain('button[data-grade="fail"], .jpdb-reader-newtab-controls button[data-grade="nothing"] { --jpdb-newtab-grade-accent: var(--jpdb-reader-study-fail); }');
        expect(newTabCss).toContain('button[data-grade="pass"], .jpdb-reader-newtab-controls button[data-grade="okay"] { --jpdb-newtab-grade-accent: var(--jpdb-reader-study-pass); }');
    });

    it('pins embedded Academy Study to the living-paper palette in either Yomu theme', () => {
        expect(newTabCss).toContain('.jpdb-reader-newtab[data-study-surface="academy"] { --jpdb-reader-bg: var(--academy-paper, #f1ead9);');
        expect(newTabCss).toContain('--jpdb-reader-text: var(--academy-paper-ink, #29271f);');
        expect(newTabCss).toContain('--jpdb-reader-muted: var(--academy-paper-muted, #655f51);');
        expect(newTabCss).toContain('--jpdb-reader-accent: var(--academy-accent, #5ea780);');
        expect(newTabCss).toContain('--jpdb-reader-accent-readable: color-mix( in srgb, var(--academy-accent, #5ea780) 62%, var(--academy-paper-ink, #29271f) );');
        expect(newTabCss).toContain('--jpdb-reader-selection-bg: #6d5149; --jpdb-reader-selection-text: #fffdf5;');
        expect(newTabCss).toContain('color-scheme: light; background: transparent;');
        expect(newTabCss).toContain('.jpdb-reader-newtab[data-study-surface="academy"] .jpdb-reader-newtab-controls button { color: var(--jpdb-reader-text); text-shadow: none; }');
    });

    it('gives Study text fields explicit glyph, caret, placeholder, and selection paint', () => {
        expect(newTabCss).toContain('.jpdb-reader-newtab-searchbox input { min-width: 0; min-height: 46px;');
        expect(newTabCss).toContain('color: var(--jpdb-reader-text); -webkit-text-fill-color: var(--jpdb-reader-text); caret-color: var(--jpdb-reader-accent);');
        expect(newTabCss).toContain('.jpdb-reader-newtab-recall-input { width: 100%; min-width: 0;');
        expect(newTabCss).toContain('.jpdb-reader-newtab-recall-input::placeholder { color: var(--jpdb-reader-faint); -webkit-text-fill-color: var(--jpdb-reader-faint); opacity: 1; }');
        expect(newTabCss).toContain('.jpdb-reader-newtab-recall-input::selection { color: var(--jpdb-reader-selection-text); background: var(--jpdb-reader-selection-bg); -webkit-text-fill-color: var(--jpdb-reader-selection-text); }');
        expect(newTabCss).toContain(':is(.jpdb-reader-newtab-searchbox input, .jpdb-reader-newtab-recall-input)::selection { color: #fffdf5; background: #6d5149; -webkit-text-fill-color: #fffdf5; }');
    });

    it('has no duplicate chrome or final-reveal summary pills and constrains embedded Study to its host', () => {
        expect(newTabCss).not.toContain('.jpdb-reader-newtab-study-summary');
        expect(newTabCss).toContain('.jpdb-reader-newtab[data-study-surface="academy"] .jpdb-reader-newtab-shell { width: 100%; min-height: 0;');
        expect(newTabCss).toContain('grid-template-rows: auto auto auto auto;');
        expect(newTabCss).toContain('.jpdb-reader-newtab-study[data-newtab-study-step="type-word"] .jpdb-reader-newtab-answer { opacity: 1; filter: none; transform: none; pointer-events: auto; visibility: visible; }');
        expect(newTabCss).toContain('.jpdb-reader-newtab[data-study-surface="academy"] :is( .jpdb-reader-newtab-brand, .jpdb-reader-newtab-theme-controls, .jpdb-reader-newtab-overflow, [data-newtab-session-clock-host] ) { display: none !important; }');
    });

    it('stacks text entry and contains grading controls on narrow Academy phones', () => {
        expect(newTabCss).toContain('@media (max-width: 420px)');
        expect(newTabCss).toContain('.jpdb-reader-newtab[data-study-surface="academy"] .jpdb-reader-newtab-shell, .jpdb-reader-newtab[data-study-surface="academy"] .jpdb-reader-newtab-mode, .jpdb-reader-newtab[data-study-surface="academy"] .jpdb-reader-newtab-controls { width: 100%; max-width: 100%; }');
        expect(newTabCss).toContain('.jpdb-reader-newtab[data-study-surface="academy"] .jpdb-reader-newtab-recall-form { grid-template-columns: minmax(0, 1fr); }');
        expect(newTabCss).toContain('.jpdb-reader-newtab[data-study-surface="academy"] .jpdb-reader-newtab-type-modes { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-radius: 8px; }');
        expect(newTabCss).toContain('.jpdb-reader-newtab[data-study-surface="academy"] .jpdb-reader-newtab-controls.jpdb-reader-newtab-grade-controls, .jpdb-reader-newtab[data-study-surface="academy"] .jpdb-reader-newtab-controls.jpdb-reader-newtab-grade-controls[data-newtab-grade-count="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; max-width: 100%; }');
    });

    it('clips Stats at its own boundary and keeps panel controls together when space permits', () => {
        expect(statsCss).toContain('.jpdb-reader-stats { width: 100%; max-width: 100%; min-width: 0;');
        expect(statsCss).toContain('overflow-x: clip;');
        expect(statsCss).toContain('.jpdb-reader-stats-panel-actions { min-width: 0; display: flex; flex-wrap: nowrap;');
        expect(statsCss).toContain('@media (max-width: 520px)');
        expect(statsCss).toContain('.jpdb-reader-stats-panel-actions { flex-wrap: wrap; }');
    });

    it('keeps the embedded Academy Study controls on one row in narrow hosts', () => {
        expect(academyShellCss).toContain('.academy-study-mount { position: relative; display: grid; gap: 12px; width: min(920px, 100%); max-width: 100%; min-width: 0;');
        expect(academyShellCss).toContain('overflow-x: clip;');
        expect(academyShellCss).toContain('.academy-study-chrome { flex-wrap: nowrap; gap: 6px; }');
        expect(academyShellCss).toContain('.academy-study-clock-host { flex: 0 0 auto; margin-left: auto; gap: 6px; }');
    });
});
