import { NEW_TAB_PAGE_URL } from '../app/constants';
import { isPrivilegedYomuLocalDevelopmentOrigin, readTrustedYomuUrl } from '../app/trusted-hosted-url';
import type { InterfaceLanguage } from '../app/types';
import { uiText } from '../app/i18n';
import { isYomuNewTabUrl, settingsPanelHash } from '../newtab/url';
import { LookupModalAccessibility } from '../popup/modal-accessibility-impl';
import { openUrlInNewTab } from '../ui/browser';
import { isDirectTrustedReaderInteraction } from '../ui/trusted-interaction';
import { firefoxAuthenticationInfoSettingsPageUrl } from './firefox-data-consent';

export interface SensitiveSettingsSurfaceAccess {
    trusted: boolean;
    launcherUrl: string;
}

interface SensitiveSettingsLauncherHost {
    createBackdrop: () => HTMLElement;
    mountDialog: (backdrop: HTMLElement, surface: HTMLElement) => void;
    sensitiveSettingsSurface?: () => SensitiveSettingsSurfaceAccess;
    dismiss: () => void;
}

const CANONICAL_SETTINGS_URL = `${NEW_TAB_PAGE_URL}#settings=api`;

/**
 * Account details and authoritative settings are editable only on a page Yomu
 * owns. An arbitrary host page owns its light DOM and can read or rewrite every
 * form control before a learner presses Save, so masking individual secrets is
 * insufficient there.
 */
export function sensitiveSettingsSurfaceAccess(
    pageUrl: string,
    extensionSettingsUrl = '',
): SensitiveSettingsSurfaceAccess {
    return {
        trusted: isTrustedSensitiveSettingsSurface(pageUrl),
        launcherUrl: trustedSettingsLauncherUrl(extensionSettingsUrl),
    };
}

export function currentSensitiveSettingsSurfaceIsTrusted(host: SensitiveSettingsLauncherHost): boolean {
    return currentSensitiveSettingsSurfaceAccess(host).trusted;
}

export function mountSensitiveSettingsLauncher(
    host: SensitiveSettingsLauncherHost,
    modal: LookupModalAccessibility,
    language: InterfaceLanguage,
    panel?: string,
    trigger?: HTMLElement,
): HTMLElement | null {
    const access = currentSensitiveSettingsSurfaceAccess(host);
    if (access.trusted) return null;
    const launcherUrl = sensitiveSettingsLauncherForPanel(access.launcherUrl, panel);
    const surface = createSensitiveSettingsLauncher(language);
    const close = () => {
        modal.release();
        host.dismiss();
    };
    surface.querySelector<HTMLElement>('[data-trusted-settings-launcher]')?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (isDirectTrustedReaderInteraction(event)) openTrustedSettingsSurface(launcherUrl);
    });
    surface.querySelector<HTMLElement>('[data-action="cancel"]')?.addEventListener('click', close);
    surface.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.isComposing) return;
        event.preventDefault();
        event.stopPropagation();
        close();
    });
    host.mountDialog(host.createBackdrop(), surface);
    modal.activate(surface, trigger);
    return surface;
}

function currentSensitiveSettingsSurfaceAccess(
    host: SensitiveSettingsLauncherHost,
): SensitiveSettingsSurfaceAccess {
    return host.sensitiveSettingsSurface?.()
        ?? sensitiveSettingsSurfaceAccess(location.href, firefoxAuthenticationInfoSettingsPageUrl());
}

export function sensitiveSettingsLauncherForPanel(url: string, panel?: string): string {
    const target = new URL(url);
    target.hash = settingsPanelHash(panel);
    return target.href;
}

export function isTrustedSensitiveSettingsSurface(value: string): boolean {
    const appUrl = readTrustedYomuUrl(value);
    if (!appUrl) return false;
    if (!isYomuNewTabUrl(value)) return false;
    return trustedSettingsOrigin(appUrl.originKind, appUrl.url.origin);
}

function trustedSettingsOrigin(
    originKind: NonNullable<ReturnType<typeof readTrustedYomuUrl>>['originKind'],
    origin: string,
): boolean {
    if (originKind === 'docs-preview') return false;
    return originKind === 'loopback'
        ? isPrivilegedYomuLocalDevelopmentOrigin(origin)
        : true;
}

function trustedSettingsLauncherUrl(extensionSettingsUrl: string): string {
    return isTrustedExtensionSettingsUrl(extensionSettingsUrl)
        ? extensionSettingsUrl
        : CANONICAL_SETTINGS_URL;
}

function isTrustedExtensionSettingsUrl(value: string): boolean {
    const appUrl = readTrustedYomuUrl(value);
    return appUrl?.originKind === 'extension' && isYomuNewTabUrl(value);
}

function openTrustedSettingsSurface(url: string): void {
    const protocol = new URL(url).protocol;
    if (WEB_SETTINGS_PROTOCOLS.has(protocol)) {
        openUrlInNewTab(url);
        return;
    }
    openTrustedExtensionSettingsSurface(url);
}

const WEB_SETTINGS_PROTOCOLS = new Set(['http:', 'https:']);

function openTrustedExtensionSettingsSurface(url: string): void {
    const opened = window.open(url, '_blank', 'noopener');
    if (!opened) return;
    try {
        opened.opener = null;
    } catch {
        // A cross-origin extension page may not expose Window.opener.
    }
}

function createSensitiveSettingsLauncher(language: InterfaceLanguage): HTMLElement {
    const root = document.createElement('section');
    root.className = 'jpdb-reader-settings jpdb-reader-settings-launcher';
    root.dataset.jpdbReaderRoot = 'true';
    root.dataset.sensitiveSettingsLauncher = 'true';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', uiText(language, 'settingsTitle'));
    root.tabIndex = -1;

    const head = document.createElement('div');
    head.className = 'jpdb-reader-settings-head';
    const title = document.createElement('h2');
    title.textContent = uiText(language, 'accountSettingsTrustedSurfaceTitle');
    head.append(title);

    const content = document.createElement('div');
    content.className = 'jpdb-reader-settings-scroll';
    const help = document.createElement('p');
    help.className = 'jpdb-reader-help';
    help.textContent = uiText(language, 'accountSettingsTrustedSurfaceHelp');
    const launcher = document.createElement('button');
    launcher.className = 'jpdb-reader-btn';
    launcher.dataset.trustedSettingsLauncher = 'true';
    launcher.type = 'button';
    launcher.textContent = uiText(language, 'openAccountSettingsTrustedSurface');
    content.append(help, launcher);

    const footer = document.createElement('div');
    footer.className = 'footer';
    const close = document.createElement('button');
    close.className = 'jpdb-reader-btn';
    close.dataset.action = 'cancel';
    close.type = 'button';
    close.textContent = uiText(language, 'cancel');
    footer.append(close);

    root.append(head, content, footer);
    return root;
}
