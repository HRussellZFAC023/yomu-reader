import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { beforeEach, describe, expect, it } from 'vitest';

import { hostedAccentCssVariables, sanitizeHostedAccentColor } from '../../src/reader/core/hosted-accent-css';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

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
        expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(ORANGE);
    });

    it('derives dark-mode accent values from the stored theme preference', () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ accentColor: ORANGE, theme: 'dark' }));
        runBoot('docs');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.style.getPropertyValue('--vp-c-brand-1'))
            .toBe(hostedAccentCssVariables(ORANGE, true)['--vp-c-brand-1']);
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
});

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
