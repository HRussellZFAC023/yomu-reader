import { APP_REPOSITORY_NAME, GITHUB_PAGES_ORIGIN } from './constants';
import { isYomuNewTabUrl } from './new-tab';

const LOCAL_HOSTS = /^(127\.0\.0\.1|localhost|\[::1\])$/;

export function isYomuHostedAppUrl(value: string): boolean {
    try {
        const url = new URL(value);
        const path = normalizedPath(url.pathname);
        if (isYomuNewTabUrl(value)) return true;
        if (isYomuVideoPlayerPath(path)) return true;
        if (url.origin === GITHUB_PAGES_ORIGIN && path.startsWith(`/${APP_REPOSITORY_NAME}/`)) return true;
        if (url.protocol === 'file:' && isYomuLocalAppPath(path)) return true;
        if (LOCAL_HOSTS.test(url.hostname) && isYomuLocalAppPath(path)) return true;
        return false;
    } catch {
        return false;
    }
}

export function isYomuHostedPassivePage(value: string): boolean {
    try {
        const url = new URL(value);
        const path = normalizedPath(url.pathname);
        if (isYomuNewTabUrl(value) || isYomuVideoPlayerPath(path)) return false;
        if (url.origin === GITHUB_PAGES_ORIGIN && path.startsWith(`/${APP_REPOSITORY_NAME}/`)) return true;
        if (url.protocol === 'file:' && isYomuLocalAppPath(path)) return true;
        if (LOCAL_HOSTS.test(url.hostname) && isYomuLocalAppPath(path)) return true;
        return false;
    } catch {
        return false;
    }
}

function normalizedPath(pathname: string): string {
    return pathname.replace(/\/index\.html$/, '/');
}

function isYomuVideoPlayerPath(path: string): boolean {
    return path.endsWith('/video-player/');
}

function isYomuLocalAppPath(path: string): boolean {
    return path.startsWith(`/${APP_REPOSITORY_NAME}/`) || path.endsWith('/newtab/') || isYomuVideoPlayerPath(path);
}
