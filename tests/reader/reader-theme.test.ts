import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';

import { SETTINGS_CHANGE_EVENT } from '../../src/reader/app/constants';
import { publishSettingsChange } from '../../src/reader/settings/settings-change-bus';
import { ReaderApp } from '../../src/reader/app/main';
import { blendRgba, contrastRatio, cssColorToRgba, rgbaToHex } from '../../src/reader/theme/color-utils';
import { resetCssColorProbeForTests } from '../../src/reader/theme/color-rgba';
import { applyReaderTheme, resetReaderRootClassGuardForTests } from '../../src/reader/theme/reader-theme';
import { refreshContrastForChangedWords, refreshReaderWordContrast, refreshReaderWordContrastForWord } from '../../src/reader/dom/word-contrast';
import { accentToRgba, accessibleOcrBackgroundColor, accessibleOcrBackgroundOpacity, DEFAULT_SETTINGS, loadSettings, normalizeReaderSettings, saveSettings, SETTINGS_STORAGE_KEYS } from '../../src/reader/settings/index';
import type { ReaderSettings } from '../../src/reader/app/types';

const SETTINGS_STORAGE_KEY = SETTINGS_STORAGE_KEYS[0];
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

function compositeOverWhiteHex(color: string): string {
    const foreground = cssColorToRgba(color);
    const white = cssColorToRgba('#ffffff');
    if (!foreground || !white) throw new Error(`Unable to parse color ${color}`);
    return rgbaToHex(blendRgba(foreground, white));
}

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

function installSharedSettingsStore(entries: ReadonlyArray<readonly [string, unknown]>): Map<string, unknown> {
    const store = new Map<string, unknown>(entries);
    vi.stubGlobal('GM_getValue', vi.fn(async (key: string, fallback: unknown) =>
        structuredClone(store.has(key) ? store.get(key) : fallback)));
    vi.stubGlobal('GM_setValue', vi.fn(async (key: string, value: unknown) => {
        store.set(key, structuredClone(value));
    }));
    return store;
}

function expectLoadedAndStoredSettings(
    settings: ReaderSettings,
    stored: Record<string, unknown>,
    expected: Partial<ReaderSettings>,
): void {
    expect(settings).toMatchObject(expected);
    expect(stored).toMatchObject(expected);
}

describe('reader theme', () => {
    afterEach(() => {
        vi.useRealTimers();
        // Stop the root-class guard before clearing className so it does not
        // re-assert the prior test's reader classes onto the next test.
        resetReaderRootClassGuardForTests();
        document.documentElement.className = '';
        document.documentElement.removeAttribute('style');
        for (const key of SETTINGS_STORAGE_KEYS) localStorage.removeItem(key);
        vi.unstubAllGlobals();
    });

    it('does not throw when the userscript starts before document.documentElement exists', () => {
        const rootSpy = vi.spyOn(document, 'documentElement', 'get').mockReturnValue(null as unknown as HTMLElement);
        try {
            const applied = applyReaderTheme({ ...DEFAULT_SETTINGS, apiKey: 'test-api-key' });

            expect(applied.wordColorSources).toMatchObject({ highlight: 'jpdb', underline: 'pitch', text: 'off' });
            expect(applied.subtitleColorSources).toMatchObject({ highlight: 'jpdb', underline: 'pitch', text: 'off' });
        } finally {
            rootSpy.mockRestore();
        }
    });

    it('re-asserts reader root classes after a host SPA rewrites <html class>', async () => {
        const root = document.documentElement;
        applyReaderTheme({
            ...DEFAULT_SETTINGS,
            apiKey: 'test-api-key',
            theme: 'dark',
            wordHighlightColorSource: 'jpdb',
            wordUnderlineColorSource: 'pitch',
            wordTextColorSource: 'anki',
        }, root);
        expect(root.classList.contains('jpdb-reader-word-underline-pitch')).toBe(true);

        // Discord/ChatGPT and similar SPA shells overwrite the whole className
        // during hydration, stripping every reader class. Inline style survives.
        root.className = 'platform-web theme-dark visual-refresh';
        expect(root.classList.contains('jpdb-reader-word-underline-pitch')).toBe(false);

        // The guard restores the reader classes (MutationObserver microtask).
        await vi.waitFor(() => {
            expect(root.classList.contains('jpdb-reader-word-underline-pitch')).toBe(true);
            expect(root.classList.contains('jpdb-reader-word-highlight-jpdb')).toBe(true);
            expect(root.classList.contains('jpdb-reader-theme-dark')).toBe(true);
        });
        // Host classes are preserved — the guard only adds, never strips.
        expect(root.classList.contains('theme-dark')).toBe(true);
        expect(root.classList.contains('visual-refresh')).toBe(true);
    });

    it('does not resurrect a reader class that was intentionally toggled off', async () => {
        const root = document.documentElement;
        applyReaderTheme({ ...DEFAULT_SETTINGS, apiKey: 'test-api-key', wordColorStates: 'new-only' }, root);
        expect(root.classList.contains('yomu-word-color-new-only')).toBe(true);
        // Re-apply with the option off: the snapshot must drop the stale class.
        applyReaderTheme({ ...DEFAULT_SETTINGS, apiKey: 'test-api-key', wordColorStates: 'all' }, root);
        expect(root.classList.contains('yomu-word-color-new-only')).toBe(false);
        root.className = 'host-shell';
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(root.classList.contains('jpdb-reader-word-underline-pitch')).toBe(true);
        expect(root.classList.contains('yomu-word-color-new-only')).toBe(false);
    });

    it('toggles per-state colour-hide classes from wordColorHiddenStateGroups', () => {
        const root = document.documentElement;
        // Woozlez: keep known words uncoloured while every other state stays coloured.
        applyReaderTheme({ ...DEFAULT_SETTINGS, apiKey: 'test-api-key', wordColorHiddenStateGroups: ['known', 'due'] }, root);
        expect(root.classList.contains('yomu-word-color-hide-known')).toBe(true);
        expect(root.classList.contains('yomu-word-color-hide-due')).toBe(true);
        expect(root.classList.contains('yomu-word-color-hide-new')).toBe(false);
        expect(root.classList.contains('yomu-word-color-hide-learning')).toBe(false);
        expect(root.classList.contains('yomu-word-color-hide-failed')).toBe(false);
        // Default (empty) colours every state — no hide classes, and toggling a group
        // off drops its stale class.
        applyReaderTheme({ ...DEFAULT_SETTINGS, apiKey: 'test-api-key' }, root);
        for (const group of ['new', 'learning', 'known', 'due', 'failed'] as const) {
            expect(root.classList.contains(`yomu-word-color-hide-${group}`)).toBe(false);
        }
    });

    // GitHub #37 (mirrormc): the colour opt-out borrowed the FURIGANA taxonomy, a
    // five-member union with no ignored member, so the ignored/suspended/
    // blacklisted/locked family had a colour and a colour picker but no switch. A
    // learner with the common particles and Kaishi 1.5k blacklisted in Jiten had
    // almost every word on the page coloured with no way to stop it.
    it('keeps a stored ignored opt-out through a settings reload', () => {
        // The normalizer validated against the five furigana groups, so even if the
        // checkbox had existed, 'ignored' would have been filtered out of storage on
        // every load and the switch would never have stuck.
        expect(normalizeReaderSettings({
            ...DEFAULT_SETTINGS,
            wordColorHiddenStateGroups: ['ignored', 'known'],
        }).wordColorHiddenStateGroups).toEqual(['ignored', 'known']);
        // Junk is still rejected.
        expect(normalizeReaderSettings({
            ...DEFAULT_SETTINGS,
            wordColorHiddenStateGroups: ['ignored', 'not-a-state'],
        } as never).wordColorHiddenStateGroups).toEqual(['ignored']);
    });

    it('hides the ignored, suspended and blacklisted colour as one group', () => {
        const root = document.documentElement;
        applyReaderTheme({ ...DEFAULT_SETTINGS, apiKey: 'test-api-key', wordColorHiddenStateGroups: ['ignored'] }, root);
        expect(root.classList.contains('yomu-word-color-hide-ignored')).toBe(true);
        // One switch, not three: these states already share one colour and one picker.
        expect(root.classList.contains('yomu-word-color-hide-known')).toBe(false);

        applyReaderTheme({ ...DEFAULT_SETTINGS, apiKey: 'test-api-key' }, root);
        expect(root.classList.contains('yomu-word-color-hide-ignored')).toBe(false);
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

    it('parses modern OKLab computed colors from dark app shells', () => {
        const discordBody = cssColorToRgba('oklab(0.183087 0.00112148 -0.00387992)');
        const discordText = cssColorToRgba('oklab(0.952693 0.000792831 -0.00253612)');

        expect(discordBody && rgbaToHex(discordBody)).toBe('#121214');
        expect(discordText && rgbaToHex(discordText)).toBe('#efeff1');
    });

    it('normalises color formats it does not model analytically through the canvas probe', () => {
        resetCssColorProbeForTests();
        const canvas = document.createElement('canvas');
        const serializedByInput: Record<string, string> = {
            'hwb(210 7% 89%)': '#12161c',
            'lab(95% 0 0)': 'color(srgb 0.937 0.937 0.937)',
            'hsl(220 13% 9% / 0.5)': 'rgba(20, 23, 26, 0.5)',
        };
        let fillStyle = '#000000';
        const fakeContext = {
            canvas,
            set fillStyle(value: string) {
                if (value === '#010203') { fillStyle = '#010203'; return; }
                const serialized = serializedByInput[value];
                if (serialized) fillStyle = serialized;
                // Unknown colors leave fillStyle untouched, like the platform.
            },
            get fillStyle() { return fillStyle; },
        } as unknown as CanvasRenderingContext2D;
        const realCreateElement = document.createElement.bind(document);
        const createElement = vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) => {
            if (tag === 'canvas') return { getContext: () => fakeContext } as unknown as HTMLCanvasElement;
            return realCreateElement(tag, options);
        }) as typeof document.createElement);

        try {
            const hwb = cssColorToRgba('hwb(210 7% 89%)');
            expect(hwb && rgbaToHex(hwb)).toBe('#12161c');
            const lab = cssColorToRgba('lab(95% 0 0)');
            expect(lab && rgbaToHex(lab)).toBe('#efefef');
            const hsla = cssColorToRgba('hsl(220 13% 9% / 0.5)');
            expect(hsla).toMatchObject({ red: 20, green: 23, blue: 26, alpha: 0.5 });
            expect(cssColorToRgba('definitely-not-a-color(1 2 3)')).toBeNull();
        } finally {
            createElement.mockRestore();
            resetCssColorProbeForTests();
        }
    });

    it('falls back to the dark page surface instead of white when a painted backdrop cannot be parsed', () => {
        document.body.innerHTML = `
            <section id="opaque-shell">
                <div id="translucent-overlay" role="button" data-jpdb-reader-passive-chrome="true">
                    <span
                        class="jpdb-reader-word jpdb-mastered jpdb-reader-scan-word jpdb-reader-passive-word jpdb-pitch-atamadaka"
                        style="color: rgb(0, 0, 0); text-decoration-color: rgb(53, 158, 255);"
                    >日本語</span>
                </div>
            </section>
        `;
        const shell = document.getElementById('opaque-shell')!;
        const overlay = document.getElementById('translucent-overlay')!;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const realGetComputedStyle = window.getComputedStyle.bind(window);
        const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElt) => {
            const style = realGetComputedStyle(element, pseudoElt);
            const isShell = element === shell;
            const isOverlay = element === overlay;
            const isPage = element === document.body || element === document.documentElement;
            if (!isShell && !isOverlay && !isPage) return style;
            return new Proxy(style, {
                get(target, property, receiver) {
                    if (property === 'backgroundColor') {
                        // The dark base uses a format the analytic parsers do
                        // not know (and jsdom has no canvas probe); a light
                        // translucent elevation overlay parses fine. The old
                        // white seed turned this into a near-white backdrop.
                        if (isShell) return 'lab(7.5% 0.4 -1.3)';
                        if (isOverlay) return 'rgba(255, 255, 255, 0.08)';
                        return 'rgba(0, 0, 0, 0)';
                    }
                    if (property === 'color') return 'oklab(0.952693 0.000792831 -0.00253612)';
                    return Reflect.get(target, property, receiver);
                },
            });
        });

        try {
            refreshReaderWordContrastForWord(word);
        } finally {
            spy.mockRestore();
        }

        const pageBg = word.style.getPropertyValue('--jpdb-reader-page-bg');
        expect(pageBg).toBe('rgb(24, 27, 32)');
        const text = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        expect(text).not.toBe('#000000');
        expect(contrastRatio(text, '#181b20')).toBeGreaterThanOrEqual(4.5);
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

    it('measures variable-backed first-render highlights without repainting them darker', () => {
        document.body.innerHTML = `
            <p style="background: rgb(255, 255, 255); color: rgb(242, 243, 245);">
                <span class="jpdb-reader-word jpdb-known" style="--jpdb-reader-word-highlight-source: rgb(236, 244, 255); color: rgb(242, 243, 245); text-decoration-color: rgb(170, 178, 192);">波蘭</span>
            </p>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        refreshReaderWordContrastForWord(word);

        const text = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        const highlight = word.style.getPropertyValue('--jpdb-reader-word-accessible-highlight');
        expect(highlight).toBe('');
        expect(text).not.toBe('#f2f3f5');
        expect(contrastRatio(text, '#ecf4ff')).toBeGreaterThanOrEqual(4.5);
    });

    it('measures generated highlights against the detected page background before preserving them', () => {
        document.body.innerHTML = `
            <p style="background: rgb(255, 255, 255); color: rgb(20, 20, 20);">
                <span class="jpdb-reader-word jpdb-known jpdb-pitch-heiban" style="color: rgb(20, 20, 20); text-decoration-color: rgb(53, 158, 255);">読む</span>
            </p>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const realGetComputedStyle = window.getComputedStyle.bind(window);
        const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElt) => {
            const style = realGetComputedStyle(element, pseudoElt);
            if (element !== word) return style;
            return new Proxy(style, {
                get(target, property, receiver) {
                    if (property === 'backgroundColor') {
                        return word.style.getPropertyValue('--jpdb-reader-highlight-backdrop') === 'rgb(255, 255, 255)'
                            ? 'rgb(230, 245, 235)'
                            : 'rgb(92, 100, 112)';
                    }
                    return Reflect.get(target, property, receiver);
                },
            });
        });

        try {
            refreshReaderWordContrastForWord(word);
        } finally {
            spy.mockRestore();
        }

        const highlight = word.style.getPropertyValue('--jpdb-reader-word-accessible-highlight');
        const underline = word.style.getPropertyValue('--jpdb-reader-word-accessible-underline');
        expect(word.style.getPropertyValue('--jpdb-reader-highlight-backdrop')).toBe('rgb(255, 255, 255)');
        expect(contrastRatio(highlight, '#ffffff')).toBeGreaterThanOrEqual(1.45);
        expect(contrastRatio(highlight, '#ffffff')).toBeLessThan(2);
        expect(contrastRatio(underline, highlight)).toBeGreaterThanOrEqual(3);
    });

    it('accounts for the first hover overlay when choosing page word text contrast', () => {
        const { word } = hoveredReaderWord('<span class="jpdb-reader-word jpdb-known" style="background: rgb(230, 245, 235); color: rgb(75, 89, 103); --jpdb-reader-hover: rgba(37, 52, 73, 0.5);">読む</span>');

        refreshReaderWordContrastForWord(word);

        const text = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        const highlight = word.style.getPropertyValue('--jpdb-reader-word-accessible-highlight') || '#e6f5eb';
        const hover = cssColorToRgba('rgba(37, 52, 73, 0.5)')!;
        const backdrop = cssColorToRgba(highlight)!;
        const hoverBackdrop = rgbaToHex(blendRgba(hover, backdrop));
        expect(contrastRatio('#4b5967', hoverBackdrop)).toBeLessThan(4.5);
        expect(contrastRatio(text, hoverBackdrop)).toBeGreaterThanOrEqual(4.5);
    });

    it('uses the dark host page canvas when the reader theme backdrop starts light', () => {
        document.body.innerHTML = `
            <p style="background: rgb(24, 27, 32); color: rgb(242, 244, 248);">
                <span class="jpdb-reader-word jpdb-known jpdb-pitch-heiban" style="color: rgb(242, 244, 248); text-decoration-color: rgb(53, 158, 255);">読む</span>
            </p>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const realGetComputedStyle = window.getComputedStyle.bind(window);
        const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElt) => {
            const style = realGetComputedStyle(element, pseudoElt);
            if (element !== word) return style;
            return new Proxy(style, {
                get(target, property, receiver) {
                    if (property === 'backgroundColor') {
                        return word.style.getPropertyValue('--jpdb-reader-highlight-backdrop') === 'rgb(24, 27, 32)'
                            ? 'rgb(58, 82, 72)'
                            : 'rgb(230, 245, 235)';
                    }
                    return Reflect.get(target, property, receiver);
                },
            });
        });

        try {
            refreshReaderWordContrastForWord(word);
        } finally {
            spy.mockRestore();
        }

        const highlight = word.style.getPropertyValue('--jpdb-reader-word-accessible-highlight');
        const text = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        const underline = word.style.getPropertyValue('--jpdb-reader-word-accessible-underline');
        expect(word.style.getPropertyValue('--jpdb-reader-highlight-backdrop')).toBe('rgb(24, 27, 32)');
        expect(contrastRatio(highlight, '#181b20')).toBeGreaterThanOrEqual(1.45);
        expect(contrastRatio(highlight, '#181b20')).toBeLessThan(2.5);
        expect(contrastRatio(text, '#181b20')).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(text, highlight)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(underline, highlight)).toBeGreaterThanOrEqual(3);
    });

    it('honours enabled word text colours on passive UI while preserving contrast', () => {
        document.body.innerHTML = `
            <p style="background: rgb(24, 27, 32);">
                <a role="button" style="background: rgb(55, 108, 80); color: rgb(255, 255, 255);">
                    <span class="jpdb-reader-word jpdb-redundant jpdb-reader-scan-word jpdb-reader-passive-word jpdb-pitch-atamadaka" style="background: rgb(55, 108, 80); color: rgb(0, 0, 0); text-decoration-color: rgb(123, 216, 143);">
                        <ruby>よ<rt class="jpdb-reader-furi">よ</rt></ruby>む
                    </span>
                </a>
            </p>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        refreshReaderWordContrastForWord(word);

        const text = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        expect(text).not.toBe('#ffffff');
        expect(word.style.getPropertyValue('--jpdb-reader-word-highlight-text')).toBe('#ffffff');
        expect(word.style.getPropertyValue('--jpdb-reader-word-accessible-highlight')).toBe('');
        expect(contrastRatio(text, '#376c50')).toBeGreaterThanOrEqual(4.5);
    });

    it('evaluates passive words contrast against host background to prevent flipping to black on mid-tone highlight tints', () => {
        // Host button background is dark green (rgb(37, 87, 61) / #25573d) with white text.
        // The word has a passive highlight tint (rgb(68, 133, 91) / #44855b).
        // Since contrast(white, highlight tint) is 4.419 (under 4.5), evaluating text contrast
        // against the highlight tint flips the text to black. It should evaluate against the host background
        // (#25573d) instead, keeping the text white.
        document.body.innerHTML = `
            <p style="background: rgb(24, 27, 32);">
                <a role="button" style="background: rgb(37, 87, 61); color: rgb(255, 255, 255);">
                    <span class="jpdb-reader-word jpdb-redundant jpdb-reader-scan-word jpdb-reader-passive-word jpdb-pitch-atamadaka" style="background: rgb(68, 133, 91); color: rgb(255, 255, 255); text-decoration-color: rgb(123, 216, 143);">
                        <ruby>よ<rt class="jpdb-reader-furi" style="color: rgb(255, 255, 255);">よ</rt></ruby>む
                    </span>
                </a>
            </p>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        refreshReaderWordContrastForWord(word);

        const text = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');

        expect(text).toBe('#ffffff');
        expect(word.style.getPropertyValue('--jpdb-reader-word-highlight-text')).toBe('#ffffff');
    });

    it('infers dark transparent host surfaces while honouring the enabled word text source', () => {
        document.documentElement.style.colorScheme = 'dark';
        document.body.innerHTML = `
            <section style="color: rgb(242, 243, 245);">
                <span class="username">
                    Canna<span class="jpdb-reader-word jpdb-known jpdb-reader-scan-word jpdb-reader-passive-word" style="color: rgb(0, 0, 0);">波蘭</span>
                </span>
            </section>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        refreshReaderWordContrastForWord(word);

        const text = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        expect(word.style.getPropertyValue('--jpdb-reader-highlight-backdrop')).toBe('rgb(24, 27, 32)');
        expect(text).not.toBe('#f2f3f5');
        expect(contrastRatio(text, '#181b20')).toBeGreaterThanOrEqual(4.5);
    });

    it('uses OKLab host backgrounds instead of falling back to a white Discord surface', () => {
        document.body.innerHTML = `
            <section id="discord-surface">
                <div id="discord-control" role="button" data-jpdb-reader-passive-chrome="true">
                    <span
                        class="jpdb-reader-word jpdb-mastered jpdb-reader-scan-word jpdb-reader-passive-word jpdb-pitch-atamadaka"
                        style="color: rgb(0, 0, 0); text-decoration-color: rgb(53, 158, 255);"
                    >日本語</span>
                </div>
            </section>
        `;
        const surface = document.getElementById('discord-surface')!;
        const control = document.getElementById('discord-control')!;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const realGetComputedStyle = window.getComputedStyle.bind(window);
        const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElt) => {
            const style = realGetComputedStyle(element, pseudoElt);
            if (element !== surface && element !== control) return style;
            return new Proxy(style, {
                get(target, property, receiver) {
                    if (property === 'backgroundColor') {
                        return element === surface
                            ? 'oklab(0.183087 0.00112148 -0.00387992)'
                            : 'rgba(0, 0, 0, 0)';
                    }
                    if (property === 'color') return 'oklab(0.952693 0.000792831 -0.00253612)';
                    return Reflect.get(target, property, receiver);
                },
            });
        });

        try {
            refreshReaderWordContrastForWord(word);
        } finally {
            spy.mockRestore();
        }

        const text = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        expect(word.style.getPropertyValue('--jpdb-reader-page-bg')).toBe('rgb(18, 18, 20)');
        expect(text).not.toBe('#efeff1');
        expect(text).not.toBe('#000000');
        expect(contrastRatio(text, '#121214')).toBeGreaterThanOrEqual(4.5);
    });

    it('keeps passive content highlights readable on the page surface', () => {
        document.body.innerHTML = `
            <p style="background: rgb(24, 27, 32); color: rgb(242, 243, 245);">
                <span class="jpdb-reader-word jpdb-known jpdb-reader-scan-word jpdb-reader-passive-word" style="background: rgb(236, 244, 255); color: rgb(242, 243, 245);">
                    <ruby><span class="jpdb-reader-ruby-base">波蘭</span><rt class="jpdb-reader-furi" style="color: rgb(242, 243, 245);">ぽーらん</rt></ruby>
                </span>
            </p>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        refreshReaderWordContrastForWord(word);

        // Furigana no longer carries its own accessible-colour variable: since
        // 1.6.192 it inherits the base word's colour (which IS contrast-clamped
        // here via --jpdb-reader-word-accessible-color), so the reading stays
        // readable structurally rather than via a separate measured var.
        const text = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        expect(contrastRatio(text, '#ecf4ff')).toBeGreaterThanOrEqual(4.5);
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
            <p style="color: rgb(32, 40, 52);">
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

    it('infers a dark canvas from light LOCAL text on a transparent backdrop', () => {
        // White paragraph text with no painted background = a dark embedded
        // shell (or a dark theme the parsers could not read). Assuming white
        // here painted dark-on-dark "redaction bars" on such surfaces.
        document.body.innerHTML = `
            <p style="color: rgb(255, 255, 255);">
                <span class="jpdb-reader-word" style="color: rgb(255, 209, 102);">読む</span>
            </p>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        refreshReaderWordContrastForWord(word);

        const text = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        expect(word.style.getPropertyValue('--jpdb-reader-page-bg')).toBe('rgb(24, 27, 32)');
        expect(contrastRatio(text, '#181b20')).toBeGreaterThanOrEqual(4.5);
    });

    it('derives accessible underlines from Yomu underline variables, not native transparent decoration', () => {
        document.body.innerHTML = `
            <p style="background: rgb(255, 255, 255); color: rgb(20, 20, 20);">
                <span class="jpdb-reader-word jpdb-pitch-unknown" style="--jpdb-reader-word-underline: var(--jpdb-reader-word-decoration-source); --jpdb-reader-word-decoration-source: rgb(156, 163, 175); text-decoration-color: transparent;">読む</span>
            </p>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        refreshReaderWordContrastForWord(word);

        const underline = word.style.getPropertyValue('--jpdb-reader-word-accessible-underline');
        expect(underline).not.toBe('');
        expect(underline).not.toBe('transparent');
        expect(contrastRatio(underline, '#ffffff')).toBeGreaterThanOrEqual(3);
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

    it('repairs stale Anki hover contrast even when no inline text color is present', async () => {
        const { word, stopHovering } = hoveredReaderWord('<span class="jpdb-reader-word anki-known" data-anki-state="known" style="--jpdb-reader-word-accessible-color: rgb(255, 255, 255);">読む</span>');

        refreshReaderWordContrastForWord(word);

        const hoveredText = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        expect(hoveredText).not.toBe('rgb(255, 255, 255)');
        expect(contrastRatio(hoveredText, '#ffffff')).toBeGreaterThanOrEqual(4.5);

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

    it('keeps the sampled page backdrop on a not-in-deck word that derives no colors', () => {
        document.body.innerHTML = `
            <div style="background: rgb(24, 26, 27);">
                <p style="color: rgb(232, 230, 227);">
                    <span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-heiban">読む</span>
                    <span class="jpdb-reader-word jpdb-not-in-deck">本</span>
                </p>
            </div>`;
        const [colored, neutral] = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'));

        refreshReaderWordContrast(document.body);

        // Both words paint the same not-in-deck wash, so both have to mix it
        // against the same sampled page color — dropping it from the neutral
        // one left it mixing against the reader theme token instead and made
        // it visibly darker than its neighbour on dark pages.
        expect(neutral.style.getPropertyValue('--jpdb-reader-highlight-backdrop')).toBe('rgb(24, 26, 27)');
        expect(neutral.style.getPropertyValue('--jpdb-reader-highlight-backdrop'))
            .toBe(colored.style.getPropertyValue('--jpdb-reader-highlight-backdrop'));
        expect(neutral.style.getPropertyValue('--jpdb-reader-word-accessible-color')).toBe('');
        expect(neutral.style.getPropertyValue('--jpdb-reader-word-accessible-underline')).toBe('');
    });

    it('restores a hover-derived word color after the pointer leaves a word nothing else changed', async () => {
        const { word, stopHovering } = hoveredReaderWord('<span class="jpdb-reader-word jpdb-known" style="color: rgb(90, 90, 90); --jpdb-reader-hover: rgba(20, 20, 20, 0.72);">読む</span>');

        refreshReaderWordContrastForWord(word);
        const hoveredText = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        // The hover overlay darkens the backdrop to roughly the word's own
        // grey, so hovering has to drive the text off that grey to stay legible.
        expect(contrastRatio(hoveredText, '#565656')).toBeGreaterThan(contrastRatio('#5a5a5a', '#565656'));

        // Refreshes that land while the pointer still rests on the word find
        // nothing to change; they must not end the watch that restores the
        // resting color on leave.
        await vi.advanceTimersByTimeAsync(200);
        refreshReaderWordContrastForWord(word);

        await stopHovering();

        const settledText = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        expect(settledText).not.toBe(hoveredText);
        expect(contrastRatio(settledText, '#ffffff')).toBeGreaterThanOrEqual(4.5);
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

    it('contrasts every sibling word and reuses the per-parent background computation', () => {
        document.body.innerHTML = `
            <div id="bg-wrap" style="background: rgb(20, 20, 20);">
                <p style="color: rgb(255, 255, 255);">
                    <span class="jpdb-reader-word" style="color: rgb(30, 30, 30);">読む</span>
                    <span class="jpdb-reader-word" style="color: rgb(30, 30, 30);">本</span>
                    <span class="jpdb-reader-word" style="color: rgb(30, 30, 30);">日</span>
                </p>
            </div>`;
        const wrap = document.querySelector('#bg-wrap')!;
        const spy = vi.spyOn(window, 'getComputedStyle');
        refreshReaderWordContrast(document.body);
        // The outer wrapper is only visited by pageBackgroundFor's ancestor
        // walk (not the per-word contrast measurement). Memoizing per parent
        // means the three sibling words trigger that walk once, not three times.
        const wrapStyleReads = spy.mock.calls.filter(call => call[0] === wrap).length;
        spy.mockRestore();
        expect(wrapStyleReads).toBe(1);
        // All three siblings still get an accessible color against the dark bg.
        for (const word of document.querySelectorAll<HTMLElement>('.jpdb-reader-word')) {
            expect(word.style.getPropertyValue('--jpdb-reader-word-accessible-color')).not.toBe('');
        }
    });

    it('refreshes contrast only for connected changed word lines during enrichment', () => {
        document.body.innerHTML = `
            <main>
                <p id="changed-line" style="background: rgb(20, 20, 20); color: rgb(255, 255, 255);">
                    <span class="jpdb-reader-word jpdb-known" style="color: rgb(30, 30, 30);">読む</span>
                    <span class="jpdb-reader-word anki-due" style="color: rgb(30, 30, 30);">本</span>
                </p>
                <p id="untouched-line" style="background: rgb(20, 20, 20); color: rgb(255, 255, 255);">
                    <span class="jpdb-reader-word jpdb-known" style="color: rgb(30, 30, 30);">犬</span>
                </p>
            </main>`;
        const changedLine = document.querySelector<HTMLElement>('#changed-line')!;
        const changedWords = Array.from(changedLine.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        const untouchedWord = document.querySelector<HTMLElement>('#untouched-line .jpdb-reader-word')!;
        const detachedLine = document.createElement('p');
        detachedLine.innerHTML = '<span class="jpdb-reader-word jpdb-known" style="color: rgb(30, 30, 30);">猫</span>';
        const detachedWord = detachedLine.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const changedLineScan = vi.spyOn(changedLine, 'querySelectorAll');
        const bodyScan = vi.spyOn(document.body, 'querySelectorAll');
        const detachedLineScan = vi.spyOn(detachedLine, 'querySelectorAll');

        try {
            refreshContrastForChangedWords([...changedWords, detachedWord]);

            expect(changedLineScan).toHaveBeenCalledTimes(1);
            expect(bodyScan).not.toHaveBeenCalled();
            expect(detachedLineScan).not.toHaveBeenCalled();
            for (const word of changedWords) {
                expect(word.style.getPropertyValue('--jpdb-reader-word-accessible-color')).not.toBe('');
            }
            expect(untouchedWord.style.getPropertyValue('--jpdb-reader-word-accessible-color')).toBe('');
            expect(detachedWord.style.getPropertyValue('--jpdb-reader-word-accessible-color')).toBe('');
        } finally {
            changedLineScan.mockRestore();
            bodyScan.mockRestore();
            detachedLineScan.mockRestore();
        }
    });

    it('rechecks page word contrast after hosted theme listeners finish toggling the page canvas', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            bindEvents(): void;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-api-key',
            theme: 'dark',
            wordHighlightColorSource: 'jpdb',
            wordUnderlineColorSource: 'jpdb',
            wordTextColorSource: 'jpdb',
        };
        document.body.innerHTML = `
            <p id="hosted-theme-wrap" style="background: rgb(24, 27, 32); color: rgb(242, 244, 248);">
                <span class="jpdb-reader-word jpdb-known" style="background: rgb(58, 82, 72); color: rgb(242, 244, 248); text-decoration-color: rgb(123, 216, 143);">読む</span>
            </p>
        `;
        const host = document.querySelector<HTMLElement>('#hosted-theme-wrap')!;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        internals.bindEvents();
        window.addEventListener(SETTINGS_CHANGE_EVENT, () => {
            host.style.background = 'rgb(255, 255, 255)';
            host.style.color = 'rgb(23, 26, 31)';
            word.style.background = 'rgb(190, 222, 198)';
            word.style.color = 'rgb(23, 26, 31)';
            word.style.textDecorationColor = 'rgb(74, 130, 86)';
        }, { once: true });

        try {
            publishSettingsChange({ preview: true, settings: { theme: 'light' } });

            expect(word.style.getPropertyValue('--jpdb-reader-page-bg')).toBe('rgb(24, 27, 32)');

            await vi.advanceTimersByTimeAsync(100);

            expect(document.documentElement.classList.contains('jpdb-reader-theme-light')).toBe(true);
            expect(word.style.getPropertyValue('--jpdb-reader-page-bg')).toBe('rgb(255, 255, 255)');
            expect(word.style.getPropertyValue('--jpdb-reader-highlight-backdrop')).toBe('rgb(255, 255, 255)');
            expect(contrastRatio(word.style.getPropertyValue('--jpdb-reader-word-accessible-color'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('falls back from unavailable JPDB color channels until an API key is available', () => {
        const withoutKey = applyReaderTheme({
            ...DEFAULT_SETTINGS,
            // A20: the local deck now feeds the state channel too, so an
            // "unavailable state source" case has to switch that deck off.
            yomuLocalSrsEnabled: false,
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
            yomuLocalSrsEnabled: false,
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
            yomuLocalSrsEnabled: false,
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
        const ocrOpacity = accessibleOcrBackgroundOpacity(settings.ocrBackgroundOpacity);
        const ocrBackground = accessibleOcrBackgroundColor(settings.accentColor, ocrOpacity);
        const ocrBackgroundRgba = accentToRgba(ocrBackground, ocrOpacity);
        expect(contrastRatio(compositeOverWhiteHex(ocrBackgroundRgba), '#ffffff')).toBeGreaterThanOrEqual(4.5);
        expect(root.style.getPropertyValue('--jpdb-ocr-background-rgba')).toBe(ocrBackgroundRgba);
        expect(root.style.getPropertyValue('--jpdb-ocr-background-active-rgba')).toBe(accentToRgba(ocrBackground, Math.min(1, ocrOpacity + 0.12)));
        expect(root.style.getPropertyValue('--jpdb-reader-font')).toBe('"Inter", system-ui, sans-serif');
        expect(root.style.getPropertyValue('--jpdb-reader-popup-font')).toBe('"Noto Sans JP", sans-serif');
        expect(root.style.getPropertyValue('--jpdb-reader-popup-font-weight')).toBe('420');
        expect(applied.wordColorSources.highlight).toBe('pitch');
        expect(applied.subtitleColorSources.highlight).toBe('anki');
    });

    it('keeps configured accent variables above host page custom properties', () => {
        const root = document.createElement('div');
        const setProperty = vi.spyOn(root.style, 'setProperty');

        applyReaderTheme({ ...DEFAULT_SETTINGS, accentColor: '#336699' }, root as unknown as HTMLElement);

        expect(root.style.getPropertyValue('--jpdb-reader-accent')).toBe('#336699');
        expect(setProperty).toHaveBeenCalledWith('--jpdb-reader-accent', '#336699', 'important');
        expect(setProperty).toHaveBeenCalledWith('--jpdb-reader-accent-soft', expect.any(String), 'important');
        expect(setProperty).toHaveBeenCalledWith('--jpdb-reader-accent-readable', expect.any(String), 'important');
        expect(setProperty).toHaveBeenCalledWith('--jpdb-reader-accent-text', expect.any(String), 'important');
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
            '--jpdb-reader-pitch-unknown-readable',
        ];

        readableVars.forEach(variable => {
            const color = root.style.getPropertyValue(variable);
            expect(color, variable).toMatch(/^#[0-9a-f]{6}$/);
            lightSurfaces.forEach(surface => {
                expect(contrastRatio(color, surface), `${variable} on ${surface}`).toBeGreaterThanOrEqual(4.5);
            });
        });
        expect(root.style.getPropertyValue('--jpdb-reader-pitch-kifuku-readable')).toBe('');
    });

    it('defaults popup Japanese text to the jpdb.io font stack', () => {
        applyReaderTheme(DEFAULT_SETTINGS);
        const root = document.documentElement;

        expect(DEFAULT_SETTINGS.popupFontFamily).toContain('Nunito Sans');
        expect(DEFAULT_SETTINGS.popupFontFamily).toContain('Extra Sans JP');
        expect(DEFAULT_SETTINGS.popupFontFamily).toContain('Noto Sans JP');
        expect(DEFAULT_SETTINGS.popupFontFamily).toContain('Noto Sans CJK JP');
        expect(root.style.getPropertyValue('--jpdb-reader-font')).toBe(DEFAULT_SETTINGS.readerFontFamily);
        expect(DEFAULT_SETTINGS.popupFontWeight).toBe(450);
        expect(root.style.getPropertyValue('--jpdb-reader-popup-font')).toBe(DEFAULT_SETTINGS.popupFontFamily);
        expect(root.style.getPropertyValue('--jpdb-reader-popup-font-weight')).toBe('450');
    });


    it('wires reader word accessible colors without expanding adjacent word hitboxes', () => {
        const normalizedCss = READER_WORD_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss).toContain('--jpdb-reader-word-highlight-paint: var( --jpdb-reader-word-accessible-highlight, var(--jpdb-reader-word-highlight-source, transparent) );');
        // Passive CONTENT words (link-wrapped prose) keep their decoration
        // sources at rest; only chrome-scoped rules strip them (1.5.4's blanket
        // strip regressed pitch underlines into hover-only flicker).
        expect(normalizedCss).toContain('.jpdb-reader-word.jpdb-reader-passive-word { --jpdb-reader-word-color-source: currentColor; display: inline !important; white-space: inherit; word-break: inherit; overflow-wrap: inherit !important; line-break: inherit; cursor: inherit; }');
        // Chrome passive words honour the configured highlight at rest like
        // content words (owner reports 2026-07-19: Reddit sort chips,
        // timestamps, join/share pills; earlier YouTube 作成/共有/質問する).
        // No chrome- or passive-chrome-scoped rule may strip the highlight
        // channel, and the old YouTube carve-out list stays gone with it.
        expect(normalizedCss).not.toMatch(/passive-chrome[^{]*\{[^}]*--jpdb-reader-word-highlight-source: transparent/);
        expect(normalizedCss).not.toContain('yt-chip-cloud-chip-renderer');
        expect(normalizedCss).not.toMatch(/passive-chrome[^{]*:hover[^{]*\{[^}]*background-image: none/);
        expect(normalizedCss).toContain('background-image: linear-gradient(var(--jpdb-reader-word-highlight-paint), var(--jpdb-reader-word-highlight-paint)) !important;');
        expect(normalizedCss).toContain('background-size: var(--jpdb-reader-word-highlight-size) var(--jpdb-reader-word-highlight-block-size) !important;');
        expect(normalizedCss).toContain('--jpdb-reader-word-highlight-block-size: 1.16em;');
        expect(normalizedCss).toContain('touch-action: manipulation;');
        expect(normalizedCss).toContain('.jpdb-reader-word::after { content: ""; position: absolute; z-index: 1;');
        expect(normalizedCss).toContain('.jpdb-reader-word.jpdb-reader-has-furi { line-height: 2.15; }');
        expect(normalizedCss).toContain('pointer-events: none; }');
        expect(normalizedCss).not.toContain('.jpdb-reader-word:not(.jpdb-reader-passive-word)::after');
        expect(normalizedCss).not.toContain('.VPHero :is(.name, .text, .heading) .jpdb-reader-word:not(.jpdb-reader-has-furi)::after');
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
        installSharedSettingsStore([[SETTINGS_STORAGE_KEY, {
            ...DEFAULT_SETTINGS,
            wordHighlightMode: 'status',
            wordHighlightColorSource: 'auto',
            wordUnderlineColorSource: 'anki',
            wordTextColorSource: 'auto',
            subtitleHighlightColorSource: 'auto',
            subtitleUnderlineColorSource: 'pitch',
            subtitleTextColorSource: 'auto',
        }]]);

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
        installSharedSettingsStore([[SETTINGS_STORAGE_KEY, {
            ...DEFAULT_SETTINGS,
            wordHighlightColorSource: 'status',
            wordUnderlineColorSource: 'status',
            wordTextColorSource: 'status',
            subtitleHighlightColorSource: 'status',
            subtitleUnderlineColorSource: 'status',
            subtitleTextColorSource: 'status',
        }]]);

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

    it('promotes appearance settings saved under the previous storage key', async () => {
        const store = installSharedSettingsStore([[SETTINGS_STORAGE_KEYS[1], {
            ...DEFAULT_SETTINGS,
            theme: 'dark',
            accentColor: '#ff3366',
            wordColorKnown: '#123456',
        }]]);

        const settings = await loadSettings();
        const stored = store.get(SETTINGS_STORAGE_KEYS[0]) as Record<string, unknown>;

        expectLoadedAndStoredSettings(settings, stored, {
            theme: 'dark',
            accentColor: '#ff3366',
            wordColorKnown: '#123456',
        });
    });

    it('recovers legacy appearance settings when the current key was written with defaults', async () => {
        const store = installSharedSettingsStore([[SETTINGS_STORAGE_KEYS[0], {
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'ja',
            popoverWidth: 640,
        }], [SETTINGS_STORAGE_KEYS[1], {
            ...DEFAULT_SETTINGS,
            theme: 'dark',
            accentColor: '#ff3366',
            interfaceLanguage: 'auto',
            popoverWidth: 480,
        }]]);

        const settings = await loadSettings();
        const stored = store.get(SETTINGS_STORAGE_KEYS[0]) as Record<string, unknown>;

        expectLoadedAndStoredSettings(settings, stored, {
            theme: 'dark',
            accentColor: '#ff3366',
            interfaceLanguage: 'ja',
            popoverWidth: 640,
        });
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
            yomuLocalSrsEnabled: false,
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
        } as ReaderSettings & { wordHighlightMode: 'off' }, {
            explicitUserChoiceKeys: ['wordHighlightColorSource'],
        });

        const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}');

        expect(stored.wordHighlightMode).toBeUndefined();
        expect(stored.wordHighlightColorSource).toBe('jpdb');
        expect(stored.wordUnderlineColorSource).toBe('pitch');
    });

    it('loads saved furigana/onboarding state when GM storage round-trips the default (message-based managers)', async () => {
        // Reproduces the reported bug: Safari Userscripts / FireMonkey hand back
        // a structured clone of the default value, so a naive identity check
        // treats every read as "unset" — settings appear unsaved and onboarding
        // re-opens on every new site. loadSettings must still recover the value.
        const store = new Map<string, unknown>([
            [SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS, showFurigana: false, furiganaMode: 'off', onboardingSeen: true }],
        ]);
        vi.stubGlobal('GM_getValue', vi.fn(async (key: string, fallback: unknown) =>
            JSON.parse(JSON.stringify(store.has(key) ? store.get(key) : fallback))));
        try {
            const settings = await loadSettings();
            expect(settings.onboardingSeen).toBe(true);
            expect(settings.showFurigana).toBe(false);
            expect(settings.furiganaMode).toBe('off');
        } finally {
            vi.unstubAllGlobals();
        }
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

    it('parks the mobile sheet close button on the left when enabled', () => {
        const root = document.createElement('div');
        applyReaderTheme({ ...DEFAULT_SETTINGS, sheetCloseButtonOnLeft: true }, root as unknown as HTMLElement);
        expect(root.classList.contains('jpdb-reader-sheet-close-left')).toBe(true);

        const popoverCss = readFileSync('src/reader/styles/popover-core.css', 'utf8').replace(/\s+/g, ' ');
        expect(popoverCss).toContain('html.jpdb-reader-sheet-close-left .jpdb-reader-sheet-close { right: auto; left: max(12px, env(safe-area-inset-left)); }');
    });
});
