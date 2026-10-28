import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRAND_COLOR_TOKENS, READER_THEME_COLOR_TOKENS } from '../../src/reader/theme/color-tokens';
// @ts-expect-error The popup builder is a Node ESM script exercised directly by the build.
import { installExtensionPopupActionsSource } from '../../scripts/lib/extension-popup-actions.mjs';

// The toolbar menu is the one よむ surface built outside the reader stylesheet,
// so its palette is checked against the shared tokens directly.
describe('the toolbar menu palette', () => {
    const source = installExtensionPopupActionsSource(readFileSync('tests/fixtures/extension/compiler-popup.js', 'utf8')) as string;
    const [lightRule, darkRule] = source.split('@media (prefers-color-scheme: dark)');

    it.each([
        ['light', lightRule!, READER_THEME_COLOR_TOKENS.light, BRAND_COLOR_TOKENS.accent],
        ['dark', darkRule!, READER_THEME_COLOR_TOKENS.dark, BRAND_COLOR_TOKENS.accentOnDark],
    ])('paints ink and paper with the よむ red focus ring in %s', (_theme, rule, theme, focus) => {
        expect(rule).toContain(`--menu-bg: ${theme.surface};`);
        expect(rule).toContain(`--menu-text: ${theme.text};`);
        expect(rule).toContain(`--menu-hover: ${theme.surface2};`);
        expect(rule).toContain(`--menu-focus: ${focus};`);
    });

    it('rounds its rows like the other controls', () => {
        expect(lightRule).toMatch(/\.yomu-toolbar \.menu button \{[^}]*border-radius: 8px;/u);
    });
});
