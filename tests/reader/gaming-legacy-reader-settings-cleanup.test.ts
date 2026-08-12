import { afterEach, describe, expect, it, vi } from 'vitest';
import { removeLegacyGamingReaderSettingsCopy } from '../../src/gaming/renderer/legacy-reader-settings-cleanup';

const LEGACY_READER_SETTINGS_COPY_KEY = 'jpdb-popup-reader-settings';
const GAMING_SETTINGS_KEY = 'yomu-gaming-reader-settings-v1';

describe('Gaming legacy Reader settings cleanup', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('removes only the obsolete Reader copy from a packaged file renderer', () => {
        const values = new Map<string, string>([
            [LEGACY_READER_SETTINGS_COPY_KEY, JSON.stringify({ apiKey: 'stale-secret' })],
            [GAMING_SETTINGS_KEY, JSON.stringify({ learningTargetChosen: true, apiKey: 'current-secret' })],
        ]);
        vi.stubGlobal('location', { protocol: 'file:' });
        vi.stubGlobal('localStorage', { removeItem: (key: string) => values.delete(key) });

        removeLegacyGamingReaderSettingsCopy();

        expect(values.has(LEGACY_READER_SETTINGS_COPY_KEY)).toBe(false);
        expect(JSON.parse(values.get(GAMING_SETTINGS_KEY) ?? '{}')).toMatchObject({
            learningTargetChosen: true,
            apiKey: 'current-secret',
        });
    });

    it('does not delete the Reader key from the HTTP development renderer', () => {
        const removeItem = vi.fn();
        vi.stubGlobal('location', { protocol: 'http:' });
        vi.stubGlobal('localStorage', { removeItem });

        removeLegacyGamingReaderSettingsCopy();

        expect(removeItem).not.toHaveBeenCalled();
    });

    it('leaves launch available when file storage is locked', () => {
        vi.stubGlobal('location', { protocol: 'file:' });
        vi.stubGlobal('localStorage', {
            removeItem: () => { throw new Error('storage locked'); },
        });

        expect(() => removeLegacyGamingReaderSettingsCopy()).not.toThrow();
    });
});
