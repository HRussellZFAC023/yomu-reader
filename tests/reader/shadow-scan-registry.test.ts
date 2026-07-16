import { afterEach, describe, expect, it, vi } from 'vitest';

import { collectFragmentTextTargetsIn } from '../../src/reader/dom';
import { forEachScannedShadowRoot, noteScannedShadowRoot, setShadowRootScanHook } from '../../src/reader/dom/shadow-scan-registry';
import { AUTO_SCAN_OBSERVER_OPTIONS, mutationMayContainJapaneseText } from '../../src/reader/app/mutation-scan';

afterEach(() => {
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

    it('delivers shadow re-render mutations to an observer attached via the hook', async () => {
        const records: MutationRecord[] = [];
        const observer = new MutationObserver(mutations => records.push(...mutations));
        setShadowRootScanHook(root => observer.observe(root, AUTO_SCAN_OBSERVER_OPTIONS));
        const { root } = shadowHostWithJapanese('Loading');
        noteScannedShadowRoot(root);

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
});
