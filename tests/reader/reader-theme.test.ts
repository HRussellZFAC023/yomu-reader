import { afterEach, describe, expect, it } from 'vitest';

import { applyReaderTheme } from '../../src/reader/reader-theme';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../../src/reader/settings';
import type { ReaderSettings } from '../../src/reader/types';

const SETTINGS_STORAGE_KEY = 'jpdb-popup-reader-settings';

describe('reader theme', () => {
    afterEach(() => {
        document.documentElement.className = '';
        document.documentElement.removeAttribute('style');
        localStorage.removeItem(SETTINGS_STORAGE_KEY);
    });

    it('applies concrete default color channels', () => {
        const applied = applyReaderTheme({ ...DEFAULT_SETTINGS, apiKey: 'test-api-key' });
        const root = document.documentElement;

        expect(root.classList.contains('jpdb-reader-word-highlight-pitch')).toBe(true);
        expect(root.classList.contains('jpdb-reader-word-underline-jpdb')).toBe(true);
        expect(root.classList.contains('jpdb-reader-word-text-off')).toBe(false);
        expect(root.classList.contains('jpdb-reader-subtitle-highlight-jpdb')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-underline-pitch')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-text-jpdb')).toBe(true);
        expect(applied.wordColorSources).toMatchObject({ highlight: 'pitch', underline: 'jpdb', text: 'off' });
        expect(applied.subtitleColorSources).toMatchObject({ highlight: 'jpdb', underline: 'pitch', text: 'jpdb' });
    });

    it('treats unavailable JPDB text color as off until an API key is available', () => {
        const withoutKey = applyReaderTheme({
            ...DEFAULT_SETTINGS,
            localDictionariesEnabled: true,
            wordTextColorSource: 'jpdb',
            subtitleTextColorSource: 'jpdb',
        });
        const root = document.documentElement;

        expect(root.classList.contains('jpdb-reader-word-text-jpdb')).toBe(false);
        expect(root.classList.contains('jpdb-reader-subtitle-text-jpdb')).toBe(false);
        expect(withoutKey.wordColorSources.text).toBe('off');
        expect(withoutKey.subtitleColorSources.text).toBe('off');

        const withKey = applyReaderTheme({
            ...DEFAULT_SETTINGS,
            apiKey: 'test-api-key',
            wordTextColorSource: 'jpdb',
            subtitleTextColorSource: 'jpdb',
        });

        expect(root.classList.contains('jpdb-reader-word-text-jpdb')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-text-jpdb')).toBe(true);
        expect(withKey.wordColorSources.text).toBe('jpdb');
        expect(withKey.subtitleColorSources.text).toBe('jpdb');
    });

    it('uses only available status backends for text color', () => {
        const none = applyReaderTheme({
            ...DEFAULT_SETTINGS,
            wordTextColorSource: 'status',
            subtitleTextColorSource: 'status',
        });

        expect(none.wordColorSources.text).toBe('off');
        expect(none.subtitleColorSources.text).toBe('off');

        const ankiOnly = applyReaderTheme({
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            wordTextColorSource: 'status',
            subtitleTextColorSource: 'status',
        });

        expect(ankiOnly.wordColorSources.text).toBe('anki');
        expect(ankiOnly.subtitleColorSources.text).toBe('anki');

        const jpdbOnly = applyReaderTheme({
            ...DEFAULT_SETTINGS,
            apiKey: 'test-api-key',
            wordTextColorSource: 'status',
            subtitleTextColorSource: 'status',
        });

        expect(jpdbOnly.wordColorSources.text).toBe('jpdb');
        expect(jpdbOnly.subtitleColorSources.text).toBe('jpdb');

        const both = applyReaderTheme({
            ...DEFAULT_SETTINGS,
            apiKey: 'test-api-key',
            ankiEnabled: true,
            wordTextColorSource: 'status',
            subtitleTextColorSource: 'status',
        });

        expect(both.wordColorSources.text).toBe('status');
        expect(both.subtitleColorSources.text).toBe('status');
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
        expect(root.style.getPropertyValue('--jpdb-reader-accent-readable')).toMatch(/^#[0-9a-f]{6}$/);
        expect(root.style.getPropertyValue('--jpdb-reader-accent-readable')).not.toBe('#76bd99');
        expect(root.style.getPropertyValue('--jpdb-reader-accent-readable')).not.toBe('#25573d');
        expect(root.style.getPropertyValue('--jpdb-reader-accent-text')).toBe('#ffffff');
        expect(root.style.getPropertyValue('--jpdb-reader-state-new')).toBe('#112233');
        expect(root.style.getPropertyValue('--jpdb-reader-pitch-heiban')).toBe('#445566');
        expect(root.style.getPropertyValue('--jpdb-reader-pitch-unknown-soft')).toBe('transparent');
        expect(applied.wordColorSources.highlight).toBe('pitch');
        expect(applied.subtitleColorSources.highlight).toBe('anki');
    });

    it('lets color channels drive theme classes instead of legacy word highlight mode', () => {
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-api-key',
            ankiEnabled: true,
            wordHighlightColorSource: 'jpdb',
            wordUnderlineColorSource: 'off',
            wordTextColorSource: 'status',
        };

        document.documentElement.classList.add('jpdb-reader-highlight-pitch');
        const applied = applyReaderTheme(settings);
        const root = document.documentElement;

        expect(root.classList.contains('jpdb-reader-highlight-pitch')).toBe(false);
        expect(root.classList.contains('jpdb-reader-word-highlight-pitch')).toBe(false);
        expect(root.classList.contains('jpdb-reader-word-highlight-jpdb')).toBe(true);
        expect(root.classList.contains('jpdb-reader-word-underline-pitch')).toBe(false);
        expect(root.classList.contains('jpdb-reader-word-text-status')).toBe(true);
        expect(applied.wordColorSources).toMatchObject({ highlight: 'jpdb', underline: 'off', text: 'status' });
    });

    it('migrates legacy automatic channel sources using wordHighlightMode only at load time', async () => {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            ...DEFAULT_SETTINGS,
            wordHighlightMode: 'status',
            wordHighlightColorSource: 'auto',
            wordUnderlineColorSource: 'anki',
            wordTextColorSource: 'auto',
            subtitleHighlightColorSource: 'auto',
            subtitleUnderlineColorSource: 'pitch',
            subtitleTextColorSource: 'auto',
        }));

        const settings = await loadSettings();

        expect(settings.wordHighlightColorSource).toBe('status');
        expect(settings.wordUnderlineColorSource).toBe('anki');
        expect(settings.wordTextColorSource).toBe('status');
        expect(settings.subtitleHighlightColorSource).toBe('jpdb');
        expect(settings.subtitleUnderlineColorSource).toBe('pitch');
        expect(settings.subtitleTextColorSource).toBe('jpdb');
        expect(Object.prototype.hasOwnProperty.call(settings, 'wordHighlightMode')).toBe(false);
    });

    it('migrates the historical automatic default channel tuple to current concrete defaults', async () => {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            ...DEFAULT_SETTINGS,
            wordHighlightMode: 'auto',
            wordHighlightColorSource: 'auto',
            wordUnderlineColorSource: 'auto',
            wordTextColorSource: 'off',
            subtitleHighlightColorSource: 'off',
            subtitleUnderlineColorSource: 'pitch',
            subtitleTextColorSource: 'auto',
        }));

        const settings = await loadSettings();

        expect(settings.wordHighlightColorSource).toBe('pitch');
        expect(settings.wordUnderlineColorSource).toBe('jpdb');
        expect(settings.wordTextColorSource).toBe('off');
        expect(settings.subtitleHighlightColorSource).toBe('jpdb');
        expect(settings.subtitleUnderlineColorSource).toBe('pitch');
        expect(settings.subtitleTextColorSource).toBe('jpdb');
        expect(Object.prototype.hasOwnProperty.call(settings, 'wordHighlightMode')).toBe(false);
    });

    it('strips legacy wordHighlightMode when saving settings', async () => {
        await saveSettings({
            ...DEFAULT_SETTINGS,
            wordHighlightMode: 'off',
            wordHighlightColorSource: 'pitch',
        } as ReaderSettings & { wordHighlightMode: 'off' });

        const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}');

        expect(stored.wordHighlightMode).toBeUndefined();
        expect(stored.wordHighlightColorSource).toBe('pitch');
    });
});
