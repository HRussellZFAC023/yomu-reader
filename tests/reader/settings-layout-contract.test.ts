import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const settingsCss = readFileSync('src/reader/styles/settings.css', 'utf8').replace(/\s+/gu, ' ');
const newTabCss = readFileSync('src/reader/styles/new-tab.css', 'utf8').replace(/\s+/gu, ' ');

describe('Settings layout contract', () => {
    it('keeps toasts off the open radial menu and lets toast.ts lift them above control bars', () => {
        expect(settingsCss).toContain('bottom: max(18px, env(safe-area-inset-bottom), var(--jpdb-reader-toast-clearance, 0px));');
        expect(settingsCss).not.toContain('bottom: calc(84px + env(safe-area-inset-bottom));');
        expect(settingsCss).toContain('@media (max-width: 699px) { body:has(.jpdb-reader-fab-radial.is-open) .jpdb-reader-toast-stack { top: calc(72px + env(safe-area-inset-top)); bottom: auto; } }');
    });

    it('lines Quick setup, Furigana, Readings and Color words up on one row (YQ-13)', () => {
        // The furigana selects used to sit stacked in one cell, 10 px off their neighbours.
        expect(settingsCss).toContain('.jpdb-reader-settings .grid > [data-language-family], .jpdb-reader-settings .grid > [data-reading-annotation-controls] { display: contents; }');
        expect(settingsCss).toContain('.jpdb-reader-settings .grid > [data-reading-annotation-controls] > :is(.jpdb-reader-help, fieldset) { grid-column: 1 / -1; }');
        // ...and their labels take the same label-above structure as their neighbours.
        expect(settingsCss).toContain('.jpdb-reader-settings .grid > [data-reading-annotation-controls] > label:not(.inline) { display: flex; flex-direction: column; align-items: stretch; gap: 6px; margin: 0; }');
        // A checkbox inside a wrapper stays centred on its text instead of
        // being pushed to the bottom of its row by the label-above rule.
        expect(settingsCss).toContain('.jpdb-reader-settings .grid > * > label:not(.inline) > input,');
        expect(settingsCss).not.toContain('.jpdb-reader-settings .grid > * > label > input,');
    });

    it('paints active placeholders with the readable muted token, not the faint one', () => {
        // Dark settings measured 3.57:1 with the faint token; the smoke requires 4.5:1.
        expect(settingsCss).toContain('.jpdb-reader-settings input::placeholder, .jpdb-reader-settings textarea::placeholder { color: var(--jpdb-reader-muted) !important; opacity: 1; }');
        expect(newTabCss).toContain('.jpdb-reader-newtab-searchbox input::placeholder { color: var(--jpdb-reader-muted); -webkit-text-fill-color: var(--jpdb-reader-muted); opacity: 1; }');
    });

    it('stacks source rows only on narrow screens so touch tablets keep the denser row layout', () => {
        expect(settingsCss).toContain('@media (max-width: 699px) { .jpdb-reader-order-head { display: none; }');
        expect(settingsCss).toContain('@media (max-width: 699px), (hover: none), (pointer: coarse) { .jpdb-reader-study-step-head { display: none; }');
        expect(settingsCss).not.toContain('@media (max-width: 699px), (hover: none), (pointer: coarse) { .jpdb-reader-order-head');
    });
});
