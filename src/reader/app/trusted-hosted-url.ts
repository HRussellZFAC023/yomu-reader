import {
    APP_REPOSITORY_NAME,
    DOCS_ORIGIN,
    GITHUB_PAGES_ORIGIN,
} from './constants';

export type TrustedYomuOriginKind = 'docs' | 'docs-preview' | 'github-pages' | 'loopback' | 'extension';

export interface TrustedYomuUrl {
    url: URL;
    path: string;
    originKind: TrustedYomuOriginKind;
}

// The docs browser smoke uses this exact reserved pseudo-loopback host to avoid
// the theme's force-local fallback while exercising production ownership. It
// gets docs route semantics without production's broad GM-storage trust. Keep
// it explicit: arbitrary *.localhost names do not acquire Yomu bridge trust.
const DOCS_PREVIEW_HOST = 'yomureader.localhost';
const WEB_PROTOCOLS = new Set(['http:', 'https:']);
const EXTENSION_PROTOCOLS = new Set(['chrome-extension:', 'moz-extension:', 'safari-web-extension:']);
const TRUSTED_HTTPS_ORIGIN_KINDS = new Map<string, 'docs' | 'github-pages'>([
    [DOCS_ORIGIN, 'docs'],
    [GITHUB_PAGES_ORIGIN, 'github-pages'],
]);
const TRUSTED_WEB_HOST_KINDS = new Map<string, 'docs-preview' | 'loopback'>([
    [DOCS_PREVIEW_HOST, 'docs-preview'],
    ['127.0.0.1', 'loopback'],
    ['localhost', 'loopback'],
    ['[::1]', 'loopback'],
]);

/**
 * Parses a URL only when its origin is allowed to host privileged Yomu UI.
 *
 * Path checks deliberately live with each hosted feature. A trusted origin is
 * necessary for the userscript bridges, but a `/study/`-looking pathname is
 * never sufficient. Credentials are rejected even when the hostname itself is
 * trusted so visually ambiguous URLs cannot acquire bridge access.
 */
export function readTrustedYomuUrl(value: string): TrustedYomuUrl | null {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    if (url.username || url.password) return null;

    const path = normalizeYomuHostedPath(url.pathname);
    const originKind = trustedYomuOriginKind(url, path);
    return originKind ? { url, path, originKind } : null;
}

export function normalizeYomuHostedPath(pathname: string): string {
    const normalized = pathname.replace(/\/index\.html$/u, '/');
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

export function isYomuRepositoryPath(path: string): boolean {
    return path === `/${APP_REPOSITORY_NAME}/`
        || path.startsWith(`/${APP_REPOSITORY_NAME}/`);
}

function trustedYomuOriginKind(url: URL, path: string): TrustedYomuOriginKind | null {
    return trustedHttpsOriginKind(url, path)
        ?? trustedWebHostKind(url)
        ?? trustedExtensionOriginKind(url);
}

function trustedHttpsOriginKind(url: URL, path: string): TrustedYomuOriginKind | null {
    const originKind = TRUSTED_HTTPS_ORIGIN_KINDS.get(url.origin);
    if (originKind !== 'github-pages') return originKind ?? null;
    return isYomuRepositoryPath(path) ? originKind : null;
}

function trustedWebHostKind(url: URL): TrustedYomuOriginKind | null {
    if (!WEB_PROTOCOLS.has(url.protocol)) return null;
    return TRUSTED_WEB_HOST_KINDS.get(url.hostname) ?? null;
}

function trustedExtensionOriginKind(url: URL): TrustedYomuOriginKind | null {
    if (!EXTENSION_PROTOCOLS.has(url.protocol)) return null;
    return url.hostname ? 'extension' : null;
}
