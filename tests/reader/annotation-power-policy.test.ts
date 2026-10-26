import { describe, expect, it } from 'vitest';
import { annotationPowerState, toggleFuriganaSettings } from '../../src/reader/app/annotation-power-policy';
import { DEFAULT_SETTINGS, effectiveFuriganaMode, normalizeReaderSettings } from '../../src/reader/settings';

describe('independent power and readings', () => {
    it.each(['all', 'known-status', 'difficult-kanji', 'hover'] as const)('restores %s without changing power', mode => {
        for (const annotationsPaused of [false, true]) {
            const settings = { ...DEFAULT_SETTINGS, annotationsPaused, furiganaMode: mode };
            const hidden = { ...settings, ...toggleFuriganaSettings(settings) };
            expect(effectiveFuriganaMode(hidden)).toBe('off');
            expect(hidden.annotationsPaused).toBe(annotationsPaused);
            const restored = { ...hidden, ...toggleFuriganaSettings(hidden) };
            expect(effectiveFuriganaMode(restored)).toBe(mode);
            expect(restored.annotationsPaused).toBe(annotationsPaused);
        }
    });

    it('loads the saved old middle state as Yomu on with Furigana Off', () => {
        const saved = JSON.parse(JSON.stringify({ ...DEFAULT_SETTINGS, annotationsPaused: false, furiganaMode: 'off', puckFuriganaModeBeforeHide: 'hover' }));
        const migrated = normalizeReaderSettings(saved);
        expect(annotationPowerState(migrated)).toBe('on');
        expect(effectiveFuriganaMode(migrated)).toBe('off');
        expect(toggleFuriganaSettings(migrated).furiganaMode).toBe('hover');
        expect(effectiveFuriganaMode({ ...migrated, annotationsPaused: true })).toBe('off');
    });

    it('restores legacy hidden readings without a pre-hide marker', () => {
        expect(toggleFuriganaSettings({ ...DEFAULT_SETTINGS, showFurigana: false, furiganaMode: 'hover' }).furiganaMode).toBe('hover');
        expect(toggleFuriganaSettings({ ...DEFAULT_SETTINGS, showFurigana: false, furiganaMode: 'off' }).furiganaMode).toBe('known-status');
    });
});
