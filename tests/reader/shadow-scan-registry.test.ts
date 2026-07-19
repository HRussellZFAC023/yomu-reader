import { afterEach, describe, expect, it, vi } from 'vitest';

import { collectFragmentTextTargetsIn } from '../../src/reader/dom';
import {
    forEachScannedShadowRoot,
    installOpenShadowRootDiscovery,
    noteScannedShadowRoot,
    setShadowRootScanHook,
    watchUndefinedCustomElementHosts,
} from '../../src/reader/dom/shadow-scan-registry';
import { AUTO_SCAN_OBSERVER_OPTIONS, mutationMayContainJapaneseText } from '../../src/reader/app/mutation-scan';

const shadowRootDiscoveryDisposers: Array<() => void> = [];

afterEach(() => {
    while (shadowRootDiscoveryDisposers.length) shadowRootDiscoveryDisposers.pop()?.();
    setShadowRootScanHook(null);
    document.body.innerHTML = '';
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

// A subtree MutationObserver never crosses shadow boundaries: web-component
// re-renders scheduled NO rescan, so shadow chrome rendered after the boot
// scan stayed bare until the user's own tap happened to trigger a scan. The
// walk must register every open shadow root it descends so the app observer
// watches it directly.
describe('shadow scan registry', () => {
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

    it('sweeps roots whose hosts left the document', () => {
        const { host, root } = shadowHostWithJapanese();
        noteScannedShadowRoot(root);
        host.remove();
        const live: ShadowRoot[] = [];
        forEachScannedShadowRoot(item => live.push(item));
        expect(live).not.toContain(root);
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

        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = '<button>ﾌｨｰﾄﾞ</button>';
        await Promise.resolve();

        expect(discovered).toHaveBeenCalledTimes(1);
        expect(discovered).toHaveBeenCalledWith(root);
        expect(records.some(record => mutationMayContainJapaneseText(record))).toBe(true);
        observer.disconnect();
    });

    it('discovers a page-realm-style attachment that bypasses the content-world wrapper', async () => {
        const originalAttachShadow = Element.prototype.attachShadow;
        const discovered = vi.fn();
        setShadowRootScanHook(discovered);
        shadowRootDiscoveryDisposers.push(installOpenShadowRootDiscovery());
        const host = document.createElement('cross-realm-component');
        document.body.append(host);
        watchUndefinedCustomElementHosts();

        // Calling the captured original simulates a page realm whose Element
        // prototype is distinct from the userscript content world.
        const root = originalAttachShadow.call(host, { mode: 'open' });
        root.innerHTML = '<button>フィード</button>';

        await vi.waitFor(() => expect(discovered).toHaveBeenCalledWith(root, 'attached'));
    });

    it('reference-counts discovery installs and restores attachShadow after cleanup', () => {
        const originalAttachShadow = Element.prototype.attachShadow;
        const discovered = vi.fn();
        setShadowRootScanHook(discovered);
        const disposeFirst = installOpenShadowRootDiscovery();
        const wrappedAttachShadow = Element.prototype.attachShadow;
        const disposeSecond = installOpenShadowRootDiscovery();
        shadowRootDiscoveryDisposers.push(disposeFirst, disposeSecond);

        expect(wrappedAttachShadow).not.toBe(originalAttachShadow);
        expect(Element.prototype.attachShadow).toBe(wrappedAttachShadow);
        disposeFirst();
        expect(Element.prototype.attachShadow).toBe(wrappedAttachShadow);

        const openHost = document.createElement('open-component');
        document.body.append(openHost);
        const openRoot = openHost.attachShadow({ mode: 'open' });
        expect(discovered).toHaveBeenCalledWith(openRoot, 'attached');

        const closedHost = document.createElement('closed-component');
        document.body.append(closedHost);
        closedHost.attachShadow({ mode: 'closed' });
        expect(discovered).toHaveBeenCalledTimes(1);

        disposeSecond();
        expect(Element.prototype.attachShadow).toBe(originalAttachShadow);
        const afterCleanupHost = document.createElement('after-cleanup-component');
        document.body.append(afterCleanupHost);
        afterCleanupHost.attachShadow({ mode: 'open' });
        expect(discovered).toHaveBeenCalledTimes(1);
    });
});
