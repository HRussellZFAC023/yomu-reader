import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const POPOVER_CORE_CSS = readFileSync('src/reader/styles/popover-core.css', 'utf8');
const SETTINGS_CSS = readFileSync('src/reader/styles/settings.css', 'utf8');

describe('settings CSS', () => {
    it('keeps inline help link icons and status text constrained inside settings panels', () => {
        const normalizedPopoverCss = POPOVER_CORE_CSS.replace(/\s+/g, ' ');
        const normalizedSettingsCss = SETTINGS_CSS.replace(/\s+/g, ' ');

        expect(normalizedPopoverCss).toContain('.jpdb-reader-status-line[data-status-tone] { --jpdb-reader-status-light: var(--jpdb-reader-faint); display: flex; align-items: flex-start; gap: 8px; min-width: 0; max-width: 100%;');
        expect(normalizedPopoverCss).toContain('white-space: normal; overflow-wrap: anywhere;');
        expect(normalizedSettingsCss).toContain('.jpdb-reader-settings a:not(.jpdb-reader-btn) svg { display: inline-block; width: 0.95em; height: 0.95em;');
        expect(normalizedSettingsCss).toContain('stroke-linejoin: round; vertical-align: -0.12em;');
    });
});
