import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { ReaderSettings } from '../../src/reader/app/types';
import { GAMING_SETTINGS_STORAGE_KEY, PREVIOUS_OCR_ENDPOINT_STORAGE_KEY, PREVIOUS_OCR_ENGINE_STORAGE_KEY,
    persistGamingReaderSettings } from '../../src/gaming/renderer/settings-storage';

const localSettings: ReaderSettings = { ...DEFAULT_SETTINGS, ocrProvider: 'local-service',
    ocrEndpointUrl: 'http://127.0.0.1:9988/new', ocrEngine: 'tesseract' };

function storageFixture(failedKey: string) {
    const values = new Map([
        [GAMING_SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS)],
        [PREVIOUS_OCR_ENDPOINT_STORAGE_KEY, 'http://127.0.0.1:9876/old'],
        [PREVIOUS_OCR_ENGINE_STORAGE_KEY, 'manga-ocr'],
    ]);
    const writes: string[] = [];
    return { values, writes, storage: { setItem(key: string, value: string) {
        writes.push(key);
        if (key === failedKey) throw new DOMException('Fixture quota exceeded', 'QuotaExceededError');
        values.set(key, value);
    } } };
}

describe('Gaming Reader persistence authority and fallback caches', () => {
    it('rejects a failed primary write before touching either existing OCR fallback', () => {
        const f = storageFixture(GAMING_SETTINGS_STORAGE_KEY);
        const previous = new Map(f.values);
        expect(() => persistGamingReaderSettings(localSettings, f.storage)).toThrow('Fixture quota exceeded');
        expect(f.writes).toEqual([GAMING_SETTINGS_STORAGE_KEY]);
        expect(f.values).toEqual(previous);
    });

    it.each([PREVIOUS_OCR_ENDPOINT_STORAGE_KEY, PREVIOUS_OCR_ENGINE_STORAGE_KEY])('keeps a committed Reader save successful when fallback cache %s rejects', failedKey => {
        const f = storageFixture(failedKey);
        const previous = f.values.get(failedKey);
        expect(() => persistGamingReaderSettings(localSettings, f.storage)).not.toThrow();
        expect(f.writes).toEqual([GAMING_SETTINGS_STORAGE_KEY, PREVIOUS_OCR_ENDPOINT_STORAGE_KEY, PREVIOUS_OCR_ENGINE_STORAGE_KEY]);
        expect(JSON.parse(f.values.get(GAMING_SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({ ocrProvider: 'local-service',
            ocrEndpointUrl: 'http://127.0.0.1:9988/new', ocrEngine: 'tesseract' });
        expect(f.values.get(failedKey)).toBe(previous);
    });

    it('does not update local-service fallback caches for a non-local Reader save', () => {
        const f = storageFixture('');
        persistGamingReaderSettings({ ...localSettings, ocrProvider: 'off' }, f.storage);
        expect(f.writes).toEqual([GAMING_SETTINGS_STORAGE_KEY]);
        expect(f.values.get(PREVIOUS_OCR_ENDPOINT_STORAGE_KEY)).toBe('http://127.0.0.1:9876/old');
        expect(f.values.get(PREVIOUS_OCR_ENGINE_STORAGE_KEY)).toBe('manga-ocr');
    });
});
