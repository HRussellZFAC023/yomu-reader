import { APP_REPOSITORY_NAME } from '../app/constants';
import {
    normalizeYomuHostedPath,
    readTrustedYomuUrl,
    type TrustedYomuOriginKind,
    type TrustedYomuUrl,
} from '../app/trusted-hosted-url';

type StudyRoutePolicy = (path: string) => boolean;

const SETTINGS_PANEL_IDS = [
    'appearance',
    'backup',
    'api',
    'dictionaries',
    'media',
    'mining',
    'newTab',
    'shortcuts',
    'help',
] as const;
export type SettingsPanelId = typeof SETTINGS_PANEL_IDS[number];
const SETTINGS_PANEL_ID_SET = new Set<string>(SETTINGS_PANEL_IDS);

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

export function settingsPanelHash(panel: string | undefined): string {
    return `#settings=${isSettingsPanelId(panel) ? panel : 'appearance'}`;
}

export function settingsPanelFromHash(hash: string): SettingsPanelId | null {
    const prefix = '#settings=';
    if (!hash.startsWith(prefix)) return null;
    const panel = hash.slice(prefix.length);
    return isSettingsPanelId(panel) ? panel : null;
}

function isSettingsPanelId(value: string | undefined): value is SettingsPanelId {
    return typeof value === 'string' && SETTINGS_PANEL_ID_SET.has(value);
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
