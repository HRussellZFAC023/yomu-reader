import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { contrastRatio } from '../../src/reader/theme/color-utils';

// The shared palette gives each colour one job. Red is the よむ accent:
// selection, focus and the one primary action. An outcome takes the success or
// error colour, so a connected key never looks like a rejected one, and text on
// a coloured badge keeps its own ink.
const CSS = {
    base: read('base'),
    popover: read('popover-core'),
    settings: read('settings'),
    words: read('reader-words-ocr'),
};

function read(name: string): string {
    return readFileSync(`src/reader/styles/${name}.css`, 'utf8');
}

type Theme = 'light' | 'dark';

/** The custom properties of the first rule whose selector starts with `selector`. */
function block(css: string, selector: string): string {
    const start = css.indexOf(`${selector}`);
    if (start < 0) throw new Error(`No rule for ${selector}`);
    const open = css.indexOf('{', start);
    return css.slice(open + 1, css.indexOf('}', open)).replace(/\/\*[\s\S]*?\*\//gu, '');
}

function declarations(body: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const match of body.matchAll(/(?:^|[\s;])(-{0,2}[a-z][\w-]*)\s*:\s*([^;]+);/giu)) out.set(match[1], match[2].replace(/!important/u, '').trim());
    return out;
}

function themeTokens(theme: Theme): Map<string, string> {
    const tokens = declarations(block(CSS.base, ':root {'));
    for (const [name, value] of declarations(block(CSS.base, `.jpdb-reader-theme-${theme},`))) tokens.set(name, value);
    return tokens;
}

/** Resolves var() chains to a hex colour; colour-mix and other functions are not expected here. */
function resolve(value: string, tokens: Map<string, string>): string {
    let current = value.trim();
    for (let depth = 0; depth < 12; depth++) {
        const match = /^var\((--[\w-]+)(?:,\s*(.+))?\)$/u.exec(current);
        if (!match) break;
        current = (tokens.get(match[1]) ?? match[2] ?? '').trim();
    }
    if (!/^#[0-9a-f]{6}$/iu.test(current)) throw new Error(`${value} did not resolve to a hex colour (${current})`);
    return current.toLowerCase();
}

function property(css: string, selector: string, name: string, theme: Theme): string {
    const value = declarations(block(css, selector)).get(name);
    if (!value) throw new Error(`${selector} has no ${name}`);
    return resolve(value, themeTokens(theme));
}

function hue(hex: string): number {
    const [r, g, b] = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    if (!delta) return 0;
    const raw = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return (raw * 60 + 360) % 360;
}

function hueDistance(a: string, b: string): number {
    const distance = Math.abs(hue(a) - hue(b));
    return Math.min(distance, 360 - distance);
}

const OUTCOMES: Array<{ name: string; css: string; success: string; error: string; property: string }> = [
    { name: 'status line light', css: CSS.popover, success: '.jpdb-reader-status-line[data-status-tone="success"]', error: '.jpdb-reader-status-line[data-status-tone="error"]', property: '--jpdb-reader-status-light' },
    { name: 'Anki adapter chip', css: CSS.settings, success: '.jpdb-reader-adapter-state-chip[data-adapter-state="connected"],', error: '.jpdb-reader-adapter-state-chip[data-adapter-state="unreachable"]', property: 'color' },
    { name: 'Settings save status', css: CSS.settings, success: '.jpdb-reader-settings-save-status[data-status-tone="success"]', error: '.jpdb-reader-settings-save-status[data-status-tone="error"]', property: 'color' },
    { name: 'Academy account status', css: CSS.settings, success: '.jpdb-reader-settings .jpdb-reader-academy-account-status[data-status-tone="success"]', error: '.jpdb-reader-settings .jpdb-reader-academy-account-status[data-status-tone="error"]', property: 'color' },
    { name: 'OCR status mark', css: CSS.words, success: '.jpdb-ocr-video-frame-status {', error: '.jpdb-ocr-video-frame-status-failed {', property: '--jpdb-ocr-status-ink' },
];

describe('the shared palette', () => {
    for (const theme of ['light', 'dark'] as const) {
        for (const outcome of OUTCOMES) {
            it(`paints success and failure in different hues: ${outcome.name}, ${theme}`, () => {
                const success = property(outcome.css, outcome.success, outcome.property, theme);
                const error = property(outcome.css, outcome.error, outcome.property, theme);
                expect(hueDistance(success, error), `${success} vs ${error}`).toBeGreaterThanOrEqual(90);
                expect(hueDistance(success, resolve('var(--jpdb-reader-accent)', themeTokens(theme)))).toBeGreaterThanOrEqual(90);
            });
        }

        // A success line is calm: ink text with the green dot. Green text on a
        // green-tinted panel fell under 4.5:1 in the light theme.
        it(`writes a success line in ink and an error line in the error colour (${theme})`, () => {
            expect(property(CSS.popover, '.jpdb-reader-status-line[data-status-tone="success"]', 'color', theme)).toBe(resolve('var(--jpdb-reader-text)', themeTokens(theme)));
            expect(property(CSS.popover, '.jpdb-reader-status-line[data-status-tone="error"]', 'color', theme)).toBe(resolve('var(--jpdb-reader-danger-readable)', themeTokens(theme)));
        });

        // Success and warning are text colours too (the save line, the Anki
        // confidence chip, Desktop status), on the page, a panel or a raised row.
        // The first light warning (#916f08) passed on white only.
        for (const tone of ['success', 'warning'] as const) {
            it(`keeps ${tone} text readable on page, surface and surface-2 (${theme})`, () => {
                const tokens = themeTokens(theme);
                const ink = resolve(`var(--jpdb-reader-${tone})`, tokens);
                for (const ground of ['bg', 'surface', 'surface-2']) {
                    const paper = resolve(`var(--jpdb-reader-${ground})`, tokens);
                    expect(contrastRatio(ink, paper), `${tone} ${ink} on ${ground} ${paper}`).toBeGreaterThanOrEqual(4.5);
                }
            });
        }
    }

    // The current puck uses an SVG state badge. Its white glyph on amber was
    // 2.2:1; the badge needs its own dark ink, independently of the brand accent.
    it('keeps the furigana-off badge legible on its amber', () => {
        const badge = '.jpdb-reader-fab.jpdb-reader-fab--no-furigana .jpdb-reader-fab-state {';
        const tone = '.jpdb-reader-fab.jpdb-reader-fab--no-furigana {';
        for (const theme of ['light', 'dark'] as const) {
            const ink = property(CSS.words, badge, 'color', theme);
            const amber = property(CSS.words, tone, '--jpdb-reader-fab-tone', theme);
            expect(contrastRatio(ink, amber), `${ink} on ${amber}`).toBeGreaterThanOrEqual(4.5);
        }
    });
});

// Red is the よむ accent for selection, focus and one primary action. Swapping
// the default from green to red once painted every Stats bar, heatmap day and
// provider dot red, so Stats read like an error report.
describe('where the red does not go', () => {
    const stats = readFileSync('src/reader/styles/stats.css', 'utf8');
    const newTab = readFileSync('src/reader/styles/new-tab.css', 'utf8');
    const ruleBody = (css: string, selector: string): string => {
        const start = css.indexOf(`${selector} {`);
        if (start < 0) throw new Error(`No rule for ${selector}`);
        return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
    };

    it('draws Stats data in ink', () => {
        for (const selector of [
            '.jpdb-reader-stats-bar-fill',
            '.jpdb-reader-stats-heatmap-cell[data-level="1"]',
            '.jpdb-reader-stats-heatmap-cell[data-level="2"]',
            '.jpdb-reader-stats-heatmap-cell[data-level="3"]',
            '.jpdb-reader-stats-heatmap-cell[data-level="4"]',
        ]) expect(ruleBody(stats, selector), selector).not.toContain('--jpdb-reader-accent');
    });

    // On dark manga pages the auto overlay mixed 22% red into every line's band
    // and 58% into its rim: maroon bands that read as an alert.
    it('bands OCR lines in ink on dark pages', () => {
        const ocr = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
        expect(ruleBody(ocr, '.jpdb-ocr-layer[data-ocr-overlay-theme="dark"][data-ocr-overlay-variant="auto"]')).not.toContain('--jpdb-reader-accent');
    });

    it('gives no review source the brand red as its dot', () => {
        for (const source of ['jpdb', 'bunpro', 'yomu-local']) {
            expect(ruleBody(newTab, `.jpdb-reader-newtab-source-select[data-source="${source}"]`), source).not.toContain('--jpdb-reader-accent');
            expect(ruleBody(newTab, `.jpdb-reader-newtab-status-light[data-source="${source}"]`), source).not.toContain('--jpdb-reader-accent');
        }
    });
});
