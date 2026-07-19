// Shadow roots the fragment walk has descended into. A MutationObserver with
// subtree:true never crosses shadow boundaries, so web-component re-renders
// (Lit hydration on Reddit shreddit, Shoelace, Spectrum) scheduled NO rescan:
// chrome rendered after the boot scan stayed bare until an unrelated trigger
// (the user's own tap) happened to run a scan. Every open shadow root the
// collection walk commits to is recorded here so the app can attach its
// auto-scan observer to it — the tap stops being the scan trigger.

const scannedShadowRootRefs = new Set<WeakRef<ShadowRoot>>();
const scannedShadowRootRefByRoot = new WeakMap<ShadowRoot, WeakRef<ShadowRoot>>();
const scannedShadowRoots = new WeakSet<ShadowRoot>();
export type ShadowRootDiscoveryCause = 'scan' | 'attached' | 'replay';
let shadowRootScanHook: ((root: ShadowRoot, cause: ShadowRootDiscoveryCause) => void) | null = null;

const POTENTIAL_SHADOW_HOST_POLL_MS = 100;
const POTENTIAL_SHADOW_HOST_FAST_POLL_LIFETIME_MS = 10_000;
const POTENTIAL_SHADOW_HOST_IDLE_POLL_MS = 2_000;
const POTENTIAL_SHADOW_HOST_LIFETIME_MS = 60_000;
export const OPEN_SHADOW_ROOT_DISCOVERY_EVENT = 'yomu:open-shadow-root-attached';
const PAGE_SHADOW_DISCOVERY_KEY = '__yomuOpenShadowRootDiscoveryV1';

interface PotentialShadowHost {
    ref: WeakRef<Element>;
    expiresAt: number;
}

const potentialShadowHosts = new Set<PotentialShadowHost>();
let seenPotentialShadowHosts = new WeakSet<Element>();
let potentialShadowHostTimer: number | undefined;
let potentialShadowHostFastPollUntil = 0;

interface AttachShadowDiscoveryInstallation {
    prototype: typeof Element.prototype;
    originalDescriptor: PropertyDescriptor;
    wrapped: typeof Element.prototype.attachShadow;
    users: number;
    pageBridgeListener: EventListener;
}

let attachShadowDiscoveryInstallation: AttachShadowDiscoveryInstallation | undefined;

// Called by the fragment walk for every open shadow root it descends into.
// Idempotent per root; invokes the app hook immediately for new roots.
export function noteScannedShadowRoot(root: ShadowRoot): void {
    noteShadowRoot(root, 'scan');
}

function noteShadowRoot(root: ShadowRoot, cause: ShadowRootDiscoveryCause): void {
    if (scannedShadowRoots.has(root)) return;
    scannedShadowRoots.add(root);
    let ref = scannedShadowRootRefByRoot.get(root);
    if (!ref) {
        ref = new WeakRef(root);
        scannedShadowRootRefByRoot.set(root, ref);
        scannedShadowRootRefs.add(ref);
    }
    shadowRootScanHook?.(root, cause);
}

// Content-world userscripts and page scripts have different JavaScript
// prototypes in Chromium/WebKit. Wrapping the userscript realm's attachShadow
// is therefore only the synchronous fast path; it cannot see a page-realm
// custom-element upgrade. Record custom-element hosts encountered by the
// generic DOM walk and poll their shared DOM `shadowRoot` property. Hydration
// gets a short fast window, then connected lazy components stay on a low-rate
// weak-reference poll: a hard expiry would miss components that attach their
// root only after a later interaction or viewport transition. This crosses the
// realm boundary without injecting page code or weakening CSP.
export function watchPotentialOpenShadowRootHost(host: Element, includeNativeHost = false): void {
    if (host.shadowRoot) {
        noteShadowRoot(host.shadowRoot, 'scan');
        return;
    }
    if ((!includeNativeHost && !host.localName.includes('-')) || seenPotentialShadowHosts.has(host)) return;
    const now = Date.now();
    seenPotentialShadowHosts.add(host);
    potentialShadowHosts.add({
        ref: new WeakRef(host),
        expiresAt: now + POTENTIAL_SHADOW_HOST_LIFETIME_MS,
    });
    potentialShadowHostFastPollUntil = Math.max(
        potentialShadowHostFastPollUntil,
        now + POTENTIAL_SHADOW_HOST_FAST_POLL_LIFETIME_MS,
    );
    schedulePotentialShadowHostPoll();
}

// Seed hosts that were already in the document when the reader started but
// have not upgraded yet. `:not(:defined)` is a browser-native custom-element
// index, avoiding the expensive second all-elements walk that dense pages paid
// before the startup scan fast path was introduced.
export function watchUndefinedCustomElementHosts(root: ParentNode = document): void {
    try {
        root.querySelectorAll<Element>(':not(:defined)').forEach(host => watchPotentialOpenShadowRootHost(host));
    } catch {
        // Older engines without :defined still get mutation-time and scan-time
        // discovery plus the synchronous attachShadow fast path.
    }
}

// A host can be inserted before its component upgrades and calls attachShadow().
// That later attachment is not itself a DOM mutation, so neither the document
// observer nor a walk of the earlier insertion can discover the new root. Keep
// one narrowly scoped wrapper installed while the reader is alive and register
// newly attached open roots at creation time. The install is reference-counted
// so repeated app setup/teardown cannot stack wrappers or restore one too early.
export function installOpenShadowRootDiscovery(): () => void {
    const existing = attachShadowDiscoveryInstallation;
    if (existing) {
        existing.users += 1;
        return attachShadowDiscoveryDisposer(existing);
    }

    installPageOpenShadowRootDiscoveryBridge();
    const pageBridgeListener: EventListener = event => {
        const host = event.target;
        const root = host instanceof Element ? host.shadowRoot : null;
        if (root?.mode === 'open') noteShadowRoot(root, 'attached');
    };
    document.addEventListener(OPEN_SHADOW_ROOT_DISCOVERY_EVENT, pageBridgeListener, true);
    const prototype = Element.prototype;
    const originalDescriptor = Object.getOwnPropertyDescriptor(prototype, 'attachShadow');
    const original = originalDescriptor?.value;
    if (!originalDescriptor || typeof original !== 'function') {
        return () => document.removeEventListener(OPEN_SHADOW_ROOT_DISCOVERY_EVENT, pageBridgeListener, true);
    }

    let installation: AttachShadowDiscoveryInstallation;
    const wrapped: typeof Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit): ShadowRoot {
        const root = Reflect.apply(original, this, [init]) as ShadowRoot;
        if (attachShadowDiscoveryInstallation === installation && root.mode === 'open') noteShadowRoot(root, 'attached');
        return root;
    };
    installation = {
        prototype,
        originalDescriptor,
        wrapped,
        users: 1,
        pageBridgeListener,
    };
    try {
        Object.defineProperty(prototype, 'attachShadow', {
            ...originalDescriptor,
            value: wrapped,
        });
    } catch {
        // A hardened host may make the method non-configurable/non-writable.
        // The page bridge and bounded host watcher remain active.
    }
    attachShadowDiscoveryInstallation = installation;
    schedulePotentialShadowHostPoll();
    return attachShadowDiscoveryDisposer(installation);
}

function attachShadowDiscoveryDisposer(installation: AttachShadowDiscoveryInstallation): () => void {
    let disposed = false;
    return () => {
        if (disposed) return;
        disposed = true;
        installation.users -= 1;
        if (installation.users > 0 || attachShadowDiscoveryInstallation !== installation) return;
        document.removeEventListener(OPEN_SHADOW_ROOT_DISCOVERY_EVENT, installation.pageBridgeListener, true);
        // Do not clobber a wrapper installed by the host or another extension
        // after ours. Such a wrapper may still delegate to ours safely.
        if (installation.prototype.attachShadow === installation.wrapped) {
            try {
                Object.defineProperty(installation.prototype, 'attachShadow', installation.originalDescriptor);
            } catch {
                // The page may have hardened the property after installation.
                // The inactive wrapper still delegates without registering roots.
            }
        }
        attachShadowDiscoveryInstallation = undefined;
        window.clearTimeout(potentialShadowHostTimer);
        potentialShadowHostTimer = undefined;
        potentialShadowHostFastPollUntil = 0;
        potentialShadowHosts.clear();
        seenPotentialShadowHosts = new WeakSet<Element>();
    };
}

function schedulePotentialShadowHostPoll(): void {
    if (!attachShadowDiscoveryInstallation
        || potentialShadowHostTimer !== undefined
        || !potentialShadowHosts.size) return;
    potentialShadowHostTimer = window.setTimeout(
        pollPotentialShadowHosts,
        Date.now() < potentialShadowHostFastPollUntil ? POTENTIAL_SHADOW_HOST_POLL_MS : POTENTIAL_SHADOW_HOST_IDLE_POLL_MS,
    );
}

function pollPotentialShadowHosts(): void {
    potentialShadowHostTimer = undefined;
    const now = Date.now();
    for (const pending of potentialShadowHosts) {
        const host = pending.ref.deref();
        if (!host || !host.isConnected || pending.expiresAt <= now) {
            potentialShadowHosts.delete(pending);
            // Disconnected hosts may be reinserted and need a fresh window.
            // A connected no-root host that exhausted its bounded fallback is
            // left seen; the page-realm bridge covers any later attachment.
            if (host && !host.isConnected) seenPotentialShadowHosts.delete(host);
            continue;
        }
        if (!host.shadowRoot) continue;
        potentialShadowHosts.delete(pending);
        seenPotentialShadowHosts.delete(host);
        noteShadowRoot(host.shadowRoot, 'attached');
    }
    schedulePotentialShadowHostPoll();
}

// Install at document-start so page-realm calls are observable even when the
// userscript runs in an isolated world. The attached host dispatches a shared
// DOM event; the content-world listener can then read its open shadowRoot.
export function installPageOpenShadowRootDiscoveryBridge(): void {
    const pageWindow = (globalThis as { unsafeWindow?: PageShadowWindow }).unsafeWindow;
    if (pageWindow) {
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
    const parent = document.head || document.documentElement;
    if (!parent) return;
    try {
        const script = document.createElement('script');
        const nonce = document.querySelector('script[nonce]')?.getAttribute('nonce');
        if (nonce) script.setAttribute('nonce', nonce);
        script.textContent = `;(${pageOpenShadowRootDiscoveryBootstrap.toString()})(window,${JSON.stringify(OPEN_SHADOW_ROOT_DISCOVERY_EVENT)},${JSON.stringify(PAGE_SHADOW_DISCOVERY_KEY)});`;
        parent.append(script);
        script.remove();
    } catch {
        // The content-world wrapper plus bounded candidate polling remain.
    }
}

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
    const wrapped = function (this: Element, init: ShadowRootInit): ShadowRoot {
        const root = Reflect.apply(original, this, [init]) as ShadowRoot;
        if (root.mode === 'open') {
            this.dispatchEvent(new pageWindow.Event(eventName, { bubbles: true, composed: true }));
        }
        return root;
    };
    Object.defineProperty(prototype, 'attachShadow', { ...descriptor, value: wrapped });
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
export function forEachScannedShadowRoot(callback: (root: ShadowRoot) => void): void {
    for (const ref of scannedShadowRootRefs) {
        const root = ref.deref();
        if (!root) {
            scannedShadowRootRefs.delete(ref);
            continue;
        }
        if (!root.host?.isConnected) {
            // A framework can cache a component off-DOM, then reinsert the
            // SAME host/root later. Mark it inactive so the next generic walk
            // re-registers it and reattaches the app observer. Keep its weak
            // reference for explicit global teardown while it is cached.
            scannedShadowRoots.delete(root);
            continue;
        }
        callback(root);
    }
}

// Explicit clear/destroy paths must also reach framework-cached roots that are
// temporarily detached; otherwise pausing annotations while a component is
// off-DOM lets its stale mirror reappear when the host is recycled.
export function forEachKnownShadowRoot(callback: (root: ShadowRoot) => void): void {
    for (const ref of scannedShadowRootRefs) {
        const root = ref.deref();
        if (!root) {
            scannedShadowRootRefs.delete(ref);
            continue;
        }
        callback(root);
    }
}
