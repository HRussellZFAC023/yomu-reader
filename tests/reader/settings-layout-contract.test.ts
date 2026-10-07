import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const settingsCss = readFileSync('src/reader/styles/settings.css', 'utf8').replace(/\s+/gu, ' ');
const newTabCss = readFileSync('src/reader/styles/new-tab.css', 'utf8').replace(/\s+/gu, ' ');

describe('Settings layout contract', () => {
    it('keeps phone toasts off the Settings footer, the Study tab bar and the open radial menu', () => {
        expect(settingsCss).toContain('@media (max-width: 699px) { body:has(.jpdb-reader-settings, .jpdb-reader-newtab-app-nav) .jpdb-reader-toast-stack { bottom: calc(84px + env(safe-area-inset-bottom)); }');
        expect(settingsCss).toContain('body:has(.jpdb-reader-fab-radial.is-open) .jpdb-reader-toast-stack { top: calc(72px + env(safe-area-inset-top)); bottom: auto; } }');
    });

    it('paints active placeholders with the readable muted token, not the faint one', () => {
        // Dark settings measured 3.57:1 with the faint token; the smoke requires 4.5:1.
        expect(settingsCss).toContain('.jpdb-reader-settings input::placeholder, .jpdb-reader-settings textarea::placeholder { color: var(--jpdb-reader-muted) !important; opacity: 1; }');
        expect(newTabCss).toContain('.jpdb-reader-newtab-searchbox input::placeholder { color: var(--jpdb-reader-muted); -webkit-text-fill-color: var(--jpdb-reader-muted); opacity: 1; }');
    });
});
