// Shadow roots the fragment walk has descended into. A MutationObserver with
// subtree:true never crosses shadow boundaries, so web-component re-renders
// (Lit hydration on Reddit shreddit, Shoelace, Spectrum) scheduled NO rescan:
// chrome rendered after the boot scan stayed bare until an unrelated trigger
// (the user's own tap) happened to run a scan. Every open shadow root the
// collection walk commits to is recorded here so the app can attach its
// auto-scan observer to it — the tap stops being the scan trigger.

const scannedShadowRootRefs = new Set<WeakRef<ShadowRoot>>();
// undefined = unseen, true = active, false = detached and eligible to replay.
const scannedShadowRootState = new WeakMap<ShadowRoot, boolean>();
export type ShadowRootDiscoveryCause = 'scan' | 'attached' | 'replay';
let shadowRootScanHook: ((root: ShadowRoot, cause: ShadowRootDiscoveryCause) => void) | null = null;

// The page-realm bridge is immediate in the normal case. Its fallback is a
// finite per-host window: enough for ordinary framework hydration, but never a
// permanent idle-page poll. Work is bounded to 160 live hosts per tick and 40
// checks per tracked host.
const POTENTIAL_SHADOW_HOST_POLL_MS = 100;
const POTENTIAL_SHADOW_HOST_POLL_LIMIT = 40;
const MAX_POTENTIAL_SHADOW_HOSTS = 160;
const MAX_PENDING_UPGRADE_NAMES = 64;
export const OPEN_SHADOW_ROOT_DISCOVERY_EVENT = 'yomu:open-shadow-root-attached';
const PAGE_SHADOW_DISCOVERY_KEY = '__yomuOpenShadowRootDiscoveryV1';

interface PotentialShadowHost {
    ref: WeakRef<Element>;
    remainingPolls: number;
}

const potentialShadowHosts = new Set<PotentialShadowHost>();
let seenPotentialShadowHosts = new WeakSet<Element>();
let potentialShadowHostTimer: number | undefined;
const subscribedUpgradeNames = new Set<string>();
let customElementLifecycleGeneration = 0;
let customElementUpgradeHook: (() => void) | null = null;
let pendingUpgradeWakeup = false;
let acceptPendingUpgradeWakeups = true;

let openShadowRootDiscoveryUsers = 0;

// Called by the fragment walk for every open shadow root it descends into.
// Idempotent per root; invokes the app hook immediately for new roots.
export function noteScannedShadowRoot(root: ShadowRoot): void {
    noteShadowRoot(root, 'scan');
}

function noteShadowRoot(root: ShadowRoot, cause: ShadowRootDiscoveryCause): void {
    const active = scannedShadowRootState.get(root);
    if (active) return;
    scannedShadowRootState.set(root, true);
    if (active === undefined) scannedShadowRootRefs.add(new WeakRef(root));
    shadowRootScanHook?.(root, cause);
}

// Content-world userscripts and page scripts have different JavaScript
// prototypes in Chromium/WebKit. The page-realm bridge is immediate in the
// normal case; custom-element hosts encountered by the generic DOM walk also
// get a bounded weak-reference poll so CSP restrictions and captured original
// methods cannot strand a later open root. Native (<div>/<span>) hosts are
// deliberately NOT polled (ccbe1c023): a busy SPA refills that set faster than
// it drains — a permanent 10Hz timer for hosts that almost never attachShadow —
// and their genuine late open roots are already covered by the page-realm
// bridge. An undefined custom element instead subscribes to its whenDefined().
export function watchPotentialOpenShadowRootHost(host: Element): ShadowRoot | null {
    const root = host.shadowRoot;
    if (root) {
        noteShadowRoot(root, 'scan');
        return root;
    }
    const tagName = host.localName.toLowerCase();
    const isCustomElement = tagName.includes('-');
    if (!isCustomElement) return null;
    const registry = customElementRegistry();
    if (registry && !registry.get(tagName)) {
        subscribeToCustomElementUpgrade(registry, tagName);
        return null;
    }
    if (seenPotentialShadowHosts.has(host)
        || potentialShadowHosts.size >= MAX_POTENTIAL_SHADOW_HOSTS) return null;
    seenPotentialShadowHosts.add(host);
    potentialShadowHosts.add({
        ref: new WeakRef(host),
        remainingPolls: POTENTIAL_SHADOW_HOST_POLL_LIMIT,
    });
    schedulePotentialShadowHostPoll();
    return null;
}

// Seed hosts that were already in the document when the reader started but
// have not upgraded yet. `:not(:defined)` is a browser-native custom-element
// index, avoiding the expensive second all-elements walk that dense pages paid
// before the startup scan fast path was introduced.
// A host can be inserted before its component upgrades and calls attachShadow().
// That later attachment is not itself a DOM mutation, so neither the document
// observer nor a walk of the earlier insertion can discover the new root. Keep
// one page-realm bridge while the reader is alive and register newly attached
// open roots at creation time. The install is reference-counted so repeated app
// setup/teardown cannot stack listeners or stop discovery too early.
export function installOpenShadowRootDiscovery(): () => void {
    openShadowRootDiscoveryUsers += 1;
    if (openShadowRootDiscoveryUsers === 1) {
        installPageOpenShadowRootDiscoveryBridge();
        document.addEventListener(OPEN_SHADOW_ROOT_DISCOVERY_EVENT, handleOpenShadowRootAttached, true);
        try {
            document.querySelectorAll<Element>(':not(:defined)').forEach(host => watchPotentialOpenShadowRootHost(host));
        } catch {
            // Mutation-time discovery remains available on older engines.
        }
        schedulePotentialShadowHostPoll();
    }
    let disposed = false;
    return () => {
        if (disposed) return;
        disposed = true;
        openShadowRootDiscoveryUsers -= 1;
        if (openShadowRootDiscoveryUsers > 0) return;
        document.removeEventListener(OPEN_SHADOW_ROOT_DISCOVERY_EVENT, handleOpenShadowRootAttached, true);
        if (!customElementUpgradeHook) resetPotentialShadowHostTracking();
    };
}

function handleOpenShadowRootAttached(event: Event): void {
    const host = event.composedPath()[0];
    const root = host instanceof Element ? host.shadowRoot : null;
    if (root) noteShadowRoot(root, 'attached');
}

function schedulePotentialShadowHostPoll(): void {
    if ((!openShadowRootDiscoveryUsers && !customElementUpgradeHook)
        || potentialShadowHostTimer !== undefined
        || !potentialShadowHosts.size
        || pollSuspendedForHiddenPage()) return;
    potentialShadowHostTimer = window.setTimeout(
        pollPotentialShadowHosts,
        POTENTIAL_SHADOW_HOST_POLL_MS,
    );
}

// A hidden tab paints nothing, so a component hydrating inside it changes no
// visible annotation — there is no reason to burn a 100ms wakeup watching for
// its shadow root. Parking the candidate poll while hidden is what lets a
// backgrounded SPA reach a true zero-timer idle; the app's visibility handler
// calls wakeShadowHostPoll() when the tab is shown again, and any host whose
// root attached while hidden is caught on that first resumed poll (or
// immediately by the page-realm bridge).
function pollSuspendedForHiddenPage(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

// Re-arm the candidate poll after it parked itself on a hidden page. Owned by
// the app's own signal-managed visibilitychange handler so the registry adds no
// standalone global listener of its own to leak across a re-boot.
export function wakeShadowHostPoll(): void {
    schedulePotentialShadowHostPoll();
}

function pollPotentialShadowHosts(): void {
    potentialShadowHostTimer = undefined;
    for (const pending of potentialShadowHosts) {
        const host = pending.ref.deref();
        if (!host || !host.isConnected) {
            potentialShadowHosts.delete(pending);
            // A disconnected host can receive a fresh window if reinserted.
            if (host && !host.isConnected) seenPotentialShadowHosts.delete(host);
            continue;
        }
        if (host.shadowRoot) {
            potentialShadowHosts.delete(pending);
            noteShadowRoot(host.shadowRoot, 'attached');
            continue;
        }
        if (pending.remainingPolls <= 1) {
            // Leave connected expired hosts in the seen set. Repeated mutation
            // scans must not silently reopen an exhausted polling window.
            potentialShadowHosts.delete(pending);
        } else {
            pending.remainingPolls -= 1;
        }
    }
    schedulePotentialShadowHostPoll();
}

// Install at document-start so page-realm calls are observable even when the
// userscript runs in an isolated world. The attached host dispatches a shared
// DOM event; the content-world listener can then read its open shadowRoot.
export function installPageOpenShadowRootDiscoveryBridge(): void {
    const sandbox = globalThis as {
        unsafeWindow?: PageShadowWindow;
    };
    const pageWindow = sandbox.unsafeWindow;
    if (pageWindow) {
        // Patching the page's Element.prototype from the sandbox is only safe in
        // the same realm. Under Firefox's Xray wrappers it breaks the host page
        // two ways, and an exportFunction bridge fixes neither: (1) the exported
        // closure still RUNS in the sandbox compartment, so the { bubbles,
        // composed } EventInit it builds is a sandbox object and the page-realm
        // Event binding throws "Permission denied to access property bubbles"
        // before attachShadow returns — every page caller (Lit createRenderRoot,
        // Apple Pay / Stripe wallet buttons in connectedCallback) inherits the
        // throw and its component dies. (2) defineProperty is handed a sandbox
        // descriptor object the Xray prototype refuses ("Not allowed to define
        // cross-origin object as property"). So patch directly only when
        // sameRealm; otherwise fall through to the page-realm <script> below,
        // whose body runs wholly in the page compartment where every object
        // involved is a page object. Under strict CSP that injection is refused
        // and discovery degrades to the bounded potential-host poll — degraded
        // discovery is acceptable; breaking the host page is not.
        const sameRealm = (pageWindow as unknown as { Object?: unknown }).Object === Object;
        if (sameRealm) {
            try {
                pageOpenShadowRootDiscoveryBootstrap(
                    pageWindow,
                    OPEN_SHADOW_ROOT_DISCOVERY_EVENT,
                    PAGE_SHADOW_DISCOVERY_KEY,
                );
                return;
            } catch {
                // Fall through to a shared-DOM page-realm script.
            }
        }
    }
    const parent = document.head || document.documentElement;
    if (!parent) return;
    try {
        const script = document.createElement('script');
        const nonceHost = document.querySelector<HTMLScriptElement>('script[nonce]');
        const nonce = nonceHost?.nonce || nonceHost?.getAttribute('nonce');
        if (nonce) script.setAttribute('nonce', nonce);
        script.textContent = `;(${pageOpenShadowRootDiscoveryBootstrap.toString()})(window,${JSON.stringify(OPEN_SHADOW_ROOT_DISCOVERY_EVENT)},${JSON.stringify(PAGE_SHADOW_DISCOVERY_KEY)});`;
        parent.append(script);
        script.remove();
    } catch {
        // Bounded candidate polling remains.
    }
}

// Runs in the page realm on every path that reaches it: called directly when
// the sandbox shares the page realm, or serialized into a page-realm <script>
// otherwise. Both closure and EventInit are therefore page objects, which is
// what keeps `new pageWindow.Event(...)` legal (see the Xray note above).
function pageOpenShadowRootDiscoveryBootstrap(
    pageWindow: PageShadowWindow,
    eventName: string,
    stateKey: string,
): void {
    const state = pageWindow as unknown as Record<string, unknown>;
    if (state[stateKey]) return;
    const prototype = pageWindow.Element?.prototype;
    const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, 'attachShadow');
    const original = descriptor?.value;
    if (!prototype || !descriptor || typeof original !== 'function') return;
    const patched = function attachShadow(this: Element, init: ShadowRootInit): ShadowRoot {
        const root = original.call(this, init) as ShadowRoot;
        if (root.mode === 'open') {
            this.dispatchEvent(new pageWindow.Event(eventName, { bubbles: true, composed: true }));
        }
        return root;
    };
    Object.defineProperty(prototype, 'attachShadow', {
        ...descriptor,
        value: patched,
    });
    state[stateKey] = true;
}

type PageShadowWindow = Window & {
    Element: typeof Element;
    Event: typeof Event;
};

// The app installs one hook (observe the root with the auto-scan observer).
// Roots discovered before the hook was installed are replayed so boot-order
// does not matter. Passing null detaches (destroy path).
export function setShadowRootScanHook(hook: ((root: ShadowRoot, cause: ShadowRootDiscoveryCause) => void) | null): void {
    shadowRootScanHook = hook;
    if (hook) forEachScannedShadowRoot(root => hook(root, 'replay'));
}

// Enumerate live registered roots (used to re-attach after the observer is
// paused/disconnected). Detached hosts are swept out here — same bounded
// cleanup discipline as the live text-mirror observer set.
export function forEachScannedShadowRoot(callback: (root: ShadowRoot) => void, includeDetached = false): void {
    for (const ref of scannedShadowRootRefs) {
        const root = ref.deref();
        if (!root) {
            scannedShadowRootRefs.delete(ref);
            continue;
        }
        if (!root.host?.isConnected) {
            // Re-register cached roots after reinsertion, but retain their weak
            // references so explicit teardown can still reach them off-DOM.
            scannedShadowRootState.set(root, false);
            if (!includeDetached) continue;
        }
        callback(root);
    }
}

// A single MutationObserver can observe many roots but cannot unobserve one.
// Return whether any target disappeared so the app callback can disconnect the
// shared observer once and re-observe document.body plus the surviving roots.
export function sweepDisconnectedShadowRoots(): boolean {
    let swept = false;
    for (const ref of scannedShadowRootRefs) {
        const root = ref.deref();
        if (!root) {
            scannedShadowRootRefs.delete(ref);
            continue;
        }
        if (root.host?.isConnected || scannedShadowRootState.get(root) === false) continue;
        // Retain the weak reference so teardown can still reach detached roots
        // and a later reinsertion can replay the same root. Only the active ->
        // detached transition requires rebuilding the shared observer targets.
        scannedShadowRootState.set(root, false);
        swept = true;
    }
    return swept;
}

// Document-start upgrade race: an undefined custom element (tag not yet in
// the registry) can be inserted with no shadow root at all, then
// customElements.define() upgrades it — attaching and populating a shadow
// root synchronously in its constructor — without emitting any light-DOM
// mutation the document observer can see. Track distinct tag names once
// (whenDefined per name, not per element) and replay a wakeup so the app can
// schedule a scan and pick up the newly attached root.
// The app installs one hook (schedule an auto-scan). Passing null detaches.
export function setCustomElementUpgradeHook(hook: (() => void) | null): void {
    customElementUpgradeHook = hook;
    if (!hook) {
        customElementLifecycleGeneration += 1;
        subscribedUpgradeNames.clear();
        acceptPendingUpgradeWakeups = false;
        pendingUpgradeWakeup = false;
        if (!openShadowRootDiscoveryUsers) resetPotentialShadowHostTracking();
        return;
    }
    acceptPendingUpgradeWakeups = true;
    schedulePotentialShadowHostPoll();
    if (pendingUpgradeWakeup) {
        pendingUpgradeWakeup = false;
        hook();
    }
}

function customElementRegistry(): CustomElementRegistry | null {
    // Chromium content-script isolated worlds can expose the property but
    // return null for it on large Polymer pages such as YouTube. `typeof null`
    // is "object", so the old `typeof customElements !== 'undefined'` guard
    // still dereferenced null and aborted the entire Reader at startup.
    const registry = typeof customElements === 'undefined' ? null : customElements;
    return registry && typeof registry.get === 'function' && typeof registry.whenDefined === 'function'
        ? registry
        : null;
}

function subscribeToCustomElementUpgrade(registry: CustomElementRegistry, tagName: string): void {
    if (subscribedUpgradeNames.has(tagName)
        || subscribedUpgradeNames.size >= MAX_PENDING_UPGRADE_NAMES) return;
    subscribedUpgradeNames.add(tagName);
    const generation = customElementLifecycleGeneration;
    // A single whole-page rescan on definition is enough: the normal composed
    // collector registers every upgraded root, including nested instances.
    void registry.whenDefined(tagName).then(() => {
        if (generation !== customElementLifecycleGeneration) return;
        // The cap protects concurrently unresolved definitions, not every tag
        // name ever seen by a long-lived SPA. Release the slot after upgrade
        // so a page that incrementally loads more than 64 component types does
        // not silently strand all later definitions forever.
        subscribedUpgradeNames.delete(tagName);
        notifyCustomElementLifecycle();
    }, () => {
        if (generation !== customElementLifecycleGeneration) return;
        subscribedUpgradeNames.delete(tagName);
    });
}

function notifyCustomElementLifecycle(): void {
    if (customElementUpgradeHook) customElementUpgradeHook();
    else if (acceptPendingUpgradeWakeups) pendingUpgradeWakeup = true;
}

function resetPotentialShadowHostTracking(): void {
    if (potentialShadowHostTimer !== undefined) {
        window.clearTimeout(potentialShadowHostTimer);
        potentialShadowHostTimer = undefined;
    }
    potentialShadowHosts.clear();
    seenPotentialShadowHosts = new WeakSet<Element>();
}
