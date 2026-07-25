import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    ParkableObserver,
    isPageDormant,
    onPageActivityChange,
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
    document.body.innerHTML = '';
});

describe('page dormancy signal', () => {
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

describe('visible page scanner settle observer parking', () => {
    it('parks the body resize observer while hidden and re-observes on wake', async () => {
        visibility = stubVisibility('visible');
        const instances: Array<{ targets: Element[]; disconnects: number }> = [];
        class StubResizeObserver {
            private readonly state = { targets: [] as Element[], disconnects: 0 };
            constructor(_callback: ResizeObserverCallback) {
                instances.push(this.state);
            }

            observe(target: Element): void {
                this.state.targets.push(target);
            }

            unobserve(): void {}

            disconnect(): void {
                this.state.disconnects += 1;
            }
        }
        vi.stubGlobal('ResizeObserver', StubResizeObserver);

        const settings = testEnSettings();
        scanner = new VisiblePageScanner({
            getSettings: () => settings,
            parseJapanese: vi.fn(async () => []),
            pauseMutationObserver: (callback: () => unknown) => callback(),
            preloadParsedTokens: vi.fn(),
            enrichPitchWords: vi.fn(),
            enrichAnkiWords: vi.fn(),
            toast: vi.fn(),
        } as unknown as ConstructorParameters<typeof VisiblePageScanner>[0]);
        await scanner.scanVisiblePage({ silent: true });

        expect(instances).toHaveLength(1);
        expect(instances[0].targets).toEqual([document.body]);

        visibility.set('hidden');
        expect(instances[0].disconnects).toBe(1);

        visibility.set('visible');
        // Re-observing replays the body's CURRENT width, which is how a reflow
        // that happened while hidden still reaches the settle sweep.
        expect(instances[0].targets).toEqual([document.body, document.body]);
    });
});
