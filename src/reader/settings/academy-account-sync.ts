import { formatUiText, resolveUiLanguage, uiText } from '../app/i18n';
import { Logger } from '../app/logger';
import { userFacingErrorText } from '../app/user-facing-errors';
import type { InterfaceLanguage } from '../app/types';
import {
    academyReaderDeviceStatus,
    claimAcademyReaderDevice,
    createAcademyReaderRecoveryPairing,
    disconnectAcademyReaderDevice,
    syncAcademyReaderSrs,
    type AcademyReaderDeviceStatus,
} from '../srs/account-sync';
import { getFormInterfaceLanguage } from './form';

type AcademyReaderAccountAction = 'connect-academy-account' | 'sync-academy-account'
    | 'create-academy-recovery-code' | 'disconnect-academy-account';
type AcademyReaderAccountStatusTone = 'pending' | 'success' | 'error';

const log = Logger.scope('AcademyAccountSyncSettings');

export class AcademyAccountSyncSettingsController {
    private statusProbeId = 0;

    constructor(private readonly toast: (message: string) => void) {}

    async refresh(form: HTMLFormElement, fallbackLanguage: InterfaceLanguage): Promise<void> {
        const probeId = ++this.statusProbeId;
        const language = getFormInterfaceLanguage(form, fallbackLanguage);
        setBusy(form, true, uiText(language, 'academyAccountChecking'));
        try {
            const status = await academyReaderDeviceStatus();
            if (probeId !== this.statusProbeId || !form.isConnected) return;
            renderStatus(form, status, language);
        } catch (error) {
            if (probeId !== this.statusProbeId || !form.isConnected) return;
            log.warn('Academy account status failed', error);
            setMessage(
                form,
                formatUiText(language, 'academyAccountConnectionProblem', {
                    message: userFacingErrorText(language, 'actionFailed', error),
                }),
                'error',
            );
        } finally {
            if (probeId === this.statusProbeId && form.isConnected) setBusy(form, false);
        }
    }

    async handle(form: HTMLFormElement, action: string, fallbackLanguage: InterfaceLanguage): Promise<boolean> {
        if (!isAcademyReaderAccountAction(action)) return false;
        const language = getFormInterfaceLanguage(form, fallbackLanguage);
        const input = form.querySelector<HTMLInputElement>('[data-academy-pairing-code]');
        const code = input?.value.trim() ?? '';
        if (action === 'connect-academy-account' && !code) {
            setMessage(form, uiText(language, 'academyPairingCodeRequired'), 'error');
            input?.focus();
            return true;
        }

        const pendingKey = action === 'connect-academy-account'
            ? 'academyAccountConnecting'
            : action === 'sync-academy-account'
                ? 'academyAccountSyncing'
                : action === 'create-academy-recovery-code'
                    ? 'academyRecoveryCodeCreating'
                    : 'academyAccountDisconnecting';
        setBusy(form, true, uiText(language, pendingKey));
        try {
            if (action === 'disconnect-academy-account') {
                await disconnectAcademyReaderDevice();
                renderStatus(form, disconnectedStatus(), language);
                this.toast(uiText(language, 'academyAccountDisconnectedDone'));
                return true;
            }

            if (action === 'create-academy-recovery-code') {
                const ticket = await createAcademyReaderRecoveryPairing();
                const output = form.querySelector<HTMLElement>('[data-academy-recovery-code]');
                if (output) {
                    output.hidden = false;
                    output.textContent = formatUiText(language, 'academyRecoveryCodeReady', { code: ticket.code });
                }
                this.toast(uiText(language, 'academyRecoveryCodeDone'));
                return true;
            }

            const status = action === 'connect-academy-account'
                ? await claimAcademyReaderDevice(code)
                : await syncAcademyReaderSrs();
            renderStatus(form, status, language);
            if (status.connected) {
                if (input) input.value = '';
                this.toast(uiText(language, action === 'connect-academy-account'
                    ? 'academyAccountConnectedDone'
                    : 'academyAccountSyncedDone'));
            }
        } catch (error) {
            log.warn('Academy account action failed', { action }, error);
            const message = userFacingErrorText(language, 'actionFailed', error);
            setMessage(form, message, 'error');
            this.toast(message);
        } finally {
            setBusy(form, false);
        }
        return true;
    }
}

function disconnectedStatus(): AcademyReaderDeviceStatus {
    return { connected: false, displayName: '', lastSyncAt: null, error: null };
}

function renderStatus(form: HTMLFormElement, status: AcademyReaderDeviceStatus, language: InterfaceLanguage): void {
    const section = form.querySelector<HTMLElement>('[data-academy-reader-account]');
    const connectControls = form.querySelector<HTMLElement>('[data-academy-reader-connect-controls]');
    const connectedControls = form.querySelector<HTMLElement>('[data-academy-reader-connected-controls]');
    if (section) section.dataset.connected = String(status.connected);
    if (connectControls) connectControls.hidden = status.connected;
    if (connectedControls) connectedControls.hidden = !status.connected;
    const recoveryCode = form.querySelector<HTMLElement>('[data-academy-recovery-code]');
    if (!status.connected && recoveryCode) {
        recoveryCode.hidden = true;
        recoveryCode.textContent = '';
    }

    if (!status.connected) {
        setMessage(form, uiText(language, 'academyAccountDisconnected'), status.error ? 'error' : 'pending');
        return;
    }

    const pieces = [status.displayName.trim()
        ? formatUiText(language, 'academyAccountConnected', { name: status.displayName.trim() })
        : uiText(language, 'academyAccountConnectedNoName')];
    pieces.push(status.lastSyncAt === null
        ? uiText(language, 'academyAccountNeverSynced')
        : formatUiText(language, 'academyAccountLastSynced', { time: syncTime(status.lastSyncAt, language) }));
    if (status.error) pieces.push(formatUiText(language, 'academyAccountConnectionProblem', { message: status.error }));
    setMessage(form, pieces.join(' '), status.error ? 'error' : 'success');
}

function setBusy(form: HTMLFormElement, busy: boolean, message?: string): void {
    const section = form.querySelector<HTMLElement>('[data-academy-reader-account]');
    if (!section) return;
    if (busy) section.setAttribute('aria-busy', 'true');
    else section.removeAttribute('aria-busy');
    section.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach(button => {
        button.disabled = busy;
    });
    const input = section.querySelector<HTMLInputElement>('[data-academy-pairing-code]');
    if (input) input.disabled = busy;
    if (message) setMessage(form, message, 'pending');
}

function setMessage(form: HTMLFormElement, message: string, tone: AcademyReaderAccountStatusTone): void {
    const status = form.querySelector<HTMLElement>('[data-academy-reader-status]');
    if (!status) return;
    status.textContent = message;
    status.dataset.statusTone = tone;
}

function syncTime(value: number, language: InterfaceLanguage): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString(resolveUiLanguage(language) === 'ja' ? 'ja-JP' : 'en-GB');
}

function isAcademyReaderAccountAction(action: string): action is AcademyReaderAccountAction {
    return action === 'connect-academy-account'
        || action === 'sync-academy-account'
        || action === 'create-academy-recovery-code'
        || action === 'disconnect-academy-account';
}
