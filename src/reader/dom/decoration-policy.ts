// DecorationPolicy — the single owner of the "how may this element be
// decorated?" decision. Classification is DETERMINISTIC: explicit DOM facts
// (tag, role, contenteditable, disabled, interactive ancestry, named site
// roots) plus pure functions of current geometry where clipping makes
// measurement unavoidable. Same input → same output; no accumulating state.
//
// The four states (sealed on the scan target at collect time, stamped on the
// host as data-yomu-decoration, consumed by render / CSS / ruby-room):
//   prose-full          long-form prose: inline ruby, ruby-room growth allowed
//   content-ruby        non-prose content (titles, metadata, comments,
//                       transcript, named content chips): inline ruby + growth
//   interactive-passive interactive controls: colour + pitch underline ONLY at
//                       rest — no in-flow <ruby>, no line-height change, no
//                       ruby-room growth; readings via the hover/long-press
//                       word popover
//   skip                editable/composing contexts: never decorated
import { CORE_COLOR_TOKENS } from '../theme/color-tokens';
import { HAS_JAPANESE, READER_ROOT_SELECTOR } from './constants';

export type DecorationState = 'prose-full' | 'content-ruby' | 'interactive-passive' | 'skip';

export const DECORATION_STATE_ATTRIBUTE = 'data-yomu-decoration';

// ---------------------------------------------------------------------------
// Shared small helpers (also consumed by dom/index.ts)
// ---------------------------------------------------------------------------

export const selectorPairs = (names: string, attributes = ['class', 'id']): string => names.split(',').flatMap(name => attributes.map(attribute => `[${attribute}*="${name}" i]`)).join(',');
export const roleSelectors = (names: string): string => names.split(',').map(name => `[role="${name}"]`).join(',');

export function safeElementMatches(element: HTMLElement, selector: string): boolean {
    try {
        return element.matches(selector);
    } catch {
        return false;
    }
}

export function safeQuerySelector(root: HTMLElement, selector: string): Element | null {
    try {
        return root.querySelector(selector);
    } catch {
        return null;
    }
}

export function safeComputedStyle(element: HTMLElement): CSSStyleDeclaration {
    try {
        return getComputedStyle(element);
    } catch {
        return element.style;
    }
}

function safePseudoContent(element: HTMLElement, pseudo: '::before' | '::after'): string {
    try {
        return getComputedStyle(element, pseudo).content;
    } catch {
        return '';
    }
}

export function compactLength(value: string): number {
    return Array.from(value.replace(/\s+/g, '')).length;
}

export function cssPixels(value: string): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function elementClassName(element: HTMLElement): string {
    return String(element.className || '');
}

// ---------------------------------------------------------------------------
// Style facts (pure predicates over a computed style)
// ---------------------------------------------------------------------------

export function hasLineClamp(style: CSSStyleDeclaration): boolean {
    const clamp = style.getPropertyValue('-webkit-line-clamp').trim();
    return Boolean(clamp && clamp !== 'none' && clamp !== '0');
}

// A clipped single-line ellipsis row (m.youtube titles, channel bylines) is
// sized for exactly one plain text line: ruby makes the line taller, the clip
// swallows the base text, and the row shows only furigana. Height is no
// exemption here — the row grows with whatever the line box becomes.
export function isEllipsisTextRow(style: CSSStyleDeclaration): boolean {
    if (!clipsOverflow(style) || !style.textOverflow.includes('ellipsis')) return false;
    return style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre' || style.display === '-webkit-box';
}

export function clipsOverflow(style: CSSStyleDeclaration): boolean {
    return style.overflow === 'hidden'
        || style.overflow === 'clip'
        || style.overflowY === 'hidden'
        || style.overflowY === 'clip';
}

export function hasDefiniteCssSize(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return Boolean(normalized
        && normalized !== 'auto'
        && normalized !== 'none'
        && normalized !== 'normal'
        && normalized !== 'initial'
        && normalized !== 'inherit'
        && normalized !== 'unset');
}

export function hasClippedTextConstraint(style: CSSStyleDeclaration): boolean {
    if (!clipsOverflow(style)) return false;
    return hasDefiniteCssSize(style.height)
        || hasDefiniteCssSize(style.maxHeight)
        || style.display === '-webkit-box';
}

export function isPositionedTextOverlay(style: CSSStyleDeclaration): boolean {
    return (style.position === 'absolute' || style.position === 'fixed')
        && (hasDefiniteCssSize(style.height) || hasDefiniteCssSize(style.maxHeight))
        && (hasDefiniteCssSize(style.width) || hasDefiniteCssSize(style.maxWidth));
}

export function isVerticalWritingMode(writingMode: string): boolean {
    return writingMode.startsWith('vertical-') || writingMode.startsWith('sideways-');
}

// ---------------------------------------------------------------------------
// The ONE shared constrained-row style probe. All constrained-row consumers
// (mirror routing, in-place ruby suppression, ruby-room clip capability) read
// these memoized per-element facts instead of keeping their own memo caches.
// Verdicts are memoized per element for a short window: this runs for every
// scan target between DOM writes, and an unmemoized ancestor walk
// (getComputedStyle × 5 + a rect read) forces one synchronous reflow per
// target — seconds of jank per pass on an iPhone.
// ---------------------------------------------------------------------------

export const CONSTRAINED_ROW_VERDICT_TTL_MS = 250;
const CONSTRAINED_ROW_MAX_HEIGHT_PX = 96;

interface ConstrainedRowStyleFacts {
    clamped: boolean;
    ellipsisRow: boolean;
    clippedConstraint: boolean;
    // overflow clip + a measured height of at most ~3 text lines: a fixed
    // chrome row that cannot absorb a taller ruby line box.
    clippedShortRow: boolean;
}

const constrainedRowStyleFactMemo = new WeakMap<HTMLElement, { at: number; facts: ConstrainedRowStyleFacts }>();

export function constrainedRowStyleFacts(element: HTMLElement): ConstrainedRowStyleFacts {
    const now = Date.now();
    const memo = constrainedRowStyleFactMemo.get(element);
    if (memo && now - memo.at < CONSTRAINED_ROW_VERDICT_TTL_MS) return memo.facts;
    const style = safeComputedStyle(element);
    const clamped = hasLineClamp(style);
    const ellipsisRow = isEllipsisTextRow(style);
    const clips = clipsOverflow(style);
    let clippedShortRow = false;
    if (clips && !clamped && !ellipsisRow) {
        const height = element.getBoundingClientRect().height;
        clippedShortRow = height > 0 && height <= CONSTRAINED_ROW_MAX_HEIGHT_PX;
    }
    const facts: ConstrainedRowStyleFacts = {
        clamped,
        ellipsisRow,
        clippedConstraint: hasClippedTextConstraint(style),
        clippedShortRow,
    };
    constrainedRowStyleFactMemo.set(element, { at: now, facts });
    return facts;
}

// The clip-constrained-row fact (class Q): within 5 ancestors an element with
// line-clamp, a single-line ellipsis clip, or an overflow clip at fixed short
// height. Applied UNCONDITIONALLY on every engine — rt paints into the
// half-leading and ancestor overflow clips shave it mid-glyph on healthy
// engines too, so this fact (not an engine probe) decides protection.
export function isInsideRubyFragileConstrainedRow(element: HTMLElement): boolean {
    return closestRubyFragileConstrainedRow(element) !== null;
}

export function closestRubyFragileConstrainedRow(element: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = element;
    for (let depth = 0; current && depth < 5; depth += 1) {
        const facts = constrainedRowStyleFacts(current);
        if (facts.clamped || facts.ellipsisRow || facts.clippedShortRow) return current;
        current = current.parentElement;
    }
    return null;
}

// The style-only clip-capability fact used by ruby-room's ancestor walk.
export function boxStyleIsClipCapable(box: HTMLElement): boolean {
    const facts = constrainedRowStyleFacts(box);
    return facts.clamped || facts.ellipsisRow || facts.clippedConstraint;
}

// The mirror replaces the HOST's rendering (visibility:hidden), so routing a
// constrained row through it is only safe when the host paints nothing of its
// own: a pill chip's background/border, a nav row's chevron SVG, or a ::before
// separator would all vanish with the host. Styled hosts keep in-place
// rendering (ruby suppression handles the clip) instead of losing their box.
const MIRROR_BARE_DESCENDANT_LIMIT = 16;

export function hostIsVisuallyBareForMirror(host: HTMLElement): boolean {
    if (host.querySelector('svg,img,picture,canvas,video,audio,iframe,input,select,textarea,button,hr')) return false;
    if (!elementHasNoOwnPaint(host)) return false;
    // Descendants can paint too (an icon drawn via background-image or a
    // ::before glyph on an inner span): hiding the host would erase it while
    // the mirror recreates only text. Check a bounded number of descendants;
    // a bigger subtree is not a bare text row — refuse the mirror.
    const descendants = host.querySelectorAll<HTMLElement>('*');
    if (descendants.length > MIRROR_BARE_DESCENDANT_LIMIT) return false;
    for (const descendant of Array.from(descendants)) {
        if (descendant.closest('.jpdb-reader-text-mirror')) continue;
        if (!elementHasNoOwnPaint(descendant)) return false;
    }
    return true;
}

function elementHasNoOwnPaint(element: HTMLElement): boolean {
    const style = safeComputedStyle(element);
    if (style.backgroundImage !== 'none' && style.backgroundImage !== '') return false;
    const background = style.backgroundColor;
    if (background && background !== 'transparent' && !/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/.test(background)) return false;
    if ((style.backgroundClip || '').includes('text') || (style.webkitBackgroundClip || '').includes('text')) return false;
    if (style.boxShadow && style.boxShadow !== 'none') return false;
    if (borderPaints(style)) return false;
    for (const pseudo of ['::before', '::after'] as const) {
        const content = safePseudoContent(element, pseudo);
        if (content && content !== 'none' && content !== 'normal' && content !== '""' && content !== "''") return false;
    }
    return true;
}

function borderPaints(style: CSSStyleDeclaration): boolean {
    return ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']
        .some(property => Number.parseFloat(style[property as 'borderTopWidth'] || '0') > 0);
}

// ---------------------------------------------------------------------------
// Prose / conversation context facts
// ---------------------------------------------------------------------------

const PROSE_TAGS = ',P,LI,DD,DT,TD,TH,BLOCKQUOTE,FIGCAPTION,';
const PROSE_CLASS_RE = /(^|[-_\s])(body|content|copy|description|lead|paragraph|prose|text|txt)([-_\s]|$)/i;
const CONVERSATION_TEXT_CLASS_RE = /(^|\s)(chat|comment|message|post|reply)(?:[-_\s]*(body|bubble|content|copy|message|text|txt))?(?:_[a-z0-9]+)?(?=$|\s)/i;
export const READABLE_PROSE_CONTAINER_SELECTOR = 'article,main,[role=main],[role=article]';
export const UI_CLASS_RE = /(^|[-_\s])(audio|badge|chip|control|icon|label|play|required|sound|speaker|tab|tag)([-_\s]|$)/i;

export function isLikelyProseElement(element: HTMLElement): boolean {
    if (PROSE_TAGS.includes(`,${element.tagName},`)) return true;
    return isLikelyProseClass(element) || isConversationTextClass(element);
}

export function isReadableProseContext(element: HTMLElement): boolean {
    let current: HTMLElement | null = element;
    while (current && current !== document.body && current !== document.documentElement) {
        if (isLikelyProseElement(current) && current.closest(READABLE_PROSE_CONTAINER_SELECTOR)) return true;
        if (isConversationTextClass(current)) return true;
        current = current.parentElement;
    }
    return false;
}

function isLikelyProseClass(element: HTMLElement): boolean {
    return PROSE_CLASS_RE.test(elementClassName(element));
}

export function isConversationTextClass(element: HTMLElement): boolean {
    return CONVERSATION_TEXT_CLASS_RE.test(elementClassName(element));
}

export function isLikelyProseLink(link: HTMLElement, element: HTMLElement): boolean {
    return Boolean(link.closest('article, main, [role="main"]') && isLikelyProseElement(element));
}

// Long-form prose proper: a prose element within an article/main container.
// Conversation surfaces (comments, chat) classify content-ruby instead — the
// decoration channels are identical, but they are content, not body prose.
function isProseFullContext(element: HTMLElement): boolean {
    let current: HTMLElement | null = element;
    while (current && current !== document.body && current !== document.documentElement) {
        if (isLikelyProseElement(current) && current.closest(READABLE_PROSE_CONTAINER_SELECTOR)) return true;
        current = current.parentElement;
    }
    return false;
}

// ---------------------------------------------------------------------------
// Link-as-control facts
// ---------------------------------------------------------------------------

export function isExplicitControlLink(link: HTMLElement): boolean {
    return UI_CLASS_RE.test(link.className || '') || link.hasAttribute('onclick') || link.hasAttribute('data-audio');
}

export function linkHasControlMedia(link: HTMLElement): boolean {
    return Boolean(safeQuerySelector(link, 'svg, use, img, [class*="icon" i], [class*="audio" i], [class*="sound" i], [class*="speaker" i], [class*="play" i]'));
}

export function linkHasControlShape(link: HTMLElement, text: string): boolean {
    const style = safeComputedStyle(link);
    const rect = link.getBoundingClientRect();
    return hasControlLinkStyle(style) && hasShortControlLinkText(link, text) && hasControlLinkWidth(rect);
}

function hasControlLinkStyle(style: CSSStyleDeclaration): boolean {
    return hasControlLinkDisplay(style.display)
        || Number.parseFloat(style.borderRadius) > 0
        || hasVisibleControlLinkBox(style);
}

function hasControlLinkDisplay(display: string): boolean {
    return display.includes('flex') || display.includes('grid') || display === 'inline-block';
}

export function hasVisibleControlLinkBox(style: CSSStyleDeclaration): boolean {
    return Boolean(style.backgroundColor && style.backgroundColor !== CORE_COLOR_TOKENS.transparentBlack)
        || hasVisibleBorderSide(style.borderTopStyle, style.borderTopWidth)
        || hasVisibleBorderSide(style.borderBottomStyle, style.borderBottomWidth);
}

function hasVisibleBorderSide(style: string, width: string): boolean {
    return Boolean(style && style !== 'none' && style !== 'hidden' && cssPixels(width) > 0);
}

function hasShortControlLinkText(link: HTMLElement, text: string): boolean {
    return compactLength(text) <= 16 && compactLength(link.textContent ?? '') <= 40;
}

function hasControlLinkWidth(rect: DOMRect): boolean {
    return rect.width > 0 && rect.width < 360;
}

export function hasUiBox(style: CSSStyleDeclaration): boolean {
    return hasVisibleControlLinkBox(style) || Number.parseFloat(style.borderRadius) > 0;
}

export function hasInlineControlShape(display: string): boolean {
    return display === 'inline-flex' || display === 'inline-grid' || display === 'inline-block' || display === 'flex';
}

// ---------------------------------------------------------------------------
// Passivity facts (CSS decoration channel: passive words keep click-through)
// ---------------------------------------------------------------------------

export const PASSIVE_INTERACTION_SELECTOR = `a[href],button,summary,label,${roleSelectors('button,link,menuitem,option,tab,checkbox,radio,switch')},[aria-controls],[aria-expanded],[slot="more-button"],.more-button,#more,#less`;
export const COMPACT_PASSIVE_INTERACTION_SELECTOR = `[onclick],[tabindex]:not([tabindex="-1"]),${selectorPairs('audio,button,control,play,sound,speaker,toggle', ['class'])}`;
export const COMPACT_PASSIVE_CHROME_SELECTOR = `time,[datetime],[aria-label*="author" i],[aria-label*="username" i],${selectorPairs('author,byline,display-name,handle,header,meta,nickname,screen-name,user-name,username', ['class'])}`;
export const PASSIVE_INTERACTION_BOUNDARY_SELECTOR = `${PASSIVE_INTERACTION_SELECTOR},${COMPACT_PASSIVE_INTERACTION_SELECTOR},${COMPACT_PASSIVE_CHROME_SELECTOR}`;

const COMPACT_PASSIVE_INTERACTION_TEXT_LIMIT = 120;

export function isPassiveInteractionElement(element: Element): boolean {
    if (element.closest(READER_ROOT_SELECTOR)) return false;
    if (element instanceof HTMLElement && isReadableProseContext(element) && !readableContextPassiveChromeElement(element)) return false;
    if (element.closest(PASSIVE_INTERACTION_SELECTOR)) return true;
    const compactInteraction = element.closest<HTMLElement>(COMPACT_PASSIVE_INTERACTION_SELECTOR);
    if (compactInteraction && isCompactPassiveInteractionElement(compactInteraction)) return true;
    const compactChrome = element.closest<HTMLElement>(COMPACT_PASSIVE_CHROME_SELECTOR);
    return Boolean(compactChrome && isCompactPassiveChromeElement(compactChrome));
}

export function isCompactPassiveInteractionElement(element: HTMLElement): boolean {
    const text = element.textContent?.replace(/\s+/g, '').trim() ?? '';
    if (!text || text.length > COMPACT_PASSIVE_INTERACTION_TEXT_LIMIT) return false;
    return element.childElementCount <= 4;
}

export function isCompactPassiveChromeElement(element: HTMLElement): boolean {
    if (isLikelyProseElement(element)) return false;
    return isCompactPassiveInteractionElement(element);
}

function readableContextPassiveChromeElement(element: HTMLElement): HTMLElement | null {
    const interaction = element.closest<HTMLElement>(PASSIVE_INTERACTION_SELECTOR);
    if (interaction) {
        if (isConversationTextClass(interaction)) return null;
        if (safeElementMatches(interaction, 'a[href],[role="link"]')) return interaction;
        if (isCompactPassiveInteractionElement(interaction)) return interaction;
    }
    const compactInteraction = element.closest<HTMLElement>(COMPACT_PASSIVE_INTERACTION_SELECTOR);
    if (compactInteraction && !isConversationTextClass(compactInteraction) && isCompactPassiveInteractionElement(compactInteraction)) return compactInteraction;
    const compactChrome = element.closest<HTMLElement>(COMPACT_PASSIVE_CHROME_SELECTOR);
    return compactChrome && isCompactPassiveChromeElement(compactChrome) ? compactChrome : null;
}

// ---------------------------------------------------------------------------
// Compact interactive-chrome cascade (deterministic facts + bounded geometry
// constraints). Pure: marking side effects are returned to the caller.
// ---------------------------------------------------------------------------

export const RICH_YOUTUBE_RUBY_ALLOWED_SELECTOR = 'ytd-watch-metadata,ytm-watch-metadata,ytm-slim-video-metadata-section-renderer,ytm-expandable-video-description-body-renderer,ytm-structured-description-content-renderer,ytd-comment-view-model,ytd-comments,ytd-transcript-segment-renderer,ytm-transcript-segment-renderer,yt-live-chat-renderer,yt-live-chat-text-message-renderer,yt-live-chat-paid-message-renderer,yt-live-chat-membership-item-renderer';
const YOUTUBE_FEEDBACK_CHROME_SELECTOR = 'yt-touch-feedback-shape[aria-hidden=true],yt-interaction[aria-hidden=true]';
export const COMPACT_INTERACTIVE_CHROME_CONTROL_SELECTOR = `button,label,summary,${roleSelectors('button,tab,menuitem,option,checkbox,radio,switch')}`;
const COMPACT_INTERACTIVE_CHROME_LINK_SELECTOR = 'a[href], [role="link"]';
export const COMPACT_INTERACTIVE_CHROME_SELECTOR = `${COMPACT_INTERACTIVE_CHROME_CONTROL_SELECTOR}, ${COMPACT_INTERACTIVE_CHROME_LINK_SELECTOR}`;
const COMPACT_INTERACTIVE_CHROME_CONTEXT_SELECTOR = `header,nav,footer,[role="banner"],[role="navigation"],[role="contentinfo"],[role="dialog"],[role="listbox"],[role="menu"],[role="menubar"],[role="tablist"],[role="toolbar"],[aria-modal="true"],${selectorPairs('account,chooser,dialog,dropdown,login,menu,modal,picker,profile,signin,toolbar')}`;
const MEDIA_CAROUSEL_CLASS_RE = /banner|carousel|rail|scroll|shelf|slick|slider|splide|swiper/i;
const EXPLICIT_MEDIA_CAROUSEL_CLASS_RE = /carousel|rail|shelf|slick|slider|splide|swiper/i;
const COMPACT_INTERACTIVE_CHROME_TEXT_LIMIT = 60;
const COMPACT_INTERACTIVE_CHROME_MAX_WIDTH = 320;
const COMPACT_INTERACTIVE_CHROME_MAX_HEIGHT = 96;
const COMPACT_VERTICAL_CHROME_MAX_WIDTH = 96;
const COMPACT_VERTICAL_CHROME_MAX_HEIGHT = 360;
const COMPACT_MEDIA_CONTEXT_ANCESTOR_LIMIT = 10;
const CONSTRAINED_NOTIFICATION_TEXT_LIMIT = 180;
const CONSTRAINED_NOTIFICATION_MAX_HEIGHT = 150;
const CONSTRAINED_NOTIFICATION_SELECTOR = `[role="alert"],[role="status"],[role="region"],[aria-live],${selectorPairs('alert,banner,notice,notification,snackbar,toast', ['class'])},${selectorPairs('assistant,prompt,question', ['class', 'id'])}`;

export interface PassiveChromeMark {
    element: HTMLElement;
    atomic: boolean;
}

export interface CompactScanRubySuppression {
    suppress: boolean;
    marks: PassiveChromeMark[];
}

export function compactScanRubySuppression(parent: HTMLElement): CompactScanRubySuppression {
    if (parent.closest(READER_ROOT_SELECTOR)) return { suppress: false, marks: [] };
    if (shouldSuppressCompactMediaRuby(parent)) {
        return { suppress: true, marks: [compactMediaPassiveChromeMark(parent)] };
    }
    const marks: PassiveChromeMark[] = [];
    const notice = compactConstrainedNotificationElement(parent);
    if (notice) marks.push({ element: notice, atomic: true });
    const chrome = compactInteractiveChromeElement(parent)
        ?? compactPassiveInteractionRubyElement(parent)
        ?? compactPassiveChromeElement(parent);
    if (chrome) marks.push({ element: chrome, atomic: true });
    return { suppress: Boolean(chrome || notice), marks };
}

function compactMediaPassiveChromeMark(parent: HTMLElement): PassiveChromeMark {
    const mediaLink = parent.closest<HTMLElement>('a[href],button,[role="link"],[role="button"]');
    const host = mediaLink
        ?? closestCompactMediaContext(parent)
        ?? closestMediaCarousel(parent)?.element
        ?? parent;
    return { element: host, atomic: Boolean(mediaLink && isNavigationChromeContext(mediaLink)) };
}

export function applyPassiveChromeMarks(marks: PassiveChromeMark[]): void {
    for (const mark of marks) markPassiveChromeElement(mark.element, mark.atomic);
}

export function markPassiveChromeElement(element: HTMLElement, atomic = false): void {
    element.dataset.jpdbReaderPassiveChrome = 'true';
    if (atomic) element.dataset.jpdbReaderPassiveAtomic = 'true';
    if (element.getAttribute('role') === 'button' && !hasExplicitAccessibleName(element)) {
        element.setAttribute('aria-label', passiveChromeAccessibleLabel(element));
    }
}

function hasExplicitAccessibleName(element: HTMLElement): boolean {
    return Boolean(
        element.getAttribute('aria-label')?.trim()
        || element.getAttribute('aria-labelledby')?.trim()
        || element.getAttribute('title')?.trim(),
    );
}

function passiveChromeAccessibleLabel(element: HTMLElement): string {
    return element.textContent?.replace(/\s+/g, ' ').trim() || 'Open item';
}

export function compactInteractiveChromeElement(parent: HTMLElement): HTMLElement | null {
    const chrome = parent.closest<HTMLElement>(COMPACT_INTERACTIVE_CHROME_SELECTOR);
    if (!chrome) return null;
    const text = compactInteractiveChromeText(chrome);
    if (!isCompactInteractiveChromeText(text)) return null;
    if (safeElementMatches(chrome, COMPACT_INTERACTIVE_CHROME_LINK_SELECTOR)) {
        return isCompactInteractiveChromeLink(chrome, parent, text) ? chrome : null;
    }
    return isCompactInteractiveChromeControl(chrome, parent) ? chrome : null;
}

function compactInteractiveChromeText(element: HTMLElement): string {
    return element.textContent?.replace(/\s+/g, '').trim() ?? '';
}

export function compactPassiveChromeElement(parent: HTMLElement): HTMLElement | null {
    if (isReadableProseContext(parent)) return null;
    if (!isCompactInteractiveChromeContext(parent)) return null;
    const text = compactInteractiveChromeText(parent);
    if (!isCompactInteractiveChromeText(text)) return null;
    return hasCompactInteractiveChromeRubyRisk(parent) ? parent : null;
}

function compactPassiveInteractionRubyElement(parent: HTMLElement): HTMLElement | null {
    if (isReadableProseContext(parent)) return null;
    const interaction = parent.closest<HTMLElement>(COMPACT_PASSIVE_INTERACTION_SELECTOR);
    if (!interaction) return null;
    if (safeElementMatches(interaction, COMPACT_INTERACTIVE_CHROME_SELECTOR)) return null;
    if (isLikelyProseElement(interaction)) return null;
    if (!isCompactPassiveInteractionElement(interaction)) return null;
    const style = safeComputedStyle(interaction);
    if (isVerticalWritingMode(style.writingMode)) return interaction;
    if (isEllipsisTextRow(style) || hasClippedTextConstraint(style)) return interaction;
    if (isCompactInteractiveChromeContext(interaction)) return interaction;
    return hasCompactInteractiveChromeGeometry(interaction) && hasUiBox(style) ? interaction : null;
}

export function isCompactInteractiveChromeText(text: string): boolean {
    const length = compactLength(text);
    return length >= 2 && length <= COMPACT_INTERACTIVE_CHROME_TEXT_LIMIT && HAS_JAPANESE.test(text);
}

function isCompactInteractiveChromeLink(link: HTMLElement, parent: HTMLElement, text: string): boolean {
    if (isLikelyProseLink(link, parent)) return false;
    if (isReadableProseContext(parent) && !isCompactInteractiveChromeContext(link)) return false;
    const chromeLike = isCompactInteractiveChromeContext(link)
        || isExplicitControlLink(link)
        || linkHasControlShape(link, text);
    return chromeLike && hasCompactInteractiveChromeRubyRisk(link);
}

function isCompactInteractiveChromeControl(control: HTMLElement, parent: HTMLElement): boolean {
    if (isReadableProseContext(parent) && !isCompactInteractiveChromeContext(control)) return false;
    if (safeElementMatches(control, '[role="button"]') && control.tagName !== 'BUTTON' && !isCompactInteractiveChromeContext(control)) return false;
    const chromeLike = isCompactInteractiveChromeContext(control)
        || hasCompactInteractiveChromeGeometry(control)
        || safeElementMatches(control, '[role="tab"], [role="menuitem"], [role="option"], [role="switch"]');
    return chromeLike && hasCompactInteractiveChromeRubyRisk(control);
}

function isCompactInteractiveChromeContext(element: HTMLElement): boolean {
    return Boolean(element.closest(COMPACT_INTERACTIVE_CHROME_CONTEXT_SELECTOR));
}

function hasCompactInteractiveChromeGeometry(element: HTMLElement): boolean {
    const style = safeComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.width <= COMPACT_INTERACTIVE_CHROME_MAX_WIDTH
        && (rect.height === 0 || rect.height <= COMPACT_INTERACTIVE_CHROME_MAX_HEIGHT)) return true;
    if (isVerticalWritingMode(style.writingMode)
        && rect.width > 0
        && rect.width <= COMPACT_VERTICAL_CHROME_MAX_WIDTH
        && (rect.height === 0 || rect.height <= COMPACT_VERTICAL_CHROME_MAX_HEIGHT)) return true;
    return hasInlineControlShape(style.display) && style.whiteSpace === 'nowrap';
}

function hasCompactInteractiveChromeRubyRisk(element: HTMLElement): boolean {
    const style = safeComputedStyle(element);
    if (isVerticalWritingMode(style.writingMode)) return true;
    if (isEllipsisTextRow(style) || hasClippedTextConstraint(style)) return true;
    if (isCompactInteractiveChromeContext(element)) return true;
    if (safeElementMatches(element, COMPACT_INTERACTIVE_CHROME_CONTROL_SELECTOR)
        && hasCompactInteractiveChromeGeometry(element)) return true;
    if (!hasCompactInteractiveChromeGeometry(element)) return false;
    if (hasDefiniteCssSize(style.height) || hasDefiniteCssSize(style.maxHeight)) return true;
    return clipsOverflow(style) && style.whiteSpace === 'nowrap';
}

function compactConstrainedNotificationElement(parent: HTMLElement): HTMLElement | null {
    if (parent.closest(READER_ROOT_SELECTOR)) return null;
    const textLength = compactLength(parent.textContent ?? '');
    if (textLength < 2 || textLength > CONSTRAINED_NOTIFICATION_TEXT_LIMIT) return null;

    let current: HTMLElement | null = parent;
    for (let depth = 0; current && current !== document.body && current !== document.documentElement && depth < 6; depth++) {
        if (isReadableProseContext(current) && !current.closest(CONSTRAINED_NOTIFICATION_SELECTOR)) return null;
        if (isConstrainedNotificationContainer(current, parent)) return current;
        current = current.parentElement;
    }
    return null;
}

function isConstrainedNotificationContainer(container: HTMLElement, textElement: HTMLElement): boolean {
    if (!safeElementMatches(container, CONSTRAINED_NOTIFICATION_SELECTOR)) return false;
    if (!hasConstrainedNotificationGeometry(container, textElement)) return false;
    return hasNotificationActionPeer(container, textElement);
}

function hasConstrainedNotificationGeometry(container: HTMLElement, textElement: HTMLElement): boolean {
    const rect = container.getBoundingClientRect();
    const textRect = textElement.getBoundingClientRect();
    return (rect.height === 0 || rect.height <= CONSTRAINED_NOTIFICATION_MAX_HEIGHT)
        && (textRect.height === 0 || textRect.height <= CONSTRAINED_NOTIFICATION_MAX_HEIGHT)
        && !notificationContainerLooksLikePageSection(container);
}

function notificationContainerLooksLikePageSection(container: HTMLElement): boolean {
    const rect = container.getBoundingClientRect();
    if (rect.height > CONSTRAINED_NOTIFICATION_MAX_HEIGHT) return true;
    return Boolean(container.closest('article, main, [role="main"]') && isLikelyProseElement(container));
}

function hasNotificationActionPeer(container: HTMLElement, textElement: HTMLElement): boolean {
    const selector = 'a[href],button,[role="button"],[role="link"],[data-action]';
    if (Array.from(container.querySelectorAll<HTMLElement>(selector)).some(action => !action.contains(textElement))) return true;
    if (container === textElement) return false;
    const row = container.parentElement;
    if (!row) return false;
    return Array.from(row.querySelectorAll<HTMLElement>(selector)).some(action => !container.contains(action));
}

// Media-card/carousel titles are CONTENT, not chrome: they keep furigana and
// pitch decorations at rest (clipped rows grow via makeRoomForRubyInCroppedRows).
// Only YouTube's feedback chrome rows still suppress ruby here — everything
// else routes through the interactive-chrome checks above.
function shouldSuppressCompactMediaRuby(parent: HTMLElement): boolean {
    return isYouTubeFeedbackChromeLinkText(parent);
}

export function isYouTubeHost(): boolean {
    const hostname = location.hostname.toLowerCase();
    return hostname === 'youtube.com'
        || hostname.endsWith('.youtube.com')
        || hostname === 'youtu.be';
}

function isYouTubeFeedbackChromeLinkText(parent: HTMLElement): boolean {
    if (parent.closest(RICH_YOUTUBE_RUBY_ALLOWED_SELECTOR)) return false;
    return Boolean(parent.closest(YOUTUBE_FEEDBACK_CHROME_SELECTOR));
}

function closestMediaCarousel(parent: HTMLElement): { element: HTMLElement; explicit: boolean } | null {
    let current: HTMLElement | null = parent;
    for (let depth = 0; current && current !== document.body && current !== document.documentElement && depth < 8; depth++) {
        const match = mediaCarouselMatch(current);
        if (match && mediaCarouselClipsHorizontally(current) && hasMediaPeer(current, parent)) return { element: current, explicit: match === 'explicit' };
        current = current.parentElement;
    }
    return null;
}

function mediaCarouselMatch(element: HTMLElement): 'explicit' | 'implicit' | null {
    const className = elementClassName(element);
    if (EXPLICIT_MEDIA_CAROUSEL_CLASS_RE.test(className)
        || element.hasAttribute('data-carousel')
        || element.hasAttribute('data-slider')) return 'explicit';
    return MEDIA_CAROUSEL_CLASS_RE.test(className) ? 'implicit' : null;
}

function mediaCarouselClipsHorizontally(element: HTMLElement): boolean {
    const style = safeComputedStyle(element);
    if (style.overflowX === 'hidden' || style.overflowX === 'clip') return true;
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && element.clientWidth > 0) return true;
    return element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1;
}

export function isNavigationChromeContext(element: HTMLElement): boolean {
    return Boolean(element.closest('header,nav,footer,[role="banner"],[role="navigation"],[role="contentinfo"]'));
}

function closestCompactMediaContext(parent: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = parent;
    for (let depth = 0; current && current !== document.body && current !== document.documentElement && depth < COMPACT_MEDIA_CONTEXT_ANCESTOR_LIMIT; depth++) {
        if (isReadableProseContext(current)) return null;
        if (hasMediaPeer(current, parent) && isCompactMediaContext(current)) return current;
        current = current.parentElement;
    }
    return null;
}

function hasMediaPeer(container: HTMLElement, textElement: HTMLElement): boolean {
    return Array.from(container.querySelectorAll('img, picture, video, canvas')).some(media => {
        if (!(media instanceof HTMLElement)) return false;
        if (media.closest(READER_ROOT_SELECTOR)) return false;
        return media !== textElement && !textElement.contains(media);
    });
}

function isCompactMediaContext(element: HTMLElement): boolean {
    const style = safeComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (element.matches('a[href], button, [role="link"], [role="button"]')) return true;
    if (safeQuerySelector(element, 'a[href], button, [role="link"], [role="button"]')) return true;
    const display = style.display;
    const structured = display.includes('grid') || display.includes('flex') || display === 'block';
    const compact = rect.width === 0 || rect.width <= 560;
    return structured && compact;
}

// ---------------------------------------------------------------------------
// classifyDecoration — the four-state policy
// ---------------------------------------------------------------------------

// Editable/composing contexts (class P): the fields themselves, listbox
// popups, disabled controls, and any popup a combobox owns via
// aria-owns/aria-controls. Never decorated at all.
const EDITABLE_SKIP_SELECTOR = 'input,textarea,select,option,optgroup,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="searchbox"],[role="combobox"],[role="listbox"],[role="spinbutton"],[disabled],[aria-disabled="true"]';
const COMBOBOX_POPUP_ANCESTOR_LIMIT = 15;

function isEditableComposingContext(element: Element): boolean {
    if (element.closest(EDITABLE_SKIP_SELECTOR)) return true;
    return isComboboxOwnedPopup(element);
}

// Only genuine combobox/search facts may own a popup: role=combobox,
// role=searchbox, or an input with aria-autocomplete. A checkbox (or any
// other control) pointing aria-controls at an article/section must never
// skip that whole region.
const COMBOBOX_OWNER_SELECTOR = '[role="combobox"][aria-owns],[role="combobox"][aria-controls],[role="searchbox"][aria-owns],[role="searchbox"][aria-controls],input[aria-autocomplete][aria-owns],input[aria-autocomplete][aria-controls]';

// Hot-loop guard (every scan target reaches this): the popup check resolves
// against ONE cached id-set per document/shadow root instead of a global
// querySelector per ancestor id — thousands of document-wide attribute
// queries per 200-target pass would jank mobile scans. Short TTL keeps the
// verdict deterministic in current-DOM terms while amortizing a pass.
let comboboxOwnedIdMemo = new WeakMap<Node, { at: number; ids: ReadonlySet<string> }>();
const COMBOBOX_OWNED_ID_TTL_MS = 250;

/** Test hook: fixtures share one jsdom document, so the per-root owned-id
 * memo would leak between them. Production staleness is bounded by the TTL. */
export function resetDecorationPolicyCachesForTest(): void {
    comboboxOwnedIdMemo = new WeakMap();
}

function comboboxOwnedIds(root: Node): ReadonlySet<string> {
    const now = Date.now();
    const memo = comboboxOwnedIdMemo.get(root);
    if (memo && now - memo.at < COMBOBOX_OWNED_ID_TTL_MS) return memo.ids;
    const ids = new Set<string>();
    if (root instanceof Document || root instanceof ShadowRoot || root instanceof Element) {
        for (const owner of Array.from(root.querySelectorAll(COMBOBOX_OWNER_SELECTOR))) {
            for (const attribute of ['aria-owns', 'aria-controls'] as const) {
                for (const token of (owner.getAttribute(attribute) ?? '').split(/\s+/)) {
                    if (token) ids.add(token);
                }
            }
        }
    }
    comboboxOwnedIdMemo.set(root, { at: now, ids });
    return ids;
}

export function isComboboxOwnedPopup(element: Element): boolean {
    // Resolve within the element's own tree so an open-shadow-root combobox
    // owning an unroled popup is found (document.querySelector cannot see it).
    const ids = comboboxOwnedIds(element.getRootNode());
    if (!ids.size) return false;
    let current: Element | null = element;
    for (let depth = 0; current && depth < COMBOBOX_POPUP_ANCESTOR_LIMIT; depth += 1, current = current.parentElement) {
        if (current.id && ids.has(current.id)) return true;
    }
    return false;
}

// Interactive-control ancestry: the explicit fact set (tags/roles the page
// author declared). Links are controls only when they carry control ancestry
// (nav/toolbar/menu context) — a link inside prose flow stays content.
// Deliberately WITHOUT bare [aria-expanded]/[aria-controls]: accordions put
// those on containers wrapping whole content bodies, and passive-izing the
// body strips its ruby. The bare attributes still contribute to the CSS
// passivity channel (PASSIVE_INTERACTION_SELECTOR) and compact toggles are
// still caught by the compact cascade.
const INTERACTIVE_CONTROL_SELECTOR = `button,summary,label,${roleSelectors('button,tab,menuitem,menuitemcheckbox,menuitemradio,option,switch,checkbox,radio')},[slot="more-button"],.more-button,#more,#less`;
const INTERACTIVE_LINK_SELECTOR = 'a[href],[role="link"]';
// Strict control contexts only: links in header/nav/footer/breadcrumbs are
// content-bearing (owner-pinned: breadcrumb, footer-help, global-nav labels
// keep furigana) — the compact cascade still classifies the genuinely
// chrome-shaped ones. Menus/toolbars/tablists are unambiguous control rows.
const INTERACTIVE_LINK_CONTEXT_SELECTOR = roleSelectors('menu,menubar,toolbar,tablist');

// Site-unique DOM naming (allowed; the BEHAVIOR decision stays here in the
// policy): subscribe buttons are always controls, even inside content roots;
// the mobile watch metadata/description chip rows are owner-curated CONTENT
// chips (質問する / 文字起こしを表示) that keep readings.
const YOUTUBE_SUBSCRIBE_CONTROL_SELECTOR = 'ytd-subscribe-button-renderer,ytm-subscribe-button-renderer,yt-subscribe-button-view-model,#subscribe-button';
// Owner-curated CONTENT chips: controls whose Japanese label is reading
// material (質問する / 文字起こしを表示, live-chat notice actions, the hosted
// docs' own menu) keep inline readings. Site-unique naming is allowed here;
// the behaviour decision stays in this policy.
const CONTENT_CHIP_ROOT_SELECTOR = [
    'ytm-slim-video-metadata-section-renderer',
    'ytm-expandable-video-description-body-renderer',
    'ytm-structured-description-content-renderer',
    // The watch info row (view count / likes) is metadata content despite its
    // role=button wrapper.
    'ytd-watch-info-text',
    'yt-live-chat-viewer-engagement-message-renderer',
    'yt-live-chat-restricted-participation-renderer',
    'yt-live-chat-banner-renderer',
    'yt-live-chat-ticker-renderer',
    '.yomu-hosted-overflow-group',
].join(',');
// BookWalker viewer metadata (book title / description in the reader chrome)
// is reading material; the header context would otherwise classify it as
// compact chrome. Replaces the old profile-level ruby kill-switch.
const NAMED_CONTENT_ROOT_SELECTOR = `${RICH_YOUTUBE_RUBY_ALLOWED_SELECTOR},${CONTENT_CHIP_ROOT_SELECTOR},.viewer-title-bar,.bookTitleText,#bookDescription`;

export function interactivePassiveControl(element: Element): HTMLElement | null {
    const control = element.closest<HTMLElement>(INTERACTIVE_CONTROL_SELECTOR);
    if (control
        // Conversation content wrapped in a clickable shell (Discord's
        // role=button messageContent) is CONTENT — pitch underline and ruby stay.
        && !isConversationTextClass(control)
        // A media card (thumbnail link/role=button with a real text label) is
        // CONTENT, not an icon button — UT-52's media-text tier.
        && !isMediaTextContentControl(control)) return control;
    const link = element.closest<HTMLElement>(INTERACTIVE_LINK_SELECTOR);
    if (!link) return null;
    if (element instanceof HTMLElement && isLikelyProseLink(link, element)) return null;
    return link.closest(INTERACTIVE_LINK_CONTEXT_SELECTOR) ? link : null;
}

function isMediaTextContentControl(control: HTMLElement): boolean {
    if (!safeElementMatches(control, 'a[href],[role="link"],[role="button"]')) return false;
    if (control.closest(INTERACTIVE_LINK_CONTEXT_SELECTOR)) return false;
    return linkHasControlMedia(control) && compactLength(control.textContent ?? '') > 2;
}

export function classifyDecoration(element: Element): DecorationState {
    // Reader-owned surfaces (lookup panel, drawers, previews) manage their own
    // rendering; they are content by definition.
    if (element.closest(READER_ROOT_SELECTOR)) return 'content-ruby';
    if (isEditableComposingContext(element)) return 'skip';
    const control = interactivePassiveControl(element);
    if (control) {
        if (control.closest(YOUTUBE_SUBSCRIBE_CONTROL_SELECTOR)) return 'interactive-passive';
        if (control.closest(CONTENT_CHIP_ROOT_SELECTOR)) return 'content-ruby';
        return 'interactive-passive';
    }
    if (element.closest(NAMED_CONTENT_ROOT_SELECTOR)) return 'content-ruby';
    if (element instanceof HTMLElement && compactScanRubySuppression(element).suppress) return 'interactive-passive';
    return element instanceof HTMLElement && isProseFullContext(element) ? 'prose-full' : 'content-ruby';
}

export function decorationSuppressesRuby(state: DecorationState | undefined): boolean {
    return state === 'interactive-passive';
}

export function stampDecorationState(host: HTMLElement, state: DecorationState): void {
    host.setAttribute(DECORATION_STATE_ATTRIBUTE, state);
}

export function decorationStateForWord(word: HTMLElement): DecorationState | null {
    const stamped = word.closest(`[${DECORATION_STATE_ATTRIBUTE}]`);
    const value = stamped?.getAttribute(DECORATION_STATE_ATTRIBUTE);
    return value === 'prose-full' || value === 'content-ruby' || value === 'interactive-passive' || value === 'skip'
        ? value
        : null;
}
