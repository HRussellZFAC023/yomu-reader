import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import { ImageOcrController } from '../../src/reader/ocr/controller';
import { initJpdbReviewPageBridge } from '../../src/reader/jpdb/jpdb-review-bridge';
import { NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT } from '../../src/reader/dom/index';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { stubInstantIntersectionObserver } from './helpers/dom-fixtures';

// Regression tests for the lifecycle leak CLASS that caused the 1.6.109 iOS OOM
// (a destroyed-but-still-listening object graph retained across re-boots).
// `bootReaderApp()` destroys and recreates ReaderApp on the same window, and
// `destroy()` tears listeners down only via `this.abortController.abort()`,
// which removes ONLY listeners registered with `{ signal }`. Any global
// document/window listener added WITHOUT that signal survives abort, keeps
// firing, and retains the whole destroyed graph through its closure — the leak.
//
// FIX 1 (main.ts bindEvents/setupAutoScan): every global listener carries the
//   app's abort signal, so destroy() removes them all.
// FIX 2 (ocr/controller.ts): the per-image 'load' listener is removed on state
//   teardown / destroy.
// FIX 3 (jpdb-review-bridge.ts): the MutationObserver disconnects on pagehide.
// FIX A (main.ts scroll-drive): the 5 scroll-drive touch/wheel listeners are
//   attached via a raw signal-less toggle and only reaped by an observer that
//   the abort handler disconnects; the abort handler must setScrollDrive(false)
//   FIRST so an overlay open at destroy() doesn't leave them stacked.
// FIX B (jpdb-review-bridge/startup/main): the bridge observer + heartbeat +
//   channel + pagehide listener must be disposable on a same-window re-boot
//   (no navigation -> no pagehide), idempotently, and destroy() calls it.

type AppInternals = {
    abortController: AbortController;
    pageHasJapaneseText: boolean;
    bindEvents(): void;
    setupAutoScan(): void;
    handleDocumentClick: (event: Event) => void;
    disposeJpdbReviewBridge?: () => void;
};

function internals(app: ReaderApp): AppInternals {
    return app as unknown as AppInternals;
}

// ---------------------------------------------------------------------------
// FIX 1 — every global listener registered during boot carries the abort signal
// ---------------------------------------------------------------------------
describe('reader global listener lifecycle (FIX 1)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        document.body.replaceChildren();
    });

    it('registers every document/window listener with the app abort signal so destroy() removes them all', () => {
        const app = new ReaderApp();
        const abortSignal = internals(app).abortController.signal;
        // Spy AFTER construction: sub-controllers (e.g. the Anki client) register
        // their OWN focus/visibilitychange listeners in their constructors and
        // remove them in their own destroy() — those are out of scope here. This
        // test isolates the ReaderApp-owned global listeners added by the two
        // boot registration methods below.
        const documentSpy = vi.spyOn(document, 'addEventListener');
        const windowSpy = vi.spyOn(window, 'addEventListener');
        try {
            // These two methods register the whole flagged surface of global
            // document/window listeners during a real boot.
            internals(app).bindEvents();
            internals(app).setupAutoScan();

            const globalCalls = [...documentSpy.mock.calls, ...windowSpy.mock.calls];
            expect(globalCalls.length).toBeGreaterThan(0);

            // A listener without `{ signal }` (or with the wrong signal) survives
            // abort() and leaks the destroyed app. The only permitted exceptions
            // are the ones destroy() removes by other means:
            //   • DOMContentLoaded {once:true} bootstrap listeners (self-clearing)
            //   • the NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT listener, which is
            //     explicitly removeEventListener'd in destroy().
            const leaked = globalCalls.filter(([type, , options]) => {
                if (type === 'DOMContentLoaded') return false;
                if (type === NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT) return false;
                const opts = options as AddEventListenerOptions | boolean | undefined;
                if (!opts || typeof opts === 'boolean') return true;
                return opts.signal !== abortSignal;
            });

            expect(leaked.map(call => call[0])).toEqual([]);
        } finally {
            app.destroy();
        }
    });

    it('refreshes a negative startup verdict after a defined component populated before hook install', () => {
        const app = new ReaderApp();
        const host = document.createElement('div');
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = '<button>フィード</button>';
        document.body.append(host);
        internals(app).pageHasJapaneseText = false;
        try {
            internals(app).setupAutoScan();

            expect(internals(app).pageHasJapaneseText).toBe(true);
        } finally {
            app.destroy();
        }
    });

    it('stops invoking document handlers after destroy() (listeners were removed, not just guarded)', () => {
        const app = new ReaderApp();
        const spy = vi.spyOn(internals(app), 'handleDocumentClick');
        try {
            internals(app).bindEvents();

            // Live: the capture-phase document click handler runs.
            document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            const liveCalls = spy.mock.calls.length;
            expect(liveCalls).toBeGreaterThan(0);

            // destroy() aborts the signal -> the listener is physically removed.
            app.destroy();
            document.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            // No further invocations: the destroyed instance's handler is gone.
            expect(spy.mock.calls.length).toBe(liveCalls);
        } finally {
            app.destroy();
        }
    });
});

// ---------------------------------------------------------------------------
// FIX 2 — the OCR controller removes its per-image 'load' listener on teardown
// ---------------------------------------------------------------------------
describe('OCR controller image load listener lifecycle (FIX 2)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        document.body.replaceChildren();
    });

    function makeImage(): HTMLImageElement {
        const image = document.createElement('img');
        image.src = '/panel.png';
        image.dataset.ocrLines = JSON.stringify([{ text: '日本語', box: { left: 0.1, top: 0.2, width: 0.4, height: 0.1 } }]);
        Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 });
        Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 });
        Object.defineProperty(image, 'complete', { configurable: true, value: true });
        image.getBoundingClientRect = () => new DOMRect(20, 80, 500, 300);
        return image;
    }

    function makeController(): ImageOcrController {
        return new ImageOcrController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ocrEnabled: true,
                ocrAutoScanImages: true,
                ocrShowTextOverlay: false,
                ocrMinImageArea: 1,
                ocrMaxImagesPerPage: 30,
                ocrPrefetchMargin: 0,
            }),
            parseJapanese: vi.fn(async () => []),
            onToast: vi.fn(),
            shouldAutoScan: () => true,
        });
    }

    it("removes the image 'load' listener when the controller is destroyed", async () => {
        stubInstantIntersectionObserver();
        const image = makeImage();
        const addSpy = vi.spyOn(image, 'addEventListener');
        const removeSpy = vi.spyOn(image, 'removeEventListener');
        document.body.replaceChildren(image);

        const controller = makeController();
        controller.init();
        await controller.scanVisible();

        // A 'load' listener was registered while the image had OCR state.
        const loadAdd = addSpy.mock.calls.find(([type]) => type === 'load');
        expect(loadAdd).toBeTruthy();
        const handler = loadAdd![1];

        // Pre-fix this listener was never removed -> it (and its closure over the
        // controller) leaked. destroy() must remove the exact handler.
        controller.destroy();
        expect(removeSpy).toHaveBeenCalledWith('load', handler);
    });
});

// ---------------------------------------------------------------------------
// FIX 3 — the jpdb review-page bridge disconnects its observer on pagehide
// ---------------------------------------------------------------------------
describe('jpdb review page bridge observer lifecycle (FIX 3)', () => {
    const originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        if (originalLocationDescriptor) Object.defineProperty(window, 'location', originalLocationDescriptor);
        document.body.replaceChildren();
    });

    it('disconnects the MutationObserver when the review tab hides', () => {
        // The bridge only arms on jpdb.io review/learn pages. jsdom forbids a
        // cross-origin history.replaceState and its location fields aren't
        // configurable, so shadow window.location wholesale with the fields the
        // bridge actually reads (hostname, pathname, href).
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { hostname: 'jpdb.io', pathname: '/review', href: 'https://jpdb.io/review' } as Location,
        });

        // Minimal BroadcastChannel stub for jsdom.
        class FakeChannel {
            onmessage: ((event: MessageEvent) => void) | null = null;
            postMessage(): void {}
            close(): void {}
        }
        vi.stubGlobal('BroadcastChannel', FakeChannel as unknown as typeof BroadcastChannel);

        const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect');

        initJpdbReviewPageBridge();

        const disconnectsBefore = disconnectSpy.mock.calls.length;
        // pagehide is the bridge's teardown signal (heartbeat + observer).
        window.dispatchEvent(new Event('pagehide'));

        expect(disconnectSpy.mock.calls.length).toBeGreaterThan(disconnectsBefore);
    });
});

// ---------------------------------------------------------------------------
// FIX A — the scroll-drive touch/wheel listeners are reaped on destroy() even
// when an overlay carrying a scroll body is open at teardown
// ---------------------------------------------------------------------------
const SCROLL_DRIVE_EVENTS = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'wheel'] as const;

describe('reader scroll-drive listener lifecycle (FIX A)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        document.body.replaceChildren();
    });

    it('attaches the scroll-drive listeners while an overlay scroll body is present and removes all 5 on destroy()', () => {
        // An overlay carrying a scroll body is present at boot: syncScrollDrive()
        // (called synchronously inside bindEvents via observeScrollDriveRoot)
        // toggles the 5 listeners on immediately — no observer flush needed.
        const overlay = document.createElement('div');
        overlay.className = 'jpdb-reader-popover-body';
        document.body.append(overlay);

        const addSpy = vi.spyOn(document, 'addEventListener');
        const removeSpy = vi.spyOn(document, 'removeEventListener');
        const app = new ReaderApp();
        try {
            internals(app).bindEvents();

            // The scroll driver attached (raw toggle, no signal): every one of
            // the 5 touch/wheel listeners registered.
            const attached = new Set(addSpy.mock.calls.filter(([type]) => (SCROLL_DRIVE_EVENTS as readonly string[]).includes(type)).map(call => call[0]));
            expect([...attached].sort()).toEqual([...SCROLL_DRIVE_EVENTS].sort());

            // destroy() aborts -> the abort handler must setScrollDrive(false)
            // BEFORE disconnecting the observers, so every scroll-drive listener
            // is removed. Pre-FIX-A the observers were disconnected first and the
            // 5 signal-less listeners survived, stacking on every re-boot.
            app.destroy();

            const removed = new Set(removeSpy.mock.calls.filter(([type]) => (SCROLL_DRIVE_EVENTS as readonly string[]).includes(type)).map(call => call[0]));
            expect([...removed].sort()).toEqual([...SCROLL_DRIVE_EVENTS].sort());
        } finally {
            app.destroy();
        }
    });

    it('stops running the wheel scroll-drive handler after destroy()', () => {
        const overlay = document.createElement('div');
        overlay.className = 'jpdb-reader-popover-body';
        // A scrollable body inside the overlay so manualScrollReaderBody engages
        // and the handler calls preventDefault on a cancelable wheel event.
        const body = document.createElement('div');
        body.className = 'jpdb-reader-popover-body';
        Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 1000 });
        Object.defineProperty(body, 'clientHeight', { configurable: true, value: 100 });
        overlay.append(body);
        document.body.append(overlay);

        const app = new ReaderApp();
        try {
            internals(app).bindEvents();

            const wheelBefore = new WheelEvent('wheel', { deltaY: 50, cancelable: true, bubbles: true });
            body.dispatchEvent(wheelBefore);
            expect(wheelBefore.defaultPrevented).toBe(true);

            app.destroy();

            const wheelAfter = new WheelEvent('wheel', { deltaY: 50, cancelable: true, bubbles: true });
            body.dispatchEvent(wheelAfter);
            // The listener was physically removed, so nothing preventDefaults.
            expect(wheelAfter.defaultPrevented).toBe(false);
        } finally {
            app.destroy();
        }
    });
});

// ---------------------------------------------------------------------------
// FIX B — the jpdb review-page bridge is disposable across a same-window
// re-boot (no navigation -> no pagehide): idempotent re-init, a returned
// dispose(), and ReaderApp.destroy() invokes the stored disposer
// ---------------------------------------------------------------------------
describe('jpdb review page bridge disposer lifecycle (FIX B)', () => {
    const originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');

    class FakeChannel {
        onmessage: ((event: MessageEvent) => void) | null = null;
        closed = false;
        postMessage(): void {}
        close(): void { this.closed = true; }
    }

    let channels: FakeChannel[] = [];

    function armReviewPage(): void {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { hostname: 'jpdb.io', pathname: '/review', href: 'https://jpdb.io/review' } as Location,
        });
        channels = [];
        vi.stubGlobal('BroadcastChannel', function FakeChannelCtor(this: FakeChannel) {
            const channel = new FakeChannel();
            channels.push(channel);
            return channel;
        } as unknown as typeof BroadcastChannel);
    }

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        if (originalLocationDescriptor) Object.defineProperty(window, 'location', originalLocationDescriptor);
        document.body.replaceChildren();
    });

    it('returns a dispose() that disconnects the observer, clears the heartbeat and closes the channel', () => {
        armReviewPage();
        const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect');
        const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

        const dispose = initJpdbReviewPageBridge();
        expect(dispose).toBeTypeOf('function');
        expect(channels).toHaveLength(1);

        const disconnectsBefore = disconnectSpy.mock.calls.length;
        const clearsBefore = clearIntervalSpy.mock.calls.length;

        dispose!();

        expect(disconnectSpy.mock.calls.length).toBeGreaterThan(disconnectsBefore);
        expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(clearsBefore);
        expect(channels[0]!.closed).toBe(true);
    });

    it('idempotently tears down the prior bridge when re-initialised without disposing (no stacking on re-boot)', () => {
        armReviewPage();
        const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect');
        const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

        // First bridge (e.g. a lower-priority runtime already live on the page).
        initJpdbReviewPageBridge();
        expect(channels).toHaveLength(1);

        const disconnectsBefore = disconnectSpy.mock.calls.length;
        const clearsBefore = clearIntervalSpy.mock.calls.length;

        // A higher-priority runtime supersedes on the SAME window: no navigation,
        // so no pagehide — the second init must reap the first bridge itself.
        const secondDispose = initJpdbReviewPageBridge();

        expect(disconnectSpy.mock.calls.length).toBeGreaterThan(disconnectsBefore);
        expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(clearsBefore);
        expect(channels[0]!.closed).toBe(true); // first channel closed by the guard
        expect(channels).toHaveLength(2); // a fresh second bridge installed
        expect(channels[1]!.closed).toBe(false);

        secondDispose?.();
    });

    it('invokes the stored jpdb bridge disposer in ReaderApp.destroy()', () => {
        const app = new ReaderApp();
        const disposeSpy = vi.fn();
        internals(app).disposeJpdbReviewBridge = disposeSpy;

        app.destroy();

        expect(disposeSpy).toHaveBeenCalledTimes(1);
    });
});
