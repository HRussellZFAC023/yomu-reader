import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SETTINGS = 'jpdb-popup-reader-settings';
const INTENT = 'yomu:settings-intent:v2';
const COMMIT = '__yomuSettingsPersistenceCommitV1';

function storageFixture() {
    const values = new Map<string, unknown>([
        [SETTINGS, { learningTargetChosen: true, theme: 'dark', [COMMIT]: 'current' }],
        [INTENT, { revision: 1, records: { theme: { seq: 1, value: 'dark' } }, [COMMIT]: 'current' }],
    ]);
    const rawRead = vi.fn(async () => { throw new Error('Raw settings must not be inspected'); });
    const read = vi.fn(async (key: string, fallback: unknown) => structuredClone(values.has(key) ? values.get(key) : fallback));
    const write = vi.fn(async (key: string, value: unknown) => { values.set(key, structuredClone(value)); });
    vi.stubGlobal('location', new URL('moz-extension://test/newtab/index.html'));
    vi.stubGlobal('browser', { runtime: { id: 'test' }, storage: { local: { get: rawRead } } });
    vi.stubGlobal('GM', undefined);
    vi.stubGlobal('GM_getValue', read);
    vi.stubGlobal('GM_setValue', write);
    vi.stubGlobal('GM_deleteValue', vi.fn(async (key: string) => { values.delete(key); }));
    vi.stubGlobal('GM_listValues', vi.fn(async () => [...values.keys()]));
    vi.stubGlobal('__YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__', true);
    return { values, rawRead, read, write };
}

beforeEach(async () => {
    vi.resetModules();
    document.body.replaceChildren();
    const { installFreshManagedStateEpochSessionForTests } = await import('../../src/reader/app/managed-state-epoch');
    installFreshManagedStateEpochSessionForTests();
});
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe('packaged Study current settings startup', () => {
    it('reads canonical authority only, without inspecting or promoting an old namespace', async () => {
        const store = storageFixture();
        const reportFailure = vi.fn();
        const { ensureExtensionStudySettingsAuthority } = await import('../../src/reader/newtab/extension-settings-recovery-guard');
        await ensureExtensionStudySettingsAuthority({ reportFailure });
        expect(store.rawRead).not.toHaveBeenCalled();
        expect(store.write).not.toHaveBeenCalled();
        expect(reportFailure).not.toHaveBeenCalled();
    });

    it('allows a genuinely empty current store without consulting old settings', async () => {
        const store = storageFixture();
        store.values.clear();
        const { ensureExtensionStudySettingsAuthority } = await import('../../src/reader/newtab/extension-settings-recovery-guard');
        await ensureExtensionStudySettingsAuthority();
        expect(store.rawRead).not.toHaveBeenCalled();
        expect(store.write).not.toHaveBeenCalled();
    });

    it('blocks an unavailable current store and lets a successful retry continue', async () => {
        const store = storageFixture();
        store.read.mockRejectedValueOnce(new Error('private backend failure'));
        const reportFailure = vi.fn();
        const { ensureExtensionStudySettingsAuthority } = await import('../../src/reader/newtab/extension-settings-recovery-guard');
        let ready = false;
        const startup = ensureExtensionStudySettingsAuthority({ interfaceLanguage: 'en', reportFailure }).then(() => { ready = true; });
        await vi.waitFor(() => expect(document.querySelector('[data-extension-settings-recovery]')).not.toBeNull());
        expect(ready).toBe(false);
        expect(document.body.textContent).not.toContain('private backend failure');
        expect(store.write).not.toHaveBeenCalled();
        document.querySelector<HTMLButtonElement>('[data-recovery-action="retry"]')!.click();
        await startup;
        expect(ready).toBe(true);
        expect(document.querySelector('[data-extension-settings-recovery]')).toBeNull();
        expect(store.rawRead).not.toHaveBeenCalled();
    });
});
