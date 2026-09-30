import { uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';
import { packagedExtensionStorageAdapterMissing } from '../app/gm-storage-adapters';
import { userFacingErrorText } from '../app/user-facing-errors';
import { readSettingsPersistenceViewStrict } from '../settings/settings-persistence-transaction';
import { importSettingsBackupForRecovery } from './settings-recovery-import';
import {
    createSettingsRecoverySurface,
    isolateRecoverySurface,
    setRecoveryActionsDisabled,
    type SettingsRecoverySurface,
} from './settings-recovery-surface';

export interface ExtensionSettingsRecoveryGuardOptions {
    readonly interfaceLanguage?: InterfaceLanguage;
    /** Startup's page-storage barrier, run before every read so the guard reads what Study will. */
    readonly prepareStorage?: () => Promise<void>;
    readonly reload?: () => void;
    readonly reportFailure?: () => void;
}

/** Settles with null once settings are readable, or with the status to show while still blocked. */
type RecoveryStep = () => Promise<string | null>;

const activeGuards = new WeakMap<Document, Promise<void>>();

/**
 * Prevents Study, packaged or hosted, from reaching onboarding/defaults while
 * settings authority is uncertain. The only escape paths are proven canonical
 * settings, a successful retry, an imported settings file, or a document reload.
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
    const attempt = (): Promise<boolean> => attemptCurrentSettingsRead(options);
    if (await attempt()) return;
    await waitOnRecoverySurface(attempt, options);
}

async function attemptCurrentSettingsRead(options: ExtensionSettingsRecoveryGuardOptions): Promise<boolean> {
    try {
        // Only a packaged document can lack its adapter; it is false everywhere else.
        if (packagedExtensionStorageAdapterMissing()) throw new Error('Storage adapter unavailable');
        await options.prepareStorage?.();
        await readSettingsPersistenceViewStrict();
        return true;
    } catch {
        options.reportFailure?.();
        return false;
    }
}

function waitOnRecoverySurface(
    retryAuthorityRecovery: () => Promise<boolean>,
    options: ExtensionSettingsRecoveryGuardOptions,
): Promise<void> {
    const language = options.interfaceLanguage ?? 'auto';
    const surface = createSettingsRecoverySurface(language);
    const { retry, import: importSettings, reload } = surface.actions;
    document.body.prepend(surface.element);
    const restorePageInteractivity = isolateRecoverySurface(surface.element);
    retry.focus();
    const readAgain: RecoveryStep = async () => (await retryAuthorityRecovery())
        ? null
        : uiText(language, 'extensionSettingsRecoveryStillBlocked');

    return new Promise(resolve => {
        const run = (step: RecoveryStep): void => {
            setRecoveryActionsDisabled(surface, true);
            surface.status.textContent = uiText(language, 'extensionSettingsRecoveryRetrying');
            void step().then(blocked => {
                if (blocked === null) {
                    restorePageInteractivity();
                    surface.element.remove();
                    resolve();
                    return;
                }
                surface.status.textContent = blocked;
                setRecoveryActionsDisabled(surface, false);
                retry.focus();
            });
        };
        retry.addEventListener('click', () => run(readAgain));
        importSettings.addEventListener('click', () => surface.importInput.click());
        surface.importInput.addEventListener('change', () => {
            const file = surface.importInput.files?.[0];
            surface.importInput.value = '';
            if (file) run(() => importThenReadAgain(file, surface, language, readAgain));
        });
        reload.addEventListener('click', () => (options.reload ?? (() => location.reload()))());
    });
}

async function importThenReadAgain(
    file: File,
    surface: SettingsRecoverySurface,
    language: InterfaceLanguage,
    readAgain: RecoveryStep,
): Promise<string | null> {
    try {
        await importSettingsBackupForRecovery(file, message => { surface.status.textContent = message; });
    } catch (error) {
        return userFacingErrorText(language, 'actionFailed', error);
    }
    return readAgain();
}
