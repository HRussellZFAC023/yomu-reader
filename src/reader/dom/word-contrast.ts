import { CORE_COLOR_TOKENS, PAGE_WORD_COLOR_TOKENS } from '../theme/color-tokens';
import { blendRgba, contrastRatio, cssColorToHex, cssColorToRgba, mixHex, readableOn, readableOnAll, rgbaToHex, type RgbaColor } from '../theme/color-utils';
import { RENDERED_WORD_CONTRAST_VARS, RENDERED_WORD_CONTRAST_VARS_WITHOUT_SHADOW } from './rendered-word-contrast-vars';

const PAGE_WORD_SELECTOR = '.jpdb-reader-word';
const YOMU_SURFACE_SELECTOR = '[data-jpdb-reader-root], .jpdb-ocr-layer, .jpdb-subtitle-player, .jpdb-subtitle-list, .asbplayer-subtitles-container-bottom, .asbplayer-offscreen';
const TEXT_CONTRAST = 4.5;
const DECORATION_CONTRAST = 3;
const HIGHLIGHT_CONTRAST = 1.45;
const TRANSPARENT_DARK_PAGE_FALLBACK = '#181b20';
const PASSIVE_CHROME_SELECTOR = 'button, [role="button"], [role="tab"], summary, label, .jpdb-reader-control-text-mirror, [data-jpdb-reader-passive-chrome="true"]';
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
        const background = cachedPageBackgroundFor(word);
        if (!background) {
            if (hasAnkiAccessibleColor && !hasInlineTextColor) continue;
            unknownBackgroundWords.push(word);
            continue;
        }
        const isHovered = word.matches(':hover, :focus');
        if (hasAnkiAccessibleColor && isHovered && !hasInlineTextColor && existingAccessibleColorRemainsReadableOnHover(word, background)) {
            scheduleHoverSettledContrastRefresh(word);
            continue;
        }
        if (isHovered) {
            scheduleHoverSettledContrastRefresh(word);
        }
        activeWords.push(word);
        activeBackgrounds.push(background);
    }

    const savedVars = activeWords.map((word, i) => {
        const saved = RENDERED_WORD_CONTRAST_VARS.map(name => ({
            name,
            value: word.style.getPropertyValue(name),
            priority: word.style.getPropertyPriority(name),
        }));
        RENDERED_WORD_CONTRAST_VARS.forEach(name => word.style.removeProperty(name));
        word.style.setProperty('--jpdb-reader-highlight-backdrop', activeBackgrounds[i].css);
        return saved;
    });

    const measurements = activeWords.map((word) => {
        const style = getComputedStyle(word);
        const parentStyle = getComputedStyle(word.parentElement ?? word);
        const furi = word.querySelector<HTMLElement>('rt.jpdb-reader-furi');
        const furiStyle = furi ? getComputedStyle(furi) : null;

        return {
            bg: style.backgroundColor,
            hl: style.getPropertyValue('--jpdb-reader-word-highlight-source'),
            fg: style.color,
            deco: measuredWordDecorationColor(style),
            parentFg: parentStyle.color,
            furiFg: furiStyle?.color,
            hover: style.getPropertyValue('--jpdb-reader-hover'),
            hovered: word.matches(':hover, :focus'),
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
    bg: string;
    hl: string;
    fg: string;
    deco: string;
    parentFg: string;
    furiFg?: string;
    hover: string;
    hovered: boolean;
};

function measuredWordDecorationColor(style: CSSStyleDeclaration): string {
    const underline = style.getPropertyValue('--jpdb-reader-word-underline').trim();
    if (underline && !underline.includes('var(')) return underline;
    const source = style.getPropertyValue('--jpdb-reader-word-decoration-source').trim();
    return source || underline || style.textDecorationColor;
}

function applyWordContrastVars(word: HTMLElement, background: PageBackground, m: WordContrastMeasurement): void {
    word.style.setProperty('--jpdb-reader-page-bg', background.css);
    word.style.setProperty('--jpdb-reader-highlight-backdrop', background.css);
    word.style.removeProperty('--jpdb-reader-word-contrast-shadow');

    const passiveWord = word.classList.contains('jpdb-reader-passive-word');
    const preserveHostPaint = isPassiveChromeWord(word);
    const accessibleRgba = resolveHighlight(word, background, m.bg, m.hl, preserveHostPaint);
    const accessibleHex = rgbaToHex(accessibleRgba);

    // Compact passive chrome keeps the host's own paint/tint, so its label text
    // sits on the host background, not on a preserved highlight tint. Passive
    // prose/links still keep Yomu highlights and must contrast against them.
    const textBackdropHex = preserveHostPaint ? background.hex : accessibleHex;

    const sourceText = cssColorToHex(m.fg, accessibleRgba);
    const nativeText = cssColorToHex(m.parentFg, accessibleRgba) ?? bestTextColor(textBackdropHex);
    const decoration = resolveDecorationHex(word, m.deco, accessibleRgba);
    const furiText = m.furiFg ? cssColorToHex(m.furiFg, accessibleRgba) : null;
    const textSource = passiveWord ? nativeText : (sourceText ?? nativeText);
    const textBackgrounds = preserveHostPaint ? [background.hex] : textBackdropsForMeasurement(m, textBackdropHex);
    const furiBackgrounds = [background.hex];

    word.style.setProperty('--jpdb-reader-word-highlight-text', readableOnAll(nativeText, textBackgrounds, TEXT_CONTRAST));
    word.style.setProperty('--jpdb-reader-word-accessible-color', readableOnAll(textSource, textBackgrounds, TEXT_CONTRAST));
    if (furiText) word.style.setProperty('--jpdb-reader-furi-accessible-color', readableOnAll(furiText, furiBackgrounds, TEXT_CONTRAST));
    else word.style.removeProperty('--jpdb-reader-furi-accessible-color');
    if (decoration) word.style.setProperty('--jpdb-reader-word-accessible-underline', readableOn(decoration, accessibleHex, DECORATION_CONTRAST));
    else word.style.removeProperty('--jpdb-reader-word-accessible-underline');
}

function isPassiveChromeWord(word: HTMLElement): boolean {
    return word.classList.contains('jpdb-reader-passive-word') && Boolean(word.closest(PASSIVE_CHROME_SELECTOR));
}

function uniqueHexes(colors: string[]): string[] {
    return [...new Set(colors)];
}

function textBackdropsForMeasurement(m: WordContrastMeasurement, textBackdropHex: string): string[] {
    const hoverBackdrop = hoveredTextBackdropHex(m.hover, textBackdropHex, m.hovered);
    return uniqueHexes(hoverBackdrop ? [textBackdropHex, hoverBackdrop] : [textBackdropHex]);
}

function existingAccessibleColorRemainsReadableOnHover(word: HTMLElement, background: PageBackground): boolean {
    const existingText = cssColorToHex(word.style.getPropertyValue('--jpdb-reader-word-accessible-color'), background.rgba);
    if (!existingText) return false;
    const existingHighlight = cssColorToHex(word.style.getPropertyValue('--jpdb-reader-word-accessible-highlight'), background.rgba);
    const baseBackdrop = existingHighlight ?? background.hex;
    const hoverBackdrop = hoveredTextBackdropHex(getComputedStyle(word).getPropertyValue('--jpdb-reader-hover'), baseBackdrop, true);
    return uniqueHexes(hoverBackdrop ? [baseBackdrop, hoverBackdrop] : [baseBackdrop])
        .every(backdrop => contrastRatio(existingText, backdrop) >= TEXT_CONTRAST);
}

function hoveredTextBackdropHex(hoverColor: string, textBackdropHex: string, hovered: boolean): string | null {
    if (!hovered) return null;
    const hover = cssColorToRgba(hoverColor);
    const backdrop = cssColorToRgba(textBackdropHex);
    if (!hover || !backdrop || hover.alpha <= 0) return null;
    return rgbaToHex(blendRgba(hover, backdrop));
}

function resolveHighlight(
    word: HTMLElement,
    background: PageBackground,
    wordBgColor: string,
    highlight: string,
    preserveHostPaint = false,
): NonNullable<ReturnType<typeof cssColorToRgba>> {
    const colorRgba = cssColorToRgba(wordBgColor);
    const hasPaint = !!colorRgba?.alpha;
    const highlightRgba = hasPaint || preserveHostPaint ? null : paintRgba(highlight, word);
    const rgba = hasPaint
        ? blendRgba(colorRgba!, background.rgba)
        : highlightRgba && highlightRgba.alpha > 0 ? blendRgba(highlightRgba, background.rgba) : background.rgba;

    if (hasPaint && !preserveHostPaint) {
        const highlightHex = readableHighlightBackground(rgbaToHex(rgba), background.hex);
        word.style.setProperty('--jpdb-reader-word-accessible-highlight', highlightHex);
        return cssColorToRgba(highlightHex) ?? rgba;
    }

    word.style.removeProperty('--jpdb-reader-word-accessible-highlight');
    return rgba;
}

function paintRgba(value: string, el: HTMLElement): RgbaColor | null {
    const direct = cssColorToRgba(value);
    if (direct) return direct;
    const probe = el.appendChild(document.createElement('span'));
    probe.style.color = value;
    const rgba = cssColorToRgba(getComputedStyle(probe).color);
    probe.remove();
    return rgba;
}

function resolveDecorationHex(word: HTMLElement, decorationColor: string, accessibleRgba: NonNullable<ReturnType<typeof cssColorToRgba>>): string | null {
    const decorationColorRgba = cssColorToRgba(decorationColor) ?? paintRgba(decorationColor, word);
    return (decorationColorRgba && decorationColorRgba.alpha > 0)
        ? rgbaToHex(decorationColorRgba.alpha < 1 ? blendRgba(decorationColorRgba, accessibleRgba) : decorationColorRgba)
        : null;
}

export function refreshReaderWordContrastForWord(word: HTMLElement): void {
    refreshReaderWordContrast(word.parentElement ?? word);
}

// Batch variant for enrichment passes: refresh each touched line once instead
// of the whole root. Contrast measurement forces style/layout per word, so
// whole-root refreshes after every subtitle cue made large transcripts jank.
export function refreshContrastForChangedWords(words: Iterable<HTMLElement>): void {
    const lines = new Set<ParentNode>();
    for (const word of words) {
        if (word.isConnected) lines.add(word.parentElement ?? word);
    }
    lines.forEach(line => refreshReaderWordContrast(line));
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
    let unknownBase = false;
    let rgba: RgbaColor = { red: 255, green: 255, blue: 255, alpha: 1 };
    for (const element of ancestors.reverse()) {
        const style = getComputedStyle(element);
        hasImageBackdrop ||= Boolean(style.backgroundImage && style.backgroundImage !== 'none');
        const color = cssColorToRgba(style.backgroundColor);
        if (!color) {
            // A painted layer we cannot parse: everything blended so far may
            // sit on a surface of unknown darkness. Never let the white seed
            // stand in for it — that painted dark-on-dark "redaction bars" on
            // Discord dark themes whose colors used unhandled formats.
            unknownBase = true;
            continue;
        }
        if (color.alpha <= 0) continue;
        if (color.alpha >= 1) unknownBase = false;
        rgba = blendRgba(color, rgba);
        found = true;
    }
    if (unknownBase || !found) {
        if (hasImageBackdrop) return null;
        return inferredTransparentPageBackground(word);
    }
    return pageBackgroundFromRgba(rgba);
}

function inferredTransparentPageBackground(word: HTMLElement): PageBackground {
    const style = getComputedStyle(word.parentElement ?? word);
    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    const colorScheme = `${style.colorScheme} ${rootStyle.colorScheme} ${bodyStyle.colorScheme}`.toLowerCase();
    if (colorScheme.includes('dark')) return pageBackgroundFromCss(TRANSPARENT_DARK_PAGE_FALLBACK);
    // The word's own context colour first: a dark embedded shell on a light
    // page has light LOCAL text while body/root still read as a light theme.
    const pageTextColors = [style.color, bodyStyle.color, rootStyle.color]
        .map(color => cssColorToHex(color))
        .filter((color): color is string => Boolean(color));
    if (pageTextColors.some(color => contrastRatio(color, CORE_COLOR_TOKENS.black) > contrastRatio(color, CORE_COLOR_TOKENS.white))) {
        return pageBackgroundFromCss(TRANSPARENT_DARK_PAGE_FALLBACK);
    }
    return pageBackgroundFromCss(CORE_COLOR_TOKENS.white);
}

function pageBackgroundFromCss(color: string): PageBackground {
    return pageBackgroundFromRgba(cssColorToRgba(color) ?? { red: 255, green: 255, blue: 255, alpha: 1 });
}

function pageBackgroundFromRgba(rgba: RgbaColor): PageBackground {
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
