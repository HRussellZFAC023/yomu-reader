import { CORE_COLOR_TOKENS, PAGE_WORD_COLOR_TOKENS } from './color-tokens';
import { blendRgba, contrastRatio, cssColorToHex, cssColorToRgba, mixHex, readableOn, rgbaToHex, type RgbaColor } from './color-utils';

const PAGE_WORD_SELECTOR = '.jpdb-reader-word';
const YOMU_SURFACE_SELECTOR = '[data-jpdb-reader-root], .jpdb-ocr-layer, .jpdb-subtitle-player, .jpdb-subtitle-list, .asbplayer-subtitles-container-bottom, .asbplayer-offscreen';
const TEXT_CONTRAST = 4.5;
const DECORATION_CONTRAST = 3;
const HIGHLIGHT_CONTRAST = 1.45;
const COLORED_READER_WORD_CLASSES = new Set([
    'jpdb-new',
    'jpdb-in-deck',
    'jpdb-learning',
    'jpdb-known',
    'jpdb-never-forget',
    'jpdb-redundant',
    'jpdb-due',
    'jpdb-failed',
    'jpdb-suspended',
    'jpdb-blacklisted',
    'jpdb-locked',
    'anki-new',
    'anki-learning',
    'anki-known',
    'anki-due',
    'anki-failed',
    'anki-suspended',
    'jpdb-pitch-heiban',
    'jpdb-pitch-atamadaka',
    'jpdb-pitch-nakadaka',
    'jpdb-pitch-odaka',
    'jpdb-pitch-kifuku',
]);
const CONTRAST_VARS = [
    '--jpdb-reader-page-bg',
    '--jpdb-reader-highlight-backdrop',
    '--jpdb-reader-furi-accessible-color',
    '--jpdb-reader-word-accessible-color',
    '--jpdb-reader-word-accessible-highlight',
    '--jpdb-reader-word-accessible-underline',
    '--jpdb-reader-word-highlight-text',
    '--jpdb-reader-word-contrast-shadow',
] as const;
const pendingHoverContrastRefresh = new WeakSet<HTMLElement>();

interface PageBackground {
    css: string;
    hex: string;
    rgba: RgbaColor;
}

interface WordBackground extends PageBackground {
    hasPaint: boolean;
}

export function refreshReaderWordContrast(root: ParentNode = document): void {
    readerWords(root).forEach(refreshReaderWordContrastForWord);
}

export function refreshReaderWordContrastForWord(word: HTMLElement): void {
    if (word.closest(YOMU_SURFACE_SELECTOR)) {
        clearContrastVars(word);
        return;
    }
    if (isNeutralReaderWord(word)) {
        clearContrastVars(word);
        return;
    }
    if (word.matches(':hover, :focus')) {
        scheduleHoverSettledContrastRefresh(word);
        if (word.dataset.ankiState && hoverAnkiContrastIsStillReadable(word)) return;
    }
    const background = pageBackgroundFor(word);
    if (!background) {
        applyUnknownBackgroundFallback(word);
        return;
    }

    word.style.setProperty('--jpdb-reader-page-bg', background.css);
    word.style.setProperty('--jpdb-reader-highlight-backdrop', background.css);
    word.style.removeProperty('--jpdb-reader-word-contrast-shadow');

    const sourcePaintBackground = renderedWordBackground(word, background);
    const paintBackground = accessibleWordBackground(word, sourcePaintBackground, background);
    const sourceText = measuredWordTextColor(word, paintBackground.rgba);
    const nativeText = cssColorToHex(parentTextColor(word), paintBackground.rgba) ?? bestTextColor(paintBackground.hex);
    const decoration = measuredDecorationColor(word, paintBackground.rgba);
    const furiText = measuredFuriTextColor(word, paintBackground.rgba);

    word.style.setProperty('--jpdb-reader-word-highlight-text', readableOn(nativeText, paintBackground.hex, TEXT_CONTRAST));
    word.style.setProperty('--jpdb-reader-word-accessible-color', readableOn(sourceText ?? nativeText, paintBackground.hex, TEXT_CONTRAST));
    if (furiText) word.style.setProperty('--jpdb-reader-furi-accessible-color', readableOn(furiText, paintBackground.hex, TEXT_CONTRAST));
    else word.style.removeProperty('--jpdb-reader-furi-accessible-color');
    if (decoration) word.style.setProperty('--jpdb-reader-word-accessible-underline', readableOn(decoration, paintBackground.hex, DECORATION_CONTRAST));
    else word.style.removeProperty('--jpdb-reader-word-accessible-underline');
}

function isNeutralReaderWord(word: HTMLElement): boolean {
    if (!word.classList.contains('jpdb-not-in-deck') && !word.classList.contains('anki-not-in-deck')) return false;
    return !Array.from(word.classList).some(className => COLORED_READER_WORD_CLASSES.has(className));
}

function hoverAnkiContrastIsStillReadable(word: HTMLElement): boolean {
    const current = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
    if (!current) return false;
    const background = pageBackgroundFor(word);
    if (!background) return false;
    const paintBackground = renderedWordBackground(word, background);
    const color = cssColorToHex(current, paintBackground.rgba);
    return Boolean(color && contrastRatio(color, paintBackground.hex) >= TEXT_CONTRAST);
}

function scheduleHoverSettledContrastRefresh(word: HTMLElement): void {
    if (pendingHoverContrastRefresh.has(word)) return;
    pendingHoverContrastRefresh.add(word);
    window.setTimeout(() => {
        pendingHoverContrastRefresh.delete(word);
        if (!word.isConnected) return;
        refreshReaderWordContrastForWord(word);
    }, 120);
}

function readerWords(root: ParentNode): HTMLElement[] {
    const words = new Set<HTMLElement>();
    if (root instanceof HTMLElement && root.matches(PAGE_WORD_SELECTOR)) words.add(root);
    root.querySelectorAll<HTMLElement>(PAGE_WORD_SELECTOR).forEach(word => words.add(word));
    return [...words];
}

function pageBackgroundFor(word: HTMLElement): PageBackground | null {
    const ancestors: Element[] = [];
    for (let element = word.parentElement; element; element = element.parentElement) ancestors.push(element);

    let found = false;
    let hasImageBackdrop = false;
    let rgba: RgbaColor = { red: 255, green: 255, blue: 255, alpha: 1 };
    for (const element of ancestors.reverse()) {
        const style = getComputedStyle(element);
        hasImageBackdrop ||= Boolean(style.backgroundImage && style.backgroundImage !== 'none');
        const color = cssColorToRgba(style.backgroundColor);
        if (!color || color.alpha <= 0) continue;
        rgba = blendRgba(color, rgba);
        found = true;
    }
    if (!found && hasImageBackdrop) return null;
    const hex = rgbaToHex(rgba);
    return { css: `rgb(${rgba.red}, ${rgba.green}, ${rgba.blue})`, hex, rgba };
}

function renderedWordBackground(word: HTMLElement, pageBackground: PageBackground): WordBackground {
    return withContrastVarsDisabled(word, () => {
        const color = cssColorToRgba(getComputedStyle(word).backgroundColor);
        const hasPaint = Boolean(color && color.alpha > 0);
        const rgba = color && color.alpha > 0 ? blendRgba(color, pageBackground.rgba) : pageBackground.rgba;
        const hex = rgbaToHex(rgba);
        return { css: `rgb(${rgba.red}, ${rgba.green}, ${rgba.blue})`, hex, rgba, hasPaint };
    });
}

function accessibleWordBackground(word: HTMLElement, paintBackground: WordBackground, pageBackground: PageBackground): PageBackground {
    if (!paintBackground.hasPaint) {
        word.style.removeProperty('--jpdb-reader-word-accessible-highlight');
        return paintBackground;
    }

    const color = readableHighlightBackground(paintBackground.hex, pageBackground.hex);
    word.style.setProperty('--jpdb-reader-word-accessible-highlight', color);
    const rgba = cssColorToRgba(color) ?? paintBackground.rgba;
    return { css: color, hex: rgbaToHex(rgba), rgba };
}

function measuredWordTextColor(word: HTMLElement, backdrop: RgbaColor): string | null {
    return withContrastVarsDisabled(word, () => cssColorToHex(getComputedStyle(word).color, backdrop));
}

function measuredDecorationColor(word: HTMLElement, backdrop: RgbaColor): string | null {
    return withContrastVarsDisabled(word, () => {
        const color = cssColorToRgba(getComputedStyle(word).textDecorationColor);
        if (!color || color.alpha <= 0) return null;
        return rgbaToHex(color.alpha < 1 ? blendRgba(color, backdrop) : color);
    });
}

function measuredFuriTextColor(word: HTMLElement, backdrop: RgbaColor): string | null {
    const furi = word.querySelector<HTMLElement>('rt.jpdb-reader-furi');
    if (!furi) return null;
    return withContrastVarsDisabled(word, () => cssColorToHex(getComputedStyle(furi).color, backdrop));
}

function parentTextColor(word: HTMLElement): string {
    return getComputedStyle(word.parentElement ?? word).color;
}

function bestTextColor(background: string): string {
    return contrastRatio(CORE_COLOR_TOKENS.black, background) >= contrastRatio(CORE_COLOR_TOKENS.white, background)
        ? CORE_COLOR_TOKENS.black
        : CORE_COLOR_TOKENS.white;
}

function readableHighlightBackground(color: string, background: string): string {
    if (contrastRatio(color, background) >= HIGHLIGHT_CONTRAST) return color;
    const toward = contrastRatio(background, CORE_COLOR_TOKENS.black) > contrastRatio(background, CORE_COLOR_TOKENS.white)
        ? CORE_COLOR_TOKENS.black
        : CORE_COLOR_TOKENS.white;
    for (let amount = 0.04; amount <= 0.24; amount += 0.04) {
        const mixed = mixHex(color, toward, amount);
        if (contrastRatio(mixed, background) >= HIGHLIGHT_CONTRAST) return mixed;
    }
    return color;
}

function applyUnknownBackgroundFallback(word: HTMLElement): void {
    word.style.removeProperty('--jpdb-reader-page-bg');
    word.style.removeProperty('--jpdb-reader-highlight-backdrop');
    word.style.removeProperty('--jpdb-reader-furi-accessible-color');
    word.style.removeProperty('--jpdb-reader-word-accessible-color');
    word.style.removeProperty('--jpdb-reader-word-accessible-highlight');
    word.style.removeProperty('--jpdb-reader-word-accessible-underline');
    word.style.removeProperty('--jpdb-reader-word-highlight-text');
    word.style.setProperty('--jpdb-reader-word-contrast-shadow', PAGE_WORD_COLOR_TOKENS.unknownBackgroundShadow);
}

function clearContrastVars(word: HTMLElement): void {
    CONTRAST_VARS.forEach(name => word.style.removeProperty(name));
}

function withContrastVarsDisabled<T>(word: HTMLElement, read: () => T): T {
    const saved = CONTRAST_VARS.map(name => ({
        name,
        value: word.style.getPropertyValue(name),
        priority: word.style.getPropertyPriority(name),
    }));
    CONTRAST_VARS.forEach(name => word.style.removeProperty(name));
    try {
        return read();
    } finally {
        saved.forEach(({ name, value, priority }) => {
            if (value) word.style.setProperty(name, value, priority);
        });
    }
}
