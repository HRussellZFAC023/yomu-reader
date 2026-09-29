import { describe, expect, it } from 'vitest';

import { normalizeReaderSettings } from '../../src/reader/settings/index';

describe('unsupported settings and current validation', () => {
    it('does not infer furiganaMode from hideKnownFurigana', () => {
        expect(normalizeReaderSettings({ hideKnownFurigana: false }).furiganaMode).toBe('all');
    });

    it('does not infer furiganaMode from showFurigana', () => {
        expect(normalizeReaderSettings({ showFurigana: false }).furiganaMode).toBe('all');
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
