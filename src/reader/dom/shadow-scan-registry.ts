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
const POTENTIAL_SHADOW_HOST_IDLE_POLL_MS = 1_000;

interface PotentialShadowHost {
    ref: WeakRef<Element>;
    fastPollUntil: number;
}

const potentialShadowHosts = new Set<PotentialShadowHost>();
const seenPotentialShadowHosts = new WeakSet<Element>();
let potentialShadowHostTimer: number | undefined;

interface AttachShadowDiscoveryInstallation {
    prototype: typeof Element.prototype;
    originalDescriptor: PropertyDescriptor;
    wrapped: typeof Element.prototype.attachShadow;
    users: number;
    active: boolean;
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
export function watchPotentialOpenShadowRootHost(host: Element): void {
    if (host.shadowRoot) {
        noteShadowRoot(host.shadowRoot, 'scan');
        return;
    }
    if (!host.localName.includes('-') || seenPotentialShadowHosts.has(host)) return;
    seenPotentialShadowHosts.add(host);
    potentialShadowHosts.add({
        ref: new WeakRef(host),
        fastPollUntil: Date.now() + POTENTIAL_SHADOW_HOST_FAST_POLL_LIFETIME_MS,
    });
    schedulePotentialShadowHostPoll();
}

// Seed hosts that were already in the document when the reader started but
// have not upgraded yet. `:not(:defined)` is a browser-native custom-element
// index, avoiding the expensive second all-elements walk that dense pages paid
// before the startup scan fast path was introduced.
export function watchUndefinedCustomElementHosts(root: ParentNode = document): void {
    try {
        root.querySelectorAll<Element>(':not(:defined)').forEach(watchPotentialOpenShadowRootHost);
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

    const prototype = Element.prototype;
    const originalDescriptor = Object.getOwnPropertyDescriptor(prototype, 'attachShadow');
    const original = originalDescriptor?.value;
    if (!originalDescriptor || typeof original !== 'function') return () => undefined;

    let installation: AttachShadowDiscoveryInstallation;
    const wrapped: typeof Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit): ShadowRoot {
        const root = Reflect.apply(original, this, [init]) as ShadowRoot;
        if (installation.active && root.mode === 'open') noteShadowRoot(root, 'attached');
        return root;
    };
    installation = {
        prototype,
        originalDescriptor,
        wrapped,
        users: 1,
        active: true,
    };
    try {
        Object.defineProperty(prototype, 'attachShadow', {
            ...originalDescriptor,
            value: wrapped,
        });
    } catch {
        // A hardened host may make the method non-configurable/non-writable.
        // Keep the cross-realm host watcher active even when the synchronous
        // wrapper cannot be installed.
        attachShadowDiscoveryInstallation = installation;
        schedulePotentialShadowHostPoll();
        return attachShadowDiscoveryDisposer(installation);
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
        installation.active = false;
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
        for (const pending of potentialShadowHosts) {
            const host = pending.ref.deref();
            if (host) seenPotentialShadowHosts.delete(host);
        }
        potentialShadowHosts.clear();
    };
}

function schedulePotentialShadowHostPoll(): void {
    if (!attachShadowDiscoveryInstallation?.active
        || potentialShadowHostTimer !== undefined
        || !potentialShadowHosts.size) return;
    const now = Date.now();
    const fast = [...potentialShadowHosts].some(pending => pending.fastPollUntil > now);
    potentialShadowHostTimer = window.setTimeout(
        pollPotentialShadowHosts,
        fast ? POTENTIAL_SHADOW_HOST_POLL_MS : POTENTIAL_SHADOW_HOST_IDLE_POLL_MS,
    );
}

function pollPotentialShadowHosts(): void {
    potentialShadowHostTimer = undefined;
    for (const pending of potentialShadowHosts) {
        const host = pending.ref.deref();
        if (!host || !host.isConnected) {
            potentialShadowHosts.delete(pending);
            if (host) seenPotentialShadowHosts.delete(host);
            continue;
        }
        if (!host.shadowRoot) continue;
        potentialShadowHosts.delete(pending);
        seenPotentialShadowHosts.delete(host);
        noteShadowRoot(host.shadowRoot, 'attached');
    }
    schedulePotentialShadowHostPoll();
}

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
