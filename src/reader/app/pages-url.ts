import { APP_REPOSITORY_NAME, GITHUB_PAGES_ORIGIN } from './constants';
import { isYomuNewTabUrl } from '../newtab/url';

const LOCAL_HOSTS = /^(127\.0\.0\.1|localhost|\[::1\])$/;

export function isYomuHostedAppUrl(value: string): boolean {
    const appUrl = readYomuAppUrl(value);
    return appUrl ? isYomuHostedAppRoute(value, appUrl) : false;
}

export function isYomuHostedPassivePage(value: string): boolean {
    const appUrl = readYomuAppUrl(value);
    return appUrl ? isPassiveYomuRepositoryPage(value, appUrl) : false;
}

export function isYomuHostedVideoPlayerPage(value: string): boolean {
    const appUrl = readYomuAppUrl(value);
    return appUrl ? isYomuRepositoryAppUrl(appUrl) && isYomuVideoPlayerPath(appUrl.path) : false;
}

export function isYomuHostedPdfReaderPage(value: string): boolean {
    const appUrl = readYomuAppUrl(value);
    return appUrl ? isYomuRepositoryAppUrl(appUrl) && isYomuPdfReaderPath(appUrl.path) : false;
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

function isYomuHostedAppRoute(value: string, appUrl: YomuAppUrl): boolean {
    return isYomuActiveAppRoute(value, appUrl) || isYomuRepositoryAppUrl(appUrl);
}

function isPassiveYomuRepositoryPage(value: string, appUrl: YomuAppUrl): boolean {
    return isYomuRepositoryAppUrl(appUrl) && !isYomuActiveAppRoute(value, appUrl);
}

function isYomuActiveAppRoute(value: string, appUrl: YomuAppUrl): boolean {
    return isYomuNewTabUrl(value) || isYomuVideoPlayerPath(appUrl.path) || isYomuPdfReaderPath(appUrl.path);
}

function isYomuRepositoryAppUrl(appUrl: YomuAppUrl): boolean {
    return isHostedRepositoryAppUrl(appUrl) || isLocalRepositoryAppUrl(appUrl);
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

function isYomuPdfReaderPath(path: string): boolean {
    return path.endsWith('/pdf-reader/');
}

function isYomuLocalAppPath(path: string): boolean {
    return path === '/'
        || path.startsWith(`/${APP_REPOSITORY_NAME}/`)
        || path.endsWith('/newtab/')
        || isYomuVideoPlayerPath(path)
        || isYomuPdfReaderPath(path);
}
