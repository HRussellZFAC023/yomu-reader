import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReaderSettings } from '../../src/reader/app/types';
import type { AcademyReaderDeviceStatus } from '../../src/reader/srs/account-sync';
import type { AcademyPairingTicket } from '../../src/reader/srs/account-contract';
import { testEnSettings } from './helpers/settings-fixture';

const accountSync = vi.hoisted(() => ({
    status: vi.fn<[], Promise<AcademyReaderDeviceStatus>>(),
    claim: vi.fn<[string], Promise<AcademyReaderDeviceStatus>>(),
    sync: vi.fn<[], Promise<AcademyReaderDeviceStatus>>(),
    recovery: vi.fn<[], Promise<AcademyPairingTicket>>(),
    disconnect: vi.fn<[], Promise<void>>(),
}));

vi.mock('../../src/reader/srs/account-sync', () => ({
    academyReaderDeviceStatus: accountSync.status,
    claimAcademyReaderDevice: accountSync.claim,
    syncAcademyReaderSrs: accountSync.sync,
    createAcademyReaderRecoveryPairing: accountSync.recovery,
    disconnectAcademyReaderDevice: accountSync.disconnect,
}));

vi.resetModules();
const { localizeSettingsForm, renderSettingsForm } = await import('../../src/reader/settings/form');
const { AcademyAccountSyncSettingsController } = await import('../../src/reader/settings/academy-account-sync');

const DISCONNECTED: AcademyReaderDeviceStatus = {
    connected: false,
    displayName: '',
    lastSyncAt: null,
    error: null,
};
const CONNECTED: AcademyReaderDeviceStatus = {
    connected: true,
    displayName: 'Henry',
    lastSyncAt: Date.UTC(2026, 6, 21, 12, 30),
    error: null,
};

function settingsForm(language: ReaderSettings['interfaceLanguage'] = 'en'): HTMLFormElement {
    const form = document.createElement('form');
    form.innerHTML = renderSettingsForm({ ...testEnSettings(), interfaceLanguage: language }, 'https://jpdb.io/settings');
    document.body.append(form);
    return form;
}

function controller(): {
    instance: InstanceType<typeof AcademyAccountSyncSettingsController>;
    toast: ReturnType<typeof vi.fn>;
} {
    const toast = vi.fn();
    const instance = new AcademyAccountSyncSettingsController(toast);
    return { instance, toast };
}

describe('Academy account sync settings', () => {
    beforeEach(() => {
        accountSync.status.mockResolvedValue(DISCONNECTED);
        accountSync.claim.mockResolvedValue(CONNECTED);
        accountSync.sync.mockResolvedValue(CONNECTED);
        accountSync.recovery.mockResolvedValue({
            pairingId: '12345678-1234-4123-8123-123456789012',
            code: '0234-5678-ABCD-EFGH-JKMN',
            expiresAt: Date.now() + 600_000,
        });
        accountSync.disconnect.mockResolvedValue(undefined);
    });

    afterEach(() => {
        document.body.replaceChildren();
        vi.clearAllMocks();
    });

    it('renders an accessible, mobile-friendly pairing flow in Backup & sync', () => {
        const form = settingsForm();
        const panel = form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-backup')!;
        const link = panel.querySelector<HTMLAnchorElement>('[data-academy-account-link]')!;
        const input = panel.querySelector<HTMLInputElement>('[data-academy-pairing-code]')!;

        expect(panel.querySelector('[data-academy-account-title]')?.textContent).toBe('Academy account sync');
        expect(link.href).toBe('https://yomureader.com/academy/?view=profile-sync');
        expect(link.target).toBe('_blank');
        expect(link.rel).toContain('noopener');
        expect(input.autocomplete).toBe('one-time-code');
        expect(input.maxLength).toBe(24);
        expect(panel.querySelector(`label[for="${input.id}"]`)?.textContent).toContain('One-time pairing code');
        expect(panel.querySelector('[data-academy-reader-status]')?.getAttribute('role')).toBe('status');
        expect(panel.querySelector('[data-action="connect-academy-account"]')?.textContent).toBe('Connect');
        expect(panel.querySelector('[data-academy-reader-connected-controls]')?.hasAttribute('hidden')).toBe(true);
    });

    it('localizes the full account flow into Japanese without untranslated copy', () => {
        const form = settingsForm('en');

        localizeSettingsForm(form, 'ja');

        const section = form.querySelector<HTMLElement>('[data-academy-reader-account]')!;
        expect(section.textContent).toContain('Academyアカウント同期');
        expect(section.textContent).toContain('1回限りのペアリングコード');
        expect(section.querySelector('[data-action="connect-academy-account"]')?.textContent).toBe('接続');
        expect(section.querySelector('[data-action="sync-academy-account"]')?.textContent).toBe('今すぐ同期');
        expect(section.querySelector('[data-action="create-academy-recovery-code"]')?.textContent).toBe('Webサイト復旧コードを作成');
        expect(section.querySelector<HTMLInputElement>('[data-academy-pairing-code]')?.placeholder).toBe('XXXX-XXXX-XXXX-XXXX-XXXX');
        expect(section.textContent).not.toContain('未翻訳');
    });

    it('connects with the one-time code, reports the account and last sync, then disconnects safely', async () => {
        const form = settingsForm();
        const { instance, toast } = controller();
        const input = form.querySelector<HTMLInputElement>('[data-academy-pairing-code]')!;
        input.value = '  0234-5678-ABCD-EFGH-JKMN  ';

        expect(await instance.handle(form, 'connect-academy-account', 'en')).toBe(true);

        expect(accountSync.claim).toHaveBeenCalledWith('0234-5678-ABCD-EFGH-JKMN');
        expect(input.value).toBe('');
        expect(form.querySelector('[data-academy-reader-connect-controls]')?.hasAttribute('hidden')).toBe(true);
        expect(form.querySelector('[data-academy-reader-connected-controls]')?.hasAttribute('hidden')).toBe(false);
        expect(form.querySelector('[data-academy-reader-status]')?.textContent).toContain('Connected as Henry.');
        expect(form.querySelector('[data-academy-reader-status]')?.textContent).toContain('Last synced');
        expect(toast).toHaveBeenCalledWith('Academy account connected and progress synced.');

        await instance.handle(form, 'create-academy-recovery-code', 'en');
        expect(accountSync.recovery).toHaveBeenCalledOnce();
        expect(form.querySelector('[data-academy-recovery-code]')?.textContent).toContain('0234-5678-ABCD-EFGH-JKMN');

        await instance.handle(form, 'disconnect-academy-account', 'en');

        expect(accountSync.disconnect).toHaveBeenCalledOnce();
        expect(form.querySelector('[data-academy-reader-connect-controls]')?.hasAttribute('hidden')).toBe(false);
        expect(form.querySelector('[data-academy-reader-connected-controls]')?.hasAttribute('hidden')).toBe(true);
        expect(form.querySelector('[data-academy-reader-status]')?.textContent).toContain('Not connected');
    });

    it('shows connection state on open and validates the code before calling the device API', async () => {
        const form = settingsForm();
        const { instance } = controller();
        accountSync.status.mockResolvedValue(CONNECTED);

        await instance.refresh(form, 'en');

        expect(form.querySelector('[data-academy-reader-status]')?.textContent).toContain('Connected as Henry.');
        expect(form.querySelector('[data-academy-reader-account]')?.getAttribute('aria-busy')).toBeNull();

        form.querySelector<HTMLInputElement>('[data-academy-pairing-code]')!.value = '   ';
        await instance.handle(form, 'connect-academy-account', 'en');

        expect(accountSync.claim).not.toHaveBeenCalled();
        expect(form.querySelector('[data-academy-reader-status]')?.textContent).toContain('Enter the one-time pairing code');
        expect(form.querySelector('[data-academy-reader-status]')?.getAttribute('data-status-tone')).toBe('error');
    });
});
