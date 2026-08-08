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
//   interactive-passive interactive controls: every enabled annotation remains
//                       visible at rest, but readings use an out-of-flow lane so
//                       controls keep their authored line height and hit target
//   skip                editable/composing contexts and truncation-sensitive
//                       native chrome: never decorated
import { CORE_COLOR_TOKENS } from '../theme/color-tokens';
import { READER_ROOT_SELECTOR } from './constants';
import { isTargetLanguageText } from '../lookup/target-text';
import { isYouTubeAppHostname } from '../app/youtube-host';

export type DecorationState = 'prose-full' | 'content-ruby' | 'interactive-passive' | 'skip';

const DECORATION_STATE_ATTRIBUTE = 'data-yomu-decoration';

// ---------------------------------------------------------------------------
// Shared small helpers (also consumed by dom/index.ts)
// ---------------------------------------------------------------------------

export const selectorPairs = (names: string, attributes = ['class', 'id']): string => names.split(',').flatMap(name => attributes.map(attribute => `[${attribute}*="${name}" i]`)).join(',');
const roleSelectors = (names: string): string => names.split(',').map(name => `[role="${name}"]`).join(',');

export function safeElementMatches(element: HTMLElement, selector: string): boolean {
    try {
        return element.matches(selector);
    } catch {
        return false;
    }
}

function safeQuerySelector(root: HTMLElement, selector: string): Element | null {
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

export function compactLength(value: string): number {
    return Array.from(value.replace(/\s+/g, '')).length;
}

export function cssPixels(value: string): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function elementClassName(element: HTMLElement): string {
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
    if (style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre' || style.display === '-webkit-box') return true;
    // Flex/grid items deliberately allowed to shrink below their content
    // (min-width:0 — computed 'auto' unless the author set it) ellipsize
    // HORIZONTALLY under the default white-space too: the track shrinks the
    // item and text-overflow clips the single line. YouTube's Shorts action
    // labels (共有/リミックス) are exactly this shape, so without recognizing it
    // they kept native ruby and the host cropped the ruby-widened base
    // (共有 → 共…, リミックス → リミック…, iPad 2026-07-20). The base row still can
    // truncate the widened word, so it is as ruby-fragile as a nowrap row.
    return style.minWidth === '0px';
}

function clipsOverflow(style: CSSStyleDeclaration): boolean {
    // Both axes matter: a nowrap label with overflow-x:hidden + ellipsis
    // (overflow-y left visible) truncates sideways when in-flow ruby spreads
    // its base, so horizontal clipping is as ruby-fragile as vertical.
    return style.overflow === 'hidden'
        || style.overflow === 'clip'
        || style.overflowY === 'hidden'
        || style.overflowY === 'clip'
        || style.overflowX === 'hidden'
        || style.overflowX === 'clip';
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

function isVerticalWritingMode(writingMode: string): boolean {
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
// Backstop age for the generation-keyed style memo below. Reuse is gated on the
// layout generation, not the clock, but a very long TTL still bounds staleness
// if a reflow ever lands with no settle signal to advance the generation.
const CONSTRAINED_ROW_STYLE_MEMO_MAX_AGE_MS = 2_000;
const CONSTRAINED_ROW_MAX_HEIGHT_PX = 96;
// Some authored previews are taller than compact chrome but still deliberately
// truncate their text (m.youtube's inner expanded-description preview is
// 112px). Recognize only boxes that are CURRENTLY overflowing, and cap the
// measured viewport so a page-sized overflow shell can never become a text
// row merely because it contains more content than the viewport.
const ACTIVELY_TRUNCATED_PREVIEW_MAX_HEIGHT_PX = 192;
const ACTIVELY_TRUNCATED_PREVIEW_OVERFLOW_EPSILON_PX = 1;

interface ConstrainedRowStyleFacts {
    clamped: boolean;
    ellipsisRow: boolean;
    clippedConstraint: boolean;
    // overflow clip + a measured height of at most ~3 text lines: a fixed
    // chrome row that cannot absorb a taller ruby line box.
    clippedShortRow: boolean;
    // A bounded, fixed-height preview whose native content is measurably
    // taller than its authored viewport. Unlike clippedShortRow this never
    // classifies a same-height box that is not actually truncating content.
    activelyTruncatedPreview: boolean;
}

let constrainedRowStyleFactMemo = new WeakMap<HTMLElement, { at: number; gen: number; facts: ConstrainedRowStyleFacts }>();
// The 250ms clock TTL floored reuse below the ~900ms steady-state scan cadence,
// so every mutation-armed pass re-ran getComputedStyle ×5 plus a rect read on
// each candidate ancestor — a forced reflow every second on a busy SPA. The
// classification these facts drive (line-clamp / overflow-clip / short-row) is
// a property of the CONTAINER's own style and is stable while its children
// churn; the reflow-sensitive parts (measured height / scrollHeight) only move
// when layout actually settles. So gate reuse on a layout generation the
// geometry-settle sweep advances whenever it runs (resize, webfont swap, image
// load, the post-scan heal) instead of on the clock: consecutive steady-state
// scans reuse the memo with no reflow, and a genuine layout change forces a
// fresh measurement on the very next read.
let constrainedRowStyleGeneration = 0;

// Called by the geometry-settle sweep before it re-measures. A sweep runs
// precisely because layout may have moved, so invalidate the memo so the sweep
// (and the next scan) see fresh geometry.
export function noteConstrainedRowLayoutSettled(): void {
    constrainedRowStyleGeneration += 1;
}

function constrainedRowStyleFacts(element: HTMLElement): ConstrainedRowStyleFacts {
    const now = Date.now();
    const memo = constrainedRowStyleFactMemo.get(element);
    if (memo
        && memo.gen === constrainedRowStyleGeneration
        && now - memo.at < CONSTRAINED_ROW_STYLE_MEMO_MAX_AGE_MS) return memo.facts;
    const style = safeComputedStyle(element);
    const clamped = hasLineClamp(style);
    const ellipsisRow = isEllipsisTextRow(style);
    const clips = clipsOverflow(style);
    const clippedConstraint = hasClippedTextConstraint(style);
    let clippedShortRow = false;
    let activelyTruncatedPreview = false;
    if (clips && !clamped && !ellipsisRow) {
        const height = element.getBoundingClientRect().height;
        clippedShortRow = height > 0 && height <= CONSTRAINED_ROW_MAX_HEIGHT_PX;
        const clientHeight = element.clientHeight;
        activelyTruncatedPreview = clippedConstraint
            && height > CONSTRAINED_ROW_MAX_HEIGHT_PX
            && height <= ACTIVELY_TRUNCATED_PREVIEW_MAX_HEIGHT_PX
            && clientHeight > CONSTRAINED_ROW_MAX_HEIGHT_PX
            && clientHeight <= ACTIVELY_TRUNCATED_PREVIEW_MAX_HEIGHT_PX
            && element.scrollHeight > clientHeight + ACTIVELY_TRUNCATED_PREVIEW_OVERFLOW_EPSILON_PX;
    }
    const facts: ConstrainedRowStyleFacts = {
        clamped,
        ellipsisRow,
        clippedConstraint,
        clippedShortRow,
        activelyTruncatedPreview,
    };
    constrainedRowStyleFactMemo.set(element, { at: now, gen: constrainedRowStyleGeneration, facts });
    return facts;
}

// The clip-constrained-row fact (class Q): within the bounded ancestor walk,
// find a line-clamp, single-line ellipsis clip, fixed short overflow clip, or
// bounded preview that is actively truncating text. Applied UNCONDITIONALLY
// on every engine — rt paints into the half-leading and ancestor overflow
// clips shave it mid-glyph on healthy engines too, so this fact (not an
// engine probe) decides protection.
export function closestRubyFragileConstrainedRow(element: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = element;
    // Deep enough to escape inline formatting wrappers: search snippets nest
    // text in span/em/b chains 6+ deep, which a 5-ancestor walk never
    // escaped, so the clamped row was invisible to the fragile-row check.
    // COMPOSED walk: the clipping row can be a light-DOM ancestor of shadow
    // content (web-component chrome) that parentElement never reaches.
    for (let depth = 0; current && depth < 12; depth += 1) {
        const facts = constrainedRowStyleFacts(current);
        if (facts.clamped || facts.ellipsisRow || facts.clippedShortRow || facts.activelyTruncatedPreview) return current;
        current = composedAncestorElement(current);
    }
    return null;
}

// Shadow-aware parent step shared by the fragile-row walk.
export function composedAncestorElement(element: HTMLElement): HTMLElement | null {
    if (element.assignedSlot) return element.assignedSlot;
    if (element.parentElement) return element.parentElement;
    const root = element.getRootNode();
    return typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot && root.host instanceof HTMLElement ? root.host : null;
}

// The style-only clip-capability fact used by ruby-room's ancestor walk.
export function boxStyleIsClipCapable(box: HTMLElement): boolean {
    const facts = constrainedRowStyleFacts(box);
    return facts.clamped || facts.ellipsisRow || facts.clippedConstraint;
}

// A single element's own clip-constrained verdict (line-clamp, single-line
// ellipsis, fixed short overflow-clip, or bounded actively truncated preview).
// Such a row shows no at-rest ruby, so ruby-room must never grow it either —
// growth on a clamped feed title expands a 44px box to its full unclamped
// mirror height (the 1.6.115 iPad home-feed blow-up).
export function isClipConstrainedRow(element: HTMLElement): boolean {
    const facts = constrainedRowStyleFacts(element);
    return facts.clamped || facts.ellipsisRow || facts.clippedShortRow || facts.activelyTruncatedPreview;
}

// A clip-constrained SEMANTIC PROSE row may keep furigana at rest when it can
// grow naturally in flow. Search cards, headings and app chrome never take
// this exception: on WebKit their hidden ruby metrics can crop the base or
// expand a containing flex card. Deterministic facts:
//   - the decoration state must be prose-full in readable article/main prose;
//   - the row must have NO definite height/max-height clip: a line-clamp or
//     ellipsis row with auto height grows in flow when the ruby line box gets
//     taller, while a fixed-height
//     clip would cut in-flow readings mid-glyph and stays rest-hidden.
// Growth here is pure in-flow line-height — no geometry writes of any kind.
// Scope: the IN-PLACE render channel only. Mirror-channel readings are projected
// out of flow, so "grow naturally" does not apply to them.
export function contentClipRowShowsRestReadings(
    decoration: DecorationState | undefined,
    clipRow: HTMLElement,
): boolean {
    // Only semantic prose gets the DETACHED-channel exception (single-line
    // rows whose reading floats in a verified-safe lane). Search-result cards,
    // headings and app chrome are commonly nested in flex/fixed-height shells
    // whose USED height looks auto in CSSOM but cannot safely absorb ruby on
    // iOS. Treating every content-ruby DIV as growable caused Google result
    // gaps and rows where the base glyphs fell below the clip while rt stayed.
    if (decoration !== 'prose-full') return false;
    if (!isLikelyProseElement(clipRow) || !isReadableProseContext(clipRow)) return false;
    if (!clipRowHasGrowableShape(clipRow)) return false;
    const facts = constrainedRowStyleFacts(clipRow);
    // Only clamp/ellipsis rows have the auto-height shape that grows in flow.
    if (!facts.clamped && !facts.ellipsisRow) return false;
    // A MULTI-line clamp keeps its readings through the IN-FLOW channel
    // (clampRowAllowsInFlowRestRuby); the detached lane cannot open safely
    // across internal line boundaries, so it stays rest-hidden here.
    const clampLines = Number.parseInt(safeComputedStyle(clipRow).getPropertyValue('-webkit-line-clamp'), 10);
    if (Number.isFinite(clampLines) && clampLines > 1) return false;
    const parentDisplay = clipRow.parentElement ? safeComputedStyle(clipRow.parentElement).display : '';
    return !parentDisplay.includes('flex')
        && !parentDisplay.includes('grid')
        && !parentDisplay.startsWith('table');
}

// Owner rule (2026-07-19): always insert furigana when the page layout can
// absorb it. A MULTI-line clamp row with an auto height CAN absorb in-flow
// ruby: -webkit-line-clamp caps the LINE COUNT, not the box height, so when
// rt participates in layout every retained line box grows and the row grows
// in flow with it — no geometry writes, no overlay in the inter-line leading
// (that overlap class came from DETACHED readings, which never grow lines).
// Deterministic safety facts keep the 1.6.115 blow-up classes excluded:
//   - content decorations only (prose-full / content-ruby) — chrome and
//     editable contexts keep their detached/skip channels;
//   - wrapping clamp rows only — single-line ellipsis/nowrap rows still
//     truncate a ruby-spread base (共有 → 共…), so they keep the detached lane;
//   - no authored height/max-height cap on the row itself;
//   - no fixed-height clipping shell among the near ancestors (growth would
//     push the base below the shell's clip while rt stays visible);
//   - flex/grid/table parents are vetoed only when they also pin geometry
//     (definite size or their own clip) — an auto-height flex column grows
//     with its content like any block.
const CLAMP_ROW_SHELL_ANCESTOR_LIMIT = 6;

export function clampRowAllowsInFlowRestRuby(
    decoration: DecorationState | undefined,
    clipRow: HTMLElement,
): boolean {
    if (decoration !== 'prose-full' && decoration !== 'content-ruby') return false;
    const facts = constrainedRowStyleFacts(clipRow);
    // Wrapping clamp rows only: nowrap/pre ellipsis rows cannot rewrap a
    // ruby-spread base. A clamped -webkit-box that ALSO declares
    // text-overflow still wraps, so the clamp fact dominates there.
    if (!facts.clamped) return false;
    if (!clipRowHasGrowableShape(clipRow)) return false;
    return !clampRowHasFixedClippingShell(clipRow);
}

// Shared row-local growability facts: interactive shells never grow, and an
// authored height/max-height cap means the author pinned the row's geometry.
// getComputedStyle().height is a USED value — a pixel string for ANY displayed
// element (CSSOM resolved values), so it cannot distinguish authored
// height:auto from a fixed row and would veto every real-browser Google
// snippet (sol review P1). Author intent is read from computed max-height
// (stays 'none' unless authored) and the element's own inline height/max-height.
function clipRowHasGrowableShape(clipRow: HTMLElement): boolean {
    if (clipRow.closest('a[href],button,[role="button"],[role="link"]')) return false;
    const facts = constrainedRowStyleFacts(clipRow);
    if (facts.clippedShortRow || facts.activelyTruncatedPreview) return false;
    const style = safeComputedStyle(clipRow);
    if (hasDefiniteCssSize(style.maxHeight)) return false;
    return !hasDefiniteCssSize(clipRow.style.height) && !hasDefiniteCssSize(clipRow.style.maxHeight);
}

function clampRowHasFixedClippingShell(clipRow: HTMLElement): boolean {
    let current = composedAncestorElement(clipRow);
    for (let depth = 0; current && current !== document.body && depth < CLAMP_ROW_SHELL_ANCESTOR_LIMIT; depth += 1) {
        if (ancestorPinsClampRowGrowth(current)) return true;
        current = composedAncestorElement(current);
    }
    return false;
}

function ancestorPinsClampRowGrowth(ancestor: HTMLElement): boolean {
    const style = safeComputedStyle(ancestor);
    const definiteSize = hasDefiniteCssSize(style.maxHeight)
        || hasDefiniteCssSize(ancestor.style.height)
        || hasDefiniteCssSize(ancestor.style.maxHeight);
    const clips = style.overflow === 'hidden' || style.overflow === 'clip'
        || style.overflowY === 'hidden' || style.overflowY === 'clip';
    if (definiteSize && clips) return true;
    const display = style.display;
    const trackParent = display.includes('flex') || display.includes('grid') || display.startsWith('table');
    return trackParent && (definiteSize || clips);
}

// ---------------------------------------------------------------------------
// Prose / conversation context facts
// ---------------------------------------------------------------------------

const PROSE_TAGS = ',P,LI,DD,DT,TD,TH,BLOCKQUOTE,FIGCAPTION,';
const PROSE_CLASS_RE = /(^|[-_\s])(body|content|copy|description|lead|paragraph|prose|text|txt)([-_\s]|$)/i;
const CONVERSATION_TEXT_CLASS_RE = /(^|\s)(chat|comment|message|post|reply)(?:[-_\s]*(body|bubble|content|copy|message|text|txt))?(?:_[a-z0-9]+)?(?=$|\s)/i;
const READABLE_PROSE_CONTAINER_SELECTOR = 'article,main,[role=main],[role=article]';
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

function isConversationTextClass(element: HTMLElement): boolean {
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

function hasVisibleControlLinkBox(style: CSSStyleDeclaration): boolean {
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

export const COMPACT_INTERACTIVE_CHROME_CONTROL_SELECTOR = `button,label,summary,${roleSelectors('button,tab,menuitem,option,checkbox,radio,switch,combobox')}`;
const COMPACT_INTERACTIVE_CHROME_LINK_SELECTOR = 'a[href], [role="link"]';
const COMPACT_INTERACTIVE_CHROME_SELECTOR = `${COMPACT_INTERACTIVE_CHROME_CONTROL_SELECTOR}, ${COMPACT_INTERACTIVE_CHROME_LINK_SELECTOR}`;
const COMPACT_INTERACTIVE_CHROME_CONTEXT_SELECTOR = `header,nav,footer,[role="banner"],[role="navigation"],[role="contentinfo"],[role="dialog"],[role="listbox"],[role="menu"],[role="menubar"],[role="tablist"],[role="toolbar"],[aria-modal="true"],${selectorPairs('account,chooser,dialog,dropdown,login,menu,modal,panel,picker,profile,signin,toolbar')}`;
const COMPACT_INTERACTIVE_CHROME_TEXT_LIMIT = 60;
const COMPACT_INTERACTIVE_CHROME_MAX_WIDTH = 320;
const COMPACT_INTERACTIVE_CHROME_MAX_HEIGHT = 96;
const COMPACT_VERTICAL_CHROME_MAX_WIDTH = 96;
const COMPACT_VERTICAL_CHROME_MAX_HEIGHT = 360;
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
    const marks: PassiveChromeMark[] = [];
    const notice = compactConstrainedNotificationElement(parent);
    if (notice) marks.push({ element: notice, atomic: true });
    const chrome = compactInteractiveChromeElement(parent)
        ?? compactPassiveInteractionRubyElement(parent)
        ?? compactPassiveChromeElement(parent)
        ?? compactMetadataChromeElement(parent)
        ?? compactVisualLabelElement(parent);
    if (chrome) marks.push({ element: chrome, atomic: true });
    return { suppress: Boolean(chrome || notice), marks };
}

// Painted badges/tags/pills are compact interface labels even when their
// clickable thumbnail is deliberately aria-hidden from accessibility (the
// accessible title lives elsewhere). They should get the passive, detached
// channel: annotations remain visible without turning the badge into prose or
// intercepting its owning card's click.
function compactVisualLabelElement(parent: HTMLElement): HTMLElement | null {
    // App shells commonly mount dialogs/panels under <main>. A class such as
    // `preset-button-label-text` then trips the broad prose-name heuristic even
    // though the element is unequivocally chrome. An explicit bounded chrome
    // context wins; genuine article prose outside such a context still opts out.
    const chromeContext = isCompactInteractiveChromeContext(parent);
    if (isReadableProseContext(parent) && !chromeContext) return null;
    let current: HTMLElement | null = parent;
    for (let depth = 0; current && depth < 3; depth += 1, current = current.parentElement) {
        if (!UI_CLASS_RE.test(elementClassName(current))) continue;
        const text = compactInteractiveChromeText(current);
        if (!isCompactInteractiveChromeText(text)) continue;
        if (hasCompactInteractiveChromeGeometry(current)) return current;
        // Hydrated panels are often scanned while their future label is still
        // unmeasured, before the sibling <button> is attached. Seal the passive
        // verdict now so the later reveal cannot inherit prose-full ruby and
        // grow the row.
        const rect = current.getBoundingClientRect();
        if (chromeContext && rect.width === 0 && rect.height === 0) return current;
    }
    return null;
}

const COMPACT_METADATA_CLASS_RE = /author|byline|count|display[-_]?name|handle|meta(?:data)?|nickname|published|screen[-_]?name|statistic|stats|timestamp|user[-_]?name/i;

// View counts, timestamps, authors and similar card facts are reading
// material, but they live in 14–20px rows whose geometry cannot accept in-flow
// ruby. Framework classes commonly end in `MetadataText`; the generic prose
// `text` hint must not turn those compact rows into full prose. Preserve all
// furigana/pitch through the detached passive channel instead.
function compactMetadataChromeElement(parent: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = parent;
    for (let depth = 0; current && depth < 4; depth += 1, current = current.parentElement) {
        const explicit = current.tagName === 'TIME'
            || current.hasAttribute('datetime')
            || COMPACT_METADATA_CLASS_RE.test(`${current.id} ${elementClassName(current)}`);
        if (!explicit || isConversationTextClass(current)) continue;
        const text = current.textContent?.replace(/\s+/g, '').trim() ?? '';
        if (!isCompactInteractiveChromeText(text)) continue;
        const rect = current.getBoundingClientRect();
        if (rect.height === 0 || rect.height <= COMPACT_INTERACTIVE_CHROME_MAX_HEIGHT) return current;
    }
    return null;
}

export function applyPassiveChromeMarks(marks: PassiveChromeMark[]): void {
    for (const mark of marks) markPassiveChromeElement(mark.element, mark.atomic);
}

function markPassiveChromeElement(element: HTMLElement, atomic = false): void {
    if (element.dataset.jpdbReaderPassiveChrome !== 'true') {
        element.dataset.jpdbReaderPassiveChrome = 'true';
    }
    if (atomic && element.dataset.jpdbReaderPassiveAtomic !== 'true') {
        element.dataset.jpdbReaderPassiveAtomic = 'true';
    }
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
    return length >= 2 && length <= COMPACT_INTERACTIVE_CHROME_TEXT_LIMIT && isTargetLanguageText(text);
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
    // Only the non-editable listbox-trigger form of role=combobox is chip
    // chrome; a composing combobox never annotates.
    if (safeElementMatches(control, '[role="combobox"]') && !isNonEditableListboxTrigger(control)) return false;
    const chromeLike = isCompactInteractiveChromeContext(control)
        || hasCompactInteractiveChromeGeometry(control)
        || safeElementMatches(control, '[role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="combobox"]');
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

export function isYouTubeHost(): boolean {
    return isYouTubeAppHostname();
}

export function isNavigationChromeContext(element: HTMLElement): boolean {
    return Boolean(element.closest('header,nav,footer,[role="banner"],[role="navigation"],[role="contentinfo"]'));
}

// ---------------------------------------------------------------------------
// classifyDecoration — the four-state policy
// ---------------------------------------------------------------------------

// Editable/composing contexts (class P): editor surfaces, listbox owners,
// disabled controls, and unclassified content in a popup a combobox owns via
// aria-owns/aria-controls. Never decorate the editor itself. Declared choices
// are different: a visible option/menuitem is read-only text, so it follows the
// passive-control channel even when its listbox belongs to a live combobox.
const EDITABLE_SURFACE_SKIP_SELECTOR = 'input,textarea,select,option,optgroup,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="searchbox"],[role="combobox"][aria-autocomplete="list"],[role="combobox"][aria-autocomplete="inline"],[role="combobox"][aria-autocomplete="both"],[role="spinbutton"],[disabled],[aria-disabled="true"]';
const EDITABLE_OWNER_SKIP_SELECTOR = '[role="listbox"]';
const PASSIVE_CHOICE_SELECTOR = roleSelectors('option,menuitem,menuitemcheckbox,menuitemradio');
const COMBOBOX_POPUP_ANCESTOR_LIMIT = 15;

function isEditableComposingContext(element: Element): boolean {
    // An editor nested inside a choice remains an editor; test this before the
    // choice escape hatch. Native <option> also stays on the control-mirror
    // path because browser-native select popups cannot host DOM decoration.
    if (element.closest(EDITABLE_SURFACE_SKIP_SELECTOR)) return true;
    // role=combobox splits: a combobox that composes text (autocomplete, a
    // text-entry descendant) is an editor surface; a select-like listbox
    // TRIGGER (Google's language picker, Material selects) is read-only
    // chrome whose visible face follows the passive-control channel.
    const combobox = element.closest('[role="combobox"]');
    if (combobox && !isNonEditableListboxTrigger(combobox)) return true;
    if (element.closest(PASSIVE_CHOICE_SELECTOR)) return false;
    if (element.closest(EDITABLE_OWNER_SKIP_SELECTOR)) return true;
    return isComboboxOwnedPopup(element);
}

// A combobox is a text-composing surface only when it can actually compose
// text: an input/textarea tag, an autocomplete contract, contenteditable, or
// a text-entry descendant (ARIA 1.1 wrapper pattern). Everything else with
// role=combobox is a select-like listbox trigger — a read-only label that
// safely takes passive annotation like any button chip.
const COMBOBOX_TEXT_ENTRY_DESCENDANT_SELECTOR = 'input,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="searchbox"]';

export function isNonEditableListboxTrigger(element: Element): boolean {
    if (!(element instanceof HTMLElement)) return false;
    if (!safeElementMatches(element, '[role="combobox"]')) return false;
    const tag = element.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
    const autocomplete = element.getAttribute('aria-autocomplete');
    if (autocomplete && autocomplete.toLowerCase() !== 'none') return false;
    if (safeElementMatches(element, '[contenteditable]:not([contenteditable="false"])')) return false;
    return !safeQuerySelector(element, COMBOBOX_TEXT_ENTRY_DESCENDANT_SELECTOR);
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

/** Test hook: fixtures share one document while mutating clip and popup facts.
 * Production staleness for both memoized verdicts is bounded by a short TTL. */
export function resetDecorationPolicyCachesForTest(): void {
    constrainedRowStyleFactMemo = new WeakMap();
    comboboxOwnedIdMemo = new WeakMap();
    reviewCardFrontPredicate = null;
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

function isComboboxOwnedPopup(element: Element): boolean {
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
// role=combobox joins the control set for its non-editable listbox-trigger
// form only (editable comboboxes are already 'skip' via
// isEditableComposingContext, which classifyDecoration tests first).
const INTERACTIVE_CONTROL_SELECTOR = `button,summary,label,${roleSelectors('button,tab,menuitem,menuitemcheckbox,menuitemradio,option,switch,checkbox,radio,combobox')},[slot="more-button"],.more-button,#more,#less`;
const INTERACTIVE_LINK_SELECTOR = 'a[href],[role="link"]';
// Strict control contexts only: links in header/nav/footer/breadcrumbs are
// content-bearing (owner-pinned: breadcrumb, footer-help, global-nav labels
// keep furigana) — the compact cascade still classifies the genuinely
// chrome-shaped ones. Menus/toolbars/tablists are unambiguous control rows.
const INTERACTIVE_LINK_CONTEXT_SELECTOR = roleSelectors('menu,menubar,toolbar,tablist');

const CONTENT_CHIP_ROOT_SELECTOR = '.yomu-hosted-overflow-group';
// BookWalker viewer metadata (book title / description in the reader chrome)
// is reading material; the header context would otherwise classify it as
// compact chrome. Replaces the old profile-level ruby kill-switch.
const NAMED_CONTENT_ROOT_SELECTOR = `${CONTENT_CHIP_ROOT_SELECTOR},.viewer-title-bar,.bookTitleText,#bookDescription`;

export function interactivePassiveControl(element: Element): HTMLElement | null {
    const temporalMetadata = element.closest<HTMLElement>('time,[datetime]');
    if (temporalMetadata && isCompactTemporalMetadata(temporalMetadata)) return temporalMetadata;
    const control = element.closest<HTMLElement>(INTERACTIVE_CONTROL_SELECTOR);
    if (control
        // Conversation content wrapped in a clickable shell (Discord's
        // role=button messageContent) is CONTENT — pitch underline and ruby stay.
        && !isConversationTextClass(control)
        // A media card (thumbnail link/role=button with a real text label) is
        // CONTENT, not an icon button — UT-52's media-text tier.
        && !isMediaTextContentControl(control)) return control;
    const siblingOwnedControl = siblingOwnedInteractiveControl(element);
    if (siblingOwnedControl) return siblingOwnedControl;
    const link = element.closest<HTMLElement>(INTERACTIVE_LINK_SELECTOR);
    if (!link) return null;
    if (isCompactLinkedCardMetadata(link, element)) return link;
    if (element instanceof HTMLElement && isLikelyProseLink(link, element)) return null;
    return link.closest(INTERACTIVE_LINK_CONTEXT_SELECTOR) ? link : null;
}

const SIBLING_CONTROL_ANCESTOR_LIMIT = 3;

// Some component libraries render a control's visible label beside its real
// <button> instead of inside it (player panel headers and speed presets are
// representative). DOM ancestry alone then misclassifies the label as prose,
// so Yomu takes ownership of taps and gives it in-flow ruby. Treat a compact
// UI-labelled sibling as part of its single neighbouring control. The bounded
// geometry/context checks keep card titles next to overflow buttons as content.
function siblingOwnedInteractiveControl(element: Element): HTMLElement | null {
    if (!(element instanceof HTMLElement)) return null;
    const text = element.textContent?.replace(/\s+/g, '').trim() ?? '';
    // Component labels often end in `-text` (which is intentionally a prose
    // hint elsewhere), even though the label is a compact sibling of its real
    // button. A genuine article/prose context still wins; the class suffix
    // alone must not defeat explicit neighbouring-control structure.
    const chromeContext = isCompactInteractiveChromeContext(element);
    if (!isCompactInteractiveChromeText(text)
        || (isReadableProseContext(element) && !chromeContext)) return null;
    let current = element.parentElement;
    for (let depth = 0; current && depth < SIBLING_CONTROL_ANCESTOR_LIMIT; depth += 1, current = current.parentElement) {
        if (isLikelyProseElement(current) || current.childElementCount > 6) continue;
        const controls = Array.from(current.querySelectorAll<HTMLElement>(INTERACTIVE_CONTROL_SELECTOR))
            .filter(candidate => !candidate.contains(element) && !element.contains(candidate));
        if (controls.length !== 1) continue;
        const classFacts = `${element.className} ${current.className}`;
        const uiContext = isCompactInteractiveChromeContext(current) || UI_CLASS_RE.test(classFacts);
        if (!uiContext) continue;
        const rect = current.getBoundingClientRect();
        const measuredCompact = rect.height > 0
            && rect.height <= COMPACT_INTERACTIVE_CHROME_MAX_HEIGHT
            && (rect.width === 0 || rect.width <= COMPACT_INTERACTIVE_CHROME_MAX_WIDTH * 1.5);
        if (measuredCompact || rect.height === 0) return current;
    }
    return null;
}

function isCompactTemporalMetadata(element: HTMLElement): boolean {
    return isCompactMetadataElement(element);
}

// A clickable card may contain both a real reading title and one or more short
// metadata rows (vote/comment counts, time, category). The title remains
// content; a compact non-heading row is control metadata. Letting a framework
// mirror give that 14-16px row ruby-friendly line metrics can move the base out
// of the fixed card on WebKit, leaving only rt visible. This structural rule is
// deliberately site-neutral: linked card + heading + short non-prose sibling.
const COMPACT_LINKED_CARD_METADATA_TEXT_LIMIT = 80;
const COMPACT_LINKED_CARD_METADATA_MAX_HEIGHT_PX = 48;

function isCompactLinkedCardMetadata(link: HTMLElement, element: Element): boolean {
    const textElement = element instanceof HTMLElement ? element : element.parentElement;
    return Boolean(textElement && isLinkedCardMetadataElement(link, textElement));
}

function isLinkedCardMetadataElement(link: HTMLElement, textElement: HTMLElement): boolean {
    if (textElement.closest('h1,h2,h3,h4,h5,h6')) return false;
    const heading = safeQuerySelector(link, 'h1,h2,h3,h4,h5,h6');
    if (!heading) return false;
    return [
        !heading.contains(textElement),
        !isLikelyProseElement(textElement),
        isCompactMetadataElement(textElement),
    ].every(Boolean);
}

function isCompactMetadataElement(element: HTMLElement): boolean {
    const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const height = element.getBoundingClientRect().height;
    return [
        isTargetLanguageText(text),
        compactLength(text) <= COMPACT_LINKED_CARD_METADATA_TEXT_LIMIT,
        height === 0 || height <= COMPACT_LINKED_CARD_METADATA_MAX_HEIGHT_PX,
    ].every(Boolean);
}

function isMediaTextContentControl(control: HTMLElement): boolean {
    if (!safeElementMatches(control, 'a[href],[role="link"],[role="button"]')) return false;
    if (control.closest(INTERACTIVE_LINK_CONTEXT_SELECTOR)) return false;
    // REAL media only (thumbnail/avatar imagery). linkHasControlMedia also
    // matches svg/icon-class glyphs, but an icon is how CONTROLS decorate
    // themselves — a dropdown trigger's caret (comments 並べ替え sort button)
    // must not upgrade the control to content-with-ruby, which re-opened
    // class-A growth on the comments header (gate-3 stray-growth flag).
    // An <img>-backed caret is the same icon in different clothes: measured
    // media smaller than an avatar/thumbnail floor stays a control glyph
    // (unmeasured media — lazy-loading, detached probes — keeps content).
    const media = safeQuerySelector(control, 'img,picture,video,canvas');
    if (!media || !(media instanceof HTMLElement)) return false;
    return mediaElementIsThumbnailSized(media) && compactLength(control.textContent ?? '') > 2;
}

// Icon glyphs render 16-24px square; any real thumbnail/avatar has at least
// one edge well past that. Judged on the LONGEST edge so short-and-wide
// letterboxed thumbnails stay media.
const MEDIA_CONTENT_MIN_LONGEST_EDGE_PX = 32;

function mediaElementIsThumbnailSized(media: HTMLElement): boolean {
    const rect = media.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return true;
    return Math.max(rect.width, rect.height) >= MEDIA_CONTENT_MIN_LONGEST_EDGE_PX;
}

// Injected by the site layer (setReviewCardFrontPredicate) so this site-neutral
// policy can drop review-card fronts (jiten study / jpdb review question side)
// without importing site modules. Null until the reader registers it.
let reviewCardFrontPredicate: ((element: Element) => boolean) | null = null;

export function setReviewCardFrontPredicate(predicate: ((element: Element) => boolean) | null): void {
    reviewCardFrontPredicate = predicate;
}

// The policy is an explicit, ordered acceptance matrix: folding its mutually
// exclusive facts into opaque predicates would make precedence harder to audit.
// fallow-ignore-next-line complexity
export function classifyDecoration(element: Element): DecorationState {
    // Reader-owned surfaces (lookup panel, drawers, previews) manage their own
    // rendering; they are content by definition.
    if (element.closest(READER_ROOT_SELECTOR)) return 'content-ruby';
    if (decorationMustBeSkipped(element)) return 'skip';
    // YouTube owns these compact labels as controls, not reading content. Its
    // Shorts rail actively measures and ellipsizes Share/Remix labels; even an
    // out-of-tree annotation portal paints over those native glyphs and makes
    // the controls look truncated or missing. Leave the complete control
    // surface page-owned. Video titles, comments, descriptions, and captions
    // do not match this deliberately narrow predicate and remain annotatable.
    if (element instanceof HTMLElement && youtubeNativeChromeMustRemainPageOwned(element)) {
        return 'skip';
    }
    const control = interactivePassiveControl(element);
    if (control) {
        if (control.closest(CONTENT_CHIP_ROOT_SELECTOR)) return 'content-ruby';
        return 'interactive-passive';
    }
    if (element instanceof HTMLElement && compactMetadataChromeElement(element)) return 'interactive-passive';
    if (element.closest(NAMED_CONTENT_ROOT_SELECTOR)) return 'content-ruby';
    if (element instanceof HTMLElement && compactScanRubySuppression(element).suppress) return 'interactive-passive';
    return element instanceof HTMLElement && isProseFullContext(element) ? 'prose-full' : 'content-ruby';
}

// Keep the three safety owners visible and ordered at this single scan gate.
// fallow-ignore-next-line complexity
function decorationMustBeSkipped(element: Element): boolean {
    if (isEditableComposingContext(element)) return true;
    // A review-card FRONT (question side) is a plain prompt: never decorate it
    // so furigana/pitch cannot spoil the reading the learner must recall.
    if (reviewCardFrontPredicate?.(element)) return true;
    return false;
}

const YOUTUBE_MINI_GUIDE_CHROME_SELECTOR = [
    'ytd-mini-guide-entry-renderer',
    'yt-mini-guide-entry-renderer',
    'ytm-mini-guide-entry-renderer',
].join(',');
const YOUTUBE_SHORTS_ACTION_CHROME_SELECTOR = [
    'ytd-reel-player-overlay-renderer',
    'yt-reel-player-overlay-renderer',
    'ytm-reel-player-overlay-renderer',
].join(',');
const YOUTUBE_SHORTS_ROOT_SELECTOR = 'ytd-shorts,ytm-shorts';
const YOUTUBE_SHORTS_ACTION_RAIL_SELECTOR = [
    '#actions',
    '#action-buttons',
    '#shorts-action-buttons',
    '[role="toolbar"]',
    '[class*="shorts-action"]',
    '[class*="reel-action"]',
].join(',');
const YOUTUBE_MINI_GUIDE_CONTROL_SELECTOR = 'a[href],[role="link"],button,[role="button"]';
const YOUTUBE_SHORTS_ACTION_CONTROL_SELECTOR = 'button,[role="button"]';
// The live desktop/tablet shelf expander. Keep this deliberately exact: bare
// #more controls occur across YouTube, including ordinary content disclosures
// that should continue down the normal annotation lane.
const YOUTUBE_SHELF_EXPANSION_CONTROL_SELECTOR = 'ytd-shelf-renderer > ytd-vertical-list-renderer > #more > yt-formatted-string[role="button"]';

/**
 * YouTube owns the lifecycle of a shelf's compact `+ other N` expander. It
 * rewrites the control's child spans while recycling search results, so the
 * whole control stays outside the reader's decoration surface.
 */
export function youtubeShelfExpansionChromeMustRemainPageOwned(element: HTMLElement): boolean {
    if (!isYouTubeAppHostname()) return false;
    return Boolean(composedClosestMatching(element, YOUTUBE_SHELF_EXPANSION_CONTROL_SELECTOR));
}

export function youtubeNativeChromeMustRemainPageOwned(element: HTMLElement): boolean {
    if (youtubeShelfExpansionChromeMustRemainPageOwned(element)) return true;
    if (!isYouTubeAppHostname()) return false;
    // Ownership is structural, not a transient computed-style fact. YouTube
    // can mount these controls before their clipping CSS hydrates; admitting
    // them during that window still mutates/focuses page-owned chrome and a
    // later style pass cannot undo it. The recognized mini-guide, reel overlay,
    // and explicit Shorts action-rail boundaries are deliberately narrow, so
    // their native controls remain page-owned for their complete lifecycle.
    return Boolean(youtubeNativeChromeControl(element));
}

function youtubeNativeChromeControl(element: HTMLElement): HTMLElement | null {
    const miniGuide = composedClosestMatching(element, YOUTUBE_MINI_GUIDE_CHROME_SELECTOR);
    if (miniGuide) return composedControlInside(element, YOUTUBE_MINI_GUIDE_CONTROL_SELECTOR, miniGuide);
    const shorts = composedClosestMatching(element, YOUTUBE_SHORTS_ACTION_CHROME_SELECTOR);
    if (shorts) return composedControlInside(element, YOUTUBE_SHORTS_ACTION_CONTROL_SELECTOR, shorts);
    // Mobile/tablet variants can place the action rail beside, rather than
    // inside, a reel-player-overlay renderer. Re-admit only a button whose
    // composed branch passes through the explicit compact action rail; other
    // buttons elsewhere in the large ytd/ytm-shorts subtree remain content/UI
    // under the ordinary policy.
    const shortsRoot = composedClosestMatching(element, YOUTUBE_SHORTS_ROOT_SELECTOR);
    if (!shortsRoot) return null;
    // Resolve the button before its rail. Labels such as
    // `.proof-shorts-action-label` can themselves match the deliberately broad
    // live-site rail selector; treating that descendant as the boundary makes
    // it appear not to contain its own ancestor button and re-admits the label
    // as annotatable content.
    const control = composedClosestMatching(element, YOUTUBE_SHORTS_ACTION_CONTROL_SELECTOR);
    if (!control) return null;
    const actionRail = composedClosestMatching(control, YOUTUBE_SHORTS_ACTION_RAIL_SELECTOR);
    if (!actionRail || !isComposedAncestor(shortsRoot, actionRail)) return null;
    return isComposedAncestor(actionRail, control) ? control : null;
}

function composedClosestMatching(element: HTMLElement, selector: string): HTMLElement | null {
    let current: HTMLElement | null = element;
    for (let depth = 0; current && depth < 16; depth += 1) {
        if (safeElementMatches(current, selector)) return current;
        current = composedAncestorElement(current);
    }
    return null;
}

function composedControlInside(element: HTMLElement, selector: string, boundary: HTMLElement): HTMLElement | null {
    const control = composedClosestMatching(element, selector);
    return control && isComposedAncestor(boundary, control) ? control : null;
}

function isComposedAncestor(ancestor: HTMLElement, descendant: HTMLElement): boolean {
    let current: HTMLElement | null = descendant;
    for (let depth = 0; current && depth < 16; depth += 1) {
        if (current === ancestor) return true;
        current = composedAncestorElement(current);
    }
    return false;
}

export function decorationSuppressesRuby(state: DecorationState | undefined): boolean {
    return state === 'interactive-passive';
}

export function stampDecorationState(host: HTMLElement, state: DecorationState): void {
    if (host.getAttribute(DECORATION_STATE_ATTRIBUTE) !== state) {
        host.setAttribute(DECORATION_STATE_ATTRIBUTE, state);
    }
}

export function decorationStateForWord(word: HTMLElement): DecorationState | null {
    const stamped = word.closest(`[${DECORATION_STATE_ATTRIBUTE}]`);
    const value = stamped?.getAttribute(DECORATION_STATE_ATTRIBUTE);
    return value === 'prose-full' || value === 'content-ruby' || value === 'interactive-passive' || value === 'skip'
        ? value
        : null;
}
