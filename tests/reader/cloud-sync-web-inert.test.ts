import { describe, expect, it } from 'vitest';

// Isolated in its own file so the import-time const evaluates in a fresh module
// registry with no Google OAuth client id ever configured — the default
// userscript/hosted build that ships before the public client id is registered.
describe('cloud-sync-web without a configured client id', () => {
    it('stays inert (disabled) and refuses to sync', async () => {
        const mod = await import('../../src/reader/settings/cloud-sync-web');
        expect(mod.CLOUD_SETTINGS_SYNC_ENABLED).toBe(false);
        expect(mod.cloudSettingsSyncAvailable()).toBe(false);
        await expect(mod.uploadCloudSettingsToCloud({} as never)).rejects.toThrow(/not configured/);
        expect(await mod.downloadCloudSettingsFromCloud().catch(() => 'threw')).toBe('threw');
    });
});
