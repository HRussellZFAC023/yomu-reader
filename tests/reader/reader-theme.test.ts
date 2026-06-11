import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { contrastRatio } from '../../src/reader/theme/color-utils';
import { applyReaderTheme } from '../../src/reader/theme/reader-theme';
import { refreshReaderWordContrastForWord } from '../../src/reader/dom/word-contrast';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../../src/reader/settings/index';
import type { ReaderSettings } from '../../src/reader/app/types';

const SETTINGS_STORAGE_KEY = 'jpdb-popup-reader-settings';
const JAPANESE_SURFACE_CSS = [
    'src/reader/styles/popover-core.css',
    'src/reader/styles/kanji.css',
    'src/reader/styles/immersion-study.css',
    'src/reader/styles/local-dictionaries.css',
    'src/reader/styles/new-tab.css',
].map(path => readFileSync(path, 'utf8')).join('\n');
const READER_WORD_CSS = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
type AppliedReaderTheme = ReturnType<typeof applyReaderTheme>;
type LoadedColorChannels = Pick<ReaderSettings,
    | 'wordHighlightColorSource'
    | 'wordUnderlineColorSource'
    | 'wordTextColorSource'
    | 'subtitleHighlightColorSource'
    | 'subtitleUnderlineColorSource'
    | 'subtitleTextColorSource'
>;

function hoveredReaderWord(spanHtml: string): { word: HTMLElement; stopHovering: () => Promise<void> } {
    vi.useFakeTimers();
    document.body.innerHTML = `
        <p style="background: rgb(255, 255, 255); color: rgb(20, 20, 20);">
            ${spanHtml}
        </p>
    `;
    const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
    const originalMatches = word.matches.bind(word);
    let hovered = true;
    word.matches = ((selector: string) => selector === ':hover, :focus' ? hovered : originalMatches(selector)) as typeof word.matches;
    return {
        word,
        stopHovering: async () => {
            hovered = false;
            await vi.advanceTimersByTimeAsync(140);
        },
    };
}

function readerWordAfterRefresh(html: string): HTMLElement {
    document.body.innerHTML = html;
    const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
    refreshReaderWordContrastForWord(word);
    return word;
}

async function expectSettledAccessibleColorAfterHover(word: HTMLElement, stopHovering: () => Promise<void>): Promise<void> {
    await stopHovering();

    const text = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
    expect(text).not.toBe('rgb(255, 255, 255)');
    expect(contrastRatio(text, '#ffffff')).toBeGreaterThanOrEqual(4.5);
}

function expectPitchUnderlineOnlyClasses(root = document.documentElement): void {
    expect(root.classList.contains('jpdb-reader-word-highlight-pitch')).toBe(false);
    expect(root.classList.contains('jpdb-reader-word-underline-pitch')).toBe(true);
    expect(root.classList.contains('jpdb-reader-subtitle-highlight-pitch')).toBe(false);
    expect(root.classList.contains('jpdb-reader-subtitle-underline-pitch')).toBe(true);
}

function expectPitchUnderlineOnlyApplied(applied: AppliedReaderTheme, options: { subtitle?: boolean } = {}): void {
    expectPitchUnderlineOnlyClasses();
    expect(applied.wordColorSources).toMatchObject({ highlight: 'jpdb', underline: 'pitch' });
    if (options.subtitle !== false) {
        expect(applied.subtitleColorSources).toMatchObject({ highlight: 'jpdb', underline: 'pitch' });
    }
}

function expectPitchUnderlineOnlySettings(settings: ReaderSettings, applied: AppliedReaderTheme, options: { subtitle?: boolean } = {}): void {
    expect(settings.wordHighlightColorSource).toBe('jpdb');
    expect(settings.wordUnderlineColorSource).toBe('pitch');
    expect(settings.subtitleHighlightColorSource).toBe('jpdb');
    expect(settings.subtitleUnderlineColorSource).toBe('pitch');
    expectPitchUnderlineOnlyApplied(applied, options);
}

function expectLoadedColorChannels(settings: ReaderSettings, expected: LoadedColorChannels, options: { stripsLegacyHighlightMode?: boolean } = {}): void {
    expect(settings).toMatchObject(expected);
    if (options.stripsLegacyHighlightMode) {
        expect(Object.prototype.hasOwnProperty.call(settings, 'wordHighlightMode')).toBe(false);
    }
}

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
        expect(root.classList.contains('jpdb-reader-word-text-off')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-highlight-jpdb')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-underline-pitch')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-text-off')).toBe(true);
        expect(applied.wordColorSources).toMatchObject({ highlight: 'jpdb', underline: 'pitch', text: 'off' });
        expect(applied.subtitleColorSources).toMatchObject({ highlight: 'jpdb', underline: 'pitch', text: 'off' });
    });

    it('adjusts page word colors and highlights against the actual website background', () => {
        document.body.innerHTML = `
            <p style="background: rgb(255, 255, 255); color: rgb(255, 255, 255);">
                <span class="jpdb-reader-word" style="background: rgb(255, 240, 200); color: rgb(255, 209, 102); text-decoration-color: rgb(255, 209, 102);">読む</span>
            </p>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        refreshReaderWordContrastForWord(word);

        const text = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        const highlight = word.style.getPropertyValue('--jpdb-reader-word-accessible-highlight');
        const underline = word.style.getPropertyValue('--jpdb-reader-word-accessible-underline');
        expect(highlight).not.toBe('');
        expect(highlight).not.toBe('#fff0c8');
        expect(word.style.getPropertyValue('--jpdb-reader-highlight-backdrop')).toBe('rgb(255, 255, 255)');
        expect(contrastRatio(highlight, '#ffffff')).toBeGreaterThanOrEqual(1.45);
        expect(contrastRatio(text, highlight)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(underline, highlight)).toBeGreaterThanOrEqual(3);
    });

    it('keeps generated furigana readable without changing native page text', () => {
        document.body.innerHTML = `
            <p style="background: rgb(255, 255, 255); color: rgb(32, 40, 52);">
                <span class="jpdb-reader-word">
                    <ruby>読<rt class="jpdb-reader-furi" style="color: rgb(170, 178, 192);">よ</rt></ruby>む
                </span>
            </p>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        refreshReaderWordContrastForWord(word);

        const furi = word.style.getPropertyValue('--jpdb-reader-furi-accessible-color');
        expect(furi).not.toBe('');
        expect(furi).not.toBe('#aab2c0');
        expect(word.style.getPropertyValue('--jpdb-reader-word-accessible-highlight')).toBe('');
        expect(contrastRatio(furi, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    });

    it('leaves ASBPlayer subtitle overlays to subtitle-aware color styling', () => {
        document.body.innerHTML = `
            <div class="asbplayer-subtitles-container-bottom">
                <span class="jpdb-reader-word jpdb-known" style="color: rgb(255, 209, 102);">読む</span>
            </div>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        word.style.setProperty('--jpdb-reader-highlight-backdrop', 'rgb(255, 255, 255)');

        refreshReaderWordContrastForWord(word);

        expect(word.style.getPropertyValue('--jpdb-reader-highlight-backdrop')).toBe('');
        expect(word.style.getPropertyValue('--jpdb-reader-word-accessible-color')).toBe('');
        expect(word.style.getPropertyValue('--jpdb-reader-word-contrast-shadow')).toBe('');
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
        const { word, stopHovering } = hoveredReaderWord('<span class="jpdb-reader-word anki-known" style="color: rgb(30, 120, 90); --jpdb-reader-word-accessible-color: rgb(255, 255, 255);">読む</span>');

        refreshReaderWordContrastForWord(word);

        expect(word.style.getPropertyValue('--jpdb-reader-word-accessible-color')).not.toBe('rgb(255, 255, 255)');

        await expectSettledAccessibleColorAfterHover(word, stopHovering);
    });

    it('does not replace an existing Anki status color while hovered', async () => {
        const { word, stopHovering } = hoveredReaderWord('<span class="jpdb-reader-word anki-known" data-anki-state="known" style="--jpdb-reader-word-accessible-color: rgb(30, 120, 90);">読む</span>');

        refreshReaderWordContrastForWord(word);

        expect(word.style.getPropertyValue('--jpdb-reader-word-accessible-color')).toBe('rgb(30, 120, 90)');

        await expectSettledAccessibleColorAfterHover(word, stopHovering);
    });

    it('repairs stale white Anki contrast when Anki status arrives during hover', async () => {
        const { word, stopHovering } = hoveredReaderWord('<span class="jpdb-reader-word anki-due" data-anki-state="due" style="color: rgb(255, 120, 170); --jpdb-reader-word-accessible-color: rgb(255, 255, 255);">読む</span>');

        refreshReaderWordContrastForWord(word);

        const hoveredText = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        expect(hoveredText).not.toBe('rgb(255, 255, 255)');
        expect(contrastRatio(hoveredText, '#ffffff')).toBeGreaterThanOrEqual(4.5);

        await stopHovering();

        const settledText = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        expect(settledText).not.toBe('rgb(255, 255, 255)');
        expect(contrastRatio(settledText, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    });

    it('keeps not-in-deck words on the website text color', () => {
        const word = readerWordAfterRefresh(`
            <p style="background: rgb(255, 255, 255); color: rgb(32, 40, 52);">
                <span class="jpdb-reader-word jpdb-not-in-deck anki-not-in-deck" data-anki-state="not-in-deck" style="--jpdb-reader-word-accessible-color: rgb(255, 255, 255); --jpdb-reader-word-accessible-underline: rgb(255, 255, 255);">読む</span>
            </p>
        `);

        expect(word.style.getPropertyValue('--jpdb-reader-word-accessible-color')).toBe('');
        expect(word.style.getPropertyValue('--jpdb-reader-word-accessible-underline')).toBe('');
        expect(getComputedStyle(word).color).toBe('rgb(32, 40, 52)');
    });

    it('leaves Yomu-owned reader surfaces on their theme colors', () => {
        const word = readerWordAfterRefresh(`
            <div data-jpdb-reader-root>
                <span class="jpdb-reader-word" style="color: rgb(255, 209, 102);">読む</span>
            </div>
        `);

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
        expect(root.classList.contains('jpdb-reader-word-text-off')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-highlight-jpdb')).toBe(false);
        expect(root.classList.contains('jpdb-reader-subtitle-highlight-off')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-underline-jpdb')).toBe(false);
        expect(root.classList.contains('jpdb-reader-subtitle-underline-off')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-text-jpdb')).toBe(false);
        expect(root.classList.contains('jpdb-reader-subtitle-text-off')).toBe(true);
        expect(withoutKey.wordColorSources.highlight).toBe('off');
        expect(withoutKey.wordColorSources.underline).toBe('pitch');
        expect(withoutKey.wordColorSources.text).toBe('off');
        expect(withoutKey.subtitleColorSources.highlight).toBe('off');
        expect(withoutKey.subtitleColorSources.underline).toBe('off');
        expect(withoutKey.subtitleColorSources.text).toBe('off');

        const withJitenKey = applyReaderTheme({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
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
        expect(withJitenKey.wordColorSources.highlight).toBe('jpdb');
        expect(withJitenKey.wordColorSources.underline).toBe('jpdb');
        expect(withJitenKey.wordColorSources.text).toBe('jpdb');
        expect(withJitenKey.subtitleColorSources.highlight).toBe('jpdb');
        expect(withJitenKey.subtitleColorSources.underline).toBe('jpdb');
        expect(withJitenKey.subtitleColorSources.text).toBe('jpdb');

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

    it('keeps explicit status channels off until Anki is enabled', () => {
        const none = applyReaderTheme({
            ...DEFAULT_SETTINGS,
            wordHighlightColorSource: 'status',
            wordUnderlineColorSource: 'status',
            wordTextColorSource: 'status',
            subtitleHighlightColorSource: 'status',
            subtitleUnderlineColorSource: 'status',
            subtitleTextColorSource: 'status',
        });

        expect(none.wordColorSources.highlight).toBe('off');
        expect(none.wordColorSources.underline).toBe('off');
        expect(none.wordColorSources.text).toBe('off');
        expect(none.subtitleColorSources.highlight).toBe('off');
        expect(none.subtitleColorSources.underline).toBe('off');
        expect(none.subtitleColorSources.text).toBe('off');

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

        expect(jpdbOnly.wordColorSources.highlight).toBe('jpdb');
        expect(jpdbOnly.wordColorSources.underline).toBe('jpdb');
        expect(jpdbOnly.wordColorSources.text).toBe('jpdb');
        expect(jpdbOnly.subtitleColorSources.highlight).toBe('jpdb');
        expect(jpdbOnly.subtitleColorSources.underline).toBe('jpdb');
        expect(jpdbOnly.subtitleColorSources.text).toBe('jpdb');

        const jitenOnly = applyReaderTheme({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            wordHighlightColorSource: 'status',
            wordUnderlineColorSource: 'status',
            wordTextColorSource: 'status',
            subtitleHighlightColorSource: 'status',
            subtitleUnderlineColorSource: 'status',
            subtitleTextColorSource: 'status',
        });

        expect(jitenOnly.wordColorSources.highlight).toBe('jpdb');
        expect(jitenOnly.wordColorSources.underline).toBe('jpdb');
        expect(jitenOnly.wordColorSources.text).toBe('jpdb');
        expect(jitenOnly.subtitleColorSources.highlight).toBe('jpdb');
        expect(jitenOnly.subtitleColorSources.underline).toBe('jpdb');
        expect(jitenOnly.subtitleColorSources.text).toBe('jpdb');

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

    it('wires reader word accessible colors without expanding adjacent word hitboxes', () => {
        const normalizedCss = READER_WORD_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss).toContain('background: var( --jpdb-reader-word-accessible-highlight, var(--jpdb-reader-word-highlight-source, transparent) ) !important;');
        expect(normalizedCss).toContain('color: var(--jpdb-reader-furi-accessible-color, var(--jpdb-reader-muted));');
        expect(normalizedCss).toContain('touch-action: manipulation;');
        expect(normalizedCss).toContain('.jpdb-reader-word::after { content: none; }');
        expect(normalizedCss).not.toContain('.jpdb-reader-word:not(.jpdb-reader-passive-word)::after');
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

        expectLoadedColorChannels(settings, {
            wordHighlightColorSource: 'jpdb',
            wordUnderlineColorSource: 'anki',
            wordTextColorSource: 'anki',
            subtitleHighlightColorSource: 'jpdb',
            subtitleUnderlineColorSource: 'pitch',
            subtitleTextColorSource: 'jpdb',
        }, { stripsLegacyHighlightMode: true });
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

        expectLoadedColorChannels(settings, {
            wordHighlightColorSource: 'status',
            wordUnderlineColorSource: 'status',
            wordTextColorSource: 'status',
            subtitleHighlightColorSource: 'status',
            subtitleUnderlineColorSource: 'status',
            subtitleTextColorSource: 'status',
        });
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

        expectLoadedColorChannels(settings, {
            wordHighlightColorSource: 'jpdb',
            wordUnderlineColorSource: 'pitch',
            wordTextColorSource: 'anki',
            subtitleHighlightColorSource: 'jpdb',
            subtitleUnderlineColorSource: 'pitch',
            subtitleTextColorSource: 'anki',
        }, { stripsLegacyHighlightMode: true });
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

        expectPitchUnderlineOnlySettings(settings, applied);
    });

    it('cleans up stale saved double-pitch channel tuples from earlier builds', async () => {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            apiKey: 'test-api-key',
            wordHighlightColorSource: 'pitch',
            wordUnderlineColorSource: 'pitch',
            subtitleHighlightColorSource: 'pitch',
            subtitleUnderlineColorSource: 'pitch',
        }));

        const settings = await loadSettings();
        const applied = applyReaderTheme(settings);

        expectPitchUnderlineOnlySettings(settings, applied);
    });

    it('cleans up partial stale word pitch highlight tuples without requiring subtitle settings to match', async () => {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            apiKey: 'test-api-key',
            wordHighlightColorSource: 'pitch',
            wordUnderlineColorSource: 'pitch',
            subtitleHighlightColorSource: 'jpdb',
            subtitleUnderlineColorSource: 'pitch',
        }));

        const settings = await loadSettings();
        const applied = applyReaderTheme(settings);

        expectPitchUnderlineOnlySettings(settings, applied, { subtitle: false });
    });

    it('does not apply double pitch channels from stale in-memory settings', () => {
        const applied = applyReaderTheme({
            ...DEFAULT_SETTINGS,
            apiKey: 'test-api-key',
            wordHighlightColorSource: 'pitch',
            wordUnderlineColorSource: 'pitch',
            subtitleHighlightColorSource: 'pitch',
            subtitleUnderlineColorSource: 'pitch',
        });

        expectPitchUnderlineOnlyApplied(applied);
    });

    it('falls stale pitch highlights back to off when no status source is available', () => {
        const applied = applyReaderTheme({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: false,
            ankiSectionEnabled: false,
            wordHighlightColorSource: 'pitch',
            wordUnderlineColorSource: 'pitch',
            subtitleHighlightColorSource: 'pitch',
            subtitleUnderlineColorSource: 'pitch',
        });
        const root = document.documentElement;

        expect(applied.wordColorSources).toMatchObject({ highlight: 'off', underline: 'pitch' });
        expect(applied.subtitleColorSources).toMatchObject({ highlight: 'off', underline: 'pitch' });
        expect(root.classList.contains('jpdb-reader-word-highlight-pitch')).toBe(false);
        expect(root.classList.contains('jpdb-reader-word-highlight-off')).toBe(true);
        expect(root.classList.contains('jpdb-reader-subtitle-highlight-pitch')).toBe(false);
        expect(root.classList.contains('jpdb-reader-subtitle-highlight-off')).toBe(true);
    });

    it('strips legacy wordHighlightMode and persists normalized color channels when saving settings', async () => {
        await saveSettings({
            ...DEFAULT_SETTINGS,
            wordHighlightMode: 'off',
            wordHighlightColorSource: 'pitch',
        } as ReaderSettings & { wordHighlightMode: 'off' });

        const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}');

        expect(stored.wordHighlightMode).toBeUndefined();
        expect(stored.wordHighlightColorSource).toBe('jpdb');
        expect(stored.wordUnderlineColorSource).toBe('pitch');
    });
});

describe('redundant word UI suppression', () => {
    it('toggles the root class from settings and pins the plain-text CSS', () => {
        const root = document.createElement('div');
        applyReaderTheme({ ...DEFAULT_SETTINGS, suppressRedundantWordUi: true }, root as unknown as HTMLElement);
        expect(root.classList.contains('jpdb-reader-suppress-redundant')).toBe(true);
        applyReaderTheme({ ...DEFAULT_SETTINGS, suppressRedundantWordUi: false }, root as unknown as HTMLElement);
        expect(root.classList.contains('jpdb-reader-suppress-redundant')).toBe(false);

        const normalized = READER_WORD_CSS.replace(/\s+/g, ' ');
        expect(normalized).toContain('html.jpdb-reader-suppress-redundant .jpdb-reader-word.jpdb-redundant');
        expect(normalized).toContain('text-decoration: none !important;');
    });
});
