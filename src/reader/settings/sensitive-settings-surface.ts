import { NEW_TAB_PAGE_URL } from '../app/constants';
import { isPrivilegedYomuLocalDevelopmentOrigin, readTrustedYomuUrl } from '../app/trusted-hosted-url';
import type { InterfaceLanguage } from '../app/types';
import { uiText } from '../app/i18n';
import {
    isYomuNewTabUrl,
    settingsPanelFromHash,
    settingsPanelHash,
    type SettingsPanelId,
} from '../newtab/url';
import type { LookupModalAccessibility } from '../popup/modal-accessibility-impl';
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
    toast: (message: string) => void;
}

const CANONICAL_SETTINGS_URL = `${NEW_TAB_PAGE_URL}#settings=api`;
const PACKAGED_STUDY_SETTINGS_LAUNCHER_PROTOCOL = 'yomu-packaged-study-settings-launcher:v1';

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
    return mountSettingsLauncher(host, modal, language, panel, trigger, false);
}

/**
 * Mounts the no-input handoff even when the current document is an owned Study
 * URL. The aggregate userscript runs in a content realm there, not in the
 * page-owned NewTabRuntime, so URL trust alone does not make that realm a
 * writable settings surface.
 */
export function mountSettingsSurfaceLauncher(
    host: SensitiveSettingsLauncherHost,
    modal: LookupModalAccessibility,
    language: InterfaceLanguage,
    panel?: string,
    trigger?: HTMLElement,
): HTMLElement {
    return mountSettingsLauncher(host, modal, language, panel, trigger, true)!;
}

function mountSettingsLauncher(
    host: SensitiveSettingsLauncherHost,
    modal: LookupModalAccessibility,
    language: InterfaceLanguage,
    panel: string | undefined,
    trigger: HTMLElement | undefined,
    allowTrustedCurrentSurface: boolean,
): HTMLElement | null {
    const access = currentSensitiveSettingsSurfaceAccess(host);
    if (access.trusted && !allowTrustedCurrentSurface) return null;
    const launcherUrl = sensitiveSettingsLauncherForPanel(access.launcherUrl, panel);
    const surface = createSensitiveSettingsLauncher(language);
    const close = () => {
        modal.release();
        host.dismiss();
    };
    surface.querySelector<HTMLButtonElement>('[data-trusted-settings-launcher]')?.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        if (!isDirectTrustedReaderInteraction(event)) return;
        await launchTrustedSettingsSurface(host, language, launcherUrl, event.currentTarget as HTMLButtonElement);
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

async function launchTrustedSettingsSurface(
    host: SensitiveSettingsLauncherHost,
    language: InterfaceLanguage,
    url: string,
    launcher: HTMLButtonElement,
): Promise<void> {
    launcher.disabled = true;
    launcher.setAttribute('aria-busy', 'true');
    try {
        if (!await openTrustedSettingsSurface(url)) {
            host.toast(uiText(language, 'settingsCompanionUnavailable'));
        }
    } catch {
        host.toast(uiText(language, 'settingsCompanionUnavailable'));
    } finally {
        launcher.disabled = false;
        launcher.removeAttribute('aria-busy');
    }
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

async function openTrustedSettingsSurface(url: string): Promise<boolean> {
    const protocol = new URL(url).protocol;
    if (WEB_SETTINGS_PROTOCOLS.has(protocol)) {
        return openUrlInNewTab(url);
    }
    return openOwnedFirefoxStudySettings(url);
}

const WEB_SETTINGS_PROTOCOLS = new Set(['http:', 'https:']);

type FirefoxLauncherRuntime = {
    id: string;
    getURL: (path: string) => string;
    sendMessage: (message: unknown) => unknown;
};

/**
 * Content pages cannot navigate to a moz-extension URL with window.open.
 * Ask the extension-owned background to create the tab, but only after proving
 * that the destination is this runtime's packaged Study route and an allowed
 * settings panel. A response without the created tab id is not success.
 */
export async function openOwnedFirefoxStudySettings(url: string): Promise<boolean> {
    const runtime = firefoxLauncherRuntime();
    if (!runtime) return false;
    const panel = runtimeOwnedFirefoxStudySettingsPanel(runtime, url);
    if (!panel) return false;
    return requestPackagedStudySettingsTab(runtime, panel);
}

async function requestPackagedStudySettingsTab(
    runtime: FirefoxLauncherRuntime,
    panel: SettingsPanelId,
): Promise<boolean> {
    try {
        const pending = runtime.sendMessage({
            type: 'yomu.openPackagedStudySettings',
            protocol: PACKAGED_STUDY_SETTINGS_LAUNCHER_PROTOCOL,
            panel,
        });
        if (!isPromiseLike(pending)) return false;
        const response = await pending;
        return validCreatedTabResponse(response);
    } catch {
        return false;
    }
}

function firefoxLauncherRuntime(): FirefoxLauncherRuntime | null {
    const runtime = firefoxLauncherRuntimeCandidate();
    return hasFirefoxLauncherInterface(runtime) ? runtime : null;
}

function firefoxLauncherRuntimeCandidate(): unknown {
    try {
        return (globalThis as typeof globalThis & {
            browser?: { runtime?: unknown };
        }).browser?.runtime;
    } catch {
        return undefined;
    }
}

function hasFirefoxLauncherInterface(value: unknown): value is FirefoxLauncherRuntime {
    const runtime = recordValue(value) as Partial<FirefoxLauncherRuntime> | null;
    if (!runtime) return false;
    return typeof runtime.id === 'string'
        && [runtime.getURL, runtime.sendMessage].every(isFunction);
}

function runtimeOwnedFirefoxStudySettingsPanel(
    runtime: FirefoxLauncherRuntime,
    value: string,
): SettingsPanelId | null {
    const target = readUrl(value);
    if (!target) return null;
    const panel = settingsPanelFromHash(target.hash);
    if (!panel) return null;
    const expected = packagedFirefoxStudySettingsUrl(runtime, panel);
    if (!expected) return null;
    return matchingSettingsPanel(target, expected, panel);
}

function packagedFirefoxStudySettingsUrl(
    runtime: FirefoxLauncherRuntime,
    panel: SettingsPanelId,
): URL | null {
    const expected = readRuntimeStudyUrl(runtime);
    if (!expected || expected.protocol !== 'moz-extension:') return null;
    expected.hash = settingsPanelHash(panel);
    return expected;
}

function readRuntimeStudyUrl(runtime: FirefoxLauncherRuntime): URL | null {
    try {
        return new URL(runtime.getURL('newtab/index.html'));
    } catch {
        return null;
    }
}

function readUrl(value: string): URL | null {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

function matchingSettingsPanel(
    target: URL,
    expected: URL,
    panel: SettingsPanelId,
): SettingsPanelId | null {
    return target.href === expected.href ? panel : null;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === 'function';
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return Boolean(value && typeof (value as { then?: unknown }).then === 'function');
}

function validCreatedTabResponse(value: unknown): boolean {
    const response = recordValue(value);
    if (!response || response.ok !== true) return false;
    return isNonNegativeInteger(response.tabId);
}

function recordValue(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object'
        ? value as Record<string, unknown>
        : null;
}

function isNonNegativeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
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
