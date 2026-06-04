import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { contrastRatio } from '../../src/reader/color-utils';
import { applyReaderTheme } from '../../src/reader/reader-theme';
import { refreshReaderWordContrastForWord } from '../../src/reader/reader-word-contrast';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../../src/reader/settings';
import type { ReaderSettings } from '../../src/reader/types';

const SETTINGS_STORAGE_KEY = 'jpdb-popup-reader-settings';
const JAPANESE_SURFACE_CSS = [
    'src/reader/styles/popover-core.css',
    'src/reader/styles/kanji.css',
    'src/reader/styles/immersion-study.css',
    'src/reader/styles/local-dictionaries.css',
    'src/reader/styles/new-tab.css',
].map(path => readFileSync(path, 'utf8')).join('\n');

describe('reader theme', () => {
    afterEach(() => {
        vi.useRealTimers();
        document.documentElement.className = '';
        document.documentElement.removeAttribute('style');
        localStorage.removeItem(SETTINGS_STORAGE_KEY);
    });

    it('applies concrete default color channels', () => {
        const applied = applyReaderTheme({ ...DEFAULT_SETTINGS, apiKey: 'test-api-key' });
        const root = document.documentElement;

        expect(root.classList.contains('jpdb-reader-word-highlight-jpdb')).toBe(true);
        expect(root.classList.contains('jpdb-reader-word-underline-pitch')).toBe(true);
        expect(root.classList.contains('jpdb-reader-word-text-anki')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-highlight-jpdb')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-underline-pitch')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-text-anki')).toBe(true);
        expect(applied.wordColorSources).toMatchObject({ highlight: 'jpdb', underline: 'pitch', text: 'anki' });
        expect(applied.subtitleColorSources).toMatchObject({ highlight: 'jpdb', underline: 'pitch', text: 'anki' });
    });

    it('adjusts page word colors against the actual website background', () => {
        document.body.innerHTML = `
            <p style="background: rgb(255, 255, 255); color: rgb(255, 255, 255);">
                <span class="jpdb-reader-word" style="background: rgb(255, 240, 200); color: rgb(255, 209, 102); text-decoration-color: rgb(255, 209, 102);">読む</span>
            </p>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        refreshReaderWordContrastForWord(word);

        const text = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        const underline = word.style.getPropertyValue('--jpdb-reader-word-accessible-underline');
        expect(contrastRatio(text, '#fff0c8')).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(underline, '#fff0c8')).toBeGreaterThanOrEqual(3);
    });

    it('uses the default light canvas without inventing underlines', () => {
        document.body.innerHTML = `
            <p style="color: rgb(255, 255, 255);">
                <span class="jpdb-reader-word" style="color: rgb(255, 209, 102);">読む</span>
            </p>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        refreshReaderWordContrastForWord(word);

        const text = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        expect(word.style.getPropertyValue('--jpdb-reader-page-bg')).toBe('rgb(255, 255, 255)');
        expect(word.style.getPropertyValue('--jpdb-reader-word-accessible-underline')).toBe('');
        expect(contrastRatio(text, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    });

    it('keeps Anki-colored page words readable while hovered', async () => {
        vi.useFakeTimers();
        document.body.innerHTML = `
            <p style="background: rgb(255, 255, 255); color: rgb(20, 20, 20);">
                <span class="jpdb-reader-word anki-known" style="color: rgb(30, 120, 90); --jpdb-reader-word-accessible-color: rgb(255, 255, 255);">読む</span>
            </p>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const originalMatches = word.matches.bind(word);
        let hovered = true;
        word.matches = ((selector: string) => selector === ':hover, :focus' ? hovered : originalMatches(selector)) as typeof word.matches;

        refreshReaderWordContrastForWord(word);

        expect(word.style.getPropertyValue('--jpdb-reader-word-accessible-color')).not.toBe('rgb(255, 255, 255)');

        hovered = false;
        await vi.advanceTimersByTimeAsync(140);

        const text = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        expect(text).not.toBe('rgb(255, 255, 255)');
        expect(contrastRatio(text, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    });

    it('does not replace an existing Anki status color while hovered', async () => {
        vi.useFakeTimers();
        document.body.innerHTML = `
            <p style="background: rgb(255, 255, 255); color: rgb(20, 20, 20);">
                <span class="jpdb-reader-word anki-known" data-anki-state="known" style="--jpdb-reader-word-accessible-color: rgb(30, 120, 90);">読む</span>
            </p>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const originalMatches = word.matches.bind(word);
        let hovered = true;
        word.matches = ((selector: string) => selector === ':hover, :focus' ? hovered : originalMatches(selector)) as typeof word.matches;

        refreshReaderWordContrastForWord(word);

        expect(word.style.getPropertyValue('--jpdb-reader-word-accessible-color')).toBe('rgb(30, 120, 90)');

        hovered = false;
        await vi.advanceTimersByTimeAsync(140);

        const text = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        expect(text).not.toBe('rgb(255, 255, 255)');
        expect(contrastRatio(text, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    });

    it('repairs stale white Anki contrast when Anki status arrives during hover', async () => {
        vi.useFakeTimers();
        document.body.innerHTML = `
            <p style="background: rgb(255, 255, 255); color: rgb(20, 20, 20);">
                <span class="jpdb-reader-word anki-due" data-anki-state="due" style="color: rgb(255, 120, 170); --jpdb-reader-word-accessible-color: rgb(255, 255, 255);">読む</span>
            </p>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const originalMatches = word.matches.bind(word);
        let hovered = true;
        word.matches = ((selector: string) => selector === ':hover, :focus' ? hovered : originalMatches(selector)) as typeof word.matches;

        refreshReaderWordContrastForWord(word);

        const hoveredText = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        expect(hoveredText).not.toBe('rgb(255, 255, 255)');
        expect(contrastRatio(hoveredText, '#ffffff')).toBeGreaterThanOrEqual(4.5);

        hovered = false;
        await vi.advanceTimersByTimeAsync(140);

        const settledText = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        expect(settledText).not.toBe('rgb(255, 255, 255)');
        expect(contrastRatio(settledText, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    });

    it('keeps not-in-deck words on the website text color', () => {
        document.body.innerHTML = `
            <p style="background: rgb(255, 255, 255); color: rgb(32, 40, 52);">
                <span class="jpdb-reader-word jpdb-not-in-deck anki-not-in-deck" data-anki-state="not-in-deck" style="--jpdb-reader-word-accessible-color: rgb(255, 255, 255); --jpdb-reader-word-accessible-underline: rgb(255, 255, 255);">読む</span>
            </p>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        refreshReaderWordContrastForWord(word);

        expect(word.style.getPropertyValue('--jpdb-reader-word-accessible-color')).toBe('');
        expect(word.style.getPropertyValue('--jpdb-reader-word-accessible-underline')).toBe('');
        expect(getComputedStyle(word).color).toBe('rgb(32, 40, 52)');
    });

    it('leaves Yomu-owned reader surfaces on their theme colors', () => {
        document.body.innerHTML = `
            <div data-jpdb-reader-root>
                <span class="jpdb-reader-word" style="color: rgb(255, 209, 102);">読む</span>
            </div>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        refreshReaderWordContrastForWord(word);

        expect(word.style.getPropertyValue('--jpdb-reader-word-accessible-color')).toBe('');
        expect(word.style.getPropertyValue('--jpdb-reader-highlight-backdrop')).toBe('');
    });

    it('falls back from unavailable JPDB color channels until an API key is available', () => {
        const withoutKey = applyReaderTheme({
            ...DEFAULT_SETTINGS,
            localDictionariesEnabled: true,
            wordHighlightColorSource: 'jpdb',
            wordUnderlineColorSource: 'jpdb',
            wordTextColorSource: 'jpdb',
            subtitleHighlightColorSource: 'jpdb',
            subtitleUnderlineColorSource: 'jpdb',
            subtitleTextColorSource: 'jpdb',
        });
        const root = document.documentElement;

        expect(root.classList.contains('jpdb-reader-word-highlight-jpdb')).toBe(false);
        expect(root.classList.contains('jpdb-reader-word-highlight-off')).toBe(true);
        expect(root.classList.contains('jpdb-reader-word-underline-jpdb')).toBe(false);
        expect(root.classList.contains('jpdb-reader-word-underline-pitch')).toBe(true);
        expect(root.classList.contains('jpdb-reader-word-text-jpdb')).toBe(false);
        expect(root.classList.contains('jpdb-reader-word-text-anki')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-highlight-jpdb')).toBe(false);
        expect(root.classList.contains('jpdb-reader-subtitle-highlight-off')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-underline-jpdb')).toBe(false);
        expect(root.classList.contains('jpdb-reader-subtitle-underline-off')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-text-jpdb')).toBe(false);
        expect(root.classList.contains('jpdb-reader-subtitle-text-off')).toBe(true);
        expect(withoutKey.wordColorSources.highlight).toBe('off');
        expect(withoutKey.wordColorSources.underline).toBe('pitch');
        expect(withoutKey.wordColorSources.text).toBe('anki');
        expect(withoutKey.subtitleColorSources.highlight).toBe('off');
        expect(withoutKey.subtitleColorSources.underline).toBe('off');
        expect(withoutKey.subtitleColorSources.text).toBe('off');

        const withKey = applyReaderTheme({
            ...DEFAULT_SETTINGS,
            apiKey: 'test-api-key',
            wordHighlightColorSource: 'jpdb',
            wordUnderlineColorSource: 'jpdb',
            wordTextColorSource: 'jpdb',
            subtitleHighlightColorSource: 'jpdb',
            subtitleUnderlineColorSource: 'jpdb',
            subtitleTextColorSource: 'jpdb',
        });

        expect(root.classList.contains('jpdb-reader-word-highlight-jpdb')).toBe(true);
        expect(root.classList.contains('jpdb-reader-word-underline-jpdb')).toBe(true);
        expect(root.classList.contains('jpdb-reader-word-text-jpdb')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-highlight-jpdb')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-underline-jpdb')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-text-jpdb')).toBe(true);
        expect(withKey.wordColorSources.highlight).toBe('jpdb');
        expect(withKey.wordColorSources.underline).toBe('jpdb');
        expect(withKey.wordColorSources.text).toBe('jpdb');
        expect(withKey.subtitleColorSources.highlight).toBe('jpdb');
        expect(withKey.subtitleColorSources.underline).toBe('jpdb');
        expect(withKey.subtitleColorSources.text).toBe('jpdb');
    });

    it('lets explicit status channels use Anki lookup without enabling Anki mining', () => {
        const none = applyReaderTheme({
            ...DEFAULT_SETTINGS,
            wordHighlightColorSource: 'status',
            wordUnderlineColorSource: 'status',
            wordTextColorSource: 'status',
            subtitleHighlightColorSource: 'status',
            subtitleUnderlineColorSource: 'status',
            subtitleTextColorSource: 'status',
        });

        expect(none.wordColorSources.highlight).toBe('anki');
        expect(none.wordColorSources.underline).toBe('anki');
        expect(none.wordColorSources.text).toBe('anki');
        expect(none.subtitleColorSources.highlight).toBe('anki');
        expect(none.subtitleColorSources.underline).toBe('anki');
        expect(none.subtitleColorSources.text).toBe('anki');

        const ankiOnly = applyReaderTheme({
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            wordHighlightColorSource: 'status',
            wordUnderlineColorSource: 'status',
            wordTextColorSource: 'status',
            subtitleHighlightColorSource: 'status',
            subtitleUnderlineColorSource: 'status',
            subtitleTextColorSource: 'status',
        });

        expect(ankiOnly.wordColorSources.highlight).toBe('anki');
        expect(ankiOnly.wordColorSources.underline).toBe('anki');
        expect(ankiOnly.wordColorSources.text).toBe('anki');
        expect(ankiOnly.subtitleColorSources.highlight).toBe('anki');
        expect(ankiOnly.subtitleColorSources.underline).toBe('anki');
        expect(ankiOnly.subtitleColorSources.text).toBe('anki');

        const jpdbOnly = applyReaderTheme({
            ...DEFAULT_SETTINGS,
            apiKey: 'test-api-key',
            wordHighlightColorSource: 'status',
            wordUnderlineColorSource: 'status',
            wordTextColorSource: 'status',
            subtitleHighlightColorSource: 'status',
            subtitleUnderlineColorSource: 'status',
            subtitleTextColorSource: 'status',
        });

        expect(jpdbOnly.wordColorSources.highlight).toBe('status');
        expect(jpdbOnly.wordColorSources.underline).toBe('status');
        expect(jpdbOnly.wordColorSources.text).toBe('status');
        expect(jpdbOnly.subtitleColorSources.highlight).toBe('status');
        expect(jpdbOnly.subtitleColorSources.underline).toBe('status');
        expect(jpdbOnly.subtitleColorSources.text).toBe('status');

        const both = applyReaderTheme({
            ...DEFAULT_SETTINGS,
            apiKey: 'test-api-key',
            ankiEnabled: true,
            wordHighlightColorSource: 'status',
            wordUnderlineColorSource: 'status',
            wordTextColorSource: 'status',
            subtitleHighlightColorSource: 'status',
            subtitleUnderlineColorSource: 'status',
            subtitleTextColorSource: 'status',
        });

        expect(both.wordColorSources.highlight).toBe('status');
        expect(both.wordColorSources.underline).toBe('status');
        expect(both.wordColorSources.text).toBe('status');
        expect(both.subtitleColorSources.highlight).toBe('status');
        expect(both.subtitleColorSources.underline).toBe('status');
        expect(both.subtitleColorSources.text).toBe('status');
    });

    it('applies theme classes, color-source classes, and CSS variables from settings', () => {
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-api-key',
            ankiEnabled: true,
            accentColor: '#336699',
            theme: 'dark',
            wordHighlightColorSource: 'pitch',
            wordUnderlineColorSource: 'status',
            wordTextColorSource: 'off',
            subtitleHighlightColorSource: 'anki',
            subtitleUnderlineColorSource: 'jpdb',
            subtitleTextColorSource: 'off',
            readerFontFamily: '"Inter", system-ui, sans-serif',
            popupFontFamily: '"Noto Sans JP", sans-serif',
            popupFontWeight: 420,
            wordColorNew: '#112233',
            pitchColorHeiban: '#445566',
            ocrTextColor: '#fafafa',
            ocrOutlineColor: '#010203',
            ocrBackgroundColor: '#112233',
            ocrBackgroundOpacity: 0.4,
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
        expect(root.style.getPropertyValue('--jpdb-ocr-text-color')).toBe('#fafafa');
        expect(root.style.getPropertyValue('--jpdb-ocr-outline-color')).toBe('#010203');
        expect(root.style.getPropertyValue('--jpdb-ocr-background-rgba')).toBe('rgba(17,34,51,0.4)');
        expect(root.style.getPropertyValue('--jpdb-ocr-background-active-rgba')).toBe('rgba(17,34,51,0.52)');
        expect(root.style.getPropertyValue('--jpdb-reader-font')).toBe('"Inter", system-ui, sans-serif');
        expect(root.style.getPropertyValue('--jpdb-reader-popup-font')).toBe('"Noto Sans JP", sans-serif');
        expect(root.style.getPropertyValue('--jpdb-reader-popup-font-weight')).toBe('420');
        expect(applied.wordColorSources.highlight).toBe('pitch');
        expect(applied.subtitleColorSources.highlight).toBe('anki');
    });

    it('keeps state and pitch text colors readable on light surfaces', () => {
        applyReaderTheme({ ...DEFAULT_SETTINGS, theme: 'light' });
        const root = document.documentElement;
        const lightSurfaces = ['#fbfcfe', '#f4f7fa', '#e8edf3'];
        const readableVars = [
            '--jpdb-reader-state-new-readable',
            '--jpdb-reader-state-learning-readable',
            '--jpdb-reader-state-known-readable',
            '--jpdb-reader-state-due-readable',
            '--jpdb-reader-state-failed-readable',
            '--jpdb-reader-state-ignored-readable',
            '--jpdb-reader-pitch-heiban-readable',
            '--jpdb-reader-pitch-atamadaka-readable',
            '--jpdb-reader-pitch-nakadaka-readable',
            '--jpdb-reader-pitch-odaka-readable',
            '--jpdb-reader-pitch-kifuku-readable',
            '--jpdb-reader-pitch-unknown-readable',
        ];

        readableVars.forEach(variable => {
            const color = root.style.getPropertyValue(variable);
            expect(color, variable).toMatch(/^#[0-9a-f]{6}$/);
            lightSurfaces.forEach(surface => {
                expect(contrastRatio(color, surface), `${variable} on ${surface}`).toBeGreaterThanOrEqual(4.5);
            });
        });
    });

    it('defaults popup Japanese text to the jpdb.io font stack', () => {
        applyReaderTheme(DEFAULT_SETTINGS);
        const root = document.documentElement;

        expect(DEFAULT_SETTINGS.popupFontFamily).toContain('Nunito Sans');
        expect(DEFAULT_SETTINGS.popupFontFamily).toContain('Extra Sans JP');
        expect(DEFAULT_SETTINGS.popupFontFamily).toContain('Noto Sans JP');
        expect(DEFAULT_SETTINGS.popupFontFamily).toContain('Noto Sans CJK JP');
        expect(root.style.getPropertyValue('--jpdb-reader-font')).toBe(DEFAULT_SETTINGS.readerFontFamily);
        expect(DEFAULT_SETTINGS.popupFontWeight).toBe(400);
        expect(root.style.getPropertyValue('--jpdb-reader-popup-font')).toBe(DEFAULT_SETTINGS.popupFontFamily);
        expect(root.style.getPropertyValue('--jpdb-reader-popup-font-weight')).toBe('400');
    });

    it('routes popup Japanese render surfaces through the popup font variables', () => {
        [
            '.jpdb-reader-spelling',
            '.jpdb-reader-reading',
            '.jpdb-reader-kanji-display',
            '.jpdb-reader-kanji-inline',
            '.jpdb-reader-jpdb-compound-term',
            '.jpdb-reader-example-sentence',
            '.jpdb-reader-local-expression',
            '.jpdb-reader-newtab-immersion .jpdb-reader-example-sentence',
        ].forEach(selector => expect(JAPANESE_SURFACE_CSS).toContain(selector));

        expect(JAPANESE_SURFACE_CSS.match(/font-family: var\(--jpdb-reader-popup-font/g)?.length).toBeGreaterThanOrEqual(10);
        expect(JAPANESE_SURFACE_CSS.match(/font-weight: var\(--jpdb-reader-popup-font-weight/g)?.length).toBeGreaterThanOrEqual(8);
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

        expect(settings.wordHighlightColorSource).toBe('jpdb');
        expect(settings.wordUnderlineColorSource).toBe('anki');
        expect(settings.wordTextColorSource).toBe('anki');
        expect(settings.subtitleHighlightColorSource).toBe('jpdb');
        expect(settings.subtitleUnderlineColorSource).toBe('pitch');
        expect(settings.subtitleTextColorSource).toBe('jpdb');
        expect(Object.prototype.hasOwnProperty.call(settings, 'wordHighlightMode')).toBe(false);
    });

    it('preserves explicit combined status color channels at load time', async () => {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            ...DEFAULT_SETTINGS,
            wordHighlightColorSource: 'status',
            wordUnderlineColorSource: 'status',
            wordTextColorSource: 'status',
            subtitleHighlightColorSource: 'status',
            subtitleUnderlineColorSource: 'status',
            subtitleTextColorSource: 'status',
        }));

        const settings = await loadSettings();

        expect(settings.wordHighlightColorSource).toBe('status');
        expect(settings.wordUnderlineColorSource).toBe('status');
        expect(settings.wordTextColorSource).toBe('status');
        expect(settings.subtitleHighlightColorSource).toBe('status');
        expect(settings.subtitleUnderlineColorSource).toBe('status');
        expect(settings.subtitleTextColorSource).toBe('status');
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

        expect(settings.wordHighlightColorSource).toBe('jpdb');
        expect(settings.wordUnderlineColorSource).toBe('pitch');
        expect(settings.wordTextColorSource).toBe('anki');
        expect(settings.subtitleHighlightColorSource).toBe('jpdb');
        expect(settings.subtitleUnderlineColorSource).toBe('pitch');
        expect(settings.subtitleTextColorSource).toBe('anki');
        expect(Object.prototype.hasOwnProperty.call(settings, 'wordHighlightMode')).toBe(false);
    });

    it('migrates legacy pitch highlight mode to pitch underline without double pitch highlighting', async () => {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            ...DEFAULT_SETTINGS,
            apiKey: 'test-api-key',
            wordHighlightMode: 'pitch',
            wordHighlightColorSource: 'auto',
            wordUnderlineColorSource: 'auto',
            subtitleHighlightColorSource: 'auto',
            subtitleUnderlineColorSource: 'pitch',
        }));

        const settings = await loadSettings();
        const applied = applyReaderTheme(settings);
        const root = document.documentElement;

        expect(settings.wordHighlightColorSource).toBe('jpdb');
        expect(settings.wordUnderlineColorSource).toBe('pitch');
        expect(settings.subtitleHighlightColorSource).toBe('jpdb');
        expect(settings.subtitleUnderlineColorSource).toBe('pitch');
        expect(root.classList.contains('jpdb-reader-word-highlight-pitch')).toBe(false);
        expect(root.classList.contains('jpdb-reader-word-underline-pitch')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-highlight-pitch')).toBe(false);
        expect(root.classList.contains('jpdb-reader-subtitle-underline-pitch')).toBe(true);
        expect(applied.wordColorSources).toMatchObject({ highlight: 'jpdb', underline: 'pitch' });
        expect(applied.subtitleColorSources).toMatchObject({ highlight: 'jpdb', underline: 'pitch' });
    });

    it('cleans up stale saved double-pitch channel tuples from earlier builds', async () => {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            ...DEFAULT_SETTINGS,
            apiKey: 'test-api-key',
            wordHighlightColorSource: 'pitch',
            wordUnderlineColorSource: 'pitch',
            subtitleHighlightColorSource: 'pitch',
            subtitleUnderlineColorSource: 'pitch',
        }));

        const settings = await loadSettings();
        const applied = applyReaderTheme(settings);
        const root = document.documentElement;

        expect(settings.wordHighlightColorSource).toBe('jpdb');
        expect(settings.wordUnderlineColorSource).toBe('pitch');
        expect(settings.subtitleHighlightColorSource).toBe('jpdb');
        expect(settings.subtitleUnderlineColorSource).toBe('pitch');
        expect(root.classList.contains('jpdb-reader-word-highlight-pitch')).toBe(false);
        expect(root.classList.contains('jpdb-reader-word-underline-pitch')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-highlight-pitch')).toBe(false);
        expect(root.classList.contains('jpdb-reader-subtitle-underline-pitch')).toBe(true);
        expect(applied.wordColorSources).toMatchObject({ highlight: 'jpdb', underline: 'pitch' });
        expect(applied.subtitleColorSources).toMatchObject({ highlight: 'jpdb', underline: 'pitch' });
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
