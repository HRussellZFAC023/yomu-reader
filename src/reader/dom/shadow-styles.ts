// Shadow-root style propagation. Yomu's reader stylesheet lives in
// document.head (or a hosted <link>), and document-level CSS never cascades
// into shadow roots. Any styled node Yomu mounts inside an open shadow root
// (text mirrors, canvas layers, control mirrors) therefore rendered UNSTYLED
// there — most visibly, the additive mirror's transparent base resolved
// opaque and painted a double image over the native text on web-component
// sites (Reddit shreddit, Shoelace, Spectrum).
//
// This module adopts one shared constructable stylesheet into every shadow
// root Yomu mounts into. The sheet object is shared, so a later CSS update
// (the async full-sheet fallback replacing the critical subset) propagates to
// every adopted root with a single replaceSync. Engines without constructable
// stylesheets (and jsdom) get a marked <style> clone per root, updated in
// place through a WeakRef sweep.

const SHADOW_STYLE_MARKER = 'data-yomu-shadow-reader-style';

let shadowReaderCssText = '';
let sharedShadowSheet: CSSStyleSheet | null | undefined;
const adoptedShadowRoots = new WeakSet<ShadowRoot>();
const clonedShadowStyleNodes = new Set<WeakRef<HTMLStyleElement>>();

function supportsConstructableSheets(root: ShadowRoot): boolean {
    if (typeof CSSStyleSheet !== 'function' || !('adoptedStyleSheets' in root)) return false;
    if (sharedShadowSheet !== undefined) return sharedShadowSheet !== null;
    try {
        sharedShadowSheet = new CSSStyleSheet();
        sharedShadowSheet.replaceSync(shadowReaderCssText);
    } catch {
        // Engines that expose the constructor but reject construction or
        // replaceSync (older WebKit) fall back to per-root style nodes.
        sharedShadowSheet = null;
    }
    return sharedShadowSheet !== null;
}

// Feed the current effective reader CSS. Called at style install and again
// when the async full-sheet fallback resolves; adopted roots update in place.
export function setShadowReaderCss(css: string): void {
    if (css === shadowReaderCssText) return;
    shadowReaderCssText = css;
    if (sharedShadowSheet) {
        try {
            sharedShadowSheet.replaceSync(css);
        } catch {
            // Keep the previous sheet contents; style nodes below still update.
        }
    }
    for (const ref of clonedShadowStyleNodes) {
        const node = ref.deref();
        if (!node || !node.isConnected) {
            clonedShadowStyleNodes.delete(ref);
            continue;
        }
        node.textContent = css;
    }
}

// Idempotently make Yomu's reader CSS available inside the shadow root that
// contains `host`. No-op for light-DOM hosts.
export function ensureReaderStylesForHost(host: Element): void {
    const root = host.getRootNode();
    if (typeof ShadowRoot === 'undefined' || !(root instanceof ShadowRoot)) return;
    ensureReaderStylesInShadowRoot(root);
}

export function ensureReaderStylesInShadowRoot(root: ShadowRoot): void {
    if (adoptedShadowRoots.has(root)) return;
    adoptedShadowRoots.add(root);
    if (supportsConstructableSheets(root) && sharedShadowSheet) {
        try {
            root.adoptedStyleSheets = [...root.adoptedStyleSheets, sharedShadowSheet];
            return;
        } catch {
            // Fall through to the style-node path (e.g. cross-realm roots).
        }
    }
    if (root.querySelector(`style[${SHADOW_STYLE_MARKER}]`)) return;
    const style = root.ownerDocument.createElement('style');
    style.setAttribute(SHADOW_STYLE_MARKER, 'true');
    style.textContent = shadowReaderCssText;
    root.append(style);
    clonedShadowStyleNodes.add(new WeakRef(style));
}
