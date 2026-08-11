import { APP_REPOSITORY_NAME } from '../app/constants';
import {
    normalizeYomuHostedPath,
    readTrustedYomuUrl,
    type TrustedYomuOriginKind,
    type TrustedYomuUrl,
} from '../app/trusted-hosted-url';

type StudyRoutePolicy = (path: string) => boolean;

const STUDY_ROUTE_POLICIES: Record<TrustedYomuOriginKind, StudyRoutePolicy> = {
    docs: isYomuStudyRoutePath,
    'docs-preview': isYomuStudyRoutePath,
    extension: isYomuStudyRoutePath,
    'github-pages': isRepositoryStudyRoutePath,
    loopback: isLoopbackStudyRoutePath,
};

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
    return STUDY_ROUTE_POLICIES[originKind](path);
}

function isLoopbackStudyRoutePath(path: string): boolean {
    return isYomuStudyRoutePath(path) || isRepositoryStudyRoutePath(path);
}

function isRepositoryStudyRoutePath(path: string): boolean {
    return path === `/${APP_REPOSITORY_NAME}/study/`
        || path === `/${APP_REPOSITORY_NAME}/newtab/`;
}
