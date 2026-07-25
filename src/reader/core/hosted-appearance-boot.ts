import { hostedAccentCssVariables } from './hosted-accent-css';

// Pre-paint appearance bootstrap. Hosted surfaces ship their default (green)
// accent in static CSS, so applying the reader's accent only once the page
// bundle hydrates paints one frame of the wrong colour — the "flash of green
// before it goes back to orange". This module runs inline in <head>, before the
// first paint, and stamps the same custom properties the runtime re-applies
// later, so there is nothing left to correct.
//
// Bundled per surface by scripts/lib/hosted-appearance-boot.cjs.
declare const __YOMU_APPEARANCE_MODE__: 'docs' | 'surface';

const SETTINGS_STORAGE_KEY = 'jpdb-popup-reader-settings';
const VITEPRESS_APPEARANCE_KEY = 'vitepress-theme-appearance';
const PAGE_THEME_KEY = 'yomu-page-theme';

type ThemePreference = 'auto' | 'dark' | 'light';

export function primeHostedAppearance(mode: 'docs' | 'surface'): void {
    const root = document.documentElement;
    const settings = readSettings();
    const preference = themePreference(settings);
    const dark = preference === 'auto' ? prefersDark() : preference === 'dark';

    const variables = hostedAccentCssVariables(settings.accentColor, dark);
    for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);

    if (mode === 'docs') {
        root.classList.toggle('dark', dark);
        // Only the docs paint their browser chrome in the accent; standalone
        // surfaces keep the page-background theme-color they ship with.
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', variables['--yomu-accent']);
        // VitePress' own inline appearance script runs after this one and only
        // ever adds `dark`; mirroring the preference keeps the two in agreement
        // instead of letting a stale key re-add the class we just removed.
        setStorageItem(VITEPRESS_APPEARANCE_KEY, preference === 'auto' ? 'auto' : dark ? 'dark' : 'light');
    } else {
        root.classList.toggle('yomu-page-theme-dark', dark);
        root.classList.toggle('yomu-page-theme-light', !dark);
    }
}

function readSettings(): Record<string, unknown> {
    try {
        const parsed = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

function themePreference(settings: Record<string, unknown>): ThemePreference {
    return normalizeThemePreference(settings.theme)
        ?? normalizeThemePreference(readStorageItem(__YOMU_APPEARANCE_MODE__ === 'docs' ? VITEPRESS_APPEARANCE_KEY : PAGE_THEME_KEY))
        ?? 'auto';
}

function normalizeThemePreference(value: unknown): ThemePreference | undefined {
    return value === 'auto' || value === 'dark' || value === 'light' ? value : undefined;
}

function prefersDark(): boolean {
    try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
        return false;
    }
}

function readStorageItem(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function setStorageItem(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* Private-mode storage failures must never block the first paint. */
    }
}

try {
    primeHostedAppearance(__YOMU_APPEARANCE_MODE__);
} catch {
    /* A themed first paint is never worth breaking the page for. */
}
