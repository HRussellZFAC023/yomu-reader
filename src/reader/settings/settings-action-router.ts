import { Logger } from '../app/logger';
import type { InterfaceLanguage, ReaderSettings } from '../app/types';
import { uiText } from '../app/i18n';
import { userFacingErrorText } from '../app/user-facing-errors';
import { readFormSettings, getFormInterfaceLanguage } from './form';
import {
    requestFirefoxAuthenticationInfoForSettings,
    requestFirefoxAuthenticationInfoPermission,
    type FirefoxAuthenticationInfoConsent,
} from './firefox-data-consent';
import type { SettingsActionTicket, SettingsRestoreCoordinator } from './settings-restore-coordinator';

export type SettingsStatusSetter = (message: string) => void;

export interface SettingsActionContext {
    readonly form: HTMLFormElement;
    readonly action: string;
    readonly control: HTMLElement | null | undefined;
    readonly setStatus: SettingsStatusSetter;
}

interface SettingsActionRouterPort {
    readonly settings: () => ReaderSettings;
    readonly toast: (message: string) => void;
    readonly handlePreviewLookup: (event: Event) => boolean;
    readonly handleAnkiTagKeydown: (form: HTMLFormElement, event: KeyboardEvent) => boolean;
    readonly handleAction: (context: SettingsActionContext) => Promise<void>;
}

interface SettingsActionTarget {
    readonly control: HTMLButtonElement;
    readonly action: string;
}

const log = Logger.scope('SettingsActionRouter');

export class SettingsActionRouter {
    constructor(
        private readonly port: SettingsActionRouterPort,
        private readonly gate: SettingsRestoreCoordinator,
    ) {}

    bind(form: HTMLFormElement): void {
        form.addEventListener('click', event => this.handleClick(form, event));
        form.addEventListener('keydown', event => this.handleKeydown(form, event));
    }

    private handleClick(form: HTMLFormElement, event: MouseEvent): void {
        if (this.port.handlePreviewLookup(event)) return;
        const target = settingsActionTarget(event);
        if (!target) return;
        this.dispatchActionClick(form, event, target);
    }

    private dispatchActionClick(
        form: HTMLFormElement,
        event: MouseEvent,
        target: SettingsActionTarget,
    ): void {
        event.preventDefault();
        event.stopPropagation();
        const ticket = this.gate.captureAction(form, target.action);
        if (!ticket) return;
        // This call must remain inside the trusted click. Awaiting before it
        // would make Firefox reject permissions.request().
        const permission = authenticationInfoPermissionForAction(form, target.action, this.port.settings());
        if (permission) void this.handlePermissionDelayedAction(form, target, permission, ticket);
        else void this.executeAction(form, target, ticket);
    }

    private handleKeydown(form: HTMLFormElement, event: KeyboardEvent): void {
        if (this.consumeAnkiTagKeydown(form, event)) return;
        if (!isSettingsPreviewKey(event)) return;
        if (this.port.handlePreviewLookup(event)) event.preventDefault();
    }

    private consumeAnkiTagKeydown(form: HTMLFormElement, event: KeyboardEvent): boolean {
        if (!this.port.handleAnkiTagKeydown(form, event)) return false;
        event.preventDefault();
        return true;
    }

    private async handlePermissionDelayedAction(
        form: HTMLFormElement,
        target: SettingsActionTarget,
        permission: Promise<FirefoxAuthenticationInfoConsent>,
        ticket: SettingsActionTicket,
    ): Promise<void> {
        try {
            const consent = await permission;
            const language = getFormInterfaceLanguage(form, this.port.settings().interfaceLanguage);
            if (!acceptFirefoxAuthenticationInfoConsent(consent, language, this.port.toast)) return;
            await this.executeAction(form, target, ticket);
        } catch (error) {
            this.reportActionError(form, target, error);
        }
    }

    private async executeAction(
        form: HTMLFormElement,
        target: SettingsActionTarget,
        ticket: SettingsActionTicket,
    ): Promise<void> {
        const setStatus = settingsStatusSetter(form, target.control);
        try {
            await this.gate.runAction(form, ticket, () => this.port.handleAction({
                form,
                action: target.action,
                control: target.control,
                setStatus,
            }));
        } catch (error) {
            this.reportActionError(form, target, error, setStatus);
        }
    }

    private reportActionError(
        form: HTMLFormElement,
        target: SettingsActionTarget,
        error: unknown,
        setStatus = settingsStatusSetter(form, target.control),
    ): void {
        const language = getFormInterfaceLanguage(form, this.port.settings().interfaceLanguage);
        const message = handleSettingsActionError(target.action, target.control, setStatus, error, language);
        this.port.toast(message);
    }

}

export function acceptFirefoxAuthenticationInfoConsent(
    consent: FirefoxAuthenticationInfoConsent,
    language: InterfaceLanguage,
    toast: (message: string) => void,
): boolean {
    if (consent === 'granted') return true;
    const key = consent === 'extension-page-required'
        ? 'firefoxAuthenticationInfoExtensionPageRequired'
        : 'firefoxAuthenticationInfoDenied';
    toast(uiText(language, key));
    return false;
}

export function handleSettingsActionError(
    action: string,
    control: HTMLElement | null | undefined,
    setStatus: SettingsStatusSetter,
    error: unknown,
    language: InterfaceLanguage,
): string {
    log.warn('Settings action failed', { action }, error);
    if (shouldReenableSettingsAction(action)) control?.removeAttribute('disabled');
    const message = userFacingErrorText(language, 'actionFailed', error);
    setStatus(message);
    return message;
}

function settingsActionTarget(event: MouseEvent): SettingsActionTarget | null {
    const control = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
    const action = control?.dataset.action;
    if (!control || !action || action === 'cancel') return null;
    return { control, action };
}

function isSettingsPreviewKey(event: KeyboardEvent): boolean {
    return event.key === 'Enter' || event.key === ' ';
}

function authenticationInfoPermissionForAction(
    form: HTMLFormElement,
    action: string,
    settings: ReaderSettings,
): Promise<FirefoxAuthenticationInfoConsent> | undefined {
    if (action === 'sync-cloud-settings') {
        return requestFirefoxAuthenticationInfoForSettings(readFormSettings(new FormData(form), settings));
    }
    if (actionNeedsCredentialPermission(action)) return requestFirefoxAuthenticationInfoPermission();
    return undefined;
}

function actionNeedsCredentialPermission(action: string): boolean {
    return action === 'restore-cloud-settings'
        || action === 'import-yomitan-settings'
        || action === 'connect-academy-account';
}

function settingsStatusSetter(form: HTMLFormElement, control?: HTMLElement | null): SettingsStatusSetter {
    return message => {
        const originPanel = control?.closest<HTMLElement>('fieldset[data-settings-panel]');
        const status = originPanel?.querySelector<HTMLElement>('[data-import-status]')
            ?? form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-backup [data-import-status]')
            ?? form.querySelector<HTMLElement>('[data-import-status]');
        if (!status) return;
        status.textContent = message;
        status.hidden = false;
    };
}

function shouldReenableSettingsAction(action: string): boolean {
    return action === 'download-recommended-dictionary' || action === 'delete-yomitan-dictionary';
}
