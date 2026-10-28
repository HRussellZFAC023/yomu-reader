import { describe, expect, it } from 'vitest';

import { uiText } from '../../src/reader/app/i18n';
import { sharedContrastRatio } from '../../src/reader/core/color-math';
import { hostedAccentCssVariables, hostedPageThemeColor } from '../../src/reader/core/hosted-accent-css';
import { ACCENT_SWATCHES, accentSwatchForColor } from '../../src/reader/theme/accent-swatches';
import { BRAND_COLOR_TOKENS } from '../../src/reader/theme/brand-color-tokens';
import { readableTextOnAccent } from '../../src/reader/theme/reader-theme';

function hue(color: string): number {
    const [r, g, b] = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    if (!delta) return 0;
    const sector = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return (sector * 60 + 360) % 360;
}

describe('accent swatches', () => {
    it('offers the six owner-chosen colours, led by the current default red', () => {
        expect(ACCENT_SWATCHES.map(swatch => swatch.id)).toEqual(['kurenai', 'shu', 'ai', 'murasaki', 'yamabuki', 'sumi']);
        expect(ACCENT_SWATCHES[0].color).toBe(BRAND_COLOR_TOKENS.accent);
        expect(new Set(ACCENT_SWATCHES.map(swatch => swatch.color)).size).toBe(ACCENT_SWATCHES.length);
        for (const swatch of ACCENT_SWATCHES) {
            expect(swatch.color).toMatch(/^#[0-9a-f]{6}$/);
            expect(accentSwatchForColor(swatch.color.toUpperCase())).toBe(swatch);
        }
        expect(accentSwatchForColor('#123456')).toBeUndefined();
    });

    it('has no green', () => {
        for (const swatch of ACCENT_SWATCHES) {
            const degrees = hue(swatch.color);
            expect(degrees < 75 || degrees > 170, `${swatch.id} ${swatch.color} hue ${degrees}`).toBe(true);
        }
    });

    for (const dark of [false, true]) {
        const theme = dark ? 'dark' : 'light';
        it(`keeps text on every swatch at AA in ${theme}`, () => {
            for (const swatch of ACCENT_SWATCHES) {
                // Reader surfaces (popup, puck, subtitles, settings).
                expect(sharedContrastRatio(swatch.color, readableTextOnAccent(swatch.color)), `${swatch.id} reader`)
                    .toBeGreaterThanOrEqual(4.5);
                // Hosted surfaces (Study, docs, PDF reader, video player).
                const variables = hostedAccentCssVariables(swatch.color, dark);
                expect(variables['--jpdb-reader-accent']).toBe(swatch.color);
                expect(sharedContrastRatio(variables['--jpdb-reader-accent'], variables['--jpdb-reader-accent-text']), `${swatch.id} hosted`)
                    .toBeGreaterThanOrEqual(4.5);
                expect(sharedContrastRatio(variables['--yomu-accent-readable'], hostedPageThemeColor(dark)), `${swatch.id} readable accent`)
                    .toBeGreaterThanOrEqual(4.5);
            }
        });
    }

    it('names every swatch in English and Japanese', () => {
        for (const language of ['en', 'ja'] as const) {
            const names = ACCENT_SWATCHES.map(swatch => uiText(language, swatch.labelKey));
            expect(new Set(names).size).toBe(names.length);
            for (const name of [...names, uiText(language, 'accentSwatchCustom'), uiText(language, 'underlineQuick')]) {
                expect(name).toBeTruthy();
                expect(name).not.toContain('未翻訳');
            }
        }
        expect(ACCENT_SWATCHES.map(swatch => uiText('ja', swatch.labelKey)[0]).join('')).toBe('紅朱藍紫山墨');
    });
});
