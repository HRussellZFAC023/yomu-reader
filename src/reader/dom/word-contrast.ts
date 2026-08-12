import { CORE_COLOR_TOKENS, PAGE_WORD_COLOR_TOKENS } from '../theme/color-tokens';
import { blendRgba, contrastRatio, cssColorToHex, cssColorToRgba, mixHex, readableOn, readableOnAll, rgbaToHex, type RgbaColor } from '../theme/color-utils';
import { probePageBackground, type PageBackground, type ProbedPageBackground } from './page-background';
import { RENDERED_WORD_CONTRAST_VARS, RENDERED_WORD_CONTRAST_VARS_WITHOUT_SHADOW } from './rendered-word-contrast-vars';
import { renderedWordHasAnkiState } from './rendered-word-state';

const PAGE_WORD_SELECTOR = '.jpdb-reader-word';
const YOMU_SURFACE_SELECTOR = '[data-jpdb-reader-root], .jpdb-ocr-layer, .jpdb-subtitle-player, .jpdb-subtitle-list, .asbplayer-subtitles-container-bottom, .asbplayer-offscreen';
const TEXT_CONTRAST = 4.5;
const DECORATION_CONTRAST = 3;
const HIGHLIGHT_CONTRAST = 1.45;
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
// A word can need no derived colours and still paint a highlight: the CSS mixes
// every status wash against the sampled backdrop, so that one var has to
// survive the clear even for words we otherwise leave alone.
const NEUTRAL_CLEARED_CONTRAST_VARS = RENDERED_WORD_CONTRAST_VARS.filter(
    name => name !== '--jpdb-reader-highlight-backdrop',
);
const pendingHoverContrastRefresh = new WeakSet<HTMLElement>();
const appliedContrastState = new WeakMap<HTMLElement, {
    background: string;
    className: string;
    cssText: string;
    hovered: boolean;
    parentColor: string;
}>();

export function refreshReaderWordContrast(root: ParentNode = document): void {
    const plan = readerWordContrastPlan(readerWords(root));
    const savedVars = temporarilyClearActiveContrastVars(plan);
    const measurements = measureActiveReaderWords(plan.activeWords);
    applyReaderWordContrastPlan(plan, savedVars, measurements);
}

type SavedContrastVar = { name: string; value: string; priority: string };

interface ReaderWordContrastPlan {
    activeWords: HTMLElement[];
    activeBackgrounds: PageBackground[];
    unknownBackgroundWords: HTMLElement[];
    unknownBackgrounds: PageBackground[];
    neutralWords: HTMLElement[];
    neutralPageWords: HTMLElement[];
    neutralPageBackgrounds: PageBackground[];
}

function readerWordContrastPlan(words: HTMLElement[]): ReaderWordContrastPlan {
    const plan: ReaderWordContrastPlan = {
        activeWords: [],
        activeBackgrounds: [],
        unknownBackgroundWords: [],
        unknownBackgrounds: [],
        neutralWords: [],
        neutralPageWords: [],
        neutralPageBackgrounds: [],
    };
    // probePageBackground walks the word's ancestors calling getComputedStyle on
    // each — identical for every word under the same parent. Memoize per parent
    // for this pass so a paragraph of N words costs one ancestor walk, not N
    // (this was a dominant cost when hovering words in dense text). Scoped to
    // this pass only: a background that changes between passes must recompute.
    const backgroundByParent = new Map<Element, ProbedPageBackground>();
    const cachedPageBackgroundFor = (word: HTMLElement): ProbedPageBackground => {
        const parent = word.parentElement;
        if (!parent) return probePageBackground(word);
        const cached = backgroundByParent.get(parent);
        if (cached) return cached;
        const probed = probePageBackground(word);
        backgroundByParent.set(parent, probed);
        return probed;
    };
    words.forEach(word => classifyReaderWordContrast(plan, word, cachedPageBackgroundFor));
    return plan;
}

type ReaderWordContrastSurface = 'reader' | 'neutral-page' | 'active-page';

function classifyReaderWordContrast(
    plan: ReaderWordContrastPlan,
    word: HTMLElement,
    pageBackgroundFor: (word: HTMLElement) => ProbedPageBackground,
): void {
    const hasAccessibleColor = hasAnkiAccessibleWordColor(word);
    const hasInlineTextColor = Boolean(word.style.getPropertyValue('color'));
    if (preserveExistingAnkiContrast(word, hasAccessibleColor, hasInlineTextColor)) return;
    const handlers: Record<ReaderWordContrastSurface, () => void> = {
        reader: () => plan.neutralWords.push(word),
        'neutral-page': () => addNeutralPageWord(plan, word, pageBackgroundFor(word).background),
        'active-page': () => addActivePageWord(plan, word, pageBackgroundFor(word), hasAccessibleColor, hasInlineTextColor),
    };
    handlers[readerWordContrastSurface(word)]();
}

function hasAnkiAccessibleWordColor(word: HTMLElement): boolean {
    return [
        renderedWordHasAnkiState(word),
        Boolean(word.style.getPropertyValue('--jpdb-reader-word-accessible-color')),
    ].every(Boolean);
}

function preserveExistingAnkiContrast(word: HTMLElement, hasAccessibleColor: boolean, hasInlineTextColor: boolean): boolean {
    const preserve = [
        word.dataset.ankiPreserveContrast === 'true',
        hasAccessibleColor,
        !hasInlineTextColor,
    ].every(Boolean);
    if (preserve) delete word.dataset.ankiPreserveContrast;
    return preserve;
}

function readerWordContrastSurface(word: HTMLElement): ReaderWordContrastSurface {
    return [
        [Boolean(word.closest(YOMU_SURFACE_SELECTOR)), 'reader'],
        [isNeutralReaderWord(word), 'neutral-page'],
        [true, 'active-page'],
    ].find(([matches]) => matches)?.[1] as ReaderWordContrastSurface;
}

function addNeutralPageWord(plan: ReaderWordContrastPlan, word: HTMLElement, background: PageBackground): void {
    // Neutral only means "derives no colours of its own"; the status wash is
    // still painted, so sample the same backdrop as coloured neighbours.
    plan.neutralPageWords.push(word);
    plan.neutralPageBackgrounds.push(background);
}

function addActivePageWord(
    plan: ReaderWordContrastPlan,
    word: HTMLElement,
    probed: ProbedPageBackground,
    hasAccessibleColor: boolean,
    hasInlineTextColor: boolean,
): void {
    if (probed.imageBackdrop) {
        addUnknownBackgroundWord(plan, word, probed.background, hasAccessibleColor, hasInlineTextColor);
        return;
    }
    addMeasuredActiveWord(plan, word, probed.background, hasAccessibleColor, hasInlineTextColor);
}

function addUnknownBackgroundWord(
    plan: ReaderWordContrastPlan,
    word: HTMLElement,
    background: PageBackground,
    hasAccessibleColor: boolean,
    hasInlineTextColor: boolean,
): void {
    if ([hasAccessibleColor, !hasInlineTextColor].every(Boolean)) return;
    plan.unknownBackgroundWords.push(word);
    plan.unknownBackgrounds.push(background);
}

function addMeasuredActiveWord(
    plan: ReaderWordContrastPlan,
    word: HTMLElement,
    background: PageBackground,
    hasAccessibleColor: boolean,
    hasInlineTextColor: boolean,
): void {
    const hovered = word.matches(':hover, :focus');
    scheduleHoveredWordRefresh(word, hovered);
    const parentColor = getComputedStyle(word.parentElement ?? word).color;
    if (readerWordContrastStateUnchanged(word, background, hovered, parentColor)) return;
    if (shouldPreserveAccessibleHoverColor(word, background, hasAccessibleColor, hasInlineTextColor, hovered)) return;
    plan.activeWords.push(word);
    plan.activeBackgrounds.push(background);
}

// Hover colours are derived against the hover overlay, and the settled poll is
// the only thing that notices the pointer leaving. Keep it alive on every pass.
function scheduleHoveredWordRefresh(word: HTMLElement, hovered: boolean): void {
    if (hovered) scheduleHoverSettledContrastRefresh(word);
}

function readerWordContrastStateUnchanged(
    word: HTMLElement,
    background: PageBackground,
    hovered: boolean,
    parentColor: string,
): boolean {
    const previous = appliedContrastState.get(word);
    if (!previous) return false;
    return [
        previous.background === background.css,
        previous.className === word.className,
        previous.cssText === word.style.cssText,
        previous.hovered === hovered,
        previous.parentColor === parentColor,
    ].every(Boolean);
}

function shouldPreserveAccessibleHoverColor(
    word: HTMLElement,
    background: PageBackground,
    hasAccessibleColor: boolean,
    hasInlineTextColor: boolean,
    hovered: boolean,
): boolean {
    const eligible = [
        hasAccessibleColor,
        hovered,
        !hasInlineTextColor,
    ].every(Boolean);
    if (!eligible) return false;
    return existingAccessibleColorRemainsReadableOnHover(word, background);
}

function temporarilyClearActiveContrastVars(plan: ReaderWordContrastPlan): SavedContrastVar[][] {
    return plan.activeWords.map((word, index) => {
        const saved = RENDERED_WORD_CONTRAST_VARS.map(name => ({
            name,
            value: word.style.getPropertyValue(name),
            priority: word.style.getPropertyPriority(name),
        }));
        RENDERED_WORD_CONTRAST_VARS.forEach(name => word.style.removeProperty(name));
        word.style.setProperty('--jpdb-reader-highlight-backdrop', plan.activeBackgrounds[index].css);
        return saved;
    });
}

function measureActiveReaderWords(words: HTMLElement[]): WordContrastMeasurement[] {
    return words.map((word) => {
        const style = getComputedStyle(word);
        const parentStyle = getComputedStyle(word.parentElement ?? word);
        return {
            bg: style.backgroundColor,
            hl: style.getPropertyValue('--jpdb-reader-word-highlight-source'),
            fg: style.color,
            deco: measuredWordDecorationColor(style),
            parentFg: parentStyle.color,
            hover: style.getPropertyValue('--jpdb-reader-hover'),
            hovered: word.matches(':hover, :focus'),
        };
    });
}

function applyReaderWordContrastPlan(
    plan: ReaderWordContrastPlan,
    savedVars: SavedContrastVar[][],
    measurements: WordContrastMeasurement[],
): void {
    plan.neutralWords.forEach(word => clearContrastVars(word));
    plan.neutralPageWords.forEach((word, index) => applyNeutralPageBackdrop(word, plan.neutralPageBackgrounds[index]));
    plan.unknownBackgroundWords.forEach((word, index) => applyUnknownBackgroundFallback(word, plan.unknownBackgrounds[index]));
    plan.activeWords.forEach((word, index) => {
        savedVars[index].forEach(({ name, value, priority }) => {
            if (value) word.style.setProperty(name, value, priority);
        });
        applyWordContrastVars(word, plan.activeBackgrounds[index], measurements[index]);
        appliedContrastState.set(word, {
            background: plan.activeBackgrounds[index].css,
            className: word.className,
            cssText: word.style.cssText,
            hovered: measurements[index].hovered,
            parentColor: measurements[index].parentFg,
        });
    });
}

type WordContrastMeasurement = {
    bg: string;
    hl: string;
    fg: string;
    deco: string;
    parentFg: string;
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

    const preserveHostPaint = isPassiveChromeWord(word);
    const accessibleRgba = resolveHighlight(word, background, m.bg, m.hl, preserveHostPaint);
    const accessibleHex = rgbaToHex(accessibleRgba);

    // Control surfaces keep their authored background; enabled word colours
    // still apply and must contrast with that surface.
    const textBackdropHex = preserveHostPaint ? background.hex : accessibleHex;

    const sourceText = cssColorToHex(m.fg, accessibleRgba);
    const nativeText = cssColorToHex(m.parentFg, accessibleRgba) ?? bestTextColor(textBackdropHex);
    const decoration = resolveDecorationHex(word, m.deco, accessibleRgba);
    const textSource = sourceText ?? nativeText;
    const textBackgrounds = preserveHostPaint ? [background.hex] : textBackdropsForMeasurement(m, textBackdropHex);

    word.style.setProperty('--jpdb-reader-word-highlight-text', readableOnAll(nativeText, textBackgrounds, TEXT_CONTRAST));
    word.style.setProperty('--jpdb-reader-word-accessible-color', readableOnAll(textSource, textBackgrounds, TEXT_CONTRAST));
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

function applyUnknownBackgroundFallback(word: HTMLElement, background: PageBackground): void {
    RENDERED_WORD_CONTRAST_VARS_WITHOUT_SHADOW.forEach(name => word.style.removeProperty(name));
    // Text and underline colours derived over an image would be guesses, so the
    // shadow carries readability instead — but the status wash still mixes
    // against the backdrop var. Leaving it unset handed that mix to the
    // stylesheet default, which prefers-color-scheme picks: a reader whose
    // device was in dark mode got dark saturated blocks on a white page.
    word.style.setProperty('--jpdb-reader-highlight-backdrop', background.css);
    word.style.setProperty('--jpdb-reader-word-contrast-shadow', PAGE_WORD_COLOR_TOKENS.unknownBackgroundShadow);
}

function applyNeutralPageBackdrop(word: HTMLElement, background: PageBackground): void {
    NEUTRAL_CLEARED_CONTRAST_VARS.forEach(name => word.style.removeProperty(name));
    if (word.style.getPropertyValue('--jpdb-reader-highlight-backdrop') === background.css) return;
    word.style.setProperty('--jpdb-reader-highlight-backdrop', background.css);
}

function clearContrastVars(word: HTMLElement): void {
    RENDERED_WORD_CONTRAST_VARS.forEach(name => word.style.removeProperty(name));
}
