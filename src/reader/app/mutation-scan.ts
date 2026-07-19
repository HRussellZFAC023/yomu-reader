import { mutationInsideClosest } from '../dom/mutation';
import { HAS_JAPANESE } from '../dom/constants';
import { noteScannedShadowRoot, watchPotentialOpenShadowRootHost } from '../dom/shadow-scan-registry';

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
    attributeFilter: ['hidden', 'open', 'aria-hidden', 'aria-expanded', 'contenteditable', 'role', 'aria-controls', 'aria-disabled', 'style', 'class'],
    attributeOldValue: true,
};
const HIDDEN_INLINE_STYLE_RE = /display\s*:\s*none|visibility\s*:\s*hidden/i;
const MUTATION_TEXT_SCAN_LIMIT = 4000;
const MUTATION_TEXT_NODE_SCAN_LIMIT = 80;
const MUTATION_ELEMENT_SCAN_LIMIT = 240;
const TEXT_REVEAL_ATTRIBUTES = new Set(['hidden', 'open', 'aria-hidden', 'aria-expanded', 'contenteditable', 'role', 'aria-controls', 'aria-disabled']);
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

export function mutationMayContainJapaneseText(mutation: MutationRecord): boolean {
    if (mutation.type === 'characterData') return nodeTextMayContainJapanese(mutation.target);
    if (mutation.type === 'attributes') {
        const attribute = mutation.attributeName ?? '';
        if (attribute === 'style' || attribute === 'class') return styleOrClassMutationRevealsJapaneseText(mutation, attribute);
        if (!TEXT_REVEAL_ATTRIBUTES.has(attribute)) return false;
        return nodeTextMayContainJapanese(mutation.target);
    }
    // Reader-owned additions (the replay path re-appends a mirror outside the
    // scanner's paused-observer window) are our own paint, never new page text.
    return Array.from(mutation.addedNodes).some(node => !nodeIsReaderOwned(node) && nodeTextMayContainJapanese(node));
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
function styleOrClassMutationRevealsJapaneseText(mutation: MutationRecord, attribute: 'style' | 'class'): boolean {
    const element = mutation.target instanceof HTMLElement ? mutation.target : null;
    if (!element) return false;
    const current = element.getAttribute(attribute) ?? '';
    if ((mutation.oldValue ?? '') === current) return false;
    if (attribute === 'style') {
        const wasHidden = HIDDEN_INLINE_STYLE_RE.test(mutation.oldValue ?? '');
        if (!wasHidden || HIDDEN_INLINE_STYLE_RE.test(current)) return false;
    }
    if (!elementRendersNow(element)) return false;
    return nodeTextMayContainJapanese(element);
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

function nodeTextMayContainJapanese(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) return HAS_JAPANESE.test(node.textContent ?? '');
    const root = node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? node : mutationNodeElement(node);
    return root ? nodeTreeTextMayContainJapanese(root) : false;
}

function nodeTreeTextMayContainJapanese(root: Node): boolean {
    const budget: MutationTextScanBudget = {
        inspectedLength: 0,
        inspectedTextNodes: 0,
        inspectedElements: 0,
    };
    const pendingRoots: Node[] = [root];
    const seenRoots = new Set<Node>();
    while (pendingRoots.length) {
        const branch = pendingRoots.shift()!;
        if (seenRoots.has(branch)) continue;
        seenRoots.add(branch);
        enqueueOpenShadowRoot(branch, pendingRoots);
        if (scanMutationBranch(branch, pendingRoots, budget)) return true;
    }
    // Reaching the sampling budget is not evidence that the remaining subtree
    // is English-only. Treat an exhausted sample as a potential match so the
    // caller schedules its normal bounded scan/continuation; otherwise a large
    // framework insertion can permanently strand Japanese text after the
    // sampled head.
    return false;
}

interface MutationTextScanBudget {
    inspectedLength: number;
    inspectedTextNodes: number;
    inspectedElements: number;
}

function scanMutationBranch(
    branch: Node,
    pendingRoots: Node[],
    budget: MutationTextScanBudget,
): boolean {
    const walker = document.createTreeWalker(branch, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
        if (mutationScanNodeMayMatch(node, pendingRoots, budget)) return true;
    }
    return false;
}

function mutationScanNodeMayMatch(
    node: Node,
    pendingRoots: Node[],
    budget: MutationTextScanBudget,
): boolean {
    if (node.nodeType === Node.ELEMENT_NODE) {
        budget.inspectedElements += 1;
        enqueueOpenShadowRoot(node, pendingRoots);
    } else {
        const text = node.textContent ?? '';
        budget.inspectedTextNodes += 1;
        budget.inspectedLength += text.length;
        if (HAS_JAPANESE.test(text)) return true;
    }
    return mutationTextScanBudgetExhausted(budget);
}

function enqueueOpenShadowRoot(node: Node, pendingRoots: Node[]): void {
    if (!(node instanceof HTMLElement)) return;
    watchPotentialOpenShadowRootHost(node);
    const shadowRoot = node.shadowRoot;
    if (!shadowRoot) return;
    noteScannedShadowRoot(shadowRoot);
    pendingRoots.push(shadowRoot);
}

function mutationTextScanBudgetExhausted(budget: MutationTextScanBudget): boolean {
    return budget.inspectedLength >= MUTATION_TEXT_SCAN_LIMIT
        || budget.inspectedTextNodes >= MUTATION_TEXT_NODE_SCAN_LIMIT
        || budget.inspectedElements >= MUTATION_ELEMENT_SCAN_LIMIT;
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
