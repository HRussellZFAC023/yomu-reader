import { APP_REPOSITORY_NAME, GITHUB_PAGES_ORIGIN } from './constants';
import { isYomuNewTabUrl } from './new-tab';

const LOCAL_HOSTS = /^(127\.0\.0\.1|localhost|\[::1\])$/;

export function isYomuHostedAppUrl(value: string): boolean {
    const appUrl = readYomuAppUrl(value);
    return Boolean(appUrl && (
        isYomuNewTabUrl(value)
        || isYomuVideoPlayerPath(appUrl.path)
        || isHostedRepositoryAppUrl(appUrl)
        || isLocalRepositoryAppUrl(appUrl)
    ));
}

export function isYomuHostedPassivePage(value: string): boolean {
    const appUrl = readYomuAppUrl(value);
    return Boolean(appUrl
        && !isYomuNewTabUrl(value)
        && !isYomuVideoPlayerPath(appUrl.path)
        && (isHostedRepositoryAppUrl(appUrl) || isLocalRepositoryAppUrl(appUrl)));
}

interface YomuAppUrl {
    url: URL;
    path: string;
}

function readYomuAppUrl(value: string): YomuAppUrl | null {
    try {
        const url = new URL(value);
        return { url, path: normalizedPath(url.pathname) };
    } catch {
        return null;
    }
}

function isHostedRepositoryAppUrl(appUrl: YomuAppUrl): boolean {
    return appUrl.url.origin === GITHUB_PAGES_ORIGIN
        && appUrl.path.startsWith(`/${APP_REPOSITORY_NAME}/`);
}

function isLocalRepositoryAppUrl(appUrl: YomuAppUrl): boolean {
    return isYomuLocalAppPath(appUrl.path)
        && (appUrl.url.protocol === 'file:' || LOCAL_HOSTS.test(appUrl.url.hostname));
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
