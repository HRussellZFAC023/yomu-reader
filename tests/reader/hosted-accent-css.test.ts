import { describe, expect, it } from 'vitest';

import {
    currentAccentColor,
    HOSTED_ACCENT_TOKENS,
    hostedAccentCssVariables,
    hostedPageThemeColor,
    readableTextOnHostedAccent,
    sanitizeHostedAccentColor,
} from '../../src/reader/core/hosted-accent-css';
import { sharedContrastRatio } from '../../src/reader/core/color-math';

const ORANGE = '#f2711c';

describe('hosted accent CSS variables', () => {
    it('paints the chosen accent on the accent tokens themselves', () => {
        const variables = hostedAccentCssVariables(ORANGE, false);
        expect(variables['--yomu-accent']).toBe(ORANGE);
        expect(variables['--vp-c-brand-3']).toBe(ORANGE);
        expect(variables['--vp-button-brand-bg']).toBe(ORANGE);
        expect(variables['--accent']).toBe(ORANGE);
        expect(variables['--jpdb-reader-accent']).toBe(ORANGE);
    });

    it('keeps brand text readable against the page background in both themes', () => {
        for (const dark of [false, true]) {
            const background = dark ? HOSTED_ACCENT_TOKENS.pageBgDark : HOSTED_ACCENT_TOKENS.pageBgLight;
            const variables = hostedAccentCssVariables(ORANGE, dark);
            expect(sharedContrastRatio(variables['--vp-c-brand-1'], background)).toBeGreaterThanOrEqual(4.5);
            expect(sharedContrastRatio(variables['--vp-c-brand-2'], background)).toBeGreaterThanOrEqual(3.5);
        }
    });

    it('keeps ink readable on the accent fill', () => {
        for (const accent of [ORANGE, '#ffffff', '#000000', HOSTED_ACCENT_TOKENS.accent]) {
            const ink = hostedAccentCssVariables(accent, false)['--yomu-accent-ink'];
            expect(sharedContrastRatio(ink, accent)).toBeGreaterThanOrEqual(4.5);
            expect(ink).toBe(readableTextOnHostedAccent(accent));
        }
    });

    it('reads the retired green default as the brand red, and keeps every chosen colour', () => {
        expect(currentAccentColor('#5ea780')).toBe(HOSTED_ACCENT_TOKENS.accent);
        expect(currentAccentColor('#5EA780')).toBe(HOSTED_ACCENT_TOKENS.accent);
        expect(currentAccentColor('#5ea781')).toBe('#5ea781');
        expect(currentAccentColor(ORANGE)).toBe(ORANGE);
        expect(hostedAccentCssVariables('#5ea780', false)['--yomu-accent']).toBe(HOSTED_ACCENT_TOKENS.accent);
    });

    it('pairs the brand red with its own light tint on dark pages', () => {
        const dark = hostedAccentCssVariables(undefined, true);
        expect(dark['--vp-c-brand-1']).toBe('#ff7892');
        expect(sharedContrastRatio(dark['--vp-c-brand-1'], HOSTED_ACCENT_TOKENS.pageBgDark)).toBeGreaterThanOrEqual(4.5);
        expect(hostedAccentCssVariables(undefined, false)['--vp-c-brand-1']).toBe(HOSTED_ACCENT_TOKENS.accent);
    });

    it('keeps a filled button label readable when hovered and pressed, in both themes', () => {
        for (const accent of [HOSTED_ACCENT_TOKENS.accent, ORANGE, '#ffd166']) {
            for (const dark of [false, true]) {
                const variables = hostedAccentCssVariables(accent, dark);
                for (const state of ['', 'hover-', 'active-']) {
                    expect(sharedContrastRatio(variables[`--vp-button-brand-${state}text`], variables[`--vp-button-brand-${state}bg`])).toBeGreaterThanOrEqual(4.5);
                }
            }
        }
    });

    it('paints browser chrome in the page colour, not the accent', () => {
        expect(hostedPageThemeColor(false)).toBe(HOSTED_ACCENT_TOKENS.pageBgLight);
        expect(hostedPageThemeColor(true)).toBe(HOSTED_ACCENT_TOKENS.pageBgDark);
    });

    it('softens the accent more in dark mode', () => {
        expect(hostedAccentCssVariables(ORANGE, false)['--vp-c-brand-soft']).toContain('0.16');
        expect(hostedAccentCssVariables(ORANGE, true)['--vp-c-brand-soft']).toContain('0.22');
    });

    it('accepts short hex and rejects anything else', () => {
        expect(sanitizeHostedAccentColor('#F81')).toBe('#ff8811');
        expect(sanitizeHostedAccentColor('orange')).toBe(HOSTED_ACCENT_TOKENS.accent);
        expect(sanitizeHostedAccentColor(undefined)).toBe(HOSTED_ACCENT_TOKENS.accent);
        expect(hostedAccentCssVariables('javascript:alert(1)', false)['--yomu-accent']).toBe(HOSTED_ACCENT_TOKENS.accent);
    });
});
