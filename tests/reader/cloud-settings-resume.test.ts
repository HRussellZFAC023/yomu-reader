import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCloudSettingsAuthorization } from '../../src/reader/settings/cloud-settings-auth-state';

const CALLBACK_STATE = 'c'.repeat(48);
const PENDING_STATE = 'd'.repeat(48);

function installCallback(state: string, token = 'callback-token'): void {
    const payload = encodeURIComponent(JSON.stringify({
        type: 'yomu-drive-oauth-token',
        state,
        accessToken: token,
        expiresIn: 1200,
    }));
    history.replaceState(null, '', `/study/#yomu-drive-oauth-return=${state}&yomu-drive-oauth-token=${payload}`);
}

function resumeHost(
    state: string | null,
    consumeAuthorization: (expectedState?: string) => { ok: boolean; state: string; error?: string } | null,
) {
    return {
        trustedSurface: true,
        available: true,
        language: 'en' as const,
        readPending: vi.fn(async () => state ? ({
            action: 'restore-cloud-settings' as const,
            startedAt: Date.now(),
            state,
        }) : null),
        clearPending: vi.fn(async () => undefined),
        consumeAuthorization,
        perform: vi.fn(async () => undefined),
        authorizationFailed: vi.fn(),
        actionFailed: vi.fn(),
        openBackup: vi.fn(),
    };
}

afterEach(() => {
    vi.resetModules();
    history.replaceState(null, '', '/');
    window.name = '';
});

describe('cloud settings OAuth resume protocol', () => {
    it('mints high-entropy states in the broker contract format', () => {
        const states = new Set(Array.from({ length: 16 }, () => createCloudSettingsAuthorization().state));
        expect(states).toHaveLength(16);
        for (const state of states) expect(state).toMatch(/^[0-9a-f]{48}$/u);
    });

    it('consumes one callback only after it matches the private pending state', async () => {
        installCallback(CALLBACK_STATE);
        const cloud = await import('../../src/reader/settings/cloud-sync-web');
        const { resumePendingCloudSettingsAction } = await import('../../src/reader/settings/cloud-settings-resume');
        const host = resumeHost(CALLBACK_STATE, cloud.cloudSettingsAuthRedirectResult);

        await expect(resumePendingCloudSettingsAction(host)).resolves.toBe(true);
        expect(host.clearPending).toHaveBeenCalledOnce();
        expect(host.perform).toHaveBeenCalledWith('restore-cloud-settings', 'en');
        expect(host.authorizationFailed).not.toHaveBeenCalled();

        expect(cloud.cloudSettingsAuthRedirectResult(CALLBACK_STATE)).toBeNull();
    });

    it('clears the pending action and refuses a callback with a different state', async () => {
        installCallback(CALLBACK_STATE, 'forged-token');
        const cloud = await import('../../src/reader/settings/cloud-sync-web');
        const { resumePendingCloudSettingsAction } = await import('../../src/reader/settings/cloud-settings-resume');
        const host = resumeHost(PENDING_STATE, cloud.cloudSettingsAuthRedirectResult);

        await expect(resumePendingCloudSettingsAction(host)).resolves.toBe(true);
        expect(host.clearPending).toHaveBeenCalledOnce();
        expect(host.perform).not.toHaveBeenCalled();
        expect(host.authorizationFailed).toHaveBeenCalledWith(
            'Google authorization did not match the pending Yomu action.',
            'en',
        );
        expect(host.openBackup).toHaveBeenCalledOnce();
    });

    it('discards a forged callback when no private pending action exists', async () => {
        installCallback(CALLBACK_STATE, 'replay-token');
        const cloud = await import('../../src/reader/settings/cloud-sync-web');
        const { resumePendingCloudSettingsAction } = await import('../../src/reader/settings/cloud-settings-resume');
        const host = resumeHost(null, cloud.cloudSettingsAuthRedirectResult);

        await expect(resumePendingCloudSettingsAction(host)).resolves.toBe(false);
        expect(host.clearPending).not.toHaveBeenCalled();
        expect(host.perform).not.toHaveBeenCalled();

        expect(cloud.cloudSettingsAuthRedirectResult(CALLBACK_STATE)).toBeNull();
    });

    it('persists the handoff only through private GM storage', () => {
        const pendingAction = readFileSync('src/reader/settings/cloud-settings-pending-action.ts', 'utf8');
        expect(pendingAction).toContain("'yomu:private:cloud-settings-sync-pending:v1'");
        expect(pendingAction).toContain('gmPrivateStorageSet(CLOUD_SETTINGS_PENDING_ACTION_KEY');
        expect(pendingAction).toContain('gmPrivateStorageGet<unknown>(CLOUD_SETTINGS_PENDING_ACTION_KEY');
        expect(pendingAction).toContain('gmPrivateStorageDelete(CLOUD_SETTINGS_PENDING_ACTION_KEY');
        expect(pendingAction).not.toContain("'__yomu_cloud_settings_sync_pending_action'");
    });
});
