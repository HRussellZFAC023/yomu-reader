// Shadow roots the fragment walk has descended into. A MutationObserver with
// subtree:true never crosses shadow boundaries, so web-component re-renders
// (Lit hydration on Reddit shreddit, Shoelace, Spectrum) scheduled NO rescan:
// chrome rendered after the boot scan stayed bare until an unrelated trigger
// (the user's own tap) happened to run a scan. Every open shadow root the
// collection walk commits to is recorded here so the app can attach its
// auto-scan observer to it — the tap stops being the scan trigger.

const scannedShadowRootRefs = new Set<WeakRef<ShadowRoot>>();
const scannedShadowRoots = new WeakSet<ShadowRoot>();
let shadowRootScanHook: ((root: ShadowRoot) => void) | null = null;

// Called by the fragment walk for every open shadow root it descends into.
// Idempotent per root; invokes the app hook immediately for new roots.
export function noteScannedShadowRoot(root: ShadowRoot): void {
    if (scannedShadowRoots.has(root)) return;
    scannedShadowRoots.add(root);
    scannedShadowRootRefs.add(new WeakRef(root));
    shadowRootScanHook?.(root);
}

// The app installs one hook (observe the root with the auto-scan observer).
// Roots discovered before the hook was installed are replayed so boot-order
// does not matter. Passing null detaches (destroy path).
export function setShadowRootScanHook(hook: ((root: ShadowRoot) => void) | null): void {
    shadowRootScanHook = hook;
    if (hook) forEachScannedShadowRoot(hook);
}

// Enumerate live registered roots (used to re-attach after the observer is
// paused/disconnected). Detached hosts are swept out here — same bounded
// cleanup discipline as the live text-mirror observer set.
export function forEachScannedShadowRoot(callback: (root: ShadowRoot) => void): void {
    for (const ref of scannedShadowRootRefs) {
        const root = ref.deref();
        if (!root || !root.host?.isConnected) {
            scannedShadowRootRefs.delete(ref);
            continue;
        }
        callback(root);
    }
}
