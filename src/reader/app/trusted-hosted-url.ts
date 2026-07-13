import {
    APP_REPOSITORY_NAME,
    DOCS_ORIGIN,
    GITHUB_PAGES_ORIGIN,
} from './constants';

export type TrustedYomuOriginKind = 'docs' | 'github-pages' | 'loopback' | 'extension';

export interface TrustedYomuUrl {
    url: URL;
    path: string;
    originKind: TrustedYomuOriginKind;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const EXTENSION_PROTOCOLS = new Set(['chrome-extension:', 'moz-extension:', 'safari-web-extension:']);

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
    if (url.protocol === 'https:' && url.origin === DOCS_ORIGIN) return 'docs';
    if (url.protocol === 'https:' && url.origin === GITHUB_PAGES_ORIGIN && isYomuRepositoryPath(path)) {
        return 'github-pages';
    }
    if ((url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK_HOSTS.has(url.hostname)) {
        return 'loopback';
    }
    if (EXTENSION_PROTOCOLS.has(url.protocol) && Boolean(url.hostname)) return 'extension';
    return null;
}
