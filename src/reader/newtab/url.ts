import { APP_REPOSITORY_NAME } from '../app/constants';

export function isYomuNewTabUrl(value: string): boolean {
    const url = parseNewTabUrl(value);
    return url ? isYomuNewTabUrlObject(url) : false;
}

function parseNewTabUrl(value: string): URL | null {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

function isYomuNewTabUrlObject(url: URL): boolean {
    const path = normalizedNewTabPath(url);
    return url.searchParams.has('yomu-newtab')
        || isHostedNewTabPath(url, path)
        || isLocalNewTabPath(url, path)
        || isRepositoryNewTabPath(path);
}

function normalizedNewTabPath(url: URL): string {
    return url.pathname.replace(/\/index\.html$/, '/');
}

function isHostedNewTabPath(url: URL, path: string): boolean {
    return url.hostname === 'hrussellzfac023.github.io' && path === `/${APP_REPOSITORY_NAME}/newtab/`;
}

function isLocalNewTabPath(url: URL, path: string): boolean {
    return /^(127\.0\.0\.1|localhost|\[::1\])$/.test(url.hostname) && path.endsWith('/newtab/');
}

function isRepositoryNewTabPath(path: string): boolean {
    return path.endsWith(`/${APP_REPOSITORY_NAME}/newtab/`) || path.endsWith('/newtab/');
}
