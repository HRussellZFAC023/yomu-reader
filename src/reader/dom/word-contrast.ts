import { CORE_COLOR_TOKENS, PAGE_WORD_COLOR_TOKENS } from '../theme/color-tokens';
import { blendRgba, contrastRatio, cssColorToHex, cssColorToRgba, mixHex, readableOn, rgbaToHex, type RgbaColor } from '../theme/color-utils';
import { RENDERED_WORD_CONTRAST_VARS, RENDERED_WORD_CONTRAST_VARS_WITHOUT_SHADOW } from './rendered-word-contrast-vars';

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
const pendingHoverContrastRefresh = new WeakSet<HTMLElement>();

interface PageBackground {
    css: string;
    hex: string;
    rgba: RgbaColor;
}

export function refreshReaderWordContrast(root: ParentNode = document): void {
    const words = readerWords(root);
    const activeWords: HTMLElement[] = [];
    const activeBackgrounds: PageBackground[] = [];
    const unknownBackgroundWords: HTMLElement[] = [];
    const neutralWords: HTMLElement[] = [];
    // pageBackgroundFor walks the word's ancestors calling getComputedStyle on
    // each — identical for every word under the same parent. Memoize per parent
    // for this pass so a paragraph of N words costs one ancestor walk, not N
    // (this was a dominant cost when hovering words in dense text).
    const backgroundByParent = new Map<Element, PageBackground | null>();
    const cachedPageBackgroundFor = (word: HTMLElement): PageBackground | null => {
        const parent = word.parentElement;
        if (!parent) return pageBackgroundFor(word);
        if (backgroundByParent.has(parent)) return backgroundByParent.get(parent) ?? null;
        const background = pageBackgroundFor(word);
        backgroundByParent.set(parent, background);
        return background;
    };

    for (const word of words) {
        const hasAnkiAccessibleColor = Boolean(word.dataset.ankiState && word.style.getPropertyValue('--jpdb-reader-word-accessible-color'));
        const hasInlineTextColor = Boolean(word.style.getPropertyValue('color'));
        if (word.dataset.ankiPreserveContrast === 'true' && hasAnkiAccessibleColor && !hasInlineTextColor) {
            delete word.dataset.ankiPreserveContrast;
            continue;
        }
        if (word.closest(YOMU_SURFACE_SELECTOR)) {
            neutralWords.push(word);
            continue;
        }
        if (isNeutralReaderWord(word)) {
            neutralWords.push(word);
            continue;
        }
        const isHovered = word.matches(':hover, :focus');
        if (hasAnkiAccessibleColor) {
            if (isHovered && !hasInlineTextColor) {
                scheduleHoverSettledContrastRefresh(word);
                continue;
            }
        }
        if (isHovered) {
            scheduleHoverSettledContrastRefresh(word);
        }
        const background = cachedPageBackgroundFor(word);
        if (!background) {
            if (hasAnkiAccessibleColor && !hasInlineTextColor) continue;
            unknownBackgroundWords.push(word);
            continue;
        }
        activeWords.push(word);
        activeBackgrounds.push(background);
    }

    const savedVars = activeWords.map(word => {
        const saved = RENDERED_WORD_CONTRAST_VARS.map(name => ({
            name,
            value: word.style.getPropertyValue(name),
            priority: word.style.getPropertyPriority(name),
        }));
        RENDERED_WORD_CONTRAST_VARS.forEach(name => word.style.removeProperty(name));
        return saved;
    });

    const measurements = activeWords.map((word) => {
        const style = getComputedStyle(word);
        const parentStyle = getComputedStyle(word.parentElement ?? word);
        const furi = word.querySelector<HTMLElement>('rt.jpdb-reader-furi');
        const furiStyle = furi ? getComputedStyle(furi) : null;

        return {
            bgColor: style.backgroundColor,
            color: style.color,
            decoration: style.textDecorationColor,
            parentColor: parentStyle.color,
            furiColor: furiStyle?.color,
        };
    });

    neutralWords.forEach(word => clearContrastVars(word));
    unknownBackgroundWords.forEach(word => applyUnknownBackgroundFallback(word));

    activeWords.forEach((word, i) => {
        savedVars[i].forEach(({ name, value, priority }) => {
            if (value) word.style.setProperty(name, value, priority);
        });
        applyWordContrastVars(word, activeBackgrounds[i], measurements[i]);
    });
}

type WordContrastMeasurement = {
    bgColor: string;
    color: string;
    decoration: string;
    parentColor: string;
    furiColor?: string;
};

function applyWordContrastVars(word: HTMLElement, background: PageBackground, m: WordContrastMeasurement): void {
    word.style.setProperty('--jpdb-reader-page-bg', background.css);
    word.style.setProperty('--jpdb-reader-highlight-backdrop', background.css);
    word.style.removeProperty('--jpdb-reader-word-contrast-shadow');

    const { accessibleHex, accessibleRgba } = resolveAccessibleHighlight(word, background, m.bgColor);

    const sourceText = cssColorToHex(m.color, accessibleRgba);
    const nativeText = cssColorToHex(m.parentColor, accessibleRgba) ?? bestTextColor(accessibleHex);
    const decoration = resolveDecorationHex(m.decoration, accessibleRgba);
    const furiText = m.furiColor ? cssColorToHex(m.furiColor, accessibleRgba) : null;

    word.style.setProperty('--jpdb-reader-word-highlight-text', readableOn(nativeText, accessibleHex, TEXT_CONTRAST));
    word.style.setProperty('--jpdb-reader-word-accessible-color', readableOn(sourceText ?? nativeText, accessibleHex, TEXT_CONTRAST));
    if (furiText) word.style.setProperty('--jpdb-reader-furi-accessible-color', readableOn(furiText, accessibleHex, TEXT_CONTRAST));
    else word.style.removeProperty('--jpdb-reader-furi-accessible-color');
    if (decoration) word.style.setProperty('--jpdb-reader-word-accessible-underline', readableOn(decoration, accessibleHex, DECORATION_CONTRAST));
    else word.style.removeProperty('--jpdb-reader-word-accessible-underline');
}

function resolveAccessibleHighlight(word: HTMLElement, background: PageBackground, wordBgColor: string): {
    accessibleHex: string;
    accessibleRgba: NonNullable<ReturnType<typeof cssColorToRgba>>;
} {
    const colorRgba = cssColorToRgba(wordBgColor);
    const hasPaint = Boolean(colorRgba && colorRgba.alpha > 0);
    const rgba = colorRgba && colorRgba.alpha > 0 ? blendRgba(colorRgba, background.rgba) : background.rgba;
    const paintBackgroundHex = rgbaToHex(rgba);

    let accessibleHighlightColor: string | null = null;
    if (hasPaint) {
        accessibleHighlightColor = readableHighlightBackground(paintBackgroundHex, background.hex);
        word.style.setProperty('--jpdb-reader-word-accessible-highlight', accessibleHighlightColor);
    } else {
        word.style.removeProperty('--jpdb-reader-word-accessible-highlight');
    }

    const accessibleRgba = accessibleHighlightColor ? (cssColorToRgba(accessibleHighlightColor) ?? rgba) : rgba;
    const accessibleHex = accessibleHighlightColor ? rgbaToHex(accessibleRgba) : paintBackgroundHex;
    return { accessibleHex, accessibleRgba };
}

function resolveDecorationHex(decorationColor: string, accessibleRgba: NonNullable<ReturnType<typeof cssColorToRgba>>): string | null {
    const decorationColorRgba = cssColorToRgba(decorationColor);
    return (decorationColorRgba && decorationColorRgba.alpha > 0)
        ? rgbaToHex(decorationColorRgba.alpha < 1 ? blendRgba(decorationColorRgba, accessibleRgba) : decorationColorRgba)
        : null;
}

export function refreshReaderWordContrastForWord(word: HTMLElement): void {
    refreshReaderWordContrast(word.parentElement ?? word);
}

function isNeutralReaderWord(word: HTMLElement): boolean {
    if (!word.classList.contains('jpdb-not-in-deck') && !word.classList.contains('anki-not-in-deck')) return false;
    return !Array.from(word.classList).some(className => COLORED_READER_WORD_CLASSES.has(className));
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
    RENDERED_WORD_CONTRAST_VARS_WITHOUT_SHADOW.forEach(name => word.style.removeProperty(name));
    word.style.setProperty('--jpdb-reader-word-contrast-shadow', PAGE_WORD_COLOR_TOKENS.unknownBackgroundShadow);
}

function clearContrastVars(word: HTMLElement): void {
    RENDERED_WORD_CONTRAST_VARS.forEach(name => word.style.removeProperty(name));
}
