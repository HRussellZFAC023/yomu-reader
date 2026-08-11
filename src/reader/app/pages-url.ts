import { isYomuNewTabUrl } from '../newtab/url';
import { APP_REPOSITORY_NAME } from './constants';
import {
    isYomuRepositoryPath,
    readTrustedYomuUrl,
    type TrustedYomuUrl,
} from './trusted-hosted-url';

export function isYomuHostedAppUrl(value: string): boolean {
    const appUrl = readTrustedYomuUrl(value);
    return appUrl ? isYomuHostedAppRoute(value, appUrl) : false;
}

/**
 * Narrow trust gate for DOM bridges that expose userscript HTTP or GM storage.
 * General docs pages remain recognizable Yomu pages, but only executable app
 * routes receive privileged bridge capabilities.
 */
export function isYomuPrivilegedHostedAppUrl(value: string): boolean {
    const appUrl = readTrustedYomuUrl(value);
    if (!appUrl || appUrl.originKind === 'extension') return false;
    return isYomuNewTabUrl(value)
        || isExactHostedAppPath(appUrl, 'video-player')
        || isExactHostedAppPath(appUrl, 'pdf-reader')
        || isExactHostedAppPath(appUrl, 'academy');
}

/**
 * Trust gate for the GM *storage* bridge only. Unlike the HTTP bridge, the
 * storage bridge proxies managed Yomu keys exclusively, and every hosted
 * yomureader.com / github-pages page already holds those values in same-origin
 * localStorage via the hosted mirror — so exposing the shared GM store there
 * adds no new surface, while withholding it strands settings edited on the
 * docs/reader pages in per-origin localStorage.
 */
export function isYomuStorageBridgeHostedUrl(value: string): boolean {
    const appUrl = readTrustedYomuUrl(value);
    if (!appUrl) return false;
    if (appUrl.originKind === 'docs' || appUrl.originKind === 'github-pages') return true;
    return isYomuPrivilegedHostedAppUrl(value);
}

export function isYomuHostedPassivePage(value: string): boolean {
    const appUrl = readTrustedYomuUrl(value);
    return appUrl ? isPassiveYomuRepositoryPage(value, appUrl) : false;
}

export function isYomuHostedVideoPlayerPage(value: string): boolean {
    const appUrl = readTrustedYomuUrl(value);
    return appUrl ? isYomuRepositoryAppUrl(appUrl) && isExactHostedAppPath(appUrl, 'video-player') : false;
}

export function isYomuHostedPdfReaderPage(value: string): boolean {
    const appUrl = readTrustedYomuUrl(value);
    return appUrl ? isYomuRepositoryAppUrl(appUrl) && isExactHostedAppPath(appUrl, 'pdf-reader') : false;
}

export function isYomuHostedAcademyPage(value: string): boolean {
    const appUrl = readTrustedYomuUrl(value);
    return appUrl ? isYomuRepositoryAppUrl(appUrl) && isExactHostedAppPath(appUrl, 'academy') : false;
}

function isYomuHostedAppRoute(value: string, appUrl: TrustedYomuUrl): boolean {
    return isYomuActiveAppRoute(value, appUrl) || isYomuRepositoryAppUrl(appUrl);
}

function isPassiveYomuRepositoryPage(value: string, appUrl: TrustedYomuUrl): boolean {
    return isYomuRepositoryAppUrl(appUrl) && !isYomuActiveAppRoute(value, appUrl);
}

function isYomuActiveAppRoute(value: string, appUrl: TrustedYomuUrl): boolean {
    return isYomuNewTabUrl(value)
        || isExactHostedAppPath(appUrl, 'video-player')
        || isExactHostedAppPath(appUrl, 'pdf-reader')
        || isExactHostedAppPath(appUrl, 'academy');
}

function isYomuRepositoryAppUrl(appUrl: TrustedYomuUrl): boolean {
    if (appUrl.originKind === 'docs') return true;
    if (appUrl.originKind === 'github-pages') return isYomuRepositoryPath(appUrl.path);
    if (appUrl.originKind === 'extension') return isYomuNewTabUrl(appUrl.url.href);
    return isYomuLocalAppPath(appUrl.path);
}

function isExactHostedAppPath(appUrl: TrustedYomuUrl, route: string): boolean {
    if (appUrl.originKind === 'github-pages') {
        return appUrl.path === `/${APP_REPOSITORY_NAME}/${route}/`;
    }
    return appUrl.path === `/${route}/`
        || (appUrl.originKind === 'loopback' && appUrl.path === `/${APP_REPOSITORY_NAME}/${route}/`);
}

function isYomuLocalAppPath(path: string): boolean {
    return path === '/'
        || isYomuRepositoryPath(path)
        || path === '/study/'
        || path === '/newtab/'
        || path === '/video-player/'
        || path === '/pdf-reader/'
        || path === '/academy/';
}
