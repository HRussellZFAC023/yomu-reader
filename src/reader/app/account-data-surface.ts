import { NEW_TAB_PAGE_URL } from './constants';
import {
    isPrivilegedYomuLocalDevelopmentOrigin,
    readTrustedYomuUrl,
} from './trusted-hosted-url';
import { isYomuNewTabUrl } from '../newtab/url';
import { isDirectTrustedReaderInteraction } from '../ui/trusted-interaction';

const OWNED_STUDY_LAUNCHER_SELECTOR = '[data-yomu-owned-study-launcher]';
const launcherDocuments = new WeakSet<Document>();

/**
 * Account-backed details may enter the DOM only on a Study/new-tab document
 * whose origin Yomu owns. Ordinary reader pages own their light DOM and can
 * inspect or rewrite it, so a matching pathname is never sufficient.
 */
export function isTrustedAccountDataSurface(value: string): boolean {
    const appUrl = readTrustedYomuUrl(value);
    if (!appUrl) return false;
    if (![isYomuNewTabUrl(value), appUrl.originKind !== 'docs-preview'].every(Boolean)) return false;
    return [
        appUrl.originKind !== 'loopback',
        isPrivilegedYomuLocalDevelopmentOrigin(appUrl.url.origin),
    ].some(Boolean);
}

export function currentAccountDataSurfaceIsTrusted(): boolean {
    return typeof location !== 'undefined' && isTrustedAccountDataSurface(location.href);
}

/**
 * Installs one delegated launcher per document. The destination lives only in
 * this closure: hostile page code cannot retarget it by rewriting an href or a
 * data attribute. Synthetic page events are rejected by the reader's trusted
 * interaction policy.
 */
export function installOwnedStudyLauncher(ownerDocument: Document = document): void {
    if (launcherDocuments.has(ownerDocument)) return;
    launcherDocuments.add(ownerDocument);
    const destination = NEW_TAB_PAGE_URL;
    ownerDocument.addEventListener('click', ownedStudyLauncherClickHandler(destination), true);
}

function ownedStudyLauncherClickHandler(destination: string): (event: MouseEvent) => void {
    return event => {
        const target = ownedStudyLauncherTarget(event);
        if (![Boolean(target), isDirectTrustedReaderInteraction(event)].every(Boolean)) return;
        event.preventDefault();
        event.stopPropagation();
        const opened = window.open(destination, '_blank', 'noopener,noreferrer');
        if (!opened) return;
        clearOpenedWindowOpener(opened);
    };
}

function ownedStudyLauncherTarget(event: MouseEvent): HTMLElement | null {
    return event.target instanceof Element
        ? event.target.closest<HTMLElement>(OWNED_STUDY_LAUNCHER_SELECTOR)
        : null;
}

function clearOpenedWindowOpener(opened: Window): void {
    try {
        opened.opener = null;
    } catch {
        // Cross-origin extension windows may not expose Window.opener.
    }
}
