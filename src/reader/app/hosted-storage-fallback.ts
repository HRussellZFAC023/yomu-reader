import { DOCS_ORIGIN } from './constants';
import { isPrivilegedYomuLocalDevelopmentOrigin } from './trusted-hosted-url';

const HOSTED_SETTINGS_BLOB_KEY = 'jpdb-popup-reader-settings';
export function isHostedSettingsStorageKey(key: string): boolean {
    return key === HOSTED_SETTINGS_BLOB_KEY;
}

function isHostedYomuLocation(origin: string, hostname: string, pathname: string): boolean {
    if (origin === DOCS_ORIGIN) return true;
    if (isHostedGithubPagesLocation(hostname, pathname)) return true;
    return isHostedLocalDevelopmentLocation(origin, pathname);
}

export function isHostedYomuOrigin(): boolean {
    try {
        return isHostedYomuLocation(location.origin, location.hostname, location.pathname);
    } catch {
        return false;
    }
}

function isHostedGithubPagesLocation(hostname: string, pathname: string): boolean {
    return hostname === 'hrussellzfac023.github.io' && pathname.startsWith('/yomu-reader/');
}

function isHostedLocalDevelopmentLocation(origin: string, pathname: string): boolean {
    if (!isPrivilegedYomuLocalDevelopmentOrigin(origin)) return false;
    return pathname.includes('/study/') || pathname.includes('/newtab/');
}
