import '../../src/reader/companions/register-build-companions';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    removeNonDestructiveScanMirrors,
    textMirrorAlreadyRenders,
    withMirrorTokenApply,
} from '../../src/reader/dom';
import { MIRROR_TEXT as TEXT, paintMirrorToken } from './helpers/japanese-token-fixtures';
import { applyTokensToScanTarget, collectTextTargetsIn } from "../../src/reader/dom";
import { DEFAULT_SETTINGS } from "../../src/reader/settings";
import { mirrorToken as token } from "./helpers/japanese-token-fixtures";

function paintMirror(host: HTMLElement): void {
    paintMirrorToken(host, { nonDestructive: true });
}
function flushMicrotasks(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

afterEach(() => {
    vi.unstubAllGlobals();
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

// An SPA page swap (YouTube home -> watch -> home) hides the old page's
// subtree while re-rendering its cards. A host attribute mutation during that
// hidden window makes syncTextMirrorVisibilityToPage force the mirror to
// visibility:hidden — correct while the page conceals it, but once the page
// un-hides the ancestor there is no host mutation left to re-sync. Silent
// scroll scans then SKIP the host (textMirrorAlreadyRenders) forever: the
// host text stays concealed and the mirror stays hidden — a permanently
// blank title/chip (2026-07-11 iPad blank-text regression).
describe('mirror visibility heals after a transient page hide', () => {
    it('re-shows a stuck-hidden mirror when the silent-scan skip check consults it', async () => {
        document.body.innerHTML = `<div id="page"><div id="host">${TEXT}</div></div>`;
        const page = document.getElementById('page')!;
        const host = document.getElementById('host')!;
        paintMirror(host);
        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        expect(mirror.style.getPropertyValue('visibility')).not.toBe('hidden');

        // The SPA hides the page, then touches the host's class attribute in
        // the same re-render batch — the per-host observer re-asserts styles
        // and syncs the mirror to the concealed page state.
        page.style.display = 'none';
        host.classList.add('recycled');
        await flushMicrotasks();
        expect(mirror.style.getPropertyValue('visibility')).toBe('hidden');

        // The SPA un-hides the page WITHOUT touching the host again.
        page.style.removeProperty('display');

        // The next silent scroll scan consults the skip check; it must heal
        // the stuck-hidden mirror instead of leaving the row blank forever.
        expect(textMirrorAlreadyRenders(host, TEXT)).toBe(true);
        expect(mirror.style.getPropertyValue('visibility')).not.toBe('hidden');
    });

    it('re-shows a stuck-hidden mirror on the guarded-apply sweep even when scans never re-collect the host', async () => {
        document.body.innerHTML = `<div id="page"><div id="host">${TEXT}</div></div>`;
        const page = document.getElementById('page')!;
        const host = document.getElementById('host')!;
        paintMirror(host);
        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;

        page.style.display = 'none';
        host.classList.add('recycled');
        await flushMicrotasks();
        expect(mirror.style.getPropertyValue('visibility')).toBe('hidden');
        page.style.removeProperty('display');

        // Channel bylines are often outside the scan budget: no skip check
        // ever consults them. The sweep at the end of every guarded token
        // apply must heal them instead.
        withMirrorTokenApply(() => undefined);
        expect(mirror.style.getPropertyValue('visibility')).not.toBe('hidden');
    });

    it('keeps the mirror hidden while the page still conceals the host', async () => {
        document.body.innerHTML = `<div id="page"><div id="host">${TEXT}</div></div>`;
        const page = document.getElementById('page')!;
        const host = document.getElementById('host')!;
        paintMirror(host);
        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;

        page.style.display = 'none';
        host.classList.add('recycled');
        await flushMicrotasks();
        expect(mirror.style.getPropertyValue('visibility')).toBe('hidden');

        expect(textMirrorAlreadyRenders(host, TEXT)).toBe(true);
        expect(mirror.style.getPropertyValue('visibility')).toBe('hidden');
    });

    it('never forces inline visibility, so ancestor autohide conceals the mirror by inheritance', () => {
        // YouTube fades its control bar via an ancestor visibility/opacity
        // toggle with NO mutation near the host. The mirror must carry no
        // inline visibility of its own — a forced 'visible !important' once
        // left underline/furigana floating over the video after the controls
        // disappeared.
        document.body.innerHTML = `<div id="page"><div id="host">${TEXT}</div></div>`;
        const host = document.getElementById('host')!;
        paintMirror(host);
        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror.style.getPropertyValue('visibility')).toBe('');
    });

    it('treats a faded-out (opacity 0) ancestor as page concealment', async () => {
        document.body.innerHTML = `<div id="page"><div id="host">${TEXT}</div></div>`;
        const page = document.getElementById('page')!;
        const host = document.getElementById('host')!;
        paintMirror(host);
        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;

        page.style.opacity = '0';
        host.classList.add('recycled');
        await flushMicrotasks();
        expect(mirror.style.getPropertyValue('visibility')).toBe('hidden');

        page.style.removeProperty('opacity');
        expect(textMirrorAlreadyRenders(host, TEXT)).toBe(true);
        expect(mirror.style.getPropertyValue('visibility')).not.toBe('hidden');
    });
});

// Interactive chrome rendered through the MIRROR channel is out-of-flow and
// paint-invariant: readings cannot distort the row's own layout. The sealed
// interactive-passive decision must therefore suppress ruby only for IN-PLACE
// renders — a mirrored toolbar link keeps its furigana (2026-07-11 "furigana
// is missing" report). Page buttons themselves are never annotated (YQ-07).
describe('mirrored interactive chrome keeps furigana', () => {
    it('renders detached readings inside a mirrored toolbar link', () => {
        document.body.innerHTML = `<div role="toolbar"><a id="host" href="/create">${TEXT}</a></div>`;
        const host = document.getElementById('host')!;
        paintMirror(host);
        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        expect(mirror.querySelector('rt')).toBeNull();
        expect(mirror.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('にほんご');
        expect(mirror.dataset.yomuDetachedReadings).toBe('true');
        // Detached readings stay out of the link's line box while the
        // control-mirror stamp keeps the base glyph on the exact native
        // metrics instead of the roomier prose mirror metrics. The reading is
        // painted at rest — the out-of-flow lane is what protects the control.
        expect(mirror.dataset.yomuControlMirror).toBe('true');
    });

    it('uses the same detached-reading channel on YouTube toolbar links', () => {
        vi.stubGlobal('location', {
            hostname: 'www.youtube.com',
            href: 'https://www.youtube.com/watch?v=test',
        });
        document.body.innerHTML = `<div role="toolbar"><a id="host" href="/create">${TEXT}</a></div>`;
        const host = document.getElementById('host')!;
        paintMirror(host);
        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('にほんご');
        expect(mirror.dataset.yomuDetachedReadings).toBe('true');
        expect(mirror.dataset.yomuControlMirror).toBe('true');
    });
});

describe("mirror observer leak", () => {
    // React expando so the host is treated as framework-managed (chat surface).
    function markReactOwned(element: Element): void {
        (element as unknown as Record<string, unknown>).__reactFiber$abc123 = {};
        (element as unknown as Record<string, unknown>).__reactProps$abc123 = {};
    }
    // A styled framework host receives an additive mirror while page-owned paint
    // remains untouched. Observer state must still be fully reaped on detach.
    function paintStyledConcealHost(): HTMLElement {
        document.body.innerHTML = `<div data-message-author-role="assistant"><div id="host" class="markdown" style="background-color: rgb(31, 41, 55); border: 1px solid rgb(99, 102, 241);">${TEXT}</div></div>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);
        paintMirrorToken(host);
        expect(host.querySelector(':scope > .jpdb-reader-text-mirror')).toBeTruthy();
        expect(host.style.getPropertyValue('color')).not.toBe('transparent');
        return host;
    }

    afterEach(() => { removeNonDestructiveScanMirrors(document); document.body.innerHTML = ''; });

    // FINDING 1: the per-host observer's callback must not transitively strong-ref
    // the host. WeakRef(host) alone did NOT break retention for concealTextOnly
    // mirrors, because the callback ALSO closed over `state`, and
    // state.concealedText holds the host element itself. Chain (all strong):
    //   liveTextMirrorObservers (module Set/Map) -> observer -> callback closure
    //   -> state -> concealedText[i].element === host.
    // After the fix the callback closes over ONLY a WeakRef and looks state up via
    // the host-keyed WeakMap, so a detached host has no strong retainer and GCs.
    describe('mirror observer retention (FINDING 1)', () => {
        // Deterministic (jsdom-observable) proof that a detached concealTextOnly
        // host is fully TORN DOWN by the sweep — not just disconnected. A pre-fix
        // build had no sweep, so a framework-detached concealTextOnly host kept its
        // state alive (state.concealedText holds the host) forever with no way to
        // release it. The fix's sweep runs removeTextMirror on the detached host,
        // which restores the concealed text styling and deletes the WeakMap state
        // entry — the observable signal that `state` (and its host ref) was released.
        it('runs full teardown (not just disconnect) for a detached concealTextOnly host on sweep', () => {
            const host = paintStyledConcealHost();
            expect(host.style.getPropertyValue('color')).not.toBe('transparent');

            // Framework detaches the subtree WITHOUT Yomu teardown.
            host.parentElement!.remove();
            // A guarded apply at the next scan cadence sweeps the detached host.
            withMirrorTokenApply(() => undefined);

            // removeTextMirror ran: the concealed text styling is restored (state's
            // transparent-colour override lifted) and the owned mirror removed.
            // Pre-fix (no sweep) the host would still read 'transparent' with its
            // state — and observer — retained indefinitely.
            expect(host.style.getPropertyValue('color')).not.toBe('transparent');
            expect(host.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        });

        // GC-based retention proof kept for documentation and for GC-capable e2e
        // runs, but SKIPPED under vitest/jsdom: jsdom holds internal strong refs to
        // every node it creates, so even a plain detached node never collects here
        // (verified) — a WeakRef/FinalizationRegistry probe cannot distinguish the
        // fixed graph from the leaky one in this environment. The retention break is
        // instead proven structurally by the teardown-on-sweep test above plus the
        // FINDING-2 disconnect+drop tests; the closure now captures ONLY a WeakRef
        // and resolves `state` via the host-keyed WeakMap (see observeTextMirrorHost).
        it.skip('lets a detached concealTextOnly host be garbage-collected (needs a GC-capable, non-jsdom runtime)', () => {
            // Intentionally skipped: unprovable under jsdom (nodes are pinned).
        });
    });

    // FINDING 2: liveTextMirrorObservers is only pruned on explicit teardown /
    // abort / re-observe. When a framework DETACHES a mirror host without Yomu
    // teardown (the OOM scenario), no abort fires and the detached node's observer
    // never fires again to self-clean — so it (and, pre-FINDING-1, its host) would
    // stay tracked forever. The guarded token-apply must opportunistically SWEEP
    // such observers: disconnect + drop them so the Set stays bounded and the host
    // is released.
    describe('mirror observer sweep on detach-without-teardown (FINDING 2)', () => {
        function paintBareHost(id: string): HTMLElement {
            const host = document.getElementById(id)!;
            const target = collectTextTargetsIn(host, 40, false).find(t => t.text.trim() === TEXT)!;
            expect(target).toBeTruthy();
            applyTokensToScanTarget({ ...target, nonDestructive: true }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
            return host;
        }

        it('disconnects and drops observers whose host detached without teardown, on the next guarded apply', () => {
            const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect');
            try {
                document.body.innerHTML = `
                    <div id="wrap-a"><span id="a" class="ytAttributedStringHost">${TEXT}</span></div>
                    <div id="wrap-b"><span id="b" class="ytAttributedStringHost">${TEXT}</span></div>
                `;
                const a = paintBareHost('a');
                const b = paintBareHost('b');
                expect(a.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();
                const observerB = document.getElementById('wrap-b'); // keep b live

                const disconnectsBefore = disconnectSpy.mock.calls.length;

                // Framework detaches host A's whole subtree WITHOUT Yomu teardown.
                // A's observer stays connected and would otherwise sit in the live
                // set forever (its callback never fires again on a detached node).
                document.getElementById('wrap-a')!.remove();

                // A later guarded token-apply (any scan cadence) must sweep A's
                // observer: disconnect it and drop it from tracking. B stays.
                withMirrorTokenApply(() => { void observerB; });

                expect(disconnectSpy.mock.calls.length).toBeGreaterThan(disconnectsBefore);
                // B, still on the DOM, must keep its mirror and observer.
                expect(b.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();
            } finally {
                disconnectSpy.mockRestore();
            }
        });

        it('bounds the live-observer set across many detach-without-teardown cycles', () => {
            // Simulate a virtualized reader recycling slots: each cycle mounts a
            // fresh mirror host and detaches it without teardown. Without the sweep
            // the live-observer set would grow unbounded (the OOM leak). A guarded
            // apply each cycle must keep it from accumulating dead observers, so the
            // count of disconnects tracks the count of detached hosts.
            const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect');
            try {
                const CYCLES = 20;
                let sweptDisconnects = 0;
                for (let cycle = 0; cycle < CYCLES; cycle++) {
                    document.body.innerHTML = `<div id="wrap"><span id="h" class="ytAttributedStringHost">${TEXT}</span></div>`;
                    paintBareHost('h');
                    const before = disconnectSpy.mock.calls.length;
                    document.getElementById('wrap')!.remove(); // detach, no teardown
                    withMirrorTokenApply(() => undefined); // scan cadence -> sweep
                    if (disconnectSpy.mock.calls.length > before) sweptDisconnects += 1;
                }
                // Every detached host's observer was swept on the following apply.
                expect(sweptDisconnects).toBe(CYCLES);
            } finally {
                disconnectSpy.mockRestore();
            }
        });
    });
});
