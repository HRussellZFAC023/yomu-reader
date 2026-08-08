import { afterEach, describe, expect, it, vi } from 'vitest';

import { collectFragmentTextTargetsIn, documentJapaneseTextProbe } from '../../src/reader/dom';
import {
    forEachScannedShadowRoot,
    installOpenShadowRootDiscovery,
    noteScannedShadowRoot,
    OPEN_SHADOW_ROOT_DISCOVERY_EVENT,
    setCustomElementUpgradeHook,
    setShadowRootScanHook,
    type ShadowRootDiscoveryCause,
    sweepDisconnectedShadowRoots,
    wakeShadowHostPoll,
    watchPotentialOpenShadowRootHost,
} from '../../src/reader/dom/shadow-scan-registry';
import {
    AUTO_SCAN_OBSERVER_OPTIONS,
    createMutationJapaneseScanBudget,
    mutationMayContainJapaneseText,
} from '../../src/reader/app/mutation-scan';
import {
    ANNOTATION_SCOPE_ATTRIBUTE,
    mutationMayExpandAnnotationScope,
    nodeWithinAnnotationScope,
    scanScopeRoots,
} from '../../src/reader/app/annotation-scope';

const shadowRootDiscoveryDisposers: Array<() => void> = [];

afterEach(() => {
    while (shadowRootDiscoveryDisposers.length) shadowRootDiscoveryDisposers.pop()?.();
    setShadowRootScanHook(null);
    setCustomElementUpgradeHook(null);
    document.body.innerHTML = '';
    document.documentElement.removeAttribute(ANNOTATION_SCOPE_ATTRIBUTE);
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

function shadowHostWithJapanese(text = '参加'): { host: HTMLElement; root: ShadowRoot } {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    const label = document.createElement('button');
    label.textContent = text;
    root.append(label);
    return { host, root };
}

let upgradeTagSequence = 0;
function uniqueUpgradeTag(prefix: string): string {
    upgradeTagSequence += 1;
    return `${prefix}-${upgradeTagSequence}`;
}

// A subtree MutationObserver never crosses shadow boundaries: web-component
// re-renders scheduled NO rescan, so shadow chrome rendered after the boot
// scan stayed bare until the user's own tap happened to trigger a scan. The
// walk must register every open shadow root it descends so the app observer
// watches it directly.
describe('shadow scan registry', () => {
    it('degrades safely when an extension isolated world exposes a null custom-element registry', () => {
        const host = document.createElement('yomu-edge-isolated-world-host');
        document.body.append(host);
        vi.stubGlobal('customElements', null);

        expect(watchPotentialOpenShadowRootHost(host)).toBeNull();
    });

    it('degrades safely when an isolated world omits customElements.whenDefined', () => {
        const host = document.createElement('yomu-partial-custom-element-registry-host');
        document.body.append(host);
        vi.stubGlobal('customElements', { get: vi.fn() });

        expect(watchPotentialOpenShadowRootHost(host)).toBeNull();
    });

    it('limits startup shadow discovery to page-declared Reader Surfaces', () => {
        document.documentElement.setAttribute(ANNOTATION_SCOPE_ATTRIBUTE, 'surface');
        document.body.innerHTML = `
            <div id="chrome"></div>
            <section data-yomu-runtime-surface><div id="surface-host"></div></section>
        `;
        const chromeRoot = document.querySelector<HTMLElement>('#chrome')!.attachShadow({ mode: 'open' });
        chromeRoot.innerHTML = '<p>翻訳ナビゲーション</p>';
        const surfaceRoot = document.querySelector<HTMLElement>('#surface-host')!.attachShadow({ mode: 'open' });
        surfaceRoot.innerHTML = '<p>Loading</p>';
        const seen: ShadowRoot[] = [];
        setShadowRootScanHook(root => seen.push(root));

        expect(documentJapaneseTextProbe(200000, scanScopeRoots())).toEqual({
            hasJapanese: false,
            shadowDiscoveryExhausted: false,
        });
        expect(seen).toContain(surfaceRoot);
        expect(seen).not.toContain(chromeRoot);
    });

    it('observes a known root after its connected host later enters a Reader Surface', async () => {
        document.documentElement.setAttribute(ANNOTATION_SCOPE_ATTRIBUTE, 'surface');
        const surface = document.createElement('section');
        surface.dataset.yomuRuntimeSurface = '';
        const host = document.createElement('reader-late-member-host');
        const root = host.attachShadow({ mode: 'open' });
        root.textContent = 'Loading';
        document.body.append(surface, host);
        const records: MutationRecord[] = [];
        const observer = new MutationObserver(mutations => records.push(...mutations));
        setShadowRootScanHook(item => {
            if (nodeWithinAnnotationScope(item)) observer.observe(item, AUTO_SCAN_OBSERVER_OPTIONS);
        });
        noteScannedShadowRoot(root);

        try {
            surface.append(host);
            const membershipMutation = childListMutation(surface, host);
            expect(mutationMayExpandAnnotationScope(membershipMutation)).toBe(true);
            forEachScannedShadowRoot(item => {
                if (nodeWithinAnnotationScope(item)) observer.observe(item, AUTO_SCAN_OBSERVER_OPTIONS);
            });
            root.append(document.createTextNode('参加'));
            await Promise.resolve();

            expect(records.some(record => mutationMayContainJapaneseText(record))).toBe(true);
        } finally {
            observer.disconnect();
        }
    });

    it('registers a shadow root when the fragment walk descends into it', () => {
        const seen: ShadowRoot[] = [];
        setShadowRootScanHook(root => seen.push(root));
        const { root } = shadowHostWithJapanese();

        collectFragmentTextTargetsIn(document.body, 40, false, '', { allowUiText: true, includePassiveInteractions: true, minLength: 1 });

        expect(seen).toContain(root);
    });

    it('fires the hook once per root and replays pre-hook roots on install', () => {
        const { root } = shadowHostWithJapanese();
        noteScannedShadowRoot(root);
        noteScannedShadowRoot(root);

        const seen = vi.fn();
        setShadowRootScanHook(seen);
        expect(seen).toHaveBeenCalledTimes(1);
        noteScannedShadowRoot(root);
        expect(seen).toHaveBeenCalledTimes(1);
    });

    it('stops observing swept detached roots and observes them again after reconnect', async () => {
        const records: MutationRecord[] = [];
        const observer = new MutationObserver(mutations => records.push(...mutations));
        const observeRoot = (item: ShadowRoot) => observer.observe(item, AUTO_SCAN_OBSERVER_OPTIONS);
        setShadowRootScanHook(observeRoot);
        const { host, root } = shadowHostWithJapanese();
        noteScannedShadowRoot(root);
        host.remove();
        const swept = sweepDisconnectedShadowRoots();
        expect(swept).toBe(true);
        // Match the app integration: a shared observer cannot unobserve one
        // target, so a sweep disconnects it once and reattaches only live
        // roots. Mutating the detached tree must now be silent.
        observer.disconnect();
        forEachScannedShadowRoot(observeRoot);
        root.append(document.createTextNode('切断中'));
        await Promise.resolve();
        expect(records).toHaveLength(0);
        expect(sweepDisconnectedShadowRoots()).toBe(false);

        document.body.append(host);
        noteScannedShadowRoot(root);
        root.append(document.createTextNode('再接続'));
        await Promise.resolve();
        expect(records).toHaveLength(1);
        observer.disconnect();
    });

    it('re-registers the same shadow root after its host is detached and reinserted', () => {
        const { host, root } = shadowHostWithJapanese();
        const seen = vi.fn();
        setShadowRootScanHook(seen);
        noteScannedShadowRoot(root);
        expect(seen).toHaveBeenCalledTimes(1);

        host.remove();
        forEachScannedShadowRoot(() => undefined);
        document.body.append(host);
        noteScannedShadowRoot(root);

        expect(seen).toHaveBeenCalledTimes(2);
        const live: ShadowRoot[] = [];
        forEachScannedShadowRoot(item => live.push(item));
        expect(live).toContain(root);
    });

    it('registers a loading-only root before Japanese hydration and observes its re-render', async () => {
        const records: MutationRecord[] = [];
        const observer = new MutationObserver(mutations => records.push(...mutations));
        setShadowRootScanHook(root => observer.observe(root, AUTO_SCAN_OBSERVER_OPTIONS));
        const { root } = shadowHostWithJapanese('Loading');

        collectFragmentTextTargetsIn(document.body, 40, false, '', {
            allowUiText: true,
            includePassiveInteractions: true,
            minLength: 1,
        });

        // Simulate a Lit hydration/re-render inside the shadow root: no click,
        // no light-DOM mutation.
        const tab = document.createElement('button');
        tab.setAttribute('role', 'tab');
        tab.textContent = 'フィード';
        root.append(tab);
        await Promise.resolve();

        expect(records.length).toBeGreaterThan(0);
        expect(records.some(record => mutationMayContainJapaneseText(record))).toBe(true);
        observer.disconnect();
    });

    it('discovers a newly appended host whose Japanese exists only in its shadow root', async () => {
        const records: MutationRecord[] = [];
        const discovered = vi.fn();
        setShadowRootScanHook(discovered);
        const observer = new MutationObserver(mutations => records.push(...mutations));
        observer.observe(document.body, AUTO_SCAN_OBSERVER_OPTIONS);
        const host = document.createElement('late-component');
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = '<button>フィード</button>';

        document.body.append(host);
        await Promise.resolve();

        expect(records.some(record => mutationMayContainJapaneseText(record))).toBe(true);
        expect(discovered).toHaveBeenCalledWith(root, 'scan');
        observer.disconnect();
    });

    it('discovers and observes an open root attached after its host was inserted', async () => {
        const discovered = vi.fn();
        const records: MutationRecord[] = [];
        const observer = new MutationObserver(mutations => records.push(...mutations));
        setShadowRootScanHook(root => {
            discovered(root);
            observer.observe(root, AUTO_SCAN_OBSERVER_OPTIONS);
        });
        shadowRootDiscoveryDisposers.push(installOpenShadowRootDiscovery());
        const host = document.createElement('late-upgrade-component');
        document.body.append(host);
        watchPotentialOpenShadowRootHost(host);

        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = '<button>ﾌｨｰﾄﾞ</button>';
        await vi.waitFor(() => expect(discovered).toHaveBeenCalledWith(root));
        root.append(document.createTextNode('参加'));
        await Promise.resolve();

        expect(discovered).toHaveBeenCalledTimes(1);
        expect(records.some(record => mutationMayContainJapaneseText(record))).toBe(true);
        observer.disconnect();
    });

    it('discovers a page-realm-style attachment that bypasses the content-world wrapper', async () => {
        const originalAttachShadow = Element.prototype.attachShadow;
        const discovered = vi.fn();
        setShadowRootScanHook(discovered);
        const host = document.createElement('cross-realm-component');
        document.body.append(host);
        shadowRootDiscoveryDisposers.push(installOpenShadowRootDiscovery());

        // Calling the captured original simulates a page realm whose Element
        // prototype is distinct from the userscript content world.
        const root = originalAttachShadow.call(host, { mode: 'open' });
        root.innerHTML = '<button>フィード</button>';

        await vi.waitFor(() => expect(discovered).toHaveBeenCalledWith(root, 'attached'));
    });

    it('accepts the page-realm bridge event from a native shadow host', () => {
        const originalAttachShadow = Element.prototype.attachShadow;
        const discovered = vi.fn();
        setShadowRootScanHook(discovered);
        shadowRootDiscoveryDisposers.push(installOpenShadowRootDiscovery());
        const host = document.createElement('div');
        document.body.append(host);
        const root = originalAttachShadow.call(host, { mode: 'open' });

        host.dispatchEvent(new CustomEvent(OPEN_SHADOW_ROOT_DISCOVERY_EVENT, {
            bubbles: true,
            composed: true,
        }));

        expect(discovered).toHaveBeenCalledWith(root, 'attached');
    });

    it('uses the original composed-path host for a nested page-realm attachment', () => {
        const originalAttachShadow = Element.prototype.attachShadow;
        const outerHost = document.createElement('div');
        document.body.append(outerHost);
        const outerRoot = originalAttachShadow.call(outerHost, { mode: 'open' });
        const nestedHost = document.createElement('nested-component');
        outerRoot.append(nestedHost);

        const discovered = vi.fn();
        setShadowRootScanHook(discovered);
        shadowRootDiscoveryDisposers.push(installOpenShadowRootDiscovery());
        const nestedRoot = originalAttachShadow.call(nestedHost, { mode: 'open' });

        nestedHost.dispatchEvent(new CustomEvent(OPEN_SHADOW_ROOT_DISCOVERY_EVENT, {
            bubbles: true,
            composed: true,
        }));

        expect(discovered).toHaveBeenCalledWith(nestedRoot, 'attached');
        expect(discovered).not.toHaveBeenCalledWith(outerRoot, 'attached');
    });

    it('uses bounded fallback polling when a captured attachShadow bypasses the bridge', async () => {
        vi.useFakeTimers();
        const originalAttachShadow = Element.prototype.attachShadow;
        const discovered = vi.fn();
        setShadowRootScanHook(discovered);
        const dispose = installOpenShadowRootDiscovery();
        shadowRootDiscoveryDisposers.push(dispose);
        // A defined custom element with no shadow root yet enrols in the poll
        // (native hosts are no longer polled since ccbe1c023), so it is the
        // vehicle for exercising the bounded fallback window.
        const tag = uniqueUpgradeTag('yomu-bridge-bypass-host');
        customElements.define(tag, class extends HTMLElement {});
        const host = document.createElement(tag);
        document.body.append(host);
        watchPotentialOpenShadowRootHost(host);

        try {
            await vi.advanceTimersByTimeAsync(3_500);
            const root = originalAttachShadow.call(host, { mode: 'open' });
            root.innerHTML = '<button>遅延表示</button>';
            await vi.advanceTimersByTimeAsync(500);

            expect(discovered).toHaveBeenCalledWith(root, 'attached');
        } finally {
            dispose();
            vi.useRealTimers();
        }
    });

    it('discovers a declarative-shadow-DOM open root the parser materialized (no attachShadow, no bridge event)', () => {
        // A <template shadowrootmode="open"> root is created by the HTML parser,
        // not by a scripted attachShadow() call, so the page-realm attachShadow
        // bridge never fires for it and no OPEN_SHADOW_ROOT_DISCOVERY_EVENT is
        // dispatched. Discovery must therefore come from the generic walk/poll.
        // jsdom cannot parse declarative shadow DOM, so we model a parser-built
        // root: attach it directly and NEVER dispatch the bridge event; with the
        // discovery bridge installed we assert the root is still found — by the
        // fragment walk ('scan'), never by an 'attached' bridge event.
        const discovered: Array<{ root: ShadowRoot; cause: ShadowRootDiscoveryCause }> = [];
        setShadowRootScanHook((root, cause) => discovered.push({ root, cause }));
        shadowRootDiscoveryDisposers.push(installOpenShadowRootDiscovery());

        const host = document.createElement('div');
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = '<button>参加</button>';
        document.body.append(host);

        collectFragmentTextTargetsIn(document.body, 40, false, '', { allowUiText: true, includePassiveInteractions: true, minLength: 1 });

        expect(discovered.map(entry => entry.root)).toContain(root);
        expect(discovered.some(entry => entry.root === root && entry.cause === 'attached')).toBe(false);
        expect(discovered.find(entry => entry.root === root)?.cause).toBe('scan');
    });

    it('registers a pre-existing declarative-shadow-DOM root immediately from the host poll path', () => {
        // watchPotentialOpenShadowRootHost is the poll entry point; a DSD root
        // already hangs off host.shadowRoot at parse time, so the poll must note
        // it on first sight rather than waiting for an attachShadow that will
        // never be called.
        const discovered: Array<{ root: ShadowRoot; cause: ShadowRootDiscoveryCause }> = [];
        setShadowRootScanHook((root, cause) => discovered.push({ root, cause }));
        shadowRootDiscoveryDisposers.push(installOpenShadowRootDiscovery());

        const host = document.createElement('div');
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = '<button>参加</button>';
        document.body.append(host);

        expect(watchPotentialOpenShadowRootHost(host)).toBe(root);
        expect(discovered.map(entry => entry.root)).toContain(root);
        expect(discovered.some(entry => entry.root === root && entry.cause === 'attached')).toBe(false);
    });

    it('reference-counts discovery installs and stops fallback polling after cleanup', async () => {
        vi.useFakeTimers();
        const originalAttachShadow = Element.prototype.attachShadow;
        const discovered = vi.fn();
        setShadowRootScanHook(discovered);
        const disposeFirst = installOpenShadowRootDiscovery();
        const disposeSecond = installOpenShadowRootDiscovery();
        shadowRootDiscoveryDisposers.push(disposeFirst, disposeSecond);
        disposeFirst();

        const openHost = document.createElement('open-component');
        document.body.append(openHost);
        watchPotentialOpenShadowRootHost(openHost);
        const openRoot = originalAttachShadow.call(openHost, { mode: 'open' });
        await vi.advanceTimersByTimeAsync(500);
        expect(discovered).toHaveBeenCalledWith(openRoot, 'attached');

        disposeSecond();
        const afterCleanupHost = document.createElement('after-cleanup-component');
        document.body.append(afterCleanupHost);
        watchPotentialOpenShadowRootHost(afterCleanupHost);
        originalAttachShadow.call(afterCleanupHost, { mode: 'open' });
        await vi.advanceTimersByTimeAsync(500);
        expect(discovered).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});

// Reddit's document MutationObserver cannot observe mutations inside a shadow
// tree, and the mutation predicate previously judged an added subtree using a
// light-DOM-only walk: a newly appended custom-element host whose OPEN shadow
// root already contained Japanese (or was empty and hydrated Japanese later,
// with no light-DOM mutation at all) was invisible forever. The predicate must
// look through composed open-shadow descendants of an added node and register
// every root it looks at, mirroring the fragment-collection walk's behavior.
function childListMutation(target: Node, ...addedNodes: Node[]): MutationRecord {
    return {
        type: 'childList',
        target,
        attributeName: null,
        oldValue: null,
        addedNodes: addedNodes as unknown as NodeList,
        removedNodes: document.createDocumentFragment().childNodes,
        previousSibling: null,
        nextSibling: null,
        attributeNamespace: null,
    } as unknown as MutationRecord;
}

function attributeMutation(target: Element, attributeName: string, oldValue: string | null): MutationRecord {
    return {
        type: 'attributes',
        target,
        attributeName,
        oldValue,
        addedNodes: document.createDocumentFragment().childNodes,
        removedNodes: document.createDocumentFragment().childNodes,
        previousSibling: null,
        nextSibling: null,
        attributeNamespace: null,
    } as unknown as MutationRecord;
}

describe('mutation predicate: composed open-shadow discovery', () => {
    afterEach(() => {
        setShadowRootScanHook(null);
        document.body.innerHTML = '';
    });

    it('detects Japanese already present in a newly added host\'s open shadow root', () => {
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = '<button>参加</button>';

        expect(mutationMayContainJapaneseText(childListMutation(document.body, host))).toBe(true);
    });

    it('observes later hydration in an empty open root discovered on a newly added host', async () => {
        const seen: ShadowRoot[] = [];
        const records: MutationRecord[] = [];
        const observer = new MutationObserver(mutations => records.push(...mutations));
        setShadowRootScanHook(root => {
            seen.push(root);
            observer.observe(root, AUTO_SCAN_OBSERVER_OPTIONS);
        });
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });

        expect(mutationMayContainJapaneseText(childListMutation(document.body, host))).toBe(false);
        expect(seen).toContain(shadow);

        // Hydration inside the now-registered root, with no light-DOM mutation.
        const label = document.createElement('button');
        label.textContent = 'フィード';
        shadow.append(label);
        await Promise.resolve();

        expect(records.some(record => mutationMayContainJapaneseText(record))).toBe(true);
        observer.disconnect();
    });

    it('registers a nested open shadow root that is empty at add-time, then detects its later hydration', () => {
        const seen: ShadowRoot[] = [];
        setShadowRootScanHook(root => seen.push(root));
        const outerHost = document.createElement('div');
        const outerShadow = outerHost.attachShadow({ mode: 'open' });
        const innerHost = document.createElement('div');
        const innerShadow = innerHost.attachShadow({ mode: 'open' });
        outerShadow.append(innerHost);

        expect(mutationMayContainJapaneseText(childListMutation(document.body, outerHost))).toBe(false);
        expect(seen).toContain(outerShadow);
        expect(seen).toContain(innerShadow);

        const label = document.createElement('button');
        label.textContent = '並べ替え基準';
        innerShadow.append(label);
        expect(mutationMayContainJapaneseText(childListMutation(innerShadow, label))).toBe(true);
    });

    it('still gates a Latin-only open shadow root while registering it', () => {
        const seen: ShadowRoot[] = [];
        setShadowRootScanHook(root => seen.push(root));
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = '<button>Join</button>';

        expect(mutationMayContainJapaneseText(childListMutation(document.body, host))).toBe(false);
        expect(seen).toContain(shadow);
    });

    it('keeps discovering later roots after an earlier added sibling already proves Japanese', () => {
        const seen: ShadowRoot[] = [];
        setShadowRootScanHook(root => seen.push(root));
        const japanese = document.createElement('span');
        japanese.textContent = '再検査';
        const lateHost = document.createElement('div');
        const lateRoot = lateHost.attachShadow({ mode: 'open' });

        expect(mutationMayContainJapaneseText(childListMutation(document.body, japanese, lateHost))).toBe(true);
        expect(seen).toContain(lateRoot);
    });

    it('ignores docs chrome while discovering newly-added declared surfaces', () => {
        document.documentElement.setAttribute(ANNOTATION_SCOPE_ATTRIBUTE, 'surface');
        const chromeHost = document.createElement('docs-nav-host');
        const chromeRoot = chromeHost.attachShadow({ mode: 'open' });
        chromeRoot.innerHTML = '<span>はじめる</span>';
        const surface = document.createElement('section');
        surface.dataset.yomuRuntimeSurface = '';
        const surfaceHost = document.createElement('reader-demo-host');
        const surfaceRoot = surfaceHost.attachShadow({ mode: 'open' });
        surfaceRoot.innerHTML = '<span>吾輩は猫である</span>';
        surface.append(surfaceHost);
        document.body.append(chromeHost, surface);
        const seen: ShadowRoot[] = [];
        setShadowRootScanHook(root => seen.push(root));

        expect(mutationMayContainJapaneseText(childListMutation(document.body, chromeHost))).toBe(false);
        expect(seen).not.toContain(chromeRoot);
        expect(mutationMayContainJapaneseText(childListMutation(document.body, surface))).toBe(true);
        expect(seen).toContain(surfaceRoot);
    });

    it('accepts later mutations inside a declared surface\'s nested open root', () => {
        document.documentElement.setAttribute(ANNOTATION_SCOPE_ATTRIBUTE, 'surface');
        const surfaceHost = document.createElement('reader-shadow-surface');
        surfaceHost.dataset.yomuRuntimeSurface = '';
        const root = surfaceHost.attachShadow({ mode: 'open' });
        document.body.append(surfaceHost);

        expect(mutationMayContainJapaneseText(childListMutation(document.body, surfaceHost))).toBe(false);
        const button = document.createElement('button');
        button.textContent = 'フィード';
        root.append(button);

        expect(mutationMayContainJapaneseText(childListMutation(root, button))).toBe(true);
    });

    it('registers later scoped roots after an earlier reveal candidate proves Japanese', () => {
        document.documentElement.setAttribute(ANNOTATION_SCOPE_ATTRIBUTE, 'surface');
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <section data-yomu-runtime-surface>日本語</section>
            <section data-yomu-runtime-surface><reader-empty-host></reader-empty-host></section>
        `;
        document.body.append(wrapper);
        const lateHost = wrapper.querySelector<HTMLElement>('reader-empty-host')!;
        const lateRoot = lateHost.attachShadow({ mode: 'open' });
        const seen: ShadowRoot[] = [];
        setShadowRootScanHook(root => seen.push(root));
        wrapper.setAttribute('aria-expanded', 'true');

        expect(mutationMayContainJapaneseText(attributeMutation(wrapper, 'aria-expanded', 'false'))).toBe(true);
        expect(seen).toContain(lateRoot);
    });

    it('discovers an already-mounted element when it is declared as a Reader Surface', () => {
        document.documentElement.setAttribute(ANNOTATION_SCOPE_ATTRIBUTE, 'surface');
        const host = document.createElement('reader-late-surface');
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = '<span>日本語</span>';
        document.body.append(host);
        const seen: ShadowRoot[] = [];
        setShadowRootScanHook(item => seen.push(item));

        expect(AUTO_SCAN_OBSERVER_OPTIONS.attributeFilter).toContain('data-yomu-runtime-surface');
        host.dataset.yomuRuntimeSurface = '';
        expect(mutationMayContainJapaneseText(attributeMutation(host, 'data-yomu-runtime-surface', null))).toBe(true);
        expect(seen).toContain(root);
    });

    it('reports a conservative "maybe" when the nested open-shadow lookahead budget is exhausted', () => {
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        // Exceed the bounded per-root element inspection limit with plain
        // Latin-only elements so the walk cannot reach a definite verdict.
        for (let i = 0; i < 200; i += 1) {
            const span = document.createElement('span');
            span.textContent = 'x';
            shadow.append(span);
        }

        expect(mutationMayContainJapaneseText(childListMutation(document.body, host))).toBe(true);
    });

    it('bounds shadow text sampling instead of reading the whole root textContent', () => {
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.append(document.createTextNode(`${'x'.repeat(5_000)}参加`));
        const budget = createMutationJapaneseScanBudget();

        // Japanese lies beyond the sampled prefix, so the safe result is a
        // conservative maybe—not an unbounded whole-root lookup.
        expect(mutationMayContainJapaneseText(childListMutation(document.body, host), budget)).toBe(true);
        expect(budget.inspectedTextLength).toBe(4_000);
        expect(budget.textBudgetExhausted).toBe(true);
    });

    it('stops walking a text-only subtree when the shared text-node budget is exhausted', () => {
        const fragment = document.createDocumentFragment();
        for (let index = 0; index < 200; index += 1) {
            fragment.append(document.createTextNode('x'));
        }
        const budget = createMutationJapaneseScanBudget();
        const nativeCreateTreeWalker = document.createTreeWalker.bind(document);
        let nextNodeCalls = 0;
        vi.spyOn(document, 'createTreeWalker').mockImplementation((...args) => {
            const walker = nativeCreateTreeWalker(...args);
            const nativeNextNode = walker.nextNode.bind(walker);
            Object.defineProperty(walker, 'nextNode', {
                configurable: true,
                value: () => {
                    nextNodeCalls += 1;
                    return nativeNextNode();
                },
            });
            return walker;
        });

        expect(mutationMayContainJapaneseText(
            childListMutation(document.body, fragment),
            budget,
        )).toBe(true);
        expect(budget.inspectedTextNodes).toBe(80);
        expect(budget.textBudgetExhausted).toBe(true);
        // The 81st TreeWalker step proves that another node exists; no later
        // text node may be traversed after that conservative "maybe" verdict.
        expect(nextNodeCalls).toBe(81);
    });

    it('shares one bounded discovery budget across every mutation and added sibling in a callback', () => {
        const seen: ShadowRoot[] = [];
        setShadowRootScanHook(root => seen.push(root));
        const hosts = Array.from({ length: 200 }, () => {
            const host = document.createElement('div');
            host.attachShadow({ mode: 'open' });
            return host;
        });
        const budget = createMutationJapaneseScanBudget();

        expect(mutationMayContainJapaneseText(
            childListMutation(document.body, ...hosts.slice(0, 100)),
            budget,
        )).toBe(false);
        expect(mutationMayContainJapaneseText(
            childListMutation(document.body, ...hosts.slice(100)),
            budget,
        )).toBe(true);

        expect(seen).toHaveLength(160);
        expect(budget.elementBudgetExhausted).toBe(true);
    });
});

// Document-start upgrade race: an undefined custom element (tag not yet in
// customElements) can be inserted with NO shadow root at all — the light-DOM
// walk and the shadow probe both find nothing — and only later does
// customElements.define() run its constructor, attaching and populating an
// open shadow root synchronously, with no light-DOM mutation for the document
// observer to see. The registry must track the undefined tag and fire a
// wakeup once it upgrades.
describe('custom-element upgrade race wakeup', () => {
    afterEach(() => {
        setCustomElementUpgradeHook(null);
        document.body.innerHTML = '';
    });

    it('fires the upgrade hook and registers the newly attached shadow root once an undefined tag is defined', async () => {
        const tag = uniqueUpgradeTag('yomu-upgrade-race-host');
        const host = document.createElement(tag);
        document.body.append(host);

        // Before definition: no shadow root exists yet, nothing to find.
        expect(mutationMayContainJapaneseText(childListMutation(document.body, host))).toBe(false);

        const woken = vi.fn(() => {
            collectFragmentTextTargetsIn(document.body, 40, false, '', {
                allowUiText: true,
                includePassiveInteractions: true,
                minLength: 1,
            });
        });
        setCustomElementUpgradeHook(woken);
        const seen: ShadowRoot[] = [];
        setShadowRootScanHook(root => seen.push(root));

        customElements.define(tag, class extends HTMLElement {
            constructor() {
                super();
                const root = this.attachShadow({ mode: 'open' });
                root.innerHTML = '<button>参加</button>';
            }
        });
        await customElements.whenDefined(tag);
        // whenDefined() resolves in the same microtask turn the upgrade
        // reaction runs in; flush one more turn so the registry's own
        // .then() continuation (which fires the hook) has run.
        await Promise.resolve();

        expect(woken).toHaveBeenCalled();
        expect(seen).toContain(host.shadowRoot);
    });

    it('wakes undefined custom elements only inside a scoped Reader Surface', async () => {
        document.documentElement.setAttribute(ANNOTATION_SCOPE_ATTRIBUTE, 'surface');
        const surface = document.createElement('section');
        surface.dataset.yomuRuntimeSurface = '';
        const outsideTag = uniqueUpgradeTag('yomu-scoped-outside-upgrade');
        const insideTag = uniqueUpgradeTag('yomu-scoped-inside-upgrade');
        const outside = document.createElement(outsideTag);
        const inside = document.createElement(insideTag);
        surface.append(inside);
        document.body.append(outside, surface);
        const woken = vi.fn();
        setCustomElementUpgradeHook(woken);

        expect(mutationMayContainJapaneseText(childListMutation(document.body, outside))).toBe(false);
        expect(mutationMayContainJapaneseText(childListMutation(surface, inside))).toBe(false);
        customElements.define(outsideTag, class extends HTMLElement {
            constructor() {
                super();
                this.attachShadow({ mode: 'open' }).innerHTML = '<span>はじめる</span>';
            }
        });
        await customElements.whenDefined(outsideTag);
        await Promise.resolve();
        expect(woken).not.toHaveBeenCalled();

        customElements.define(insideTag, class extends HTMLElement {
            constructor() {
                super();
                this.attachShadow({ mode: 'open' }).innerHTML = '<span>参加</span>';
            }
        });
        await customElements.whenDefined(insideTag);
        await Promise.resolve();
        expect(woken).toHaveBeenCalledTimes(1);
    });

    it('tracks an undefined custom element encountered by the initial fragment walk', async () => {
        const tag = uniqueUpgradeTag('yomu-initial-upgrade-race-host');
        const host = document.createElement(tag);
        document.body.append(host);
        const woken = vi.fn();
        setCustomElementUpgradeHook(woken);

        collectFragmentTextTargetsIn(document.body, 40, false, '', {
            allowUiText: true,
            includePassiveInteractions: true,
            minLength: 1,
        });
        customElements.define(tag, class extends HTMLElement {
            constructor() {
                super();
                this.attachShadow({ mode: 'open' }).innerHTML = '<button>フィード</button>';
            }
        });
        await customElements.whenDefined(tag);
        await Promise.resolve();

        expect(woken).toHaveBeenCalledTimes(1);
        expect(host.shadowRoot?.textContent).toContain('フィード');
    });

    it('tracks an undefined custom element nested inside a Latin open root', async () => {
        const tag = uniqueUpgradeTag('yomu-nested-upgrade-race-host');
        const outerHost = document.createElement('div');
        const outerRoot = outerHost.attachShadow({ mode: 'open' });
        outerRoot.innerHTML = `<span>Loading</span><${tag}></${tag}>`;
        document.body.append(outerHost);
        const woken = vi.fn();
        setCustomElementUpgradeHook(woken);

        collectFragmentTextTargetsIn(document.body, 40, false, '', {
            allowUiText: true,
            includePassiveInteractions: true,
            minLength: 1,
        });
        customElements.define(tag, class extends HTMLElement {
            constructor() {
                super();
                this.attachShadow({ mode: 'open' }).innerHTML = '<button>参加</button>';
            }
        });
        await customElements.whenDefined(tag);
        await Promise.resolve();

        expect(woken).toHaveBeenCalledTimes(1);
        expect(outerRoot.querySelector(tag)?.shadowRoot?.textContent).toContain('参加');
    });

    it('polls an already-defined host that attaches its open root asynchronously', async () => {
        vi.useFakeTimers();
        const tag = uniqueUpgradeTag('yomu-defined-async-root-host');
        customElements.define(tag, class extends HTMLElement {
            constructor() {
                super();
                window.setTimeout(() => {
                    this.attachShadow({ mode: 'open' }).innerHTML = '<button>賛成票率順</button>';
                }, 0);
            }
        });
        const woken = vi.fn();
        const seen: ShadowRoot[] = [];
        setCustomElementUpgradeHook(woken);
        setShadowRootScanHook(root => seen.push(root));
        const host = document.createElement(tag);
        document.body.append(host);

        expect(mutationMayContainJapaneseText(childListMutation(document.body, host))).toBe(false);
        expect(host.shadowRoot).toBeNull();
        await vi.advanceTimersByTimeAsync(110);

        expect(host.shadowRoot?.textContent).toContain('賛成票率順');
        expect(seen).toContain(host.shadowRoot);
        // Root discovery itself uses the cause-aware shadow-root hook. The
        // separate upgrade hook is reserved for whenDefined() fallback wakes.
        expect(woken).not.toHaveBeenCalled();
    });

    it('gives a host added late in another poll window its own full hydration window', async () => {
        vi.useFakeTimers();
        const tag = uniqueUpgradeTag('yomu-staggered-async-root-host');
        customElements.define(tag, class extends HTMLElement {});
        const woken = vi.fn();
        const seen: ShadowRoot[] = [];
        setCustomElementUpgradeHook(woken);
        setShadowRootScanHook(root => seen.push(root));

        const first = document.createElement(tag);
        document.body.append(first);
        expect(mutationMayContainJapaneseText(childListMutation(document.body, first))).toBe(false);
        await vi.advanceTimersByTimeAsync(3_900);

        const late = document.createElement(tag);
        document.body.append(late);
        expect(mutationMayContainJapaneseText(childListMutation(document.body, late))).toBe(false);
        window.setTimeout(() => {
            late.attachShadow({ mode: 'open' }).innerHTML = '<button>フィード</button>';
        }, 450);
        await vi.advanceTimersByTimeAsync(600);

        expect(late.shadowRoot?.textContent).toContain('フィード');
        expect(seen).toContain(late.shadowRoot);
        expect(woken).not.toHaveBeenCalled();
    });

    it('does not reopen an expired hydration window for the same connected rootless host', async () => {
        vi.useFakeTimers();
        const tag = uniqueUpgradeTag('yomu-expired-rootless-host');
        customElements.define(tag, class extends HTMLElement {});
        setCustomElementUpgradeHook(vi.fn());
        const host = document.createElement(tag);
        document.body.append(host);

        expect(mutationMayContainJapaneseText(childListMutation(document.body, host))).toBe(false);
        await vi.advanceTimersByTimeAsync(4_100);
        expect(vi.getTimerCount()).toBe(0);

        expect(mutationMayContainJapaneseText(childListMutation(document.body, host))).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('cancels pending definition wakeups and host polling when the lifecycle hook disconnects', async () => {
        vi.useFakeTimers();
        const definedTag = uniqueUpgradeTag('yomu-disconnected-defined-host');
        customElements.define(definedTag, class extends HTMLElement {});
        const definedHost = document.createElement(definedTag);
        document.body.append(definedHost);
        const undefinedTag = uniqueUpgradeTag('yomu-disconnected-upgrade-host');
        const undefinedHost = document.createElement(undefinedTag);
        document.body.append(undefinedHost);
        const woken = vi.fn();
        const seen = vi.fn();
        setCustomElementUpgradeHook(woken);
        setShadowRootScanHook(seen);

        expect(mutationMayContainJapaneseText(childListMutation(document.body, definedHost))).toBe(false);
        expect(mutationMayContainJapaneseText(childListMutation(document.body, undefinedHost))).toBe(false);
        expect(vi.getTimerCount()).toBeGreaterThan(0);

        setCustomElementUpgradeHook(null);
        expect(vi.getTimerCount()).toBe(0);
        definedHost.attachShadow({ mode: 'open' });
        customElements.define(undefinedTag, class extends HTMLElement {});
        await customElements.whenDefined(undefinedTag);
        await vi.advanceTimersByTimeAsync(500);

        expect(seen).not.toHaveBeenCalled();
        expect(woken).not.toHaveBeenCalled();
    });

    it('reuses custom-element subscription slots after earlier definitions settle', async () => {
        const waitForDefinition = customElements.whenDefined.bind(customElements);
        const whenDefined = vi.spyOn(customElements, 'whenDefined');
        const tags = Array.from({ length: 64 }, () => uniqueUpgradeTag('yomu-settled-cap-host'));

        for (const tag of tags) {
            mutationMayContainJapaneseText(childListMutation(document.body, document.createElement(tag)));
        }
        expect(whenDefined).toHaveBeenCalledTimes(64);

        for (const tag of tags) customElements.define(tag, class extends HTMLElement {});
        await Promise.all(tags.map(tag => waitForDefinition(tag)));
        await Promise.resolve();

        const nextTag = uniqueUpgradeTag('yomu-reused-cap-host');
        mutationMayContainJapaneseText(childListMutation(document.body, document.createElement(nextTag)));
        expect(whenDefined).toHaveBeenCalledTimes(65);
        expect(whenDefined).toHaveBeenLastCalledWith(nextTag);
    });

    it('globally caps distinct unresolved custom-element definition subscriptions', () => {
        const whenDefined = vi.spyOn(customElements, 'whenDefined');

        for (let index = 0; index < 100; index += 1) {
            const tag = uniqueUpgradeTag('yomu-never-defined-cap-host');
            const host = document.createElement(tag);
            mutationMayContainJapaneseText(childListMutation(document.body, host));
        }

        expect(whenDefined.mock.calls.length).toBeGreaterThan(0);
        expect(whenDefined.mock.calls.length).toBeLessThanOrEqual(64);
    });
});

// iPad heat regression (cluster G1/G2): the candidate poll must reach a true
// zero-timer idle. Native <div>/<span> hosts walked by the mutation probe used
// to be enrolled into a 100ms poll — on a page that never stops mutating that
// set is refilled faster than it drains, leaving a permanent 10Hz timer. And
// the poll must park entirely while the tab is hidden.
describe('candidate poll idle behaviour', () => {
    function stubVisibility(initial: 'visible' | 'hidden'): { set: (value: 'visible' | 'hidden') => void; restore: () => void } {
        let value = initial;
        const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
        const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => value === 'hidden' });
        return {
            set: next => { value = next; },
            restore: () => {
                if (visibilityDescriptor) Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
                else delete (document as unknown as Record<string, unknown>).visibilityState;
                if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor);
                else delete (document as unknown as Record<string, unknown>).hidden;
            },
        };
    }

    it('never enrols a native host into the candidate poll from the mutation probe', () => {
        vi.useFakeTimers();
        shadowRootDiscoveryDisposers.push(installOpenShadowRootDiscovery());
        const host = document.createElement('div');
        document.body.append(host);

        expect(mutationMayContainJapaneseText(childListMutation(document.body, host))).toBe(false);

        // A plain <div>'s late attachShadow is covered by the page-realm bridge,
        // so the mutation probe must arm no candidate timer at all.
        expect(vi.getTimerCount()).toBe(0);
        vi.useRealTimers();
    });

    it('parks the candidate poll while the tab is hidden and resumes it when shown', () => {
        vi.useFakeTimers();
        const visibility = stubVisibility('hidden');
        shadowRootDiscoveryDisposers.push(installOpenShadowRootDiscovery());
        // A defined custom-element host is a genuine poll candidate; native
        // hosts are no longer enrolled at all (ccbe1c023).
        const tag = uniqueUpgradeTag('yomu-hidden-park-host');
        customElements.define(tag, class extends HTMLElement {});
        const host = document.createElement(tag);
        document.body.append(host);

        // Enrol a candidate while hidden: scheduling must be suppressed — a true
        // zero-timer idle.
        watchPotentialOpenShadowRootHost(host);
        expect(vi.getTimerCount()).toBe(0);

        // The app's visibilitychange handler re-arms the parked poll on show.
        visibility.set('visible');
        wakeShadowHostPoll();
        expect(vi.getTimerCount()).toBe(1);

        visibility.restore();
        vi.useRealTimers();
    });
});

// Firefox userscript managers see the page through Xray wrappers. Patching the
// page's Element.prototype from the sandbox breaks the host page there and an
// exportFunction bridge does not save it: the exported closure still runs in the
// sandbox compartment, so its { bubbles, composed } EventInit is a sandbox
// object and the page-realm Event throws "Permission denied to access property
// bubbles" before attachShadow returns — every page caller (Lit createRenderRoot,
// Apple Pay / Stripe wallet buttons in connectedCallback) inherits the throw and
// its component dies. So the direct unsafeWindow patch installs ONLY when the
// sandbox shares the page realm; cross-realm falls through to the page-realm
// <script> injection whose body runs wholly in the page compartment.
describe('page open-shadow-root discovery bridge realms', () => {
    interface FakePagePrototype { attachShadow: (init: ShadowRootInit) => unknown }
    function fakePageWindow(sameRealm: boolean): {
        pageWindow: Record<string, unknown>;
        prototype: FakePagePrototype;
        originalAttachShadow: (init: ShadowRootInit) => unknown;
    } {
        const originalAttachShadow = vi.fn(() => ({ mode: 'open' }));
        const prototype: FakePagePrototype = { attachShadow: originalAttachShadow };
        // The page realm's own Object; only init dicts minted by it are readable
        // from a page-realm Event constructor. Same-realm fakes share the test
        // realm's Object, so literals built here count as page objects; a
        // cross-realm fake gets a distinct constructor, so any init handed to its
        // Event is treated as foreign and throws — modelling Firefox's Xray
        // "Permission denied" exactly.
        const pageRealmObject = sameRealm ? Object : {};
        const pageWindow: Record<string, unknown> = {
            Object: pageRealmObject,
            Element: { prototype },
            Event: class FakeEvent {
                type: string;
                bubbles: boolean;
                composed: boolean;
                constructor(type: string, init: unknown) {
                    const madeByPageRealm = init != null
                        && Object.getPrototypeOf(init)
                            === (pageRealmObject as { prototype?: object }).prototype;
                    if (!madeByPageRealm) {
                        throw new Error('Permission denied to access property bubbles');
                    }
                    this.type = type;
                    this.bubbles = (init as { bubbles: boolean }).bubbles;
                    this.composed = (init as { composed: boolean }).composed;
                }
            },
        };
        return { pageWindow, prototype, originalAttachShadow };
    }

    const sandbox = globalThis as { unsafeWindow?: unknown; exportFunction?: unknown };

    afterEach(() => {
        delete sandbox.unsafeWindow;
        delete sandbox.exportFunction;
    });

    it('never patches a cross-realm Xray prototype, even when exportFunction exists', async () => {
        const { installPageOpenShadowRootDiscoveryBridge } = await import('../../src/reader/dom/shadow-scan-registry');
        const { pageWindow, prototype, originalAttachShadow } = fakePageWindow(false);
        const exported = vi.fn(<T,>(fn: T) => fn);
        const createElement = vi.spyOn(document, 'createElement');
        sandbox.unsafeWindow = pageWindow;
        sandbox.exportFunction = exported;
        try {
            installPageOpenShadowRootDiscoveryBridge();
            // No sandbox closure crosses onto the Xray prototype, and the removed
            // bridge is not even consulted; discovery uses the page-realm script.
            expect(prototype.attachShadow).toBe(originalAttachShadow);
            expect(exported).not.toHaveBeenCalled();
            expect(createElement).toHaveBeenCalledWith('script');
        } finally {
            createElement.mockRestore();
        }
    });

    it('falls through to the page-realm script when the sandbox is cross-realm', async () => {
        const { installPageOpenShadowRootDiscoveryBridge } = await import('../../src/reader/dom/shadow-scan-registry');
        const { pageWindow, prototype, originalAttachShadow } = fakePageWindow(false);
        const createElement = vi.spyOn(document, 'createElement');
        sandbox.unsafeWindow = pageWindow;
        try {
            installPageOpenShadowRootDiscoveryBridge();
            expect(prototype.attachShadow).toBe(originalAttachShadow);
            expect(createElement).toHaveBeenCalledWith('script');
        } finally {
            createElement.mockRestore();
        }
    });

    it('patches a same-realm unsafeWindow directly and reads a page-realm EventInit', async () => {
        const { installPageOpenShadowRootDiscoveryBridge } = await import('../../src/reader/dom/shadow-scan-registry');
        const { pageWindow, prototype, originalAttachShadow } = fakePageWindow(true);
        sandbox.unsafeWindow = pageWindow;
        installPageOpenShadowRootDiscoveryBridge();
        expect(prototype.attachShadow).not.toBe(originalAttachShadow);
        expect(pageWindow.__yomuOpenShadowRootDiscoveryV1).toBe(true);
        // Invoke the patched attachShadow the way a page caller would: the Event
        // is constructed from a page-realm init dict, so bubbles/composed are read
        // without the Xray "Permission denied" throw.
        const dispatched: Array<{ type: string; bubbles: boolean; composed: boolean }> = [];
        const root = prototype.attachShadow.call(
            {
                dispatchEvent: (event: { type: string; bubbles: boolean; composed: boolean }) => {
                    dispatched.push(event);
                    return true;
                },
            },
            { mode: 'open' },
        );
        expect(root).toEqual({ mode: 'open' });
        expect(originalAttachShadow).toHaveBeenCalledTimes(1);
        expect(dispatched).toHaveLength(1);
        expect(dispatched[0].bubbles).toBe(true);
        expect(dispatched[0].composed).toBe(true);
    });
});
