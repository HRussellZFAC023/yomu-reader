import { APP_NAME, APP_PUCK } from '../app/constants';
import { uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';
import { firefoxAuthenticationInfoSettingsPageUrl } from '../settings/firefox-data-consent';
import {
    openOwnedFirefoxStudySettings,
    sensitiveSettingsLauncherForPanel,
    sensitiveSettingsSurfaceAccess,
} from '../settings/sensitive-settings-surface';
import { openUrlInNewTab } from './browser';
import { isDirectTrustedReaderInteraction } from './trusted-interaction';

type UserscriptMenuCommandRegister = (name: string, run: () => unknown) => void;

/** Backup is where a learner restores settings once Study can read them again. */
const RECOVERY_PANEL = 'backup';
const WEB_PROTOCOL = /^https?:$/;

// No reader stylesheet is installed when settings never loaded, and the host
// page owns every author rule. Inline !important declarations keep the puck
// legible without widening what the page can reach.
const PUCK_STYLE: Readonly<Record<string, string>> = {
    position: 'fixed',
    right: 'max(14px, env(safe-area-inset-right))',
    bottom: 'max(14px, env(safe-area-inset-bottom))',
    'z-index': '2147483646',
    display: 'inline-flex',
    'align-items': 'center',
    'justify-content': 'center',
    width: '52px',
    height: '52px',
    margin: '0',
    padding: '0',
    border: '2px solid #c5221f',
    'border-radius': '50%',
    background: 'Canvas',
    color: 'CanvasText',
    font: '600 15px/1 system-ui, sans-serif',
    'box-shadow': '0 10px 28px rgba(0, 0, 0, 0.28)',
    cursor: 'pointer',
    opacity: '1',
};
const BADGE_STYLE: Readonly<Record<string, string>> = {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    width: '18px',
    height: '18px',
    'border-radius': '50%',
    background: '#c5221f',
    color: '#ffffff',
    font: '700 12px/18px system-ui, sans-serif',
    'text-align': 'center',
};

let menuCommandRegistered = false;
let recoveryPuck: HTMLButtonElement | undefined;
let pendingMount: (() => void) | undefined;

/**
 * The one visible way back when a content-page Reader cannot read settings:
 * a userscript menu command and an error-state puck, both opening Study.
 */
export function offerSettingsRecovery(language: InterfaceLanguage = 'auto'): void {
    const label = settingsRecoveryLabel(language);
    registerRecoveryMenuCommand(label, language);
    mountRecoveryPuckWhenReady(label, language);
}

/** A later Reader in this document owns the page again. */
export function withdrawSettingsRecovery(): void {
    if (pendingMount) document.removeEventListener('DOMContentLoaded', pendingMount);
    pendingMount = undefined;
    recoveryPuck?.remove();
    recoveryPuck = undefined;
}

export function resetSettingsRecoveryForTests(): void {
    withdrawSettingsRecovery();
    menuCommandRegistered = false;
}

/**
 * Opens the Yomu-owned Study page through the same trusted route as the
 * Settings launcher. Study runs its own settings-authority recovery guard; this
 * page never renders settings, so the host cannot read or retarget them.
 */
export function openStudySettingsRecovery(): Promise<boolean> {
    const access = sensitiveSettingsSurfaceAccess(location.href, firefoxAuthenticationInfoSettingsPageUrl());
    const url = sensitiveSettingsLauncherForPanel(access.launcherUrl, RECOVERY_PANEL);
    if (WEB_PROTOCOL.test(new URL(url).protocol)) return Promise.resolve(openUrlInNewTab(url));
    return openOwnedFirefoxStudySettings(url);
}

function settingsRecoveryLabel(language: InterfaceLanguage): string {
    const state = uiText(language, 'extensionSettingsRecoveryTitle');
    return `${APP_NAME}: ${state} · ${uiText(language, 'openAccountSettingsTrustedSurface')}`;
}

function launchStudySettingsRecovery(language: InterfaceLanguage): void {
    void openStudySettingsRecovery()
        .catch(() => false)
        .then(opened => { if (!opened) markLaunchBlocked(language); });
}

function markLaunchBlocked(language: InterfaceLanguage): void {
    if (!recoveryPuck) return;
    const label = `${APP_NAME}: ${uiText(language, 'settingsCompanionUnavailable')}`;
    recoveryPuck.dataset.yomuSettingsRecovery = 'open-failed';
    recoveryPuck.title = label;
    recoveryPuck.setAttribute('aria-label', label);
}

function registerRecoveryMenuCommand(label: string, language: InterfaceLanguage): void {
    const register = userscriptMenuCommandRegister();
    if (menuCommandRegistered || !register) return;
    menuCommandRegistered = true;
    register(label, () => launchStudySettingsRecovery(language));
}

function userscriptMenuCommandRegister(): UserscriptMenuCommandRegister | null {
    if (typeof GM_registerMenuCommand === 'function') return GM_registerMenuCommand;
    if (typeof GM !== 'undefined' && typeof GM?.registerMenuCommand === 'function') {
        return (name, run) => GM.registerMenuCommand?.(name, run);
    }
    return null;
}

function mountRecoveryPuckWhenReady(label: string, language: InterfaceLanguage): void {
    if (recoveryPuck?.isConnected || pendingMount) return;
    if (document.body) {
        mountRecoveryPuck(label, language);
        return;
    }
    const mount = (): void => {
        pendingMount = undefined;
        if (document.body) mountRecoveryPuck(label, language);
    };
    pendingMount = mount;
    document.addEventListener('DOMContentLoaded', mount, { once: true });
}

function mountRecoveryPuck(label: string, language: InterfaceLanguage): void {
    const puck = recoveryPuckElement(label);
    puck.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (isDirectTrustedReaderInteraction(event)) launchStudySettingsRecovery(language);
    });
    recoveryPuck = puck;
    document.body.append(puck);
}

function recoveryPuckElement(label: string): HTMLButtonElement {
    const puck = document.createElement('button');
    puck.type = 'button';
    // The shared class lets a healthy Reader's own puck replace this one.
    puck.className = 'jpdb-reader-fab jpdb-reader-fab--settings-error';
    puck.dataset.jpdbReaderRoot = 'true';
    puck.dataset.yomuSettingsRecovery = 'unavailable';
    puck.title = label;
    puck.setAttribute('aria-label', label);
    applyImportantStyle(puck, PUCK_STYLE);
    const badge = document.createElement('span');
    badge.textContent = '!';
    badge.setAttribute('aria-hidden', 'true');
    applyImportantStyle(badge, BADGE_STYLE);
    puck.append(APP_PUCK, badge);
    return puck;
}

function applyImportantStyle(element: HTMLElement, declarations: Readonly<Record<string, string>>): void {
    for (const [property, value] of Object.entries(declarations)) {
        element.style.setProperty(property, value, 'important');
    }
}
