import { uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';

interface SettingsRestoreCoordinatorPort {
    interfaceLanguage: () => InterfaceLanguage;
    currentForm: () => HTMLFormElement | undefined;
    toast: (message: string) => void;
    invalidateRestoreDependents: () => void;
}

interface SettingsOperationUiState {
    busy: boolean;
    message: string;
    saveLabel: string;
    blockedBy?: 'settings-import' | 'dictionary-import' | 'settings-save' | 'settings-action';
}

type SettingsActionMode = 'local' | 'durable' | 'restore';

export interface SettingsActionTicket {
    readonly revision: number;
    readonly mode: SettingsActionMode;
}

interface FormFreezeSnapshot {
    readonly fieldsets: Map<HTMLFieldSetElement, boolean>;
    readonly controls: Map<SettingsControl, boolean>;
}

type SettingsControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement;

const LOCAL_SETTINGS_ACTIONS = new Set([
    'anki-tag-add',
    'anki-tag-remove',
    'audio-source-add',
    'audio-source-down',
    'audio-source-remove',
    'audio-source-up',
    'cancel',
    'copy-newtab-url',
    'dictionary-source-down',
    'dictionary-source-up',
    'lookup-link-add',
    'lookup-link-down',
    'lookup-link-remove',
    'lookup-link-up',
    'open-yomu-update',
    'settings-panel',
    'toggle-catalog-browse',
]);

function settingsActionMode(action: string): SettingsActionMode {
    if (action === 'import-yomitan-settings' || action === 'restore-cloud-settings') return 'restore';
    if (LOCAL_SETTINGS_ACTIONS.has(action)) return 'local';
    // Unknown actions fail closed. Adding a durable settings action does not
    // silently make it concurrent with Save or restore.
    return 'durable';
}

/**
 * Owns the settings dialog's durable-operation ordering and its UI projection.
 *
 * Callers capture an action ticket synchronously inside the trusted click, so
 * Firefox permission requests can remain in that gesture. The same ticket is
 * re-admitted after permission settles; a restore that started in between has
 * changed the revision and the stale action never starts.
 */
export class SettingsRestoreCoordinator {
    private dictionaryOperationTail: Promise<void> = Promise.resolve();
    private pendingDictionaryOperations = 0;
    private restorePending = false;
    private revision = 0;
    private savePending = false;
    private readonly activeSaves = new Set<Promise<void>>();
    private readonly activeDurableOperations = new Set<Promise<void>>();
    private readonly freezeSnapshots = new WeakMap<HTMLFormElement, FormFreezeSnapshot>();

    constructor(private readonly port: SettingsRestoreCoordinatorPort) {}

    get importPending(): boolean {
        return this.restorePending;
    }

    get importRevision(): number {
        return this.revision;
    }

    captureAction(form: HTMLFormElement, action: string): SettingsActionTicket | undefined {
        const ticket = { revision: this.revision, mode: settingsActionMode(action) } as const;
        return this.actionIsAdmitted(form, ticket) ? ticket : undefined;
    }

    async runAction<T>(
        form: HTMLFormElement,
        ticket: SettingsActionTicket,
        operation: () => Promise<T>,
    ): Promise<T | undefined> {
        if (!this.actionIsAdmitted(form, ticket)) return undefined;
        if (ticket.mode === 'durable') return this.runDurableOperation(operation);
        return operation();
    }

    private actionIsAdmitted(form: HTMLFormElement, ticket: SettingsActionTicket): boolean {
        if (ticket.mode === 'local') return true;
        if (this.restoreBlocksAction(ticket)) {
            this.showRestoreBlocked(form);
            return false;
        }
        if (!this.savePending) return true;
        this.sync(form);
        return false;
    }

    private restoreBlocksAction(ticket: SettingsActionTicket): boolean {
        return this.restorePending || ticket.revision !== this.revision;
    }

    beginSave(form: HTMLFormElement): number | undefined {
        if (this.saveIsBlocked(form)) return undefined;
        this.savePending = true;
        try {
            this.sync(form);
        } catch (error) {
            this.savePending = false;
            throw error;
        }
        return this.revision;
    }

    private saveIsBlocked(form: HTMLFormElement): boolean {
        if (this.saveConflictPending()) {
            this.sync(form);
            return true;
        }
        if (this.restorePending) {
            this.showRestoreBlocked(form);
            return true;
        }
        if (this.pendingDictionaryOperations > 0) {
            this.showDictionarySaveBlocked(form);
            return true;
        }
        return false;
    }

    private saveConflictPending(): boolean {
        return this.savePending || this.activeDurableOperations.size > 0;
    }

    finishSave(form: HTMLFormElement): void {
        this.savePending = false;
        if (form.isConnected) this.sync(form);
        this.syncOtherCurrentForm(form);
    }

    saveRevisionIsCurrent(revision: number): boolean {
        return revision === this.importRevision;
    }

    async runDurableOperation<T>(operation: () => Promise<T>): Promise<T> {
        let release!: () => void;
        const lifetime = new Promise<void>(resolve => { release = resolve; });
        this.activeDurableOperations.add(lifetime);
        try {
            this.syncCurrentForm();
            return await operation();
        } finally {
            this.activeDurableOperations.delete(lifetime);
            release();
            this.syncCurrentForm();
        }
    }

    trackSave(operation: Promise<void>): Promise<void> {
        this.activeSaves.add(operation);
        const settle = () => this.activeSaves.delete(operation);
        void operation.then(settle, settle);
        return operation;
    }

    enqueueDictionaryOperation<T>(form: HTMLFormElement | undefined, task: () => Promise<T>): Promise<T> {
        this.pendingDictionaryOperations++;
        try {
            if (form) this.sync(form);
        } catch (error) {
            this.pendingDictionaryOperations = Math.max(0, this.pendingDictionaryOperations - 1);
            throw error;
        }
        const operation = this.dictionaryOperationTail.then(task);
        this.dictionaryOperationTail = operation.then(() => undefined, () => undefined);
        return operation.finally(() => {
            this.pendingDictionaryOperations = Math.max(0, this.pendingDictionaryOperations - 1);
            if (form?.isConnected) this.sync(form);
            this.syncOtherCurrentForm(form);
        });
    }

    sync(form: HTMLFormElement): void {
        const state = this.operationUiState();
        const save = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        const status = form.querySelector<HTMLElement>('[data-settings-save-status]');
        syncSettingsSaveControl(save, state);
        this.syncFormFreeze(form, save);
        if (status) {
            status.hidden = !state.message;
            status.textContent = state.message;
        }
    }

    showRestoreBlocked(form: HTMLFormElement): void {
        this.sync(form);
        this.port.toast(uiText(this.port.interfaceLanguage(), 'settingsImportSaveBlocked'));
    }

    showStaleSaveDiscarded(form: HTMLFormElement): void {
        const message = uiText(this.port.interfaceLanguage(), 'settingsImportStaleSaveDiscarded');
        const status = form.querySelector<HTMLElement>('[data-settings-save-status]');
        if (status) {
            status.hidden = false;
            status.textContent = message;
        }
        this.port.toast(message);
    }

    importBlocked(form: HTMLFormElement): boolean {
        if (!this.restorePending) return false;
        this.showRestoreBlocked(form);
        return true;
    }

    async runRestore<T>(form: HTMLFormElement | undefined, operation: () => Promise<T>): Promise<T> {
        this.startRestore(form);
        try {
            await Promise.allSettled([
                ...this.activeSaves,
                ...this.activeDurableOperations,
            ]);
            return await this.enqueueDictionaryOperation(form, operation);
        } finally {
            this.endRestore(form);
        }
    }

    private startRestore(form: HTMLFormElement | undefined): void {
        if (this.restorePending) throw new Error('A settings restore is already running.');
        this.restorePending = true;
        this.revision++;
        try {
            this.port.invalidateRestoreDependents();
            if (form) this.sync(form);
            this.syncOtherCurrentForm(form);
        } catch (error) {
            this.revision++;
            this.restorePending = false;
            throw error;
        }
    }

    private endRestore(form: HTMLFormElement | undefined): void {
        this.revision++;
        this.restorePending = false;
        if (form?.isConnected) this.sync(form);
        this.syncOtherCurrentForm(form);
    }

    private operationUiState(): SettingsOperationUiState {
        const language = this.port.interfaceLanguage();
        if (this.restorePending) return restoreUiState(language);
        if (this.pendingDictionaryOperations > 0) {
            return dictionaryQueueUiState(this.pendingDictionaryOperations, language);
        }
        return this.operationUiStateWithoutRestore(language);
    }

    private operationUiStateWithoutRestore(language: InterfaceLanguage): SettingsOperationUiState {
        if (this.activeDurableOperations.size > 0) return busyUiState(language, 'settings-action');
        if (this.savePending) return busyUiState(language, 'settings-save');
        return readyUiState(language);
    }

    private syncFormFreeze(form: HTMLFormElement, save: HTMLButtonElement | null): void {
        const snapshot = this.freezeSnapshot(form);
        this.syncRestoreFieldsets(form, snapshot.fieldsets);
        this.syncFrozenControls(form, save, snapshot.controls);
        if (!snapshot.fieldsets.size && !snapshot.controls.size) this.freezeSnapshots.delete(form);
    }

    private freezeSnapshot(form: HTMLFormElement): FormFreezeSnapshot {
        const existing = this.freezeSnapshots.get(form);
        if (existing) return existing;
        const snapshot = {
            fieldsets: new Map<HTMLFieldSetElement, boolean>(),
            controls: new Map<SettingsControl, boolean>(),
        };
        this.freezeSnapshots.set(form, snapshot);
        return snapshot;
    }

    private syncRestoreFieldsets(form: HTMLFormElement, snapshots: Map<HTMLFieldSetElement, boolean>): void {
        if (!this.restorePending) {
            restoreDisabledSnapshots(snapshots);
            return;
        }
        form.querySelectorAll<HTMLFieldSetElement>('fieldset[data-settings-panel]').forEach(fieldset => {
            rememberAndDisable(fieldset, snapshots);
        });
    }

    private syncFrozenControls(
        form: HTMLFormElement,
        save: HTMLButtonElement | null,
        snapshots: Map<SettingsControl, boolean>,
    ): void {
        for (const [control, disabled] of snapshots) {
            if (this.controlShouldFreeze(control, save)) continue;
            control.disabled = disabled;
            snapshots.delete(control);
        }
        form.querySelectorAll<SettingsControl>('input, select, textarea, button').forEach(control => {
            if (this.controlShouldFreeze(control, save)) rememberAndDisable(control, snapshots);
        });
    }

    private controlShouldFreeze(control: SettingsControl, save: HTMLButtonElement | null): boolean {
        if (controlStaysInteractive(control, save)) return false;
        if (this.restorePending) return !control.closest('fieldset[data-settings-panel]');
        if (!this.savePending) return false;
        return settingsActionIsUnsafe(control);
    }

    private showDictionarySaveBlocked(form: HTMLFormElement): void {
        this.sync(form);
        const message = uiText(this.port.interfaceLanguage(), 'dictionaryInstallSaveBlocked');
        const status = form.querySelector<HTMLElement>('[data-settings-save-status]');
        if (status) {
            status.hidden = false;
            status.textContent = message;
        }
        this.port.toast(message);
    }

    private syncCurrentForm(): void {
        const form = this.port.currentForm();
        if (form?.isConnected) this.sync(form);
    }

    private syncOtherCurrentForm(form: HTMLFormElement | undefined): void {
        const current = this.port.currentForm();
        if (current && current !== form && current.isConnected) this.sync(current);
    }
}

function controlStaysInteractive(control: SettingsControl, save: HTMLButtonElement | null): boolean {
    return control === save || control.dataset.action === 'cancel';
}

function settingsActionIsUnsafe(control: SettingsControl): boolean {
    const action = control.dataset.action;
    if (!action) return false;
    return settingsActionMode(action) !== 'local';
}

function rememberAndDisable<T extends { disabled: boolean }>(control: T, snapshots: Map<T, boolean>): void {
    if (!snapshots.has(control)) snapshots.set(control, control.disabled);
    control.disabled = true;
}

function restoreDisabledSnapshots<T extends { disabled: boolean }>(snapshots: Map<T, boolean>): void {
    for (const [control, disabled] of snapshots) control.disabled = disabled;
    snapshots.clear();
}

function restoreUiState(language: InterfaceLanguage): SettingsOperationUiState {
    return {
        busy: true,
        message: uiText(language, 'settingsImportSaveBlocked'),
        saveLabel: uiText(language, 'saveAfterImport'),
        blockedBy: 'settings-import',
    };
}

function dictionaryQueueUiState(count: number, language: InterfaceLanguage): SettingsOperationUiState {
    const message = uiText(language, 'dictionaryImportQueueStatus')
        .replace('{count}', count.toLocaleString())
        .replace('{plural}', count === 1 ? '' : 's');
    return {
        busy: true,
        message,
        saveLabel: uiText(language, 'saveAfterInstall'),
        blockedBy: 'dictionary-import',
    };
}

function busyUiState(
    language: InterfaceLanguage,
    blockedBy: 'settings-save' | 'settings-action',
): SettingsOperationUiState {
    return {
        busy: true,
        message: '',
        saveLabel: uiText(language, 'save'),
        blockedBy,
    };
}

function readyUiState(language: InterfaceLanguage): SettingsOperationUiState {
    return { busy: false, message: '', saveLabel: uiText(language, 'save') };
}

function syncSettingsSaveControl(save: HTMLButtonElement | null, state: SettingsOperationUiState): void {
    if (!save) return;
    const accessibleLabel = state.message || state.saveLabel;
    save.setAttribute('aria-disabled', String(state.busy));
    save.disabled = state.busy;
    save.replaceChildren(state.saveLabel);
    save.title = accessibleLabel;
    save.setAttribute('aria-label', accessibleLabel);
    if (state.blockedBy) save.dataset.saveBlocked = state.blockedBy;
    else delete save.dataset.saveBlocked;
}
