// A background tab gets its timers clamped and its animation frames suspended
// for free, but observer delivery is NOT throttled: a document-wide
// MutationObserver on a busy SPA keeps running its callback at full rate while
// nothing it produces can ever be painted. That is what makes a backgrounded
// Safari tab hot — the work is invisible, indefinite, and entirely ours.
//
// Parking is therefore a property of the page, not of any one subsystem. This
// module owns the dormancy signal and the observer wrapper so each site parks
// on the same rule instead of growing its own visibility check (and its own
// half of the reconciliation contract).

export interface PageActivityScope {
    /** Document whose visibility drives dormancy; defaults to the ambient one. */
    document?: Document;
    /**
     * Lifetime signal for the subscription. A subscriber that outlives its
     * owner keeps the whole destroyed graph alive through this closure, so an
     * owner with an abort controller must hand it over rather than rely on
     * remembering to dispose. Getting this wrong costs more than a leak: every
     * later wake re-attaches the observer and re-runs the reconcile on a page
     * whose owner is gone, so parking makes a stale watcher periodically
     * active instead of merely resident. Optional only because a caller may
     * genuinely own the whole document's lifetime; otherwise treat it as
     * required and keep the handle.
     */
    signal?: AbortSignal;
}

export interface ParkableObserverHandle<TTarget, TInit> {
    observe(target: TTarget, init?: TInit): void;
    disconnect(): void;
    takeRecords?(): unknown;
}

export interface ParkableObserverOptions extends PageActivityScope {
    /**
     * Runs once per wake, after every remembered target is re-attached. Work
     * the page did while dormant produced no record anyone saw, so this stands
     * in for the whole missed batch — without it, parking loses work instead of
     * deferring it.
     */
    reconcile?: () => void;
}

function scopedDocument(scope: PageActivityScope = {}): Document | null {
    if (scope.document) return scope.document;
    return typeof document === 'undefined' ? null : document;
}

export function isPageDormant(scope: PageActivityScope = {}): boolean {
    const owner = scopedDocument(scope);
    // A document with no browsing context reports 'hidden' for good and can
    // never fire visibilitychange, so calling it dormant parks a watcher that
    // nothing is left to wake. There is no screen behind it to save either.
    if (!owner?.defaultView) return false;
    return owner.visibilityState === 'hidden';
}

/**
 * Subscribe to dormancy transitions. Each subscriber owns its own listener,
 * resolved against the document it is given at subscribe time — a module-level
 * shared listener would bind to whichever realm imported this file first, which
 * an embedded frame (and a test realm) does not share.
 */
export function onPageActivityChange(
    listener: (dormant: boolean) => void,
    scope: PageActivityScope = {},
): () => void {
    const owner = scopedDocument(scope);
    if (!owner) return () => undefined;
    const handler = (): void => listener(owner.visibilityState === 'hidden');
    owner.addEventListener('visibilitychange', handler, { signal: scope.signal });
    return () => owner.removeEventListener('visibilitychange', handler);
}

interface RememberedTarget<TInit> {
    init?: TInit;
    wasConnected: boolean;
}

// Duck-typed: a target from an embedded frame is not an instanceof this
// realm's Node, and a target that is not a node has no connectedness at all.
function isConnectedTarget(target: unknown): boolean {
    return (target as { isConnected?: unknown } | null)?.isConnected === true;
}

/**
 * An observer that remembers what it was asked to watch, detaches entirely
 * while the page is dormant, and re-attaches plus reconciles on wake. Wraps
 * anything with the observe/disconnect shape — Mutation, Resize, Intersection.
 */
export class ParkableObserver<TTarget, TInit> {
    // One entry per target: every call site observes a given node exactly one
    // way, and keeping the latest init makes re-attachment deterministic.
    private readonly targets = new Map<TTarget, RememberedTarget<TInit>>();
    private readonly observer: ParkableObserverHandle<TTarget, TInit> | null;
    private readonly reconcile?: () => void;
    private readonly unsubscribe: () => void;
    private parked: boolean;
    private disposed = false;

    constructor(
        observer: ParkableObserverHandle<TTarget, TInit> | null,
        options: ParkableObserverOptions = {},
    ) {
        this.observer = observer;
        this.reconcile = options.reconcile;
        this.parked = isPageDormant(options);
        this.unsubscribe = onPageActivityChange(dormant => {
            if (dormant) this.park();
            else this.wake();
        }, options);
    }

    observe(target: TTarget, init?: TInit): void {
        // Disposal is final. A disposed instance has already given up the
        // subscription that parks it, so anything attached now would run at
        // full rate in a hidden tab forever — on behalf of an owner that asked
        // to be torn down.
        if (this.disposed) return;
        this.targets.set(target, { init, wasConnected: isConnectedTarget(target) });
        if (!this.parked) this.observer?.observe(target, init);
    }

    /** Native semantics: forget every target, not just detach from them. */
    disconnect(): void {
        this.targets.clear();
        this.drain();
        this.observer?.disconnect();
    }

    /** Detach for good — drops the visibility subscription with the targets. */
    dispose(): void {
        this.disposed = true;
        this.unsubscribe();
        this.disconnect();
    }

    get dormant(): boolean {
        return this.parked;
    }

    private park(): void {
        if (this.parked) return;
        this.parked = true;
        this.forgetDiscardedTargets();
        this.drain();
        this.observer?.disconnect();
    }

    private wake(): void {
        if (!this.parked) return;
        this.parked = false;
        this.forgetDiscardedTargets();
        this.targets.forEach((entry, target) => this.observer?.observe(target, entry.init));
        this.reconcile?.();
    }

    // A node the page threw away must not come back with us. The observers
    // answer for a detached target rather than refusing it — a ResizeObserver
    // reports one at zero width, which reads downstream as a reflow to heal —
    // and remembering it pins the whole dead subtree, an edge the native
    // observers never create. Only a target that WAS in the document counts as
    // discarded: watching a node that was offscreen from the start is a
    // deliberate thing to ask for, so it survives the park.
    private forgetDiscardedTargets(): void {
        this.targets.forEach((entry, target) => {
            if (entry.wasConnected && !isConnectedTarget(target)) this.targets.delete(target);
        });
    }

    private drain(): void {
        // disconnect() empties the record queue per spec, but taking the
        // records first keeps the drain explicit — a queue that survived the
        // park would fire the whole hidden-tab backlog into the callback on the
        // next observation, which is the cost we are parking to avoid.
        this.observer?.takeRecords?.();
    }
}

/**
 * Build a parkable MutationObserver from the realm that owns `document` — an
 * overlay in a same-origin frame must not use the top window's constructor.
 */
export function parkableMutationObserver(
    callback: MutationCallback,
    options: ParkableObserverOptions = {},
): ParkableObserver<Node, MutationObserverInit> | null {
    const owner = scopedDocument(options);
    // No ambient fallback. A document cut off from its browsing context has no
    // constructor of its own, and borrowing this realm's would hand back a
    // watcher that can never deliver — report the absence so the caller can
    // give up instead of holding something permanently dead.
    const Observer = owner?.defaultView?.MutationObserver;
    if (!Observer) return null;
    const observer = new Observer(callback) as unknown as ParkableObserverHandle<Node, MutationObserverInit>;
    return new ParkableObserver(observer, options);
}
