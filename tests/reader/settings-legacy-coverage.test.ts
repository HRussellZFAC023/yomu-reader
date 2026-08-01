import { describe, expect, it } from 'vitest';

import { normalizeReaderSettings } from '../../src/reader/settings/index';

// Regression guards for legacy-migration branches that previously had zero
// coverage: a payload predating furiganaMode must map onto the mode its old
// booleans expressed, and junk enum payloads must coerce to safe defaults.
describe('legacy settings migration coverage', () => {
    it('maps legacy hideKnownFurigana:false to furiganaMode all', () => {
        expect(normalizeReaderSettings({ hideKnownFurigana: false }).furiganaMode).toBe('all');
    });

    it('maps legacy showFurigana:false to furiganaMode off', () => {
        expect(normalizeReaderSettings({ showFurigana: false }).furiganaMode).toBe('off');
    });

    it('coerces junk subtitleControlsMode to auto', () => {
        expect(normalizeReaderSettings({ subtitleControlsMode: 'bogus' as never }).subtitleControlsMode).toBe('auto');
    });

    it('passes valid subtitleControlsMode values through', () => {
        expect(normalizeReaderSettings({ subtitleControlsMode: 'hidden' }).subtitleControlsMode).toBe('hidden');
    });

    it('defaults and clamps native subtitle concealment strength', () => {
        expect(normalizeReaderSettings({}).subtitleNativeBlurStrength).toBe(12);
        expect(normalizeReaderSettings({ subtitleNativeBlurStrength: 2 }).subtitleNativeBlurStrength).toBe(4);
        expect(normalizeReaderSettings({ subtitleNativeBlurStrength: 99 }).subtitleNativeBlurStrength).toBe(20);
        expect(normalizeReaderSettings({ subtitleNativeBlurStrength: 17 }).subtitleNativeBlurStrength).toBe(17);
    });
});
