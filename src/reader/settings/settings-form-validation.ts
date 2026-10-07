import { uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';
import { activateSettingsPanel, getFormInterfaceLanguage } from './form';

type SettingsConstraintControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Reveal and identify the first invalid setting after an authorized Save. */
export function reportInvalidSettingsForm(
    form: HTMLFormElement,
    fallbackLanguage: InterfaceLanguage,
    toast: (message: string) => void,
): void {
    const control = firstInvalidSettingsControl(form);
    if (!control) return;
    activateInvalidSettingsPanel(form, control);
    revealInvalidSettingsControl(control, form);
    control.focus();
    const message = control.validationMessage
        || uiText(getFormInterfaceLanguage(form, fallbackLanguage), 'settingsSaveFailed');
    // The status line beside Save says it and is announced. A toast would only
    // repeat it, and on a phone it sat on the very field to fix.
    if (!showInvalidSettingsStatus(form, message)) toast(message);
}

function activateInvalidSettingsPanel(form: HTMLFormElement, control: SettingsConstraintControl): void {
    const panel = control.closest<HTMLElement>('[data-settings-panel]')?.dataset.settingsPanel;
    if (panel) activateSettingsPanel(form, panel);
}

function showInvalidSettingsStatus(form: HTMLFormElement, message: string): boolean {
    const status = form.querySelector<HTMLElement>('[data-settings-save-status]');
    if (!status) return false;
    status.hidden = false;
    status.textContent = message;
    return status.isConnected && getComputedStyle(status).display !== 'none';
}

function firstInvalidSettingsControl(form: HTMLFormElement): SettingsConstraintControl | null {
    return Array.from(form.querySelectorAll<SettingsConstraintControl>('input, select, textarea'))
        .find(control => control.willValidate && !control.validity.valid) ?? null;
}

function revealInvalidSettingsControl(control: SettingsConstraintControl, form: HTMLFormElement): void {
    for (let ancestor = control.parentElement; ancestor && ancestor !== form; ancestor = ancestor.parentElement) {
        if (ancestor.hidden) ancestor.hidden = false;
        if (ancestor.tagName === 'DETAILS') (ancestor as HTMLDetailsElement).open = true;
    }
}
