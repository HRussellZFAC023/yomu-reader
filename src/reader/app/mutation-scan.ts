import { mutationInsideClosest } from '../dom/mutation';
import { HAS_JAPANESE } from '../dom/constants';
import {
    noteScannedShadowRoot,
    watchPotentialOpenShadowRootHost,
} from '../dom/shadow-scan-registry';
import {
    ANNOTATION_SCOPE_SURFACE_ATTRIBUTE,
    annotationScopeRoots,
    nodeWithinAnnotationScope,
} from './annotation-scope';

export const AUTO_SCAN_OBSERVER_OPTIONS: MutationObserverInit = {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    // style/class carry the OTHER reveal mechanism (class E): menus/sheets that
    // keep their DOM and toggle display/visibility (YouTube player settings,
    // m.youtube bottom sheets) deliver no childList mutation on open. oldValue
    // is required so a style flip can be shape-tested as hidden\u2192shown instead
    // of scheduling on every animation frame's style churn.
    attributeFilter: ['hidden', 'open', 'aria-hidden', 'aria-expanded', 'contenteditable', 'role', 'aria-controls', 'aria-disabled', ANNOTATION_SCOPE_SURFACE_ATTRIBUTE, 'style', 'class'],
    attributeOldValue: true,
};
const HIDDEN_INLINE_STYLE_RE = /display\s*:\s*none|visibility\s*:\s*hidden/i;
const MUTATION_TEXT_SCAN_LIMIT = 4000;
const MUTATION_TEXT_NODE_SCAN_LIMIT = 80;
// The document MutationObserver cannot see mutations inside a shadow tree, so
// a host added with an already-populated OPEN shadow root (custom-element
// upgrade, framework hydration racing the observer callback) looks empty to a
// light-DOM-only walk. These bound how deep/wide the predicate looks into
// composed shadow descendants of an added subtree — matching the collection
// walk's own bounds (src/reader/dom/index.ts SHADOW_SCAN_MAX_DEPTH /
// SHADOW_JAPANESE_LOOKAHEAD_ELEMENT_LIMIT) so this stays a bounded probe, not
// a second unbounded traversal.
const MUTATION_SHADOW_MAX_DEPTH = 4;
const MUTATION_SHADOW_ELEMENT_INSPECT_LIMIT = 160;

export interface MutationJapaneseScanBudget {
    inspectedElements: number;
    inspectedTextNodes: number;
    inspectedTextLength: number;
    elementBudgetExhausted: boolean;
    textBudgetExhausted: boolean;
}

// One budget is created per MutationObserver delivery and shared by every
// record and added sibling in that delivery. Without that shared ownership, a
// framework can defeat each nominal bound simply by batching many small
// subtrees into one callback.
export function createMutationJapaneseScanBudget(): MutationJapaneseScanBudget {
    return {
        inspectedElements: 0,
        inspectedTextNodes: 0,
        inspectedTextLength: 0,
        elementBudgetExhausted: false,
        textBudgetExhausted: false,
    };
}
const TEXT_REVEAL_ATTRIBUTES = new Set(['hidden', 'open', 'aria-hidden', 'aria-expanded', 'contenteditable', 'role', 'aria-controls', 'aria-disabled', ANNOTATION_SCOPE_SURFACE_ATTRIBUTE]);
const READER_ROOT_SELECTOR = '[data-jpdb-reader-root]';
const DYNAMIC_UI_DISCLOSURE_SELECTOR = [
    'summary',
    '[aria-controls]',
    '[aria-expanded]',
    '[aria-haspopup]:not([aria-haspopup="false"])',
    '[role="menuitem"]',
    '[role="menuitemcheckbox"]',
    '[role="menuitemradio"]',
    '[role="tab"]',
].join(',');
const JPDB_PAGE_ENHANCEMENT_ROOT_SELECTOR = [
    '.result.vocabulary',
    '.result.kanji',
    '.entry',
    '.answer-box',
    '.review-card',
    '.answer',
].join(',');
const JPDB_PAGE_ENHANCEMENT_ANCHOR_SELECTOR = [
    '.subsection-meanings',
    '.subsection-used-in',
    '.cross-table',
].join(',');
const JPDB_PAGE_ENHANCEMENT_TARGET_SELECTOR = `${JPDB_PAGE_ENHANCEMENT_ROOT_SELECTOR},${JPDB_PAGE_ENHANCEMENT_ANCHOR_SELECTOR}`;
const JPDB_PAGE_ENHANCEMENT_DYNAMIC_IGNORE_SELECTOR = [
    READER_ROOT_SELECTOR,
    '[data-immersion-kit]',
    '[class*="immersion" i]',
].join(',');
const JPDB_PAGE_ENHANCEMENT_VISIBILITY_ATTRIBUTES = new Set(['hidden', 'aria-hidden']);

export function mutationTouchesAsbPlayer(mutation: MutationRecord): boolean {
    const nodes = [
        mutation.target,
        ...Array.from(mutation.addedNodes),
    ];
    return nodes.some(node => {
        const element = node.nodeType === Node.ELEMENT_NODE
            ? node as Element
            : node.parentElement;
        return Boolean(element?.closest?.('.asbplayer-offscreen, .asbplayer-subtitles-container-bottom'));
    });
}

export function mutationInsideReaderRoot(mutation: MutationRecord): boolean {
    return mutationInsideClosest(mutation, READER_ROOT_SELECTOR);
}

// Some UI libraries keep all submenu DOM mounted and swap panels using
// transforms/dimensions that intentionally do not qualify as a reveal
// mutation. A click on an explicit disclosure/menu/tab control is the stable
// semantic signal. The caller schedules one debounced post-click scan, not a
// scan for every style frame.
export function clickMayRevealDynamicUiText(eventOrTarget: Event | EventTarget | null): boolean {
    const elements = dynamicUiClickElements(eventOrTarget);
    if (elements.some(element => element.closest(READER_ROOT_SELECTOR))) return false;
    return elements.some(element => Boolean(element.closest(DYNAMIC_UI_DISCLOSURE_SELECTOR)));
}

// A document capture listener sees a click from an open shadow tree retargeted
// to the outer custom-element host. The actual disclosure button remains in
// the composed path, so inspect that path while the event is dispatching. This
// keeps newly revealed menus/sheets scannable across component libraries
// without naming any site or custom-element tag.
function dynamicUiClickElements(eventOrTarget: Event | EventTarget | null): Element[] {
    const path = eventOrTarget instanceof Event
        ? eventOrTarget.composedPath()
        : [eventOrTarget];
    return path.filter((target): target is Element => target instanceof Element);
}

export function mutationMayContainJapaneseText(
    mutation: MutationRecord,
    budget: MutationJapaneseScanBudget = createMutationJapaneseScanBudget(),
    scopeRoots: readonly HTMLElement[] | null = annotationScopeRoots(),
): boolean {
    const targetNodes = mutationNodesWithinAnnotationScope(mutation.target, scopeRoots);
    if (mutation.type === 'characterData') {
        return nodesMayContainJapanese(targetNodes, budget);
    }
    if (mutation.type === 'attributes') {
        const attribute = mutation.attributeName ?? '';
        if (attribute === 'style' || attribute === 'class') {
            return styleOrClassMutationRevealsJapaneseText(mutation, attribute, budget, targetNodes);
        }
        if (!TEXT_REVEAL_ATTRIBUTES.has(attribute)) return false;
        return nodesMayContainJapanese(targetNodes, budget);
    }
    // Reader-owned additions (the replay path re-appends a mirror outside the
    // scanner's paused-observer window) are our own paint, never new page text.
    let mayContainJapanese = false;
    // Do not short-circuit after the first Japanese node: discovery has the
    // additional job of registering empty/Latin shadow roots later in the
    // same mutation so their future hydration is observable.
    const candidates = new Set(Array.from(mutation.addedNodes)
        .flatMap(node => mutationNodesWithinAnnotationScope(node, scopeRoots)));
    for (const node of candidates) {
        if (!nodeIsReaderOwned(node) && nodeTextMayContainJapanese(node, budget)) mayContainJapanese = true;
    }
    return mayContainJapanese;
}

function nodesMayContainJapanese(
    nodes: readonly Node[],
    budget: MutationJapaneseScanBudget,
): boolean {
    let found = false;
    // Discovery must visit every scoped candidate even after Japanese is
    // proven: a later empty open root still needs observer registration.
    for (const node of nodes) {
        if (nodeTextMayContainJapanese(node, budget)) found = true;
    }
    return found;
}

// A scoped page still observes document.body so a Reader Surface added later
// can be discovered. Restrict each record to nodes already inside a declared
// surface, or to newly-added surface roots contained by that record. This
// prevents translated docs chrome from registering shadow observers or
// waking whole-page scans while preserving ordinary unscoped pages exactly.
function mutationNodesWithinAnnotationScope(
    node: Node,
    scopeRoots: readonly HTMLElement[] | null,
): Node[] {
    if (!scopeRoots) return [node];
    if (nodeWithinAnnotationScope(node, scopeRoots)) return [node];
    if (!(node instanceof Element || node instanceof DocumentFragment)) return [];
    return scopeRoots.filter(root => node === root || node.contains(root));
}

function nodeIsReaderOwned(node: Node): boolean {
    const element = mutationNodeElement(node);
    return Boolean(element?.closest(`${READER_ROOT_SELECTOR},.jpdb-reader-text-mirror`));
}

// Cheap reveal filter for the noisy style/class channel, checked BEFORE the
// (bounded) Japanese-text walk. A style mutation is a reveal only when the old
// inline style hid the element and the new one no longer does; a class flip is
// a candidate only when the value actually changed and the element renders
// now. Everything else (position/size/color churn, hover classes on hidden
// trees, hide transitions) schedules nothing.
function styleOrClassMutationRevealsJapaneseText(
    mutation: MutationRecord,
    attribute: 'style' | 'class',
    budget: MutationJapaneseScanBudget,
    candidates: readonly Node[],
): boolean {
    const element = mutation.target instanceof HTMLElement ? mutation.target : null;
    if (!element || !candidates.length) return false;
    const current = element.getAttribute(attribute) ?? '';
    if ((mutation.oldValue ?? '') === current) return false;
    if (attribute === 'style') {
        const wasHidden = HIDDEN_INLINE_STYLE_RE.test(mutation.oldValue ?? '');
        if (!wasHidden || HIDDEN_INLINE_STYLE_RE.test(current)) return false;
    }
    if (!elementRendersNow(element)) return false;
    return nodesMayContainJapanese(candidates, budget);
}

function elementRendersNow(element: HTMLElement): boolean {
    // Detached nodes can appear in queued records after a framework swap —
    // nothing to reveal there.
    if (!element.isConnected) return false;
    if (element.closest('[hidden]')) return false;
    if (typeof element.checkVisibility === 'function') return element.checkVisibility();
    const view = element.ownerDocument.defaultView;
    if (!view) return false;
    const style = view.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
}

function nodeTextMayContainJapanese(node: Node, budget: MutationJapaneseScanBudget): boolean {
    if (node.nodeType === Node.TEXT_NODE) return textNodeMayContainJapanese(node, budget);
    const root = node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? node : mutationNodeElement(node);
    return root ? nodeTreeTextMayContainJapanese(root, budget) : false;
}

function nodeTreeTextMayContainJapanese(root: Node, budget: MutationJapaneseScanBudget): boolean {
    let found = root.nodeType === Node.ELEMENT_NODE
        && probeComposedElement(root as Element, MUTATION_SHADOW_MAX_DEPTH, budget);
    if (budget.elementBudgetExhausted || budget.textBudgetExhausted) return true;
    const walker = (root.ownerDocument ?? document).createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    );
    let node: Node | null;
    while ((node = walker.nextNode())) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (textNodeMayContainJapanese(node, budget)) found = true;
        } else if (probeComposedElement(node as Element, MUTATION_SHADOW_MAX_DEPTH, budget)) {
            found = true;
        }
        if (budget.elementBudgetExhausted || budget.textBudgetExhausted) return true;
    }
    return found;
}

// Registers every open shadow root it looks at (even Latin-only/empty ones)
// so a later hydration inside it is observable, then reports whether Japanese
// text was found (or the lookahead budget ran out — reported as "maybe" so
// the caller schedules its normal deferred scan rather than silently
// dropping the branch). A closed root (element.shadowRoot === null) is
// unreachable and not an error.
function probeComposedShadowRoot(
    shadowRoot: ShadowRoot | null,
    remainingDepth: number,
    budget: MutationJapaneseScanBudget,
): boolean {
    if (!shadowRoot) return false;
    noteScannedShadowRoot(shadowRoot);
    if (remainingDepth <= 0) {
        budget.elementBudgetExhausted = true;
        return true;
    }
    if (budget.elementBudgetExhausted || budget.textBudgetExhausted) return true;
    let found = false;
    const walker = shadowRoot.ownerDocument.createTreeWalker(
        shadowRoot,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    );
    let node: Node | null;
    while ((node = walker.nextNode())) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (textNodeMayContainJapanese(node, budget)) found = true;
        } else if (probeComposedElement(node as Element, remainingDepth - 1, budget)) {
            found = true;
        }
        if (budget.elementBudgetExhausted || budget.textBudgetExhausted) return true;
    }
    return found;
}

function probeComposedElement(
    element: Element,
    remainingDepth: number,
    budget: MutationJapaneseScanBudget,
): boolean {
    if (!consumeProbeElement(budget)) return true;
    // Keep upstream's generic attachment bridge/poll fallback in the same
    // bounded element walk as the shared Japanese-text probe. It covers both
    // native hosts and custom elements, including page-realm attachShadow()
    // calls and delayed hydration. An already-open root is registered
    // idempotently here and by probeComposedShadowRoot below.
    const shadowRoot = element instanceof HTMLElement
        ? watchPotentialOpenShadowRootHost(element, true)
        : element.shadowRoot;
    return probeComposedShadowRoot(shadowRoot, remainingDepth, budget);
}

function consumeProbeElement(budget: MutationJapaneseScanBudget): boolean {
    if (budget.inspectedElements >= MUTATION_SHADOW_ELEMENT_INSPECT_LIMIT) {
        budget.elementBudgetExhausted = true;
        return false;
    }
    budget.inspectedElements += 1;
    return true;
}

function textNodeMayContainJapanese(node: Node, budget: MutationJapaneseScanBudget): boolean {
    if (budget.inspectedTextNodes >= MUTATION_TEXT_NODE_SCAN_LIMIT
        || budget.inspectedTextLength >= MUTATION_TEXT_SCAN_LIMIT) {
        budget.textBudgetExhausted = true;
        return true;
    }
    budget.inspectedTextNodes += 1;
    const text = node.textContent ?? '';
    const remainingLength = MUTATION_TEXT_SCAN_LIMIT - budget.inspectedTextLength;
    const sampledText = text.slice(0, remainingLength);
    budget.inspectedTextLength += sampledText.length;
    if (HAS_JAPANESE.test(sampledText)) return true;
    if (sampledText.length < text.length) {
        budget.textBudgetExhausted = true;
        return true;
    }
    return false;
}

export function mutationMayAffectJpdbPageEnhancements(mutation: MutationRecord): boolean {
    if (mutation.type === 'attributes') return jpdbPageEnhancementAttributeMayAffect(mutation);
    if (mutation.type === 'characterData') return nodeMayAffectJpdbPageEnhancements(mutation.target);
    if (mutation.type === 'childList') return childListMutationMayAffectJpdbPageEnhancements(mutation);
    return false;
}

function childListMutationMayAffectJpdbPageEnhancements(mutation: MutationRecord): boolean {
    const nodes = [
        ...Array.from(mutation.addedNodes),
        ...Array.from(mutation.removedNodes),
    ];
    return nodes.some(nodeMayAffectJpdbPageEnhancements)
        || childListTargetMayAffectJpdbPageEnhancements(mutation.target);
}

function childListTargetMayAffectJpdbPageEnhancements(node: Node): boolean {
    const element = mutationNodeElement(node);
    if (!element || element.closest(JPDB_PAGE_ENHANCEMENT_DYNAMIC_IGNORE_SELECTOR)) return false;
    return elementMatchesJpdbPageEnhancementTarget(element)
        || Boolean(element.closest(JPDB_PAGE_ENHANCEMENT_TARGET_SELECTOR));
}

function jpdbPageEnhancementAttributeMayAffect(mutation: MutationRecord): boolean {
    return JPDB_PAGE_ENHANCEMENT_VISIBILITY_ATTRIBUTES.has(mutation.attributeName ?? '')
        && nodeMayAffectJpdbPageEnhancements(mutation.target);
}

function nodeMayAffectJpdbPageEnhancements(node: Node): boolean {
    const element = mutationNodeElement(node);
    if (!element || element.closest(JPDB_PAGE_ENHANCEMENT_DYNAMIC_IGNORE_SELECTOR)) return false;
    if (node.nodeType === Node.TEXT_NODE) return textNodeMayAffectJpdbPageEnhancements(node, element);
    return elementMayAffectJpdbPageEnhancements(element);
}

function textNodeMayAffectJpdbPageEnhancements(node: Node, parent: Element): boolean {
    return HAS_JAPANESE.test(node.textContent ?? '')
        && Boolean(parent.closest(JPDB_PAGE_ENHANCEMENT_ROOT_SELECTOR));
}

function elementMayAffectJpdbPageEnhancements(element: Element): boolean {
    return elementMatchesJpdbPageEnhancementTarget(element)
        || elementContainsJpdbPageEnhancementTarget(element)
        || elementTextMayAffectJpdbPageEnhancements(element);
}

function elementMatchesJpdbPageEnhancementTarget(element: Element): boolean {
    return element.matches(JPDB_PAGE_ENHANCEMENT_ROOT_SELECTOR)
        || element.matches(JPDB_PAGE_ENHANCEMENT_ANCHOR_SELECTOR);
}

function elementContainsJpdbPageEnhancementTarget(element: Element): boolean {
    return Boolean(element.querySelector(JPDB_PAGE_ENHANCEMENT_TARGET_SELECTOR));
}

function elementTextMayAffectJpdbPageEnhancements(element: Element): boolean {
    return HAS_JAPANESE.test(element.textContent ?? '')
        && Boolean(element.closest(JPDB_PAGE_ENHANCEMENT_ROOT_SELECTOR));
}

function mutationNodeElement(node: Node): Element | null {
    if (node.nodeType === Node.ELEMENT_NODE) return node as Element;
    return node.parentElement;
}
