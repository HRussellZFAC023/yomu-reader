import { describe, expect, it } from 'vitest';

// Isolated in its own file so the import-time const evaluates in a fresh module
// registry with no build-time OAuth override configured.
describe('cloud-sync-web with the baked-in public client id', () => {
    it('is enabled by default for hosted and userscript builds', async () => {
        const mod = await import('../../src/reader/settings/cloud-sync-web');
        expect(mod.CLOUD_SETTINGS_SYNC_ENABLED).toBe(true);
        expect(mod.cloudSettingsSyncAvailable()).toBe(true);
    });
});
