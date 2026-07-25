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
     * remembering to dispose.
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
    return scopedDocument(scope)?.visibilityState === 'hidden';
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

/**
 * An observer that remembers what it was asked to watch, detaches entirely
 * while the page is dormant, and re-attaches plus reconciles on wake. Wraps
 * anything with the observe/disconnect shape — Mutation, Resize, Intersection.
 */
export class ParkableObserver<TTarget, TInit> {
    // One init per target: every call site observes a given node exactly one
    // way, and keeping the latest init makes re-attachment deterministic.
    private readonly targets = new Map<TTarget, TInit | undefined>();
    private readonly observer: ParkableObserverHandle<TTarget, TInit> | null;
    private readonly reconcile?: () => void;
    private readonly unsubscribe: () => void;
    private parked: boolean;

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
        this.targets.set(target, init);
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
        this.unsubscribe();
        this.disconnect();
    }

    get dormant(): boolean {
        return this.parked;
    }

    private park(): void {
        if (this.parked) return;
        this.parked = true;
        this.drain();
        this.observer?.disconnect();
    }

    private wake(): void {
        if (!this.parked) return;
        this.parked = false;
        this.targets.forEach((init, target) => this.observer?.observe(target, init));
        this.reconcile?.();
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
    const Observer = owner?.defaultView?.MutationObserver
        ?? (typeof MutationObserver === 'function' ? MutationObserver : undefined);
    if (!Observer) return null;
    const observer = new Observer(callback) as unknown as ParkableObserverHandle<Node, MutationObserverInit>;
    return new ParkableObserver(observer, options);
}
