// Filesystem/subprocess inputs, including generic helpers called by this test.
// @yomu-reads public/** docs/.vitepress/config.mts docs/public/hosted-appearance-settings.js scripts/lib/hosted-appearance*.cjs tests/reader/helpers/hosted-appearance-module-proof.mjs
// @yomu-imports src/reader/core/hosted-appearance-boot.ts src/reader/settings/hosted-appearance-settings.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { beforeEach, describe, expect, it } from 'vitest';

import { hostedAccentCssVariables, sanitizeHostedAccentColor } from '../../src/reader/core/hosted-accent-css';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { currentAccentColor, HOSTED_ACCENT_TOKENS, hostedPageThemeColor, readableTextOnHostedAccent } from "../../src/reader/core/hosted-accent-css";
import { sharedContrastRatio } from "../../src/reader/core/color-math";

const ROOT = process.cwd();
const START_MARKER = '/* yomu:appearance-boot:start */';
const END_MARKER = '/* yomu:appearance-boot:end */';
const snippets = new Map<string, string>();

// esbuild refuses to run under jsdom (its Uint8Array realm check fails), so the
// bootstrap is built in a plain Node process — the same builder every hosted
// surface stamps from.
function hostedAppearanceBootSnippet(mode: 'docs' | 'surface'): string {
    const cached = snippets.get(mode);
    if (cached) return cached;
    const snippet = execFileSync(process.execPath, [
        '-e',
        "process.stdout.write(require(process.argv[1]).hostedAppearanceBootSnippet(process.argv[2]))",
        path.join(ROOT, 'scripts/lib/hosted-appearance-boot.cjs'),
        mode,
    ], { encoding: 'utf8' });
    snippets.set(mode, snippet);
    return snippet;
}

function stampedBootBlock(html: string): string | undefined {
    const start = html.indexOf(START_MARKER);
    const end = html.indexOf(END_MARKER);
    return start === -1 || end === -1 || end < start ? undefined : html.slice(start + START_MARKER.length, end);
}
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const ORANGE = '#f2711c';

function readProjectFile(file: string): string {
    return readFileSync(path.join(ROOT, file), 'utf8');
}

function runBoot(mode: 'docs' | 'surface'): void {
    // eslint-disable-next-line no-new-func
    new Function(hostedAppearanceBootSnippet(mode))();
}

// Hosted surfaces ship a default green accent in static CSS. Applying the
// reader's own accent only after the page bundle hydrates paints a frame of
// green first — the reported "flash of green before it goes back to orange".
// The bootstrap runs inline in <head>, before that first paint.
describe('hosted pre-paint appearance bootstrap', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.className = '';
        document.documentElement.removeAttribute('style');
        document.head.innerHTML = '<meta name="theme-color" content="#5ea780">';
    });

    it('paints the stored accent on the docs surface before hydration', () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ accentColor: ORANGE, theme: 'light' }));
        runBoot('docs');
        const expected = hostedAccentCssVariables(ORANGE, false);
        for (const [name, value] of Object.entries(expected)) {
            expect(document.documentElement.style.getPropertyValue(name)).toBe(value);
        }
        // The browser chrome takes the page's paper, never the accent.
        expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#ffffff');
    });

    it('derives dark-mode accent values from the stored theme preference', () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ accentColor: ORANGE, theme: 'dark' }));
        runBoot('docs');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.style.getPropertyValue('--vp-c-brand-1'))
            .toBe(hostedAccentCssVariables(ORANGE, true)['--vp-c-brand-1']);
        expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#181b20');
        // VitePress' own inline script only ever ADDS `dark`; keeping its key in
        // sync stops a stale value from re-darkening a light page.
        expect(localStorage.getItem('vitepress-theme-appearance')).toBe('dark');
    });

    it('keeps a standalone surface on its own chrome theme-color and page-theme classes', () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ accentColor: ORANGE, theme: 'light' }));
        runBoot('surface');
        expect(document.documentElement.classList.contains('yomu-page-theme-light')).toBe(true);
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(document.documentElement.style.getPropertyValue('--accent')).toBe(ORANGE);
        expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#5ea780');
    });

    it('falls back to the default accent when nothing is stored', () => {
        runBoot('docs');
        expect(document.documentElement.style.getPropertyValue('--yomu-accent')).toBe(sanitizeHostedAccentColor(undefined));
    });

    it('survives unreadable settings without throwing', () => {
        localStorage.setItem(SETTINGS_KEY, '{not json');
        expect(() => runBoot('docs')).not.toThrow();
        expect(document.documentElement.style.getPropertyValue('--yomu-accent')).toBe(sanitizeHostedAccentColor(undefined));
    });

    it('never emits a script end tag that would truncate the inline block', () => {
        expect(hostedAppearanceBootSnippet('docs')).not.toContain('</script');
        expect(hostedAppearanceBootSnippet('surface')).not.toContain('</script');
    });

    // Inlined into every hosted page's <head>: importing the brand red from the
    // reader's token table pulled that whole table in (+1 KB of unused colours).
    it('carries the brand colours and none of the reader token tables', () => {
        for (const mode of ['docs', 'surface'] as const) {
            const snippet = hostedAppearanceBootSnippet(mode);
            expect(snippet).toContain('#b8324e');
            expect(snippet).not.toMatch(/surface2|sentenceBorder|tableBorder/u);
        }
    });
});

// The template's `:root…{ --bg: … }` theme blocks, other than the dark default.
function studyShellThemeRules(): Array<{ selector: string; bg: string }> {
    const css = readProjectFile('public/newtab/index.html').match(/<style>([\s\S]*?)<\/style>/)![1];
    return [...css.matchAll(/([^{}]+)\{([^{}]*--bg:\s*([^;]+);[^{}]*)\}/g)]
        .map(([, selector, , bg]) => ({ selector: selector.replace(/\/\*[\s\S]*?\*\//g, '').trim(), bg }))
        .filter(rule => rule.selector !== ':root');
}

// The snippet is stamped into checked-in HTML. A stale stamp would silently
// restore the flash, so every stamped page must match the current build.
describe('stamped hosted surfaces', () => {
    const pages = [
        'docs/public/pdf-reader/index.html',
        'docs/public/video-player/index.html',
        'docs/public/study/index.html',
    ];

    it.each(pages)('%s carries the current appearance bootstrap', page => {
        expect(stampedBootBlock(readProjectFile(page))).toBe(hostedAppearanceBootSnippet('surface'));
    });

    it('keeps the docs head script in the VitePress config', () => {
        expect(readProjectFile('docs/.vitepress/config.mts')).toContain("hostedAppearanceBootSnippet('docs')");
    });

    it('keeps the new-tab template marked so the study build and extension can stamp it', () => {
        expect(stampedBootBlock(readProjectFile('public/newtab/index.html'))).toBeDefined();
    });

    // For theme Auto the boot adds only yomu-page-theme-*; jpdb-reader-theme-* marks an
    // explicit choice. The Study shell's light tokens must follow the boot's light
    // class, or Auto on a light system paints a dark shell under light-tuned accents
    // (the active bottom-nav label measured 2.3:1). An explicit choice made with the
    // in-page toggle must beat the boot class it leaves behind.
    it.each([
        [['yomu-page-theme-light'], 'light'],
        [['yomu-page-theme-dark'], 'dark'],
        [['jpdb-reader-theme-light'], 'light'],
        [['jpdb-reader-theme-dark'], 'dark'],
        [['yomu-page-theme-dark', 'jpdb-reader-theme-light'], 'light'],
        [['yomu-page-theme-light', 'jpdb-reader-theme-dark'], 'dark'],
        [[], 'dark'],
    ])('paints the Study shell for root classes %j in the %s theme', (classes, expected) => {
        document.documentElement.className = classes.join(' ');
        const matching = studyShellThemeRules().filter(rule => document.documentElement.matches(rule.selector));

        // At most one theme block may match, so specificity never decides the shell.
        expect(matching.length).toBeLessThanOrEqual(1);
        expect(matching.map(rule => rule.bg)).toEqual(expected === 'light' ? ['#f8f9fb'] : matching.length ? ['#181b20'] : []);
    });

    // The boot reads settings.theme BEFORE its own 'auto' fallback, so a stored
    // default of 'light' makes that fallback unreachable and the operating
    // system's dark preference can never win. Measured on the live site: with
    // prefers-color-scheme: dark the page still resolved colorScheme 'light' and
    // a white body while the dark rules sat unused. Pin the default so a revert
    // to 'light' fails here instead of on someone's screen.
    it('defaults the theme to auto so the operating system decides until the learner does', () => {
        expect(DEFAULT_SETTINGS.theme).toBe('auto');
    });
});

describe('hosted accent CSS variables', () => {
    const ORANGE = '#f2711c';



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

describe('built standalone appearance module', () => {
    it('executes the actual emitted ESM before Reader startup using standalone storage', () => {
        const output = execFileSync(process.execPath, ['--experimental-vm-modules', 'tests/reader/helpers/hosted-appearance-module-proof.mjs'], {
            encoding: 'utf8', timeout: 15_000,
        });
        const { settings, ledger } = JSON.parse(output);
        expect(settings).toMatchObject({ theme: 'dark', interfaceLanguage: 'ja' });
        // 2.1.0 is Japanese-only with no setup gate (1a59f3fa0): an appearance save
        // must not stamp the retired gate keys back onto a fresh install.
        expect(settings).not.toHaveProperty('learningTargetChosen');
        expect(settings).not.toHaveProperty('onboardingSeen');
        expect(ledger).toMatchObject({ revision: 2, records: { theme: { value: 'dark' }, interfaceLanguage: { value: 'ja' } } });
        expect(settings.__yomuSettingsPersistenceCommitV1).toEqual(expect.any(String));
        expect(ledger.__yomuSettingsPersistenceCommitV1).toBe(settings.__yomuSettingsPersistenceCommitV1);
    });
});
