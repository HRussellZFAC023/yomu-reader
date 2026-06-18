import { isYomuHostedAppUrl } from '../app/pages-url';

export type HostTheme = 'light' | 'dark';
type ThemeHostKind = 'jpdb' | 'jiten' | 'yomu-hosted';

const HOST_DARK_CLASS = 'dark-mode';
const JITEN_THEME_COOKIE = 'jiten-theme-mode';

function currentThemeHost(): ThemeHostKind | null {
    if (isYomuHostedAppUrl(location.href)) return 'yomu-hosted';
    const host = location.hostname;
    if (host === 'jpdb.io' || host.endsWith('.jpdb.io')) return 'jpdb';
    if (host === 'jiten.moe' || host.endsWith('.jiten.moe')) return 'jiten';
    return null;
}

export function isThemeSyncHost(): boolean {
    return currentThemeHost() !== null;
}

export function isHostThemeAuthoritative(): boolean {
    return false;
}

function prefersDark(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function detectHostTheme(): HostTheme {
    if (currentThemeHost() === 'yomu-hosted') return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    if (document.documentElement.classList.contains(HOST_DARK_CLASS)) return 'dark';
    if (currentThemeHost() === 'jiten') {
        const mode = readJitenThemeCookie();
        if (mode === 'dark' || mode === 'light') return mode;
        return prefersDark() ? 'dark' : 'light';
    }
    return 'light';
}

export function applyHostTheme(theme: HostTheme): void {
    const root = document.documentElement;
    if (currentThemeHost() === 'yomu-hosted') {
        root.classList.toggle('dark', theme === 'dark');
        root.style.colorScheme = theme;
        return;
    }
    root.classList.toggle(HOST_DARK_CLASS, theme === 'dark');
    root.style.colorScheme = theme;
    if (currentThemeHost() === 'jiten') writeJitenThemeCookie(theme);
}

export function jitenThemeCookieMatches(theme: HostTheme): boolean {
    return currentThemeHost() === 'jiten' && readJitenThemeCookie() === theme;
}

function readJitenThemeCookie(): string {
    const match = document.cookie.match(/(?:^|;\s*)jiten-theme-mode=([^;]+)/);
    return match ? decodeURIComponent(match[1]).trim() : '';
}

function writeJitenThemeCookie(theme: HostTheme): void {
    document.cookie = `${JITEN_THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

export function observeHostTheme(onChange: (theme: HostTheme) => void): () => void {
    if (typeof MutationObserver !== 'function') return () => undefined;
    const root = document.documentElement;
    let last = detectHostTheme();
    const observer = new MutationObserver(() => {
        const next = detectHostTheme();
        if (next === last) return;
        last = next;
        onChange(next);
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => observer.disconnect();
}
