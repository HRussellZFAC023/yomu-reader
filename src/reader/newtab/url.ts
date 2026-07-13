import { APP_REPOSITORY_NAME } from '../app/constants';
import {
    normalizeYomuHostedPath,
    readTrustedYomuUrl,
    type TrustedYomuUrl,
} from '../app/trusted-hosted-url';

export function isYomuNewTabUrl(value: string): boolean {
    const appUrl = readTrustedYomuUrl(value);
    return appUrl ? isTrustedStudyRoute(appUrl) : false;
}

/** Route-shape check for callers that do not need privileged origin access. */
export function isYomuStudyRoutePath(pathname: string): boolean {
    const path = normalizeYomuHostedPath(pathname);
    return path === '/study/' || path === '/newtab/';
}

function isTrustedStudyRoute(appUrl: TrustedYomuUrl): boolean {
    const { originKind, path } = appUrl;
    if (originKind === 'docs' || originKind === 'extension') return isYomuStudyRoutePath(path);
    if (originKind === 'github-pages') return isRepositoryStudyRoutePath(path);
    return isYomuStudyRoutePath(path) || isRepositoryStudyRoutePath(path);
}

function isRepositoryStudyRoutePath(path: string): boolean {
    return path === `/${APP_REPOSITORY_NAME}/study/`
        || path === `/${APP_REPOSITORY_NAME}/newtab/`;
}
