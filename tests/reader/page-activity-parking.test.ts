import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    ParkableObserver,
    isPageDormant,
    onPageActivityChange,
    parkableMutationObserver,
    type ParkableObserverHandle,
} from '../../src/reader/platform/page-activity';
import { syncProjectedReadings, clearProjectedReadings } from '../../src/reader/dom/detached-reading-overlay-impl';
import { VisiblePageScanner } from '../../src/reader/app/visible-page-scanner';
import { testEnSettings } from './helpers/settings-fixture';

// Safari background battery drain: MutationObserver delivery is NOT throttled
// in a hidden tab, so every always-on document-wide watcher kept running its
// callback at full rate on a busy backgrounded SPA. Park-on-hide was only ever
// wired for the auto-scan loop; these pin the shared primitive and the sites
// that now adopt it — including the reconciliation half, without which parking
// would silently lose the work instead of deferring it.

function stubVisibility(initial: 'visible' | 'hidden'): {
    set: (value: 'visible' | 'hidden') => void;
    restore: () => void;
} {
    let value = initial;
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value === 'hidden' });
    return {
        set: next => {
            value = next;
            document.dispatchEvent(new Event('visibilitychange'));
        },
        restore: () => {
            if (visibilityDescriptor) Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
            else Reflect.deleteProperty(document, 'visibilityState');
            if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor);
            else Reflect.deleteProperty(document, 'hidden');
        },
    };
}

interface Attachment {
    target: Node;
    init?: MutationObserverInit;
}

class FakeObserver implements ParkableObserverHandle<Node, MutationObserverInit> {
    readonly attachments: Attachment[] = [];
    readonly events: string[] = [];
    disconnects = 0;
    drains = 0;

    observe(target: Node, init?: MutationObserverInit): void {
        this.attachments.push({ target, init });
        this.events.push('observe');
    }

    disconnect(): void {
        this.disconnects += 1;
        this.events.push('disconnect');
    }

    takeRecords(): unknown {
        this.drains += 1;
        this.events.push('drain');
        return [];
    }
}

let visibility: ReturnType<typeof stubVisibility> | undefined;
let scanner: VisiblePageScanner | undefined;

afterEach(() => {
    scanner?.destroy();
    scanner = undefined;
    visibility?.restore();
    visibility = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    observedWidths.clear();
    document.body.innerHTML = '';
});

describe('page dormancy signal', () => {
    it('never calls a document with no browsing context dormant', () => {
        const detached = document.implementation.createHTMLDocument('parked');
        Object.defineProperty(detached, 'visibilityState', { configurable: true, get: () => 'hidden' });

        // Such a document reports 'hidden' for good and can never fire
        // visibilitychange, so parking on it is a one-way trip.
        expect(detached.defaultView).toBeNull();
        expect(isPageDormant({ document: detached })).toBe(false);
    });

    it('reports dormancy and notifies subscribers on each transition', () => {
        visibility = stubVisibility('visible');
        const seen: boolean[] = [];
        const stop = onPageActivityChange(dormant => seen.push(dormant));

        expect(isPageDormant()).toBe(false);
        visibility.set('hidden');
        expect(isPageDormant()).toBe(true);
        visibility.set('visible');
        stop();
        visibility.set('hidden');

        expect(seen).toEqual([true, false]);
    });
});

describe('parkable observer', () => {
    it('drains and disconnects when the page goes hidden, and refuses to attach while parked', () => {
        visibility = stubVisibility('visible');
        const fake = new FakeObserver();
        const observer = new ParkableObserver(fake, {});
        const first = document.createElement('div');
        const late = document.createElement('div');
        observer.observe(first, { childList: true });

        visibility.set('hidden');
        observer.observe(late, { subtree: true });

        expect(observer.dormant).toBe(true);
        expect(fake.disconnects).toBe(1);
        // The queued records are dropped with the attachment: a backlog that
        // survived the park would land in the callback all at once on wake.
        expect(fake.drains).toBe(1);
        expect(fake.events).toEqual(['observe', 'drain', 'disconnect']);

        // The request made while parked was remembered, not dropped.
        visibility.set('visible');
        expect(fake.attachments.slice(1)).toEqual([
            { target: first, init: { childList: true } },
            { target: late, init: { subtree: true } },
        ]);
    });

    it('re-attaches every remembered target and reconciles once on wake', () => {
        visibility = stubVisibility('visible');
        const fake = new FakeObserver();
        const reconcile = vi.fn(() => fake.events.push('reconcile'));
        const observer = new ParkableObserver(fake, { reconcile });
        const body = document.createElement('div');
        const panel = document.createElement('section');
        observer.observe(body, { childList: true });
        observer.observe(panel, { attributes: true, subtree: true });

        visibility.set('hidden');
        visibility.set('visible');

        expect(observer.dormant).toBe(false);
        expect(fake.attachments.slice(2)).toEqual([
            { target: body, init: { childList: true } },
            { target: panel, init: { attributes: true, subtree: true } },
        ]);
        // Reconciliation stands in for the whole missed batch, so it has to run
        // AFTER the targets are live or its own follow-up work goes unobserved.
        expect(fake.events.at(-1)).toBe('reconcile');
        expect(reconcile).toHaveBeenCalledTimes(1);
    });

    it('starts parked when built inside an already-hidden page', () => {
        visibility = stubVisibility('hidden');
        const fake = new FakeObserver();
        const observer = new ParkableObserver(fake, {});
        const target = document.createElement('div');
        observer.observe(target, { childList: true });

        expect(observer.dormant).toBe(true);
        expect(fake.attachments).toEqual([]);

        visibility.set('visible');
        expect(fake.attachments).toEqual([{ target, init: { childList: true } }]);
    });

    it('forgets a target the page discarded while parked, and keeps one that was never in the document', () => {
        visibility = stubVisibility('visible');
        const fake = new FakeObserver();
        const observer = new ParkableObserver(fake, {});
        const swapped = document.createElement('main');
        const kept = document.createElement('section');
        const offscreen = document.createElement('template');
        document.body.append(swapped, kept);
        observer.observe(swapped, { childList: true });
        observer.observe(kept, { childList: true });
        // Never in the document, so nothing discarded it — watching an
        // offscreen node is a thing an adopter is allowed to ask for.
        observer.observe(offscreen, { childList: true });

        visibility.set('hidden');
        swapped.remove();
        visibility.set('visible');

        // The removed node is neither re-observed nor still remembered, so it
        // cannot deliver a phantom measurement and its subtree is not pinned.
        expect(fake.attachments.slice(3).map(attachment => attachment.target)).toEqual([kept, offscreen]);
        visibility.set('hidden');
        visibility.set('visible');
        expect(fake.attachments.slice(5).map(attachment => attachment.target)).toEqual([kept, offscreen]);
    });

    it('refuses to attach anything after dispose', () => {
        visibility = stubVisibility('visible');
        const fake = new FakeObserver();
        const observer = new ParkableObserver(fake, {});
        observer.dispose();

        // Disposal already surrendered the subscription that parks this
        // observer, so a late attach could never be parked again.
        observer.observe(document.createElement('div'), { childList: true });
        expect(fake.attachments).toEqual([]);
    });

    it('stops parking and waking once the owner aborts', () => {
        visibility = stubVisibility('visible');
        const fake = new FakeObserver();
        const controller = new AbortController();
        const reconcile = vi.fn();
        const observer = new ParkableObserver(fake, { reconcile, signal: controller.signal });
        observer.observe(document.body, { childList: true });

        controller.abort();
        visibility.set('hidden');
        visibility.set('visible');

        // The signal IS the disposal contract: an owner that hands one over
        // cannot leave a subscription behind that resurrects its graph.
        expect(fake.disconnects).toBe(0);
        expect(reconcile).not.toHaveBeenCalled();
    });

    it('forgets targets on disconnect and drops the visibility subscription on dispose', () => {
        visibility = stubVisibility('visible');
        const fake = new FakeObserver();
        const observer = new ParkableObserver(fake, {});
        observer.observe(document.createElement('div'), { childList: true });
        observer.disconnect();

        visibility.set('hidden');
        visibility.set('visible');
        expect(fake.attachments).toHaveLength(1);

        observer.dispose();
        const disconnectsAfterDispose = fake.disconnects;
        visibility.set('hidden');
        expect(fake.disconnects).toBe(disconnectsAfterDispose);
    });
});

describe('parkable mutation observer construction', () => {
    it('reports no watcher for a document with no browsing context instead of building a dead one', () => {
        const detached = document.implementation.createHTMLDocument('parked');

        // Borrowing this realm's constructor would hand the caller something
        // that can never deliver and can never be woken; the caller needs to
        // know there is no watcher at all.
        expect(parkableMutationObserver(() => undefined, { document: detached })).toBeNull();
        expect(parkableMutationObserver(() => undefined, {})).not.toBeNull();
    });
});

function projectionRect(top: number): DOMRect {
    return {
        left: 20, top, width: 40, height: 16,
        right: 60, bottom: top + 16, x: 20, y: top,
        toJSON: () => ({}),
    } as DOMRect;
}

async function nextProjectionFrame(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

describe('detached reading overlay parking', () => {
    it('detaches its document-wide watcher while hidden and repositions once on wake', async () => {
        visibility = stubVisibility('visible');
        const observeSpy = vi.spyOn(MutationObserver.prototype, 'observe');
        const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect');

        const anchor = document.createElement('div');
        const owner = document.createElement('span');
        const source = document.createElement('span');
        source.textContent = 'よみ';
        owner.append(source);
        anchor.append(owner);
        document.body.append(anchor);
        let measured = projectionRect(20);
        anchor.getBoundingClientRect = () => measured;
        syncProjectedReadings(owner, [{ source, anchor, rect: measured, measure: () => measured }]);
        await nextProjectionFrame();

        const clone = document.querySelector<HTMLElement>('[data-yomu-projected-reading="true"]');
        expect(clone?.dataset.yomuSourceTop).toBe('20');
        const environmentObservations = (): number => observeSpy.mock.calls
            .filter(([target, init]) => target === document.documentElement && (init as MutationObserverInit)?.subtree)
            .length;
        expect(environmentObservations()).toBe(1);

        visibility.set('hidden');
        expect(disconnectSpy).toHaveBeenCalled();

        // The page keeps mutating in the background — exactly the traffic that
        // used to run this callback (and a topology refresh) at full rate.
        measured = projectionRect(140);
        for (let index = 0; index < 5; index += 1) {
            document.body.append(document.createElement('p'));
        }
        await nextProjectionFrame();
        expect(clone?.dataset.yomuSourceTop).toBe('20');

        visibility.set('visible');
        expect(environmentObservations()).toBe(2);
        await nextProjectionFrame();
        // Nothing mutated after the wake, so only the reconcile pass can have
        // caught the reading up to where its word moved while hidden.
        expect(clone?.dataset.yomuSourceTop).toBe('140');

        clearProjectedReadings(owner);
    });
});

// The real ResizeObserver answers every observe() with the target's current
// size — including zero for a detached element — so a stub that never calls
// back cannot show whether a replayed target reaches the settle sweep.
interface SettleObserverStub {
    targets: Element[];
    disconnects: number;
    deliver: (target: Element) => void;
}

const observedWidths = new Map<Element, number>();

function installSettleObserverStub(instances: SettleObserverStub[]): void {
    class StubResizeObserver {
        private readonly state: SettleObserverStub;
        constructor(callback: ResizeObserverCallback) {
            this.state = {
                targets: [],
                disconnects: 0,
                deliver: target => callback(
                    [{ contentRect: { width: observedWidths.get(target) ?? 0 } } as ResizeObserverEntry],
                    this as unknown as ResizeObserver,
                ),
            };
            instances.push(this.state);
        }

        observe(target: Element): void {
            this.state.targets.push(target);
            this.state.deliver(target);
        }

        unobserve(): void {}

        disconnect(): void {
            this.state.disconnects += 1;
        }
    }
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
}

async function scannerWithSettleObserver(sweep: () => number): Promise<SettleObserverStub> {
    const instances: SettleObserverStub[] = [];
    installSettleObserverStub(instances);
    const settings = testEnSettings();
    scanner = new VisiblePageScanner({
        getSettings: () => settings,
        parseJapanese: vi.fn(async () => []),
        pauseMutationObserver: (callback: () => unknown) => callback(),
        preloadParsedTokens: vi.fn(),
        enrichPitchWords: vi.fn(),
        enrichAnkiWords: vi.fn(),
        makeRoomForRubyInCroppedRows: sweep,
        toast: vi.fn(),
    } as unknown as ConstructorParameters<typeof VisiblePageScanner>[0]);
    await scanner.scanVisiblePage({ silent: true });
    // The post-scan clamp sweep is on its own long timer; drop it so the only
    // thing that can still reach the sweep spy is a settle delivery.
    scanner.pauseGeometrySweeps();
    return instances[0];
}

async function afterSettleDebounce(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 260));
}

function swapDocumentBody(): { previous: HTMLElement; replacement: HTMLElement } {
    const previous = document.body;
    const replacement = document.createElement('body');
    document.documentElement.replaceChild(replacement, previous);
    return { previous, replacement };
}

describe('visible page scanner settle observer parking', () => {
    it('parks the body resize observer while hidden and re-observes on wake', async () => {
        visibility = stubVisibility('visible');
        const sweeps = vi.fn(() => 0);
        observedWidths.set(document.body, 800);
        const settle = await scannerWithSettleObserver(sweeps);

        expect(settle.targets).toEqual([document.body]);

        visibility.set('hidden');
        expect(settle.disconnects).toBe(1);

        // Re-observing replays the body's CURRENT width, which is how a reflow
        // that happened while hidden still reaches the settle sweep.
        observedWidths.set(document.body, 640);
        visibility.set('visible');
        expect(settle.targets).toEqual([document.body, document.body]);
        await afterSettleDebounce();
        expect(sweeps).toHaveBeenCalledTimes(1);
    });

    it('does not replay a body the host swapped out while the tab was hidden', async () => {
        visibility = stubVisibility('visible');
        const sweeps = vi.fn(() => 0);
        observedWidths.set(document.body, 800);
        const settle = await scannerWithSettleObserver(sweeps);
        expect(sweeps).not.toHaveBeenCalled();

        visibility.set('hidden');
        const { previous, replacement } = swapDocumentBody();
        try {
            // A detached element measures zero, which the width gate would read
            // as a reflow worth a full document-wide heal — of a body that is
            // no longer on the page.
            observedWidths.set(previous, 0);
            observedWidths.set(replacement, 800);
            visibility.set('visible');

            expect(settle.targets).toEqual([document.body]);
            await afterSettleDebounce();
            expect(sweeps).not.toHaveBeenCalled();
        } finally {
            document.documentElement.replaceChild(previous, replacement);
        }
    });

    it('re-points the settle observer at a replacement body without spending a sweep on the first measure', async () => {
        visibility = stubVisibility('visible');
        const sweeps = vi.fn(() => 0);
        observedWidths.set(document.body, 800);
        const settle = await scannerWithSettleObserver(sweeps);

        const { previous, replacement } = swapDocumentBody();
        try {
            observedWidths.set(replacement, 1024);
            scanner!.repointGeometrySettleTarget();

            expect(settle.targets).toEqual([previous, replacement]);
            // The replacement has not settled — it has been measured for the
            // first time — so its width must only prime the baseline.
            await afterSettleDebounce();
            expect(sweeps).not.toHaveBeenCalled();

            // ...and from then on the live body's reflows do reach the sweep,
            // which is what stopped happening when the observer was stranded.
            settle.deliver(replacement);
            observedWidths.set(replacement, 700);
            settle.deliver(replacement);
            await afterSettleDebounce();
            expect(sweeps).toHaveBeenCalledTimes(1);
        } finally {
            document.documentElement.replaceChild(previous, replacement);
        }
    });
});
