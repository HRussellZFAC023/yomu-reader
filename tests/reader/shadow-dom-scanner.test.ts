import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    applyTokensToScanTarget,
    collectFragmentTextTargetsIn,
    readerWordSurfaceText,
    removeNonDestructiveScanMirrors,
    withMirrorTokenApply,
    type FragmentTextTarget,
} from '../../src/reader/dom/index';
import { collectScanTargets } from '../../src/reader/app/site-parsers';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

const TEXT = '日本語';

function card(spelling: string): JPDBCard {
    return {
        vid: 1, sid: 1, rid: 0, spelling, reading: 'にほんご', frequencyRank: null,
        partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
    };
}

function token(spelling: string, text = spelling): JPDBToken {
    return {
        card: card(spelling),
        start: 0,
        end: text.length,
        length: text.length,
        rubies: [{ text: 'にほんご', start: 0, end: text.length, length: text.length }],
        pitchClass: '',
        sentence: text,
    };
}

// Register a custom element class exactly once (customElements throws on a
// duplicate name, and vitest reuses the same jsdom window across a file).
const definedHosts = new Set<string>();
function defineShadowHost(tag: string, mode: 'open' | 'closed', innerHTML: string): void {
    if (definedHosts.has(tag)) return;
    definedHosts.add(tag);
    customElements.define(tag, class extends HTMLElement {
        constructor() {
            super();
            const root = this.attachShadow({ mode });
            root.innerHTML = innerHTML;
        }
    });
}

const SETTINGS = { ...DEFAULT_SETTINGS, furiganaMode: 'all' as const };

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

describe('shadow DOM scanner (Phase 1)', () => {
    it('annotates Japanese inside an open shadow root via the mirror (never destructive)', () => {
        defineShadowHost('yomu-open-host', 'open', `<p>${TEXT}</p>`);
        document.body.innerHTML = '<yomu-open-host></yomu-open-host>';
        const host = document.querySelector('yomu-open-host') as HTMLElement;

        const targets = collectFragmentTextTargetsIn(document.body, 40, false, '', {
            allowUiText: true,
            includeUiChrome: true,
            includePassiveInteractions: true,
            minLength: 1,
        });
        const shadowTarget = targets.find(t => t.text === TEXT);
        expect(shadowTarget, 'shadow text should be collected as a scan target').toBeTruthy();
        expect(shadowTarget!.insideShadowDOM).toBe(true);
        expect(shadowTarget!.nonDestructive).toBe(true);

        const shadowParagraph = host.shadowRoot!.querySelector('p')!;
        withMirrorTokenApply(() => applyTokensToScanTarget(shadowTarget!, [token(TEXT)], SETTINGS));

        // Mirror rendered INSIDE the shadow root, over the host paragraph.
        const mirror = host.shadowRoot!.querySelector('.jpdb-reader-text-mirror');
        expect(mirror, 'a mirror should be painted inside the shadow root').toBeTruthy();
        const word = host.shadowRoot!.querySelector<HTMLElement>('.jpdb-reader-word');
        expect(word).toBeTruthy();
        expect(readerWordSurfaceText(word!)).toBe(TEXT);

        // The shadow's OWN paragraph text node must be untouched (non-destructive):
        // its original text node still holds the source text, and no word span
        // has REPLACED it (word spans live inside the appended mirror overlay,
        // not in place of the component's own node).
        expect(shadowParagraph.firstChild!.nodeType).toBe(Node.TEXT_NODE);
        expect(shadowParagraph.firstChild!.textContent).toBe(TEXT);
        // The word lives inside the mirror overlay, never as a direct child that
        // replaced the paragraph's text node.
        expect(word!.closest('.jpdb-reader-text-mirror')).toBe(mirror);
    });

    it('silently skips closed shadow roots (no crash, no annotation)', () => {
        defineShadowHost('yomu-closed-host', 'closed', `<p>封じ込め${TEXT}</p>`);
        document.body.innerHTML = '<yomu-closed-host></yomu-closed-host>';

        const targets = collectFragmentTextTargetsIn(document.body, 40, false, '', { allowUiText: true, minLength: 1 });
        expect(targets.some(t => t.text.includes('封じ込め'))).toBe(false);
        expect(document.querySelector('.jpdb-reader-text-mirror')).toBeNull();
    });

    it('deduplicates slotted light-DOM content projected into a shadow root', () => {
        defineShadowHost('yomu-slot-host', 'open', '<slot></slot>');
        document.body.innerHTML = `<yomu-slot-host><p>スロット投影${TEXT}</p></yomu-slot-host>`;

        const targets = collectFragmentTextTargetsIn(document.body, 40, false, '', { allowUiText: true, minLength: 1 });
        const projectedText = 'スロット投影' + TEXT;
        const matches = targets.filter(t => t.text.replace(/\s+/g, '') === projectedText);
        expect(matches, 'slotted text must be collected exactly once (light walk), not doubled by the shadow walk').toHaveLength(1);
        expect(matches[0]!.insideShadowDOM).toBeFalsy();
    });

    it('bounds the live-observer set across many detached shadow hosts (no leak)', () => {
        defineShadowHost('yomu-leak-host', 'open', `<p>${TEXT}</p>`);
        const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect');
        try {
            const CYCLES = 20;
            let sweptDisconnects = 0;
            for (let cycle = 0; cycle < CYCLES; cycle++) {
                document.body.innerHTML = '<div id="wrap"><yomu-leak-host></yomu-leak-host></div>';
                const host = document.querySelector('yomu-leak-host') as HTMLElement;
                const target = collectFragmentTextTargetsIn(document.body, 40, false, '', { allowUiText: true, minLength: 1 })
                    .find(t => t.text === TEXT)!;
                withMirrorTokenApply(() => applyTokensToScanTarget(target, [token(TEXT)], SETTINGS));
                expect(host.shadowRoot!.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();

                const before = disconnectSpy.mock.calls.length;
                // Framework detaches the shadow host WITHOUT Yomu teardown.
                document.getElementById('wrap')!.remove();
                // Next guarded apply (scan cadence) must sweep the detached host's observer.
                withMirrorTokenApply(() => undefined);
                if (disconnectSpy.mock.calls.length > before) sweptDisconnects += 1;
            }
            expect(sweptDisconnects, 'every detached shadow host must be swept on the next apply').toBe(CYCLES);
        } finally {
            disconnectSpy.mockRestore();
        }
    });

    it('forces a shadow target to the mirror (never a destructive inline paint)', () => {
        // The render-plan guard keys off insideShadowDOM, NOT nonDestructive, so
        // it holds even if a future collection path forgets to set nonDestructive
        // on a shadow target. Simulate that regression by clearing nonDestructive
        // and asserting the guard STILL routes to the mirror and never replaces
        // the component's own text node (which would corrupt a framework shadow).
        defineShadowHost('yomu-force-host', 'open', `<span class="label">${TEXT}</span>`);
        document.body.innerHTML = '<yomu-force-host></yomu-force-host>';
        const host = document.querySelector('yomu-force-host') as HTMLElement;

        const collected = collectFragmentTextTargetsIn(document.body, 40, false, '', { allowUiText: true, minLength: 1 })
            .find(t => t.text === TEXT)!;
        expect(collected.insideShadowDOM).toBe(true);
        expect(collected.nonDestructive).toBe(true);
        // Defence-in-depth: strip nonDestructive; the insideShadowDOM guard alone
        // must still prevent destructive paint.
        const target = { ...collected, nonDestructive: false };

        withMirrorTokenApply(() => applyTokensToScanTarget(target, [token(TEXT)], SETTINGS));

        // Rendered as a mirror overlay; the label's own text node is intact.
        expect(host.shadowRoot!.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();
        const label = host.shadowRoot!.querySelector('.label')!;
        expect(label.firstChild!.nodeType).toBe(Node.TEXT_NODE);
        expect(label.firstChild!.textContent).toBe(TEXT);
        // Word spans exist only inside the mirror, never replacing the source node.
        const words = Array.from(host.shadowRoot!.querySelectorAll('.jpdb-reader-word'));
        expect(words.length).toBeGreaterThan(0);
        expect(words.every(w => w.closest('.jpdb-reader-text-mirror'))).toBe(true);
    });

    it('gates on HAS_JAPANESE: a Latin-only open shadow root is not walked (perf short-circuit)', () => {
        defineShadowHost('yomu-latin-host', 'open', '<p class="latin-label">Join the community</p>');
        document.body.innerHTML = '<yomu-latin-host></yomu-latin-host>';
        const host = document.querySelector('yomu-latin-host') as HTMLElement;

        // Spy the label's childNodes: the fast-path gate must reject the whole
        // shadow root on textContent alone, so the walker never reaches into the
        // Latin label's children. (reddit has ~155 mostly-Latin shadow hosts;
        // this is what keeps them cheap.)
        const label = host.shadowRoot!.querySelector('.latin-label')!;
        const childNodesSpy = vi.spyOn(label, 'childNodes', 'get');
        try {
            const targets = collectFragmentTextTargetsIn(document.body, 40, false, '', { allowUiText: true, minLength: 1 });
            expect(targets.some(t => t.text.includes('Join'))).toBe(false);
            expect(childNodesSpy, 'gate must reject before descending into a Latin shadow subtree').not.toHaveBeenCalled();
        } finally {
            childNodesSpy.mockRestore();
        }
    });

    it('descends four open-shadow boundaries and still caps traversal before depth five', () => {
        defineShadowHost('yomu-inner-host', 'open', `<p>深い階層</p>`);
        defineShadowHost('yomu-outer-host', 'open', `<p>浅い階層</p><yomu-inner-host></yomu-inner-host>`);
        document.body.innerHTML = '<yomu-outer-host></yomu-outer-host>';
        const outer = document.querySelector('yomu-outer-host') as HTMLElement;
        const inner = outer.shadowRoot!.querySelector('yomu-inner-host') as HTMLElement;
        expect(inner.shadowRoot, 'inner depth-2 shadow must exist for this test to bite').toBeTruthy();

        const targets = collectFragmentTextTargetsIn(document.body, 40, false, '', { allowUiText: true, minLength: 1 });
        expect(targets.some(t => t.text.includes('浅い階層')), 'depth-1 shadow text should be collected').toBe(true);
        expect(targets.some(t => t.text.includes('深い階層')), 'depth-2 shadow text should be collected').toBe(true);

        defineShadowHost('yomu-depth-three-host', 'open', `<p>第三階層</p>`);
        defineShadowHost('yomu-depth-two-host', 'open', `<p>第二階層</p><yomu-depth-three-host></yomu-depth-three-host>`);
        defineShadowHost('yomu-depth-one-host', 'open', `<p>第一階層</p><yomu-depth-two-host></yomu-depth-two-host>`);
        document.body.innerHTML = '<yomu-depth-one-host></yomu-depth-one-host>';
        const cappedTargets = collectFragmentTextTargetsIn(document.body, 40, false, '', { allowUiText: true, minLength: 1 });
        expect(cappedTargets.some(t => t.text.includes('第一階層'))).toBe(true);
        expect(cappedTargets.some(t => t.text.includes('第二階層'))).toBe(true);
        expect(cappedTargets.some(t => t.text.includes('第三階層')), 'depth-3 shreddit-style text should be collected').toBe(true);

        defineShadowHost('yomu-depth-five-host', 'open', `<p>第五階層</p>`);
        defineShadowHost('yomu-depth-four-host', 'open', `<p>第四階層</p><yomu-depth-five-host></yomu-depth-five-host>`);
        defineShadowHost('yomu-depth-three-deep-host', 'open', `<p>第三深層</p><yomu-depth-four-host></yomu-depth-four-host>`);
        defineShadowHost('yomu-depth-two-deep-host', 'open', `<p>第二深層</p><yomu-depth-three-deep-host></yomu-depth-three-deep-host>`);
        defineShadowHost('yomu-depth-one-deep-host', 'open', `<p>第一深層</p><yomu-depth-two-deep-host></yomu-depth-two-deep-host>`);
        document.body.innerHTML = '<yomu-depth-one-deep-host></yomu-depth-one-deep-host>';
        const deeplyCappedTargets = collectFragmentTextTargetsIn(document.body, 40, false, '', { allowUiText: true, minLength: 1 });
        expect(deeplyCappedTargets.some(t => t.text.includes('第四階層')), 'depth-4 shadow text should be collected').toBe(true);
        // A SINGLE walk still caps at depth 4 (per-frame bound); coverage of
        // deeper levels is the collection driver's deferred continuation, not
        // this walk's job — see the pipeline test below.
        expect(deeplyCappedTargets.some(t => t.text.includes('第五階層')), 'a single bounded walk still stops at depth 4').toBe(false);
    });

    it('covers depth-5+ shadow text through the deferred continuation (full pipeline)', () => {
        defineShadowHost('yomu-p-depth-six-host', 'open', `<p>第六階層</p>`);
        defineShadowHost('yomu-p-depth-five-host', 'open', `<p>第五階層</p><yomu-p-depth-six-host></yomu-p-depth-six-host>`);
        defineShadowHost('yomu-p-depth-four-host', 'open', `<p>第四階層</p><yomu-p-depth-five-host></yomu-p-depth-five-host>`);
        defineShadowHost('yomu-p-depth-three-host', 'open', `<p>第三階層</p><yomu-p-depth-four-host></yomu-p-depth-four-host>`);
        defineShadowHost('yomu-p-depth-two-host', 'open', `<p>第二階層</p><yomu-p-depth-three-host></yomu-p-depth-three-host>`);
        defineShadowHost('yomu-p-depth-one-host', 'open', `<p>第一階層</p><yomu-p-depth-two-host></yomu-p-depth-two-host>`);
        document.body.innerHTML = '<yomu-p-depth-one-host></yomu-p-depth-one-host>';

        const originalRect = HTMLElement.prototype.getBoundingClientRect;
        HTMLElement.prototype.getBoundingClientRect = () => ({
            x: 0, y: 0, width: 240, height: 24, top: 0, right: 240, bottom: 24, left: 0, toJSON: () => ({}),
        } as DOMRect);
        try {
            const targets = collectScanTargets(80, 'https://example.com/');
            const texts = targets.map(target => target.text);
            expect(texts.some(text => text.includes('第五階層')), 'depth-5 must be covered by the deferred continuation').toBe(true);
            expect(texts.some(text => text.includes('第六階層')), 'depth-6 must be covered across rounds').toBe(true);
            const deep = targets.find(target => target.text.includes('第五階層'));
            expect(deep?.passiveInteraction, 'deferred deep coverage stays passive').toBe(true);
        } finally {
            HTMLElement.prototype.getBoundingClientRect = originalRect;
        }
    });

    it('looks through a Latin-only outer shell to reach Reddit-style nested Japanese controls', () => {
        defineShadowHost('yomu-reddit-join-host', 'open', '<button id="join">参加</button>');
        // The outer component has no direct Japanese text. ShadowRoot.textContent
        // therefore cannot see the label; the bounded lookahead must discover
        // it through the nested component boundary.
        defineShadowHost('yomu-reddit-header-shell', 'open', '<div class="actions"><yomu-reddit-join-host></yomu-reddit-join-host></div>');
        document.body.innerHTML = '<yomu-reddit-header-shell></yomu-reddit-header-shell>';

        const targets = collectFragmentTextTargetsIn(document.body, 40, false, '', {
            allowUiText: true,
            includeUiChrome: true,
            includePassiveInteractions: true,
            minLength: 1,
        });
        const joinTarget = targets.find(target => target.text === '参加');
        expect(joinTarget, 'nested Reddit join label should be collected').toBeTruthy();
        expect(joinTarget?.insideShadowDOM).toBe(true);
        expect(joinTarget?.nonDestructive).toBe(true);
    });
});

// ISSUE 1/2 (codex round-1): a pending inline light-DOM run must be COMMITTED
// before descending into a host's shadow root, so a shadow flush that fills the
// collection limit never causes the earlier light run to be held-then-dropped,
// and document order is preserved (light run before shadow target).
describe('shadow descent preserves a pending light-DOM run', () => {
    it('does not drop an earlier inline light run when the shadow flush fills the limit', () => {
        // The host carries BOTH a light-DOM text child (光ラン内容) and an open
        // shadow root (影テキスト内容). At limit 1 only one target fits: it must
        // be the earlier-in-document LIGHT run, never the shadow text.
        defineShadowHost('yomu-lightthenshadow-host', 'open', '<p>影テキスト内容</p>');
        document.body.innerHTML = '<div><yomu-lightthenshadow-host>光ラン内容</yomu-lightthenshadow-host></div>';

        const oneTarget = collectFragmentTextTargetsIn(document.body, 1, false, '', { allowUiText: true, minLength: 1 });
        expect(oneTarget).toHaveLength(1);
        expect(oneTarget[0]!.text, 'the earlier light run must win the single slot, not be dropped').toBe('光ラン内容');
        expect(oneTarget[0]!.insideShadowDOM).toBeFalsy();
    });

    it('collects the light run and the shadow target in document order', () => {
        defineShadowHost('yomu-order-host', 'open', '<p>影テキスト内容</p>');
        document.body.innerHTML = '<div><yomu-order-host>光ラン内容</yomu-order-host></div>';

        const targets = collectFragmentTextTargetsIn(document.body, 10, false, '', { allowUiText: true, minLength: 1 });
        const light = targets.findIndex(t => t.text === '光ラン内容');
        const shadow = targets.findIndex(t => t.text === '影テキスト内容');
        expect(light, 'light run collected').toBeGreaterThanOrEqual(0);
        expect(shadow, 'shadow target collected').toBeGreaterThanOrEqual(0);
        expect(light, 'light run must precede the shadow target (document order)').toBeLessThan(shadow);
    });
});

// ISSUE 3 (codex round-1): teardown/clear must pierce open shadow roots. A
// shadow-scan mirror is appended INSIDE the shadow root, which a plain
// querySelectorAll does not cross — so before the fix the shadow mirror stayed
// painted and its per-host observer stayed connected after a clear, reviving the
// leak class 1.6.112 closed.
describe('shadow-hosted mirror teardown (no observer leak)', () => {
    it('removes a shadow-hosted mirror and disconnects its observer on clear', () => {
        defineShadowHost('yomu-teardown-host', 'open', `<p>${TEXT}</p>`);
        document.body.innerHTML = '<yomu-teardown-host></yomu-teardown-host>';
        const host = document.querySelector('yomu-teardown-host') as HTMLElement;

        const target = collectFragmentTextTargetsIn(document.body, 40, false, '', { allowUiText: true, minLength: 1 })
            .find(t => t.text === TEXT)!;
        const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect');
        try {
            withMirrorTokenApply(() => applyTokensToScanTarget(target, [token(TEXT)], SETTINGS));
            expect(host.shadowRoot!.querySelector('.jpdb-reader-text-mirror'), 'shadow mirror painted').toBeTruthy();

            const disconnectsBefore = disconnectSpy.mock.calls.length;
            const removed = removeNonDestructiveScanMirrors(document);

            // The shadow mirror node is gone and its per-host observer disconnected.
            expect(host.shadowRoot!.querySelector('.jpdb-reader-text-mirror'), 'shadow mirror removed on clear').toBeNull();
            expect(removed, 'the shadow host counts toward removed mirrors').toBeGreaterThanOrEqual(1);
            expect(disconnectSpy.mock.calls.length, 'the shadow host observer was disconnected').toBeGreaterThan(disconnectsBefore);
            // Host visibility restored (mirror teardown un-hides the host paragraph).
            expect(host.shadowRoot!.querySelector('p')!.getAttribute('style') ?? '').not.toContain('visibility: hidden');
        } finally {
            disconnectSpy.mockRestore();
        }
    });

    // codex round-2: keying teardown off mirror.parentElement leaves the
    // ORIGINAL host's observer connected when a framework has relocated the
    // mirror under a wrapper below its host (the 1.6.108 mirror-stacking shape,
    // reachable inside a shreddit shadow root). Teardown must resolve the
    // closest REGISTERED host, not the immediate parent.
    it('disconnects the original host observer when the shadow mirror was relocated under a wrapper', () => {
        defineShadowHost('yomu-reloc-host', 'open', `<p>${TEXT}</p>`);
        document.body.innerHTML = '<yomu-reloc-host></yomu-reloc-host>';
        const host = document.querySelector('yomu-reloc-host') as HTMLElement;
        const target = collectFragmentTextTargetsIn(document.body, 40, false, '', { allowUiText: true, minLength: 1 })
            .find(t => t.text === TEXT)!;
        const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect');
        try {
            withMirrorTokenApply(() => applyTokensToScanTarget(target, [token(TEXT)], SETTINGS));
            const mirror = host.shadowRoot!.querySelector('.jpdb-reader-text-mirror') as HTMLElement;
            expect(mirror, 'shadow mirror painted').toBeTruthy();
            // Framework relocates the mirror into a wrapper BELOW its registered host.
            const registeredHost = mirror.parentElement as HTMLElement;
            const wrapper = document.createElement('div');
            registeredHost.appendChild(wrapper);
            wrapper.appendChild(mirror);
            expect(mirror.parentElement, 'mirror no longer a direct child of its host').toBe(wrapper);

            const disconnectsBefore = disconnectSpy.mock.calls.length;
            removeNonDestructiveScanMirrors(document);

            expect(host.shadowRoot!.querySelector('.jpdb-reader-text-mirror'), 'relocated shadow mirror removed').toBeNull();
            expect(disconnectSpy.mock.calls.length, 'the original registered host observer was disconnected despite relocation')
                .toBeGreaterThan(disconnectsBefore);
        } finally {
            disconnectSpy.mockRestore();
        }
    });
});

// Type note: the shadow metadata lives on FragmentTextTarget; assert the shape
// is present so a future refactor cannot silently drop it.
describe('shadow DOM scan target shape', () => {
    it('exposes shadow metadata fields', () => {
        defineShadowHost('yomu-shape-host', 'open', `<p>${TEXT}</p>`);
        document.body.innerHTML = '<yomu-shape-host></yomu-shape-host>';
        const target = collectFragmentTextTargetsIn(document.body, 40, false, '', { allowUiText: true, minLength: 1 })
            .find(t => t.text === TEXT) as FragmentTextTarget;
        expect(target.insideShadowDOM).toBe(true);
        expect(target.shadowHost).toBeInstanceOf(HTMLElement);
        expect(target.shadowRoot).toBeInstanceOf(ShadowRoot);
        expect(target.shadowHost!.tagName.toLowerCase()).toBe('yomu-shape-host');
    });
});
