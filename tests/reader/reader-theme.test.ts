import { afterEach, describe, expect, it } from 'vitest';

import { applyReaderTheme } from '../../src/reader/reader-theme';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { ReaderSettings } from '../../src/reader/types';

describe('reader theme', () => {
    afterEach(() => {
        document.documentElement.className = '';
        document.documentElement.removeAttribute('style');
    });

    it('applies theme classes, color-source classes, and CSS variables from settings', () => {
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            accentColor: '#336699',
            theme: 'dark',
            wordHighlightColorSource: 'pitch',
            wordUnderlineColorSource: 'status',
            wordTextColorSource: 'off',
            subtitleHighlightColorSource: 'anki',
            subtitleUnderlineColorSource: 'jpdb',
            subtitleTextColorSource: 'off',
            wordColorNew: '#112233',
            pitchColorHeiban: '#445566',
        };

        const applied = applyReaderTheme(settings);
        const root = document.documentElement;

        expect(root.classList.contains('jpdb-reader-theme-dark')).toBe(true);
        expect(root.classList.contains('jpdb-reader-theme-light')).toBe(false);
        expect(root.classList.contains('jpdb-reader-word-highlight-pitch')).toBe(true);
        expect(root.classList.contains('jpdb-reader-word-underline-status')).toBe(true);
        expect(root.classList.contains('jpdb-reader-word-text-pitch')).toBe(false);
        expect(root.classList.contains('jpdb-reader-subtitle-highlight-anki')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-underline-jpdb')).toBe(true);
        expect(root.style.getPropertyValue('--jpdb-reader-accent')).toBe('#336699');
        expect(root.style.getPropertyValue('--jpdb-reader-state-new')).toBe('#112233');
        expect(root.style.getPropertyValue('--jpdb-reader-pitch-heiban')).toBe('#445566');
        expect(root.style.getPropertyValue('--jpdb-reader-pitch-unknown-soft')).toBe('transparent');
        expect(applied.wordColorSources.highlight).toBe('pitch');
        expect(applied.subtitleColorSources.highlight).toBe('anki');
    });
});
