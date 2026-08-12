import { APP_NAME } from './constants';
import { uiText } from './i18n';
import type { InterfaceLanguage } from './types';
import { sensitiveSettingsSurfaceAccess } from '../settings/sensitive-settings-surface';
import { openUrlInNewTab } from '../ui/browser';
import { isDirectTrustedReaderInteraction } from '../ui/trusted-interaction';

export interface OffhostOnboardingLauncher {
    readonly backdrop: HTMLElement;
    readonly panel: HTMLElement;
}

/**
 * Arbitrary pages own their light DOM and can rewrite every control in it.
 * Return the full chooser to Yomu-owned Study/new-tab documents only; elsewhere
 * expose a no-input launcher whose validated destination never enters the DOM.
 */
export function createOffhostOnboardingLauncher(
    pageUrl: string,
    language: InterfaceLanguage,
    dismiss: () => void,
): OffhostOnboardingLauncher | null {
    const access = sensitiveSettingsSurfaceAccess(pageUrl);
    if (access.trusted) return null;

    // Capture the policy-produced URL in module-private state. A host may mutate
    // attributes, text, or descendants, but no later DOM read can redirect it.
    const launcherUrl = access.launcherUrl;
    const backdrop = document.createElement('div');
    backdrop.className = 'jpdb-reader-backdrop jpdb-reader-onboarding-backdrop';
    backdrop.dataset.jpdbReaderRoot = 'true';

    const panel = document.createElement('section');
    panel.className = 'jpdb-reader-onboarding jpdb-reader-onboarding-trusted-launcher';
    panel.dataset.jpdbReaderRoot = 'true';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', uiText(language, 'welcomeLabel'));
    panel.tabIndex = -1;

    const eyebrow = document.createElement('div');
    eyebrow.className = 'jpdb-reader-onboarding-eyebrow';
    eyebrow.textContent = uiText(language, 'onboardingTrustedSurfaceEyebrow');
    const title = document.createElement('h2');
    title.textContent = APP_NAME;
    const copy = document.createElement('p');
    copy.textContent = uiText(language, 'onboardingTrustedSurfaceCopy');
    const actions = document.createElement('div');
    actions.className = 'jpdb-reader-onboarding-actions';

    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = uiText(language, 'openOnboardingTrustedSurface');
    open.className = 'jpdb-reader-btn add';
    open.dataset.onboardingAction = 'open-trusted-setup';
    open.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!isDirectTrustedReaderInteraction(event)) return;
        if (openUrlInNewTab(launcherUrl)) dismiss();
    });

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = uiText(language, 'closeOnboarding');
    close.className = 'jpdb-reader-btn';
    close.dataset.onboardingAction = 'close';
    close.addEventListener('click', dismiss);
    actions.append(open, close);
    panel.append(eyebrow, title, copy, actions);
    return { backdrop, panel };
}
