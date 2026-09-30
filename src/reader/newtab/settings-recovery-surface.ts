import { uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';

type SettingsRecoveryAction = 'retry' | 'import' | 'reload';

export interface SettingsRecoverySurface {
    readonly element: HTMLElement;
    readonly actions: Readonly<Record<SettingsRecoveryAction, HTMLButtonElement>>;
    /** Hidden picker behind the Import action. */
    readonly importInput: HTMLInputElement;
    readonly status: HTMLElement;
}

/** The blocking wall Study shows while its settings cannot be read. */
export function createSettingsRecoverySurface(language: InterfaceLanguage): SettingsRecoverySurface {
    const element = document.createElement('section');
    element.className = 'jpdb-reader-extension-settings-recovery';
    element.dataset.extensionSettingsRecovery = 'blocked';
    element.setAttribute('role', 'alert');
    element.setAttribute('aria-labelledby', 'yomu-extension-settings-recovery-title');
    element.setAttribute('aria-describedby', 'yomu-extension-settings-recovery-copy');
    element.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:Canvas;color:CanvasText;font:16px/1.5 system-ui,sans-serif;';

    const card = document.createElement('div');
    card.style.cssText = 'width:min(560px,100%);padding:24px;border:1px solid ButtonBorder;border-radius:14px;background:Canvas;box-shadow:0 12px 40px #0004;';
    const title = document.createElement('h1');
    title.id = 'yomu-extension-settings-recovery-title';
    title.textContent = uiText(language, 'extensionSettingsRecoveryTitle');
    const body = document.createElement('p');
    body.id = 'yomu-extension-settings-recovery-copy';
    body.textContent = uiText(language, 'extensionSettingsRecoveryBody');
    const actions = {
        retry: recoveryButton('retry', uiText(language, 'extensionSettingsRecoveryRetry')),
        import: recoveryButton('import', uiText(language, 'importSettings')),
        reload: recoveryButton('reload', uiText(language, 'extensionSettingsRecoveryReload')),
    };
    const importInput = settingsFileInput();
    const actionRow = document.createElement('div');
    actionRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;';
    actionRow.append(actions.retry, actions.import, actions.reload, importInput);
    const status = document.createElement('p');
    status.dataset.recoveryStatus = '';
    status.setAttribute('aria-live', 'polite');
    card.append(title, body, actionRow, status);
    element.append(card);
    return { element, actions, importInput, status };
}

export function setRecoveryActionsDisabled(surface: SettingsRecoverySurface, disabled: boolean): void {
    for (const button of Object.values(surface.actions)) button.disabled = disabled;
}

/** Makes the rest of the page inert behind the wall; returns the undo. */
export function isolateRecoverySurface(surface: HTMLElement): () => void {
    const previousInert = [...document.body.children]
        .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== surface)
        .map(element => ({ element, inert: element.inert === true }));
    for (const { element } of previousInert) element.inert = true;
    return () => {
        for (const { element, inert } of previousInert) element.inert = inert;
    };
}

function recoveryButton(action: SettingsRecoveryAction, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jpdb-reader-btn';
    button.dataset.recoveryAction = action;
    button.textContent = label;
    return button;
}

function settingsFileInput(): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.hidden = true;
    input.tabIndex = -1;
    input.dataset.recoveryImportInput = '';
    return input;
}
