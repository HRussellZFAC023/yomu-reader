import { uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';
import {
    canonicalExtensionStudySettingsAreChosen,
    ExtensionStudySettingsRecoveryFailure,
    isExtensionStudySettingsRecoveryFailure,
    recoverExtensionStudySettingsAuthority,
} from '../settings/extension-study-settings-recovery';

export interface ExtensionSettingsRecoveryGuardOptions {
    readonly interfaceLanguage?: InterfaceLanguage;
    readonly reload?: () => void;
    readonly reportFailure?: (failure: ExtensionStudySettingsRecoveryFailure) => void;
}

const activeGuards = new WeakMap<Document, Promise<void>>();

/**
 * Prevents packaged Study from reaching onboarding/defaults while settings
 * authority is uncertain. The only escape paths are proven canonical settings,
 * a successful retry, or a document reload.
 */
export function ensureExtensionStudySettingsAuthority(
    options: ExtensionSettingsRecoveryGuardOptions = {},
): Promise<void> {
    const active = activeGuards.get(document);
    if (active) return active;
    const guard = runExtensionSettingsRecoveryGuard(options);
    activeGuards.set(document, guard);
    const clearActiveGuard = (): void => {
        if (activeGuards.get(document) === guard) activeGuards.delete(document);
    };
    void guard.then(clearActiveGuard, clearActiveGuard);
    return guard;
}

async function runExtensionSettingsRecoveryGuard(
    options: ExtensionSettingsRecoveryGuardOptions,
): Promise<void> {
    const attempt = (): Promise<boolean> => attemptSettingsAuthorityRecovery(options.reportFailure);
    if (await attempt()) return;
    await waitOnRecoverySurface(attempt, options);
}

async function attemptSettingsAuthorityRecovery(
    reportFailure: ExtensionSettingsRecoveryGuardOptions['reportFailure'],
): Promise<boolean> {
    try {
        await recoverExtensionStudySettingsAuthority();
        return true;
    } catch (error) {
        reportFailure?.(secretFreeRecoveryFailure(error));
        try {
            return await canonicalExtensionStudySettingsAreChosen();
        } catch {
            return false;
        }
    }
}

function secretFreeRecoveryFailure(error: unknown): ExtensionStudySettingsRecoveryFailure {
    return isExtensionStudySettingsRecoveryFailure(error)
        ? error
        : new ExtensionStudySettingsRecoveryFailure(false);
}

function waitOnRecoverySurface(
    retryAuthorityRecovery: () => Promise<boolean>,
    options: ExtensionSettingsRecoveryGuardOptions,
): Promise<void> {
    const language = options.interfaceLanguage ?? 'auto';
    const surface = recoverySurface(language);
    const retry = surface.querySelector<HTMLButtonElement>('[data-recovery-action="retry"]')!;
    const reload = surface.querySelector<HTMLButtonElement>('[data-recovery-action="reload"]')!;
    const status = surface.querySelector<HTMLElement>('[data-recovery-status]')!;
    document.body.prepend(surface);
    const restorePageInteractivity = isolateRecoverySurface(surface);
    retry.focus();

    return new Promise(resolve => {
        retry.addEventListener('click', () => {
            retry.disabled = true;
            reload.disabled = true;
            status.textContent = uiText(language, 'extensionSettingsRecoveryRetrying');
            void retryAuthorityRecovery().then(ready => {
                if (ready) {
                    restorePageInteractivity();
                    surface.remove();
                    resolve();
                    return;
                }
                status.textContent = uiText(language, 'extensionSettingsRecoveryStillBlocked');
                retry.disabled = false;
                reload.disabled = false;
                retry.focus();
            });
        });
        reload.addEventListener('click', () => (options.reload ?? (() => location.reload()))());
    });
}

function isolateRecoverySurface(surface: HTMLElement): () => void {
    const previousInert = [...document.body.children]
        .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== surface)
        .map(element => ({ element, inert: element.inert === true }));
    for (const { element } of previousInert) element.inert = true;
    return () => {
        for (const { element, inert } of previousInert) element.inert = inert;
    };
}

function recoverySurface(language: InterfaceLanguage): HTMLElement {
    const surface = document.createElement('section');
    surface.className = 'jpdb-reader-extension-settings-recovery';
    surface.dataset.extensionSettingsRecovery = 'blocked';
    surface.setAttribute('role', 'alert');
    surface.setAttribute('aria-labelledby', 'yomu-extension-settings-recovery-title');
    surface.setAttribute('aria-describedby', 'yomu-extension-settings-recovery-copy');
    surface.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:Canvas;color:CanvasText;font:16px/1.5 system-ui,sans-serif;';

    const card = document.createElement('div');
    card.style.cssText = 'width:min(560px,100%);padding:24px;border:1px solid ButtonBorder;border-radius:14px;background:Canvas;box-shadow:0 12px 40px #0004;';
    const title = document.createElement('h1');
    title.id = 'yomu-extension-settings-recovery-title';
    title.textContent = uiText(language, 'extensionSettingsRecoveryTitle');
    const body = document.createElement('p');
    body.id = 'yomu-extension-settings-recovery-copy';
    body.textContent = uiText(language, 'extensionSettingsRecoveryBody');
    const guidance = document.createElement('p');
    guidance.textContent = uiText(language, 'extensionSettingsRecoveryGuidance');
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;';
    actions.append(
        recoveryButton('retry', uiText(language, 'extensionSettingsRecoveryRetry')),
        recoveryButton('reload', uiText(language, 'extensionSettingsRecoveryReload')),
    );
    const status = document.createElement('p');
    status.dataset.recoveryStatus = '';
    status.setAttribute('aria-live', 'polite');
    card.append(title, body, guidance, actions, status);
    surface.append(card);
    return surface;
}

function recoveryButton(action: 'retry' | 'reload', label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jpdb-reader-btn';
    button.dataset.recoveryAction = action;
    button.textContent = label;
    return button;
}
